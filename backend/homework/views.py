from django.conf import settings
from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts.permissions import IsStaff, IsStudent, IsTeacher
from core.files import delete_file, store_upload
from core.models import audit
from school.models import StudentProfile
from school.services import notify
from school.views import student_of, teacher_of

from .models import Homework, HomeworkFile, Submission, SubmissionEvent, SubmissionFile
from .serializers import (
    HomeworkDetailSerializer, HomeworkListSerializer, HomeworkWriteSerializer, ReviewSerializer, SubmissionSerializer,
    student_state,
)


def _files(request, key="files"):
    files = request.FILES.getlist(key)
    if len(files) > settings.MAX_UPLOAD_FILES:
        raise ValidationError({"detail": f"Bir martada ko'pi bilan {settings.MAX_UPLOAD_FILES} ta fayl"})
    return files


class HomeworkViewSet(viewsets.ModelViewSet):
    parser_classes = [JSONParser, MultiPartParser]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "add_files", "remove_file"):
            return [IsTeacher()]
        if self.action in ("destroy", "submissions"):
            return [IsStaff()]
        if self.action == "submit":
            return [IsStudent()]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return HomeworkWriteSerializer
        if self.action == "retrieve":
            return HomeworkDetailSerializer
        return HomeworkListSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        user = self.request.user
        if user.is_teacher:
            ctx["teacher"] = teacher_of(user)
        elif user.is_authenticated and user.is_student and self.action == "list":
            sp = student_of(user)
            ctx["my_subs"] = {s.homework_id: s for s in Submission.objects.filter(student=sp)}
        return ctx

    def get_queryset(self):
        user = self.request.user
        p = self.request.query_params
        qs = Homework.objects.select_related("subject", "school_class", "teacher__user")
        if user.is_student:
            sp = student_of(user)
            qs = qs.filter(school_class_id=sp.school_class_id)
            st = p.get("state")
            now = timezone.now()
            mine = Submission.objects.filter(student=sp)
            if st == "active":  # bajarilishi kerak: topshirilmagan yoki qayta ishlash
                qs = qs.filter(Q(is_closed=False) & (Q(due_at__gte=now) | Q(allow_late=True))).exclude(
                    id__in=mine.exclude(status="revision").values("homework_id"))
            elif st == "submitted":
                qs = qs.filter(id__in=mine.filter(status="submitted").values("homework_id"))
            elif st == "graded":
                qs = qs.filter(id__in=mine.filter(status="accepted").values("homework_id"))
            elif st == "missed":
                qs = qs.filter(due_at__lt=now).exclude(id__in=mine.values("homework_id"))
            if st == "active":
                qs = qs.order_by("due_at")
        elif user.is_teacher:
            tp = teacher_of(user)
            qs = qs.filter(teacher=tp)
        if p.get("class"):
            qs = qs.filter(school_class_id=p["class"])
        if p.get("subject"):
            qs = qs.filter(subject_id=p["subject"])
        if p.get("teacher") and user.is_manager:
            qs = qs.filter(teacher_id=p["teacher"])
        if p.get("q"):
            qs = qs.filter(Q(title__icontains=p["q"]) | Q(description__icontains=p["q"]))
        if not user.is_student:
            if p.get("status") == "active":
                qs = qs.filter(is_closed=False, due_at__gte=timezone.now())
            elif p.get("status") == "past":
                qs = qs.filter(Q(is_closed=True) | Q(due_at__lt=timezone.now()))
            elif p.get("status") == "review":
                qs = qs.filter(submissions__status="submitted").distinct()
            qs = qs.annotate(
                submitted=Count("submissions", distinct=True),
                to_review=Count("submissions", filter=Q(submissions__status="submitted"), distinct=True),
                accepted=Count("submissions", filter=Q(submissions__status="accepted"), distinct=True),
                student_total=Count("school_class__students", filter=Q(school_class__students__user__is_active=True), distinct=True),
            )
        return qs.annotate(file_count=Count("files", distinct=True))

    def _own(self, hw):
        u = self.request.user
        if u.is_manager:
            return
        if not (u.is_teacher and hw.teacher.user_id == u.id):
            raise PermissionDenied("Bu vazifa sizga tegishli emas")

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        tp = teacher_of(request.user)
        ser = HomeworkWriteSerializer(data=request.data, context={"teacher": tp, "request": request})
        ser.is_valid(raise_exception=True)
        hw = ser.save(teacher=tp)
        for f in _files(request):
            info = store_upload(f, kind="material", folder="homework")
            HomeworkFile.objects.create(homework=hw, path=info["path"], name=info["name"], mime=info["mime"], size=info["size"])
        students = [s.user for s in StudentProfile.objects.filter(school_class=hw.school_class, user__is_active=True).select_related("user")]
        due = timezone.localtime(hw.due_at).strftime("%d.%m %H:%M")
        notify(students, "homework", f"Yangi vazifa: {hw.subject.name}", f"{hw.title} · muddat {due}", f"/s/homework/{hw.id}")
        return Response(HomeworkDetailSerializer(hw, context={"request": request}).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        hw = self.get_object()
        self._own(hw)
        ser = HomeworkWriteSerializer(hw, data=request.data, partial=kwargs.get("partial", False),
                                      context={"teacher": teacher_of(request.user), "request": request})
        ser.is_valid(raise_exception=True)
        old_due = hw.due_at
        hw = ser.save()
        if hw.due_at != old_due:
            hw.reminded = False
            hw.save(update_fields=["reminded"])
            students = [s.user for s in StudentProfile.objects.filter(school_class=hw.school_class, user__is_active=True).select_related("user")]
            notify(students, "homework", f"Muddat o'zgardi: {hw.title}", f"Yangi muddat {timezone.localtime(hw.due_at):%d.%m %H:%M}", f"/s/homework/{hw.id}")
        return Response(HomeworkDetailSerializer(hw, context={"request": request}).data)

    def destroy(self, request, *args, **kwargs):
        hw = self.get_object()
        self._own(hw)
        paths = list(hw.files.values_list("path", flat=True)) + list(SubmissionFile.objects.filter(submission__homework=hw).values_list("path", flat=True))
        audit(request, "homework_deleted", hw.title)
        hw.delete()
        for p in paths:
            delete_file(p)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="files")
    def add_files(self, request, pk=None):
        hw = self.get_object()
        self._own(hw)
        files = _files(request)
        if not files:
            raise ValidationError({"detail": "Fayl tanlang"})
        if hw.files.count() + len(files) > settings.MAX_UPLOAD_FILES:
            raise ValidationError({"detail": f"Vazifaga ko'pi bilan {settings.MAX_UPLOAD_FILES} ta fayl biriktiriladi"})
        for f in files:
            info = store_upload(f, kind="material", folder="homework")
            HomeworkFile.objects.create(homework=hw, path=info["path"], name=info["name"], mime=info["mime"], size=info["size"])
        return Response(HomeworkDetailSerializer(hw, context={"request": request}).data)

    @action(detail=True, methods=["delete"], url_path=r"files/(?P<file_id>\d+)")
    def remove_file(self, request, pk=None, file_id=None):
        hw = self.get_object()
        self._own(hw)
        f = get_object_or_404(HomeworkFile, pk=file_id, homework=hw)
        delete_file(f.path)
        f.delete()
        return Response(HomeworkDetailSerializer(hw, context={"request": request}).data)

    @action(detail=True, methods=["get"])
    def submissions(self, request, pk=None):
        """Sinfdagi har bir o'quvchi va uning topshirig'i (topshirmaganlar ham)."""
        hw = self.get_object()
        self._own(hw)
        subs = {s.student_id: s for s in hw.submissions.select_related("student__user").prefetch_related("files")}
        rows = []
        students = StudentProfile.objects.filter(Q(school_class=hw.school_class, user__is_active=True) | Q(id__in=subs.keys())).select_related("user")
        for sp in students.order_by("user__last_name", "user__first_name"):
            s = subs.get(sp.id)
            rows.append({
                "student": {"id": sp.id, "full_name": sp.user.full_name},
                "state": student_state(hw, s),
                "submission": {"id": s.id, "status": s.status, "score": s.score, "submitted_at": s.submitted_at, "is_late": s.is_late,
                               "attempt": s.attempt, "file_count": len(s.files.all())} if s else None,
            })
        order = {"submitted": 0, "revision": 1, "accepted": 2, "overdue": 3, "missed": 3, "pending": 4}
        rows.sort(key=lambda r: order.get(r["state"], 9))
        return Response({"homework": HomeworkListSerializer(hw, context={"request": request}).data, "rows": rows})

    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser])
    @transaction.atomic
    def submit(self, request, pk=None):
        sp = student_of(request.user)
        hw = get_object_or_404(Homework.objects.select_related("teacher__user", "subject"), pk=pk, school_class_id=sp.school_class_id)
        sub = Submission.objects.select_for_update().filter(homework=hw, student=sp).first()
        if sub and sub.status == Submission.Status.ACCEPTED:
            raise ValidationError({"detail": "Bu vazifa allaqachon qabul qilingan"})
        if sub and sub.status == Submission.Status.SUBMITTED:
            raise ValidationError({"detail": "Ishingiz tekshirilmoqda. O'qituvchi javobini kuting."})
        if not hw.accepts_submissions():
            raise ValidationError({"detail": "Topshirish muddati tugagan"})
        files = _files(request)
        if not files:
            raise ValidationError({"detail": "Kamida bitta rasm yoki PDF fayl yuklang"})
        comment = (request.data.get("comment") or "").strip()[:2000]
        stored = [store_upload(f, kind="submission", folder="submissions") for f in files]
        now = timezone.now()
        if sub is None:
            sub = Submission.objects.create(homework=hw, student=sp, comment=comment, is_late=now > hw.due_at, submitted_at=now)
            action_name = "submitted"
        else:
            sub.attempt += 1
            sub.status = Submission.Status.SUBMITTED
            sub.comment = comment
            sub.submitted_at = now
            sub.is_late = now > hw.due_at
            sub.score = None
            sub.save()
            action_name = "resubmitted"
        for info in stored:
            SubmissionFile.objects.create(submission=sub, attempt=sub.attempt, path=info["path"], name=info["name"], mime=info["mime"], size=info["size"])
        SubmissionEvent.objects.create(submission=sub, action=action_name, actor=request.user, note=comment)
        title = "Qayta topshirildi" if action_name == "resubmitted" else "Yangi topshiriq"
        notify([hw.teacher.user], "submission", f"{title}: {sp.user.full_name}", f"{hw.school_class.name} · {hw.title}", f"/t/review/{sub.id}")
        sub = Submission.objects.prefetch_related("files", "events__actor").select_related("homework__school_class", "homework__subject", "student__user").get(pk=sub.pk)
        return Response(SubmissionSerializer(sub).data, status=status.HTTP_201_CREATED)


class SubmissionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = SubmissionSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Submission.objects.select_related("homework__school_class", "homework__subject", "homework__teacher__user", "student__user", "reviewed_by").prefetch_related("files", "events__actor")
        if user.is_student:
            return qs.filter(student__user=user)
        if user.is_teacher:
            qs = qs.filter(homework__teacher__user=user)
        p = self.request.query_params
        if p.get("status"):
            qs = qs.filter(status=p["status"])
        if p.get("class"):
            qs = qs.filter(homework__school_class_id=p["class"])
        if p.get("homework"):
            qs = qs.filter(homework_id=p["homework"])
        return qs.order_by("submitted_at" if p.get("status") == "submitted" else "-submitted_at")

    @action(detail=True, methods=["post"], permission_classes=[IsTeacher])
    @transaction.atomic
    def review(self, request, pk=None):
        sub = self.get_object()
        hw = sub.homework
        if hw.teacher.user_id != request.user.id:
            raise PermissionDenied("Bu topshiriq sizning vazifangizga tegishli emas")
        if sub.status != Submission.Status.SUBMITTED and request.data.get("action") == "revision" and sub.status == Submission.Status.REVISION:
            raise ValidationError({"detail": "Allaqachon qayta ishlashga qaytarilgan"})
        ser = ReviewSerializer(data=request.data, context={"homework": hw})
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        sub.status = Submission.Status.ACCEPTED if d["action"] == "accept" else Submission.Status.REVISION
        sub.score = d.get("score")
        sub.feedback = (d.get("feedback") or "").strip()
        sub.reviewed_at = timezone.now()
        sub.reviewed_by = request.user
        sub.save()
        SubmissionEvent.objects.create(submission=sub, action="accepted" if d["action"] == "accept" else "revision",
                                       actor=request.user, note=sub.feedback, score=sub.score)
        if d["action"] == "accept":
            notify([sub.student.user], "graded", f"Baholandi: {hw.subject.name} — {sub.score}/{hw.max_score}", hw.title, f"/s/homework/{hw.id}")
        else:
            notify([sub.student.user], "revision", f"Qayta ishlash kerak: {hw.subject.name}", sub.feedback[:200], f"/s/homework/{hw.id}")
        sub.refresh_from_db()
        return Response(SubmissionSerializer(self.get_queryset().get(pk=sub.pk)).data)


@api_view(["GET"])
@permission_classes([IsStudent])
def my_grades(request):
    sp = student_of(request.user)
    subs = Submission.objects.filter(student=sp, status="accepted", score__isnull=False).select_related("homework__subject").order_by("-reviewed_at")
    items, by_subject = [], {}
    for s in subs:
        h = s.homework
        norm = round(s.score * 5 / h.max_score, 2) if h.max_score else None
        items.append({"id": s.id, "homework_id": h.id, "title": h.title, "subject": h.subject.name, "color": h.subject.color,
                      "score": s.score, "max_score": h.max_score, "normalized": norm, "reviewed_at": s.reviewed_at, "feedback": s.feedback})
        by_subject.setdefault(h.subject.name, {"subject": h.subject.name, "color": h.subject.color, "values": []})["values"].append(norm)
    subjects = [{"subject": v["subject"], "color": v["color"], "count": len(v["values"]), "average": round(sum(v["values"]) / len(v["values"]), 2)} for v in by_subject.values()]
    subjects.sort(key=lambda x: -x["average"])
    allv = [i["normalized"] for i in items if i["normalized"] is not None]
    return Response({"average": round(sum(allv) / len(allv), 2) if allv else None, "subjects": subjects, "items": items[:100]})
