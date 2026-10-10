import csv
import io

from django.db import transaction
from django.db.models import Count, Prefetch, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view, parser_classes, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts.models import Role, User
from accounts.permissions import IsManager, IsStaff, IsStudent, ManagerWriteOrReadOnly
from core.files import delete_file, store_upload
from core.models import AuditLog, audit

from .models import (
    Announcement, Event, Lesson, Notification, Period, SchoolClass, SchoolSettings,
    StudentProfile, Subject, TeacherProfile, TeachingAssignment,
)
from .serializers import (
    AnnouncementSerializer, EventSerializer, LessonSerializer, NotificationSerializer, PeriodSerializer,
    SchoolClassSerializer, SettingsSerializer, StudentSerializer, SubjectSerializer, TeacherSerializer,
    TeachingAssignmentSerializer, generate_password,
)
from .services import audience_users, notify, teacher_class_ids, visible_filter


def teacher_of(user):
    tp = getattr(user, "teacher", None) if user.is_teacher else None
    if tp is None and user.is_teacher:
        raise PermissionDenied("O'qituvchi profili topilmadi")
    return tp


def student_of(user):
    sp = getattr(user, "student", None) if user.is_student else None
    if sp is None and user.is_student:
        raise PermissionDenied("O'quvchi profili topilmadi")
    return sp


# ---------------- Sozlamalar ----------------

@api_view(["GET", "PATCH"])
def school_settings(request):
    s = SchoolSettings.get()
    if request.method == "PATCH":
        if not request.user.is_manager:
            raise PermissionDenied("Faqat direktor uchun")
        ser = SettingsSerializer(s, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        audit(request, "settings_updated", "school", fields=list(request.data.keys()))
    data = SettingsSerializer(s).data
    data["periods"] = PeriodSerializer(Period.objects.all(), many=True).data
    return Response(data)


@api_view(["POST"])
@permission_classes([IsManager])
@parser_classes([MultiPartParser])
def school_logo(request):
    f = request.FILES.get("file")
    if not f:
        raise ValidationError({"detail": "Rasm tanlang"})
    s = SchoolSettings.get()
    info = store_upload(f, kind="image", folder="school")
    delete_file(s.logo)
    s.logo = info["path"]
    s.save(update_fields=["logo", "updated_at"])
    return Response(SettingsSerializer(s).data)


@api_view(["PUT"])
@permission_classes([IsManager])
@parser_classes([JSONParser])
def periods_bulk(request):
    items = request.data if isinstance(request.data, list) else request.data.get("periods")
    if not isinstance(items, list) or not items or len(items) > 12:
        raise ValidationError({"detail": "1 dan 12 tagacha dars vaqtini kiriting"})
    ser = PeriodSerializer(data=items, many=True)
    ser.is_valid(raise_exception=True)
    rows = sorted(ser.validated_data, key=lambda r: r["number"])
    nums = [r["number"] for r in rows]
    if len(set(nums)) != len(nums):
        raise ValidationError({"detail": "Dars raqamlari takrorlanmasin"})
    for a, b in zip(rows, rows[1:]):
        if b["start"] < a["end"]:
            raise ValidationError({"detail": f"{b['number']}-dars {a['number']}-dars tugashidan oldin boshlanmoqda"})
    with transaction.atomic():
        Period.objects.exclude(number__in=nums).delete()
        for r in rows:
            Period.objects.update_or_create(number=r["number"], defaults={"start": r["start"], "end": r["end"]})
    audit(request, "periods_updated", "school", count=len(rows))
    return Response(PeriodSerializer(Period.objects.all(), many=True).data)


# ---------------- Fanlar ----------------

class SubjectViewSet(viewsets.ModelViewSet):
    serializer_class = SubjectSerializer
    permission_classes = [ManagerWriteOrReadOnly]
    pagination_class = None

    def get_queryset(self):
        return Subject.objects.annotate(teacher_count=Count("teachers", distinct=True))

    def perform_destroy(self, instance):
        if instance.homeworks.exists():
            raise ValidationError({"detail": "Bu fan bo'yicha uy vazifalari bor — o'chirib bo'lmaydi"})
        audit(self.request, "subject_deleted", instance.name)
        instance.delete()


# ---------------- O'qituvchilar ----------------

def _reset_password(request, user):
    pw = generate_password()
    user.set_password(pw)
    user.must_change_password = True
    user.tokens_valid_after = timezone.now().replace(microsecond=0)
    user.save(update_fields=["password", "must_change_password", "tokens_valid_after"])
    audit(request, "password_reset", user.username)
    return Response({"username": user.username, "temp_password": pw})


class TeacherViewSet(viewsets.ModelViewSet):
    serializer_class = TeacherSerializer
    permission_classes = [IsManager]

    def get_queryset(self):
        qs = TeacherProfile.objects.select_related("user", "face_consent").prefetch_related(
            "subjects", "face_enrollments", Prefetch("assignments", queryset=TeachingAssignment.objects.select_related("school_class", "subject"))
        )
        p = self.request.query_params
        if p.get("q"):
            q = p["q"].strip()
            qs = qs.filter(Q(user__first_name__icontains=q) | Q(user__last_name__icontains=q) | Q(user__phone__icontains=q) | Q(user__username__icontains=q))
        if p.get("subject"):
            qs = qs.filter(subjects__id=p["subject"])
        if p.get("active") in ("0", "1"):
            qs = qs.filter(user__is_active=p["active"] == "1")
        elif p.get("all") != "1" and self.action == "list":
            qs = qs.filter(user__is_active=True)
        return qs.order_by("user__last_name", "user__first_name").distinct()

    def perform_create(self, serializer):
        obj = serializer.save()
        audit(self.request, "teacher_created", obj.user.full_name)

    def perform_destroy(self, instance):
        # Ma'lumotlar (davomat, vazifalar) yo'qolmasin: akkaunt arxivlanadi
        u = instance.user
        u.is_active = False
        u.tokens_valid_after = timezone.now().replace(microsecond=0)
        u.save(update_fields=["is_active", "tokens_valid_after"])
        audit(self.request, "teacher_archived", u.full_name)

    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        return _reset_password(request, self.get_object().user)

    @action(detail=True, methods=["post"], url_path="set-pin")
    def set_pin(self, request, pk=None):
        from attendance.views import validate_and_hash_pin
        tp = self.get_object()
        pin = str(request.data.get("pin", "")).strip()
        tp.pin_hash = validate_and_hash_pin(pin) if pin else ""
        tp.pin_failed = 0
        tp.pin_locked_until = None
        tp.save(update_fields=["pin_hash", "pin_failed", "pin_locked_until"])
        audit(request, "pin_set" if pin else "pin_removed", tp.user.full_name)
        return Response({"pin_set": bool(tp.pin_hash)})


# ---------------- O'quvchilar ----------------

class StudentViewSet(viewsets.ModelViewSet):
    serializer_class = StudentSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsStaff()]
        return [IsManager()]

    def get_queryset(self):
        user = self.request.user
        qs = StudentProfile.objects.select_related("user", "school_class")
        if user.is_teacher:
            qs = qs.filter(school_class_id__in=teacher_class_ids(user), user__is_active=True)
        p = self.request.query_params
        if p.get("class"):
            qs = qs.filter(school_class_id=p["class"])
        if p.get("no_class") == "1":
            qs = qs.filter(school_class__isnull=True)
        if p.get("q"):
            q = p["q"].strip()
            qs = qs.filter(Q(user__first_name__icontains=q) | Q(user__last_name__icontains=q) | Q(user__username__icontains=q) | Q(student_no__icontains=q) | Q(parent_phone__icontains=q))
        if p.get("active") in ("0", "1"):
            qs = qs.filter(user__is_active=p["active"] == "1")
        elif p.get("all") != "1" and self.action == "list":
            qs = qs.filter(user__is_active=True)
        return qs.order_by("user__last_name", "user__first_name")

    def perform_create(self, serializer):
        obj = serializer.save()
        audit(self.request, "student_created", obj.user.full_name)

    def perform_destroy(self, instance):
        u = instance.user
        u.is_active = False
        u.tokens_valid_after = timezone.now().replace(microsecond=0)
        u.save(update_fields=["is_active", "tokens_valid_after"])
        audit(self.request, "student_archived", u.full_name)

    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        return _reset_password(request, self.get_object().user)

    @action(detail=False, methods=["post"], url_path="move")
    def move(self, request):
        ids = request.data.get("ids") or []
        cls_id = request.data.get("school_class")
        cls = get_object_or_404(SchoolClass, pk=cls_id) if cls_id else None
        n = StudentProfile.objects.filter(id__in=ids).update(school_class=cls)
        audit(request, "students_moved", cls.name if cls else "-", count=n)
        return Response({"moved": n})

    @action(detail=False, methods=["post"], url_path="import", parser_classes=[MultiPartParser])
    def import_csv(self, request):
        """CSV: familiya, ism, otasining ismi, sinf (9-A), ota-ona telefoni, tug'ilgan sana (YYYY-MM-DD)"""
        f = request.FILES.get("file")
        if not f:
            raise ValidationError({"detail": "CSV fayl tanlang"})
        if f.size > 2 * 1024 * 1024:
            raise ValidationError({"detail": "Fayl 2 MB dan katta bo'lmasin"})
        raw = f.read()
        for enc in ("utf-8-sig", "cp1251", "latin-1"):
            try:
                text = raw.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        dialect = ";" if text.count(";") > text.count(",") else ","
        reader = csv.reader(io.StringIO(text), delimiter=dialect)
        classes = {c.name.upper(): c for c in SchoolClass.objects.all()}
        created, errors = [], []
        for i, row in enumerate(reader, start=1):
            row = [c.strip() for c in row]
            if not row or not any(row):
                continue
            if i == 1 and row[0].lower() in ("familiya", "last_name", "фамилия"):
                continue
            if len(row) < 2:
                errors.append({"row": i, "error": "Kamida familiya va ism bo'lishi kerak"})
                continue
            data = {"last_name": row[0], "first_name": row[1], "middle_name": row[2] if len(row) > 2 else ""}
            cname = (row[3] if len(row) > 3 else "").upper().replace(" ", "")
            if cname:
                c = classes.get(cname)
                if not c:
                    errors.append({"row": i, "error": f"«{row[3]}» sinf topilmadi"})
                    continue
                data["school_class"] = c.id
            if len(row) > 4 and row[4]:
                data["parent_phone"] = row[4]
            if len(row) > 5 and row[5]:
                data["birth_date"] = row[5]
            ser = StudentSerializer(data=data, context={"request": request})
            if not ser.is_valid():
                errors.append({"row": i, "error": "; ".join(f"{k}: {v[0]}" for k, v in ser.errors.items())})
                continue
            obj = ser.save()
            created.append({"full_name": obj.user.full_name, "class_name": obj.school_class.name if obj.school_class else None,
                            "username": obj.user.username, "temp_password": ser._temp_password})
            if len(created) >= 1000:
                break
        audit(request, "students_imported", f.name, count=len(created))
        return Response({"created": created, "errors": errors}, status=status.HTTP_201_CREATED if created else 200)


# ---------------- Sinflar ----------------

class ClassViewSet(viewsets.ModelViewSet):
    serializer_class = SchoolClassSerializer
    permission_classes = [ManagerWriteOrReadOnly]
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        qs = SchoolClass.objects.select_related("homeroom_teacher__user").annotate(
            student_count=Count("students", filter=Q(students__user__is_active=True), distinct=True)
        )
        if user.is_teacher:
            qs = qs.filter(id__in=teacher_class_ids(user))
        elif user.is_student:
            sp = student_of(user)
            qs = qs.filter(id=sp.school_class_id)
        if self.request.query_params.get("all") != "1" and not user.is_manager:
            qs = qs.filter(is_active=True)
        return qs

    def perform_create(self, serializer):
        obj = serializer.save()
        audit(self.request, "class_created", obj.name)

    def perform_destroy(self, instance):
        if instance.students.filter(user__is_active=True).exists():
            raise ValidationError({"detail": "Sinfda o'quvchilar bor. Avval ularni boshqa sinfga o'tkazing."})
        audit(self.request, "class_deleted", instance.name)
        instance.delete()

    @action(detail=True, methods=["get"])
    def overview(self, request, pk=None):
        from homework.models import Homework, Submission
        cls = self.get_object()
        user = request.user
        students = StudentProfile.objects.filter(school_class=cls, user__is_active=True).select_related("user")
        assignments = TeachingAssignment.objects.filter(school_class=cls).select_related("teacher__user", "subject")
        lessons = Lesson.objects.filter(school_class=cls).select_related("subject", "teacher__user")
        hw = Homework.objects.filter(school_class=cls).select_related("subject", "teacher__user")
        if user.is_teacher:
            hw = hw.filter(teacher=teacher_of(user))
        hw = hw.annotate(
            submitted=Count("submissions", distinct=True),
            accepted=Count("submissions", filter=Q(submissions__status="accepted"), distinct=True),
        )[:20]
        n_students = students.count()
        from homework.serializers import HomeworkListSerializer
        sub_rate = None
        total_hw = Homework.objects.filter(school_class=cls).count()
        if total_hw and n_students:
            subs = Submission.objects.filter(homework__school_class=cls).count()
            sub_rate = round(subs * 100 / (total_hw * n_students), 1)
        return Response({
            "class": SchoolClassSerializer(cls).data,
            "students": StudentSerializer(students, many=True, context={"request": request}).data,
            "assignments": TeachingAssignmentSerializer(assignments, many=True).data,
            "lessons": LessonSerializer(lessons, many=True).data,
            "homework": HomeworkListSerializer(hw, many=True, context={"request": request}).data,
            "stats": {"students": n_students, "teachers": len({a.teacher_id for a in assignments}), "homework": total_hw, "submission_rate": sub_rate},
        })


class TeachingAssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = TeachingAssignmentSerializer
    permission_classes = [IsManager]
    pagination_class = None

    def get_queryset(self):
        qs = TeachingAssignment.objects.select_related("teacher__user", "school_class", "subject")
        p = self.request.query_params
        if p.get("teacher"):
            qs = qs.filter(teacher_id=p["teacher"])
        if p.get("class"):
            qs = qs.filter(school_class_id=p["class"])
        return qs

    def perform_create(self, serializer):
        obj = serializer.save()
        audit(self.request, "teacher_assigned", f"{obj.teacher.user.full_name} → {obj.school_class.name} {obj.subject.name}")
        notify([obj.teacher.user], "assignment", f"Sizga {obj.school_class.name} sinf biriktirildi",
               f"Fan: {obj.subject.name}", "/t/classes")

    def perform_destroy(self, instance):
        audit(self.request, "teacher_unassigned", f"{instance.teacher.user.full_name} → {instance.school_class.name} {instance.subject.name}")
        Lesson.objects.filter(school_class=instance.school_class, subject=instance.subject, teacher=instance.teacher).update(teacher=None)
        instance.delete()


class LessonViewSet(viewsets.ModelViewSet):
    serializer_class = LessonSerializer
    permission_classes = [ManagerWriteOrReadOnly]
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        qs = Lesson.objects.select_related("school_class", "subject", "teacher__user")
        p = self.request.query_params
        if user.is_student:
            qs = qs.filter(school_class_id=student_of(user).school_class_id)
        elif user.is_teacher:
            tp = teacher_of(user)
            if p.get("class") and int(p["class"]) in teacher_class_ids(user):
                qs = qs.filter(school_class_id=p["class"])
            else:
                qs = qs.filter(teacher=tp)
        else:
            if p.get("class"):
                qs = qs.filter(school_class_id=p["class"])
            if p.get("teacher"):
                qs = qs.filter(teacher_id=p["teacher"])
        if p.get("weekday"):
            qs = qs.filter(weekday=p["weekday"])
        return qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["periods"] = {p.number: p for p in Period.objects.all()}
        return ctx


# ---------------- E'lonlar ----------------

class AnnouncementViewSet(viewsets.ModelViewSet):
    serializer_class = AnnouncementSerializer
    parser_classes = [JSONParser, MultiPartParser]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsStaff()]
        return super().get_permissions()

    def get_queryset(self):
        user = self.request.user
        qs = Announcement.objects.select_related("author").prefetch_related("classes")
        f = visible_filter(user)
        if user.is_teacher:
            f = f | Q(author=user)
        qs = qs.filter(f).distinct()
        p = self.request.query_params
        if p.get("q"):
            qs = qs.filter(Q(title__icontains=p["q"]) | Q(body__icontains=p["q"]))
        if p.get("important") == "1":
            qs = qs.filter(important=True)
        return qs

    def _check_owner(self, obj):
        u = self.request.user
        if not (u.is_manager or obj.author_id == u.id):
            raise PermissionDenied("Faqat muallif yoki direktor o'zgartira oladi")

    def perform_create(self, serializer):
        user = self.request.user
        extra = {}
        f = self.request.FILES.get("file")
        if f:
            info = store_upload(f, kind="material", folder="announcements")
            extra = {"attachment": info["path"], "attachment_name": info["name"]}
        if not user.is_manager:
            extra["pinned"] = False
        obj = serializer.save(author=user, **extra)
        publish_announcement(obj)
        audit(self.request, "announcement_created", obj.title)

    def perform_update(self, serializer):
        self._check_owner(serializer.instance)
        if not self.request.user.is_manager:
            serializer.save(pinned=False)
        else:
            serializer.save()

    def perform_destroy(self, instance):
        self._check_owner(instance)
        delete_file(instance.attachment)
        audit(self.request, "announcement_deleted", instance.title)
        instance.delete()


def publish_announcement(obj):
    users = audience_users(obj.audience, [c.id for c in obj.classes.all()]).exclude(id=obj.author_id)
    prefix = "❗ " if obj.important else ""
    notify(users, "announcement", f"{prefix}{obj.title}", obj.body[:200], f"/announcements/{obj.id}")


# ---------------- Tadbirlar (taqvim) ----------------

class EventViewSet(viewsets.ModelViewSet):
    serializer_class = EventSerializer
    pagination_class = None

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsStaff()]
        return super().get_permissions()

    def get_queryset(self):
        user = self.request.user
        f = visible_filter(user)
        if user.is_teacher:
            f = f | Q(created_by=user)
        qs = Event.objects.filter(f).select_related("created_by").prefetch_related("classes").distinct()
        p = self.request.query_params
        if p.get("from"):
            qs = qs.filter(starts_at__date__gte=p["from"])
        if p.get("to"):
            qs = qs.filter(starts_at__date__lte=p["to"])
        if p.get("kind"):
            qs = qs.filter(kind=p["kind"])
        return qs[:500]

    def _check_owner(self, obj):
        u = self.request.user
        if not (u.is_manager or obj.created_by_id == u.id):
            raise PermissionDenied("Faqat muallif yoki direktor o'zgartira oladi")

    def perform_create(self, serializer):
        obj = serializer.save(created_by=self.request.user)
        users = audience_users(obj.audience, [c.id for c in obj.classes.all()]).exclude(id=self.request.user.id)
        when = timezone.localtime(obj.starts_at).strftime("%d.%m %H:%M")
        notify(users, "event", f"{obj.get_kind_display()}: {obj.title}", f"{when}{' · ' + obj.location if obj.location else ''}", "/calendar")
        audit(self.request, "event_created", obj.title)

    def perform_update(self, serializer):
        self._check_owner(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        self._check_owner(instance)
        instance.delete()


# ---------------- Bildirishnomalar ----------------

class NotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = NotificationSerializer

    def get_queryset(self):
        qs = Notification.objects.filter(user=self.request.user)
        if self.request.query_params.get("unread") == "1":
            qs = qs.filter(read_at__isnull=True)
        return qs

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        return Response({"count": Notification.objects.filter(user=request.user, read_at__isnull=True).count()})

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        Notification.objects.filter(user=request.user, pk=pk, read_at__isnull=True).update(read_at=timezone.now())
        return Response({"ok": True})

    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        n = Notification.objects.filter(user=request.user, read_at__isnull=True).update(read_at=timezone.now())
        return Response({"updated": n})


# ---------------- O'quvchi uchun: o'qituvchilarim / fanlarim ----------------

@api_view(["GET"])
@permission_classes([IsStudent])
def my_subjects(request):
    from homework.models import Homework, Submission
    sp = student_of(request.user)
    if not sp.school_class_id:
        return Response([])
    rows = []
    assigns = TeachingAssignment.objects.filter(school_class_id=sp.school_class_id).select_related("subject", "teacher__user")
    weekly = dict(Lesson.objects.filter(school_class_id=sp.school_class_id).values("subject_id").annotate(n=Count("id")).values_list("subject_id", "n"))
    subject_ids = set(weekly) | {a.subject_id for a in assigns}
    by_subject = {a.subject_id: a for a in assigns}
    subs = Submission.objects.filter(student=sp, homework__subject_id__in=subject_ids).select_related("homework")
    scores = {}
    for s in subs:
        if s.status == "accepted" and s.score is not None and s.homework.max_score:
            scores.setdefault(s.homework.subject_id, []).append(s.score * 5 / s.homework.max_score)
    hw_counts = dict(Homework.objects.filter(school_class_id=sp.school_class_id).values("subject_id").annotate(n=Count("id")).values_list("subject_id", "n"))
    done = dict(subs.values("homework__subject_id").annotate(n=Count("id")).values_list("homework__subject_id", "n"))
    for subj in Subject.objects.filter(id__in=subject_ids):
        a = by_subject.get(subj.id)
        sc = scores.get(subj.id, [])
        t = a.teacher if a else None
        rows.append({
            "id": subj.id, "name": subj.name, "color": subj.color, "icon": subj.icon,
            "teacher": {"id": t.id, "full_name": t.user.full_name, "phone": t.user.phone, "avatar_url": TeacherSerializer().get_avatar_url(t)} if t else None,
            "lessons_per_week": weekly.get(subj.id, 0),
            "homework_total": hw_counts.get(subj.id, 0),
            "homework_done": done.get(subj.id, 0),
            "average": round(sum(sc) / len(sc), 2) if sc else None,
            "grades": len(sc),
        })
    rows.sort(key=lambda r: r["name"])
    return Response(rows)


@api_view(["GET"])
@permission_classes([IsStudent])
def my_teachers(request):
    sp = student_of(request.user)
    if not sp.school_class_id:
        return Response([])
    cls = sp.school_class
    data = {}
    for a in TeachingAssignment.objects.filter(school_class=cls).select_related("teacher__user", "subject"):
        t = a.teacher
        row = data.setdefault(t.id, {"id": t.id, "full_name": t.user.full_name, "phone": t.user.phone, "position": t.position,
                                     "avatar_url": TeacherSerializer().get_avatar_url(t), "subjects": [], "is_homeroom": False})
        row["subjects"].append({"name": a.subject.name, "color": a.subject.color})
    if cls.homeroom_teacher_id:
        t = cls.homeroom_teacher
        row = data.setdefault(t.id, {"id": t.id, "full_name": t.user.full_name, "phone": t.user.phone, "position": t.position,
                                     "avatar_url": TeacherSerializer().get_avatar_url(t), "subjects": [], "is_homeroom": False})
        row["is_homeroom"] = True
    return Response(sorted(data.values(), key=lambda r: (not r["is_homeroom"], r["full_name"])))


# ---------------- Qidiruv va audit ----------------

@api_view(["GET"])
@permission_classes([IsManager])
def search(request):
    q = (request.query_params.get("q") or "").strip()
    if len(q) < 2:
        return Response({"teachers": [], "students": [], "classes": []})
    name_q = Q(user__first_name__icontains=q) | Q(user__last_name__icontains=q) | Q(user__username__icontains=q) | Q(user__phone__icontains=q)
    teachers = TeacherProfile.objects.filter(name_q, user__is_active=True).select_related("user")[:8]
    students = StudentProfile.objects.filter(name_q | Q(student_no__icontains=q), user__is_active=True).select_related("user", "school_class")[:8]
    classes = [c for c in SchoolClass.objects.all() if q.upper().replace(" ", "") in c.name.upper()][:8]
    return Response({
        "teachers": [{"id": t.id, "full_name": t.user.full_name, "sub": t.position} for t in teachers],
        "students": [{"id": s.id, "full_name": s.user.full_name, "sub": s.school_class.name if s.school_class else "Sinfsiz"} for s in students],
        "classes": [{"id": c.id, "name": c.name} for c in classes],
    })


AUDIT_LABELS = {
    "login": "Tizimga kirdi", "login_failed": "Muvaffaqiyatsiz kirish urinishi", "password_changed": "Parolni o'zgartirdi",
    "password_reset": "Parolni tikladi", "teacher_created": "O'qituvchi qo'shdi", "teacher_archived": "O'qituvchini arxivladi",
    "student_created": "O'quvchi qo'shdi", "student_archived": "O'quvchini arxivladi", "students_imported": "O'quvchilarni import qildi",
    "students_moved": "O'quvchilarni ko'chirdi", "class_created": "Sinf yaratdi", "class_deleted": "Sinfni o'chirdi",
    "teacher_assigned": "O'qituvchini biriktirdi", "teacher_unassigned": "Biriktirishni olib tashladi",
    "announcement_created": "E'lon joyladi", "announcement_deleted": "E'lonni o'chirdi", "event_created": "Tadbir qo'shdi",
    "settings_updated": "Sozlamalarni o'zgartirdi", "periods_updated": "Qo'ng'iroq jadvalini o'zgartirdi",
    "attendance_manual": "Davomatni qo'lda kiritdi", "absence_created": "Sababli kelmaslik qo'shdi", "absence_deleted": "Sababli kelmaslikni o'chirdi",
    "face_consent_given": "Biometrik rozilik berdi", "face_consent_withdrawn": "Biometrik rozilikni qaytarib oldi",
    "face_enrolled": "Yuz namunasini yubordi", "face_approved": "Yuz namunasini tasdiqladi", "face_rejected": "Yuz namunasini rad etdi",
    "face_deleted": "Yuz namunalarini o'chirdi", "kiosk_created": "Kiosk qo'shdi", "kiosk_paired": "Kiosk juftlandi",
    "kiosk_revoked": "Kioskni o'chirdi", "pin_set": "PIN o'rnatdi", "pin_removed": "PIN olib tashladi", "subject_deleted": "Fanni o'chirdi",
    "telegram_linked": "Telegram botga ulandi", "telegram_unlinked": "Telegram botdan uzildi", "homework_deleted": "Vazifani o'chirdi",
}


@api_view(["GET"])
@permission_classes([IsManager])
def audit_log(request):
    qs = AuditLog.objects.select_related("actor")
    if request.query_params.get("action"):
        qs = qs.filter(action=request.query_params["action"])
    from core.pagination import Pagination
    pg = Pagination()
    page = pg.paginate_queryset(qs, request)
    return pg.get_paginated_response([{
        "id": a.id, "action": a.action, "label": AUDIT_LABELS.get(a.action, a.action), "target": a.target,
        "actor": a.actor.full_name if a.actor else None, "ip": a.ip, "created_at": a.created_at, "details": a.details,
    } for a in page])


@api_view(["GET"])
@permission_classes([IsManager])
def admins_list(request):
    return Response([{"id": u.id, "full_name": u.full_name, "role": u.role, "telegram_linked": bool(u.telegram_chat_id)}
                     for u in User.objects.filter(role__in=[Role.DIRECTOR, Role.ADMIN], is_active=True)])


@api_view(["GET"])
@permission_classes([IsStaff])
def my_teaching(request):
    """O'qituvchining biriktirishlari (vazifa formasi uchun: qaysi sinfga qaysi fan)."""
    qs = TeachingAssignment.objects.select_related("teacher__user", "school_class", "subject")
    if request.user.is_teacher:
        qs = qs.filter(teacher=teacher_of(request.user))
    return Response(TeachingAssignmentSerializer(qs, many=True).data)
