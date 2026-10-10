"""Har bir rol uchun bosh sahifa ma'lumotlari — bitta so'rovda, haqiqiy ma'lumotlardan."""
from datetime import timedelta

from django.db.models import Avg, Count, F, FloatField, Q
from django.db.models.functions import Cast
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from attendance.logic import STATUS_LABELS, day_board, range_report
from attendance.models import AttendanceRecord, FaceEnrollment, KioskDevice
from homework.models import Homework, Submission
from homework.serializers import HomeworkListSerializer, student_state

from .models import Announcement, Event, Lesson, Notification, Period, SchoolClass, SchoolSettings, StudentProfile, Subject, TeacherProfile, TeachingAssignment
from .serializers import AnnouncementSerializer, EventSerializer, LessonSerializer
from .services import teacher_class_ids, visible_filter
from .views import student_of, teacher_of


def _hm(dt):
    return timezone.localtime(dt).strftime("%H:%M") if dt else None


def today_lessons(qs):
    now = timezone.localtime()
    periods = {p.number: p for p in Period.objects.all()}
    lessons = list(qs.filter(weekday=now.isoweekday()).select_related("subject", "teacher__user", "school_class").order_by("period"))
    data = LessonSerializer(lessons, many=True, context={"periods": periods}).data
    t = now.time()
    for item, l in zip(data, lessons):
        p = periods.get(l.period)
        item["state"] = "upcoming"
        if p:
            if p.start <= t < p.end:
                item["state"] = "now"
            elif t >= p.end:
                item["state"] = "done"
    nxt = next((i for i in data if i["state"] == "upcoming"), None)
    if nxt:
        nxt["state"] = "next"
    return data


def _common(user, request):
    ann = Announcement.objects.filter(visible_filter(user)).select_related("author").prefetch_related("classes").distinct()[:3]
    ev = Event.objects.filter(visible_filter(user), starts_at__gte=timezone.now() - timedelta(hours=2)).prefetch_related("classes").distinct()[:4]
    return {
        "announcements": AnnouncementSerializer(ann, many=True, context={"request": request}).data,
        "events": EventSerializer(ev, many=True, context={"request": request}).data,
        "unread": Notification.objects.filter(user=user, read_at__isnull=True).count(),
        "school": SchoolSettings.get().name,
        "server_time": timezone.now(),
    }


@api_view(["GET"])
def dashboard(request):
    u = request.user
    if u.is_student:
        return Response(student_dashboard(request))
    if u.is_teacher:
        return Response(teacher_dashboard(request))
    if u.is_manager:
        return Response(director_dashboard(request))
    raise PermissionDenied()


def student_dashboard(request):
    sp = student_of(request.user)
    cid = sp.school_class_id
    now = timezone.now()
    subs = {s.homework_id: s for s in Submission.objects.filter(student=sp)}
    hws = list(Homework.objects.filter(school_class_id=cid).select_related("subject", "school_class", "teacher__user"))
    counts = {"pending": 0, "revision": 0, "submitted": 0, "accepted": 0, "overdue": 0, "missed": 0}
    todo = []
    for h in hws:
        st = student_state(h, subs.get(h.id), now)
        counts[st] = counts.get(st, 0) + 1
        if st in ("pending", "revision", "overdue") and not h.is_closed:
            todo.append(h)
    todo.sort(key=lambda h: (subs.get(h.id) is None, h.due_at))
    graded = [s for s in subs.values() if s.status == "accepted" and s.score is not None]
    avg = None
    if graded:
        hmax = {h.id: h.max_score for h in hws}
        vals = [s.score * 5 / hmax[s.homework_id] for s in graded if hmax.get(s.homework_id)]
        avg = round(sum(vals) / len(vals), 2) if vals else None
    return {
        **_common(request.user, request),
        "class_name": sp.school_class.name if sp.school_class else None,
        "lessons": today_lessons(Lesson.objects.filter(school_class_id=cid)) if cid else [],
        "todo": HomeworkListSerializer(todo[:5], many=True, context={"request": request, "my_subs": subs}).data,
        "counts": counts,
        "average": avg,
    }


def teacher_dashboard(request):
    tp = teacher_of(request.user)
    rec = AttendanceRecord.objects.filter(teacher=tp, date=timezone.localdate()).first()
    to_review = Submission.objects.filter(homework__teacher=tp, status="submitted").select_related("student__user", "homework__subject", "homework__school_class").order_by("submitted_at")
    active = Homework.objects.filter(teacher=tp, is_closed=False, due_at__gte=timezone.now()).select_related("subject", "school_class", "teacher__user").annotate(
        submitted=Count("submissions", distinct=True),
        to_review=Count("submissions", filter=Q(submissions__status="submitted"), distinct=True),
        accepted=Count("submissions", filter=Q(submissions__status="accepted"), distinct=True),
        student_total=Count("school_class__students", filter=Q(school_class__students__user__is_active=True), distinct=True),
    ).order_by("due_at")[:5]
    class_ids = teacher_class_ids(request.user)
    return {
        **_common(request.user, request),
        "lessons": today_lessons(Lesson.objects.filter(teacher=tp)),
        "attendance": {
            "check_in": _hm(rec.check_in) if rec else None, "check_out": _hm(rec.check_out) if rec else None,
            "late_minutes": rec.late_minutes if rec else 0,
        },
        "to_review_count": to_review.count(),
        "to_review": [{"id": s.id, "student": s.student.user.full_name, "title": s.homework.title, "class_name": s.homework.school_class.name,
                       "subject": s.homework.subject.name, "color": s.homework.subject.color, "submitted_at": s.submitted_at, "is_late": s.is_late,
                       "attempt": s.attempt} for s in to_review[:5]],
        "active_homework": HomeworkListSerializer(active, many=True, context={"request": request}).data,
        "stats": {
            "classes": len(class_ids),
            "students": StudentProfile.objects.filter(school_class_id__in=class_ids, user__is_active=True).count(),
            "homework": Homework.objects.filter(teacher=tp).count(),
            "lessons_week": Lesson.objects.filter(teacher=tp).count(),
        },
    }


def director_dashboard(request):
    today = timezone.localdate()
    board = day_board(today)
    week = range_report(today - timedelta(days=6), today)
    week_ago = timezone.now() - timedelta(days=7)
    hw_week = Homework.objects.filter(created_at__gte=week_ago)
    subs_week = Submission.objects.filter(submitted_at__gte=week_ago)
    graded = Submission.objects.filter(status="accepted", score__isnull=False).annotate(
        norm=Cast(F("score"), FloatField()) * 5.0 / Cast(F("homework__max_score"), FloatField()))
    avg_score = graded.aggregate(a=Avg("norm"))["a"]

    # Sinflar bo'yicha uy vazifasi bajarilishi (oxirgi 30 kun)
    month_ago = timezone.now() - timedelta(days=30)
    class_rows = []
    for c in SchoolClass.objects.filter(is_active=True).annotate(
        n_students=Count("students", filter=Q(students__user__is_active=True), distinct=True),
    ):
        n_hw = Homework.objects.filter(school_class=c, created_at__gte=month_ago).count()
        n_sub = Submission.objects.filter(homework__school_class=c, homework__created_at__gte=month_ago).count()
        rate = round(n_sub * 100 / (n_hw * c.n_students), 1) if n_hw and c.n_students else None
        class_rows.append({"id": c.id, "name": c.name, "students": c.n_students, "homework": n_hw, "rate": rate})
    class_rows.sort(key=lambda r: (r["rate"] is None, -(r["rate"] or 0)))

    def brief(r):
        rec = r["record"]
        return {"id": r["teacher"].id, "full_name": r["teacher"].user.full_name, "status": r["status"], "status_label": STATUS_LABELS[r["status"]],
                "check_in": _hm(rec.check_in) if rec else None, "expected_at": _hm(r["expected_at"]), "late_minutes": r["late_minutes"]}

    s = SchoolSettings.get()
    from accounts.models import MANAGER_ROLES, User
    setup = [
        {"key": "periods", "label": "Qo'ng'iroq jadvalini kiriting", "done": Period.objects.exists(), "link": "/d/settings"},
        {"key": "subjects", "label": "Fanlarni qo'shing", "done": Subject.objects.exists(), "link": "/d/subjects"},
        {"key": "classes", "label": "Sinflarni yarating", "done": SchoolClass.objects.exists(), "link": "/d/classes"},
        {"key": "teachers", "label": "O'qituvchilarni qo'shing", "done": TeacherProfile.objects.exists(), "link": "/d/teachers"},
        {"key": "assign", "label": "O'qituvchilarni sinflarga biriktiring", "done": TeachingAssignment.objects.exists(), "link": "/d/classes"},
        {"key": "students", "label": "O'quvchilarni qo'shing yoki import qiling", "done": StudentProfile.objects.exists(), "link": "/d/students"},
        {"key": "timetable", "label": "Dars jadvalini tuzing", "done": Lesson.objects.exists(), "link": "/d/classes"},
        {"key": "kiosk", "label": "Darvozaga kiosk qurilmasini ulang", "done": KioskDevice.objects.exclude(token_hash="").exists(), "link": "/d/devices"},
        {"key": "telegram", "label": "Telegram botni ulang", "done": User.objects.filter(role__in=MANAGER_ROLES, telegram_chat_id__isnull=False).exists(), "link": "/d/telegram"},
    ]
    return {
        **_common(request.user, request),
        "counts": {
            "students": StudentProfile.objects.filter(user__is_active=True).count(),
            "teachers": TeacherProfile.objects.filter(user__is_active=True).count(),
            "classes": SchoolClass.objects.filter(is_active=True).count(),
            "subjects": Subject.objects.count(),
        },
        "attendance": board["summary"],
        "late": [brief(r) for r in board["rows"] if r["status"] == "late"][:10],
        "absent": [brief(r) for r in board["rows"] if r["status"] == "absent"][:10],
        "week": {"series": week["series"], "totals": week["totals"]},
        "homework": {
            "created_week": hw_week.count(),
            "submissions_week": subs_week.count(),
            "to_review": Submission.objects.filter(status="submitted").count(),
            "average_score": round(avg_score, 2) if avg_score else None,
        },
        "classes": class_rows[:12],
        "pending_faces": FaceEnrollment.objects.filter(status="pending").count(),
        "setup": setup,
        "work_start": s.work_start.strftime("%H:%M"),
    }
