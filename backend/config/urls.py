from django.conf import settings
from django.http import FileResponse, HttpResponse
from django.urls import include, path, re_path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from accounts import views as acc
from accounts.authentication import RefreshSerializer
from attendance import views as att
from bot import views as botv
from core import views as core
from homework import views as hw
from school import dashboard, views as sch

router = DefaultRouter(trailing_slash=True)
router.register("subjects", sch.SubjectViewSet, basename="subject")
router.register("teachers", sch.TeacherViewSet, basename="teacher")
router.register("students", sch.StudentViewSet, basename="student")
router.register("classes", sch.ClassViewSet, basename="class")
router.register("teaching", sch.TeachingAssignmentViewSet, basename="teaching")
router.register("lessons", sch.LessonViewSet, basename="lesson")
router.register("announcements", sch.AnnouncementViewSet, basename="announcement")
router.register("events", sch.EventViewSet, basename="event")
router.register("notifications", sch.NotificationViewSet, basename="notification")
router.register("homework", hw.HomeworkViewSet, basename="homework")
router.register("submissions", hw.SubmissionViewSet, basename="submission")
router.register("attendance/absences", att.AbsenceViewSet, basename="absence")
router.register("attendance/kiosks", att.KioskViewSet, basename="kiosk")


class Refresh(TokenRefreshView):
    serializer_class = RefreshSerializer


api = [
    path("health/", core.health),
    path("auth/login/", acc.login),
    path("auth/refresh/", Refresh.as_view()),
    path("auth/me/", acc.me),
    path("auth/avatar/", acc.avatar),
    path("auth/change-password/", acc.change_password),
    path("dashboard/", dashboard.dashboard),
    path("school/", sch.school_settings),
    path("school/logo/", sch.school_logo),
    path("school/periods/", sch.periods_bulk),
    path("school/admins/", sch.admins_list),
    path("search/", sch.search),
    path("audit/", sch.audit_log),
    path("my/subjects/", sch.my_subjects),
    path("my/teachers/", sch.my_teachers),
    path("my/teaching/", sch.my_teaching),
    path("my/grades/", hw.my_grades),
    path("my/attendance/", att.my_attendance),
    path("my/face/", att.my_face),
    path("my/face/enroll/", att.my_face_enroll),
    path("my/pin/", att.my_pin),
    path("attendance/board/", att.board),
    path("attendance/report/", att.report),
    path("attendance/manual/", att.manual_mark),
    path("attendance/teachers/<int:teacher_id>/", att.teacher_history),
    path("attendance/teachers/<int:teacher_id>/face/", att.teacher_face_delete),
    path("attendance/teachers/<int:teacher_id>/face/enroll/", att.teacher_face_enroll),
    path("attendance/enrollments/", att.enrollments),
    path("attendance/enrollments/<int:pk>/review/", att.enrollment_review),
    path("kiosk/pair/", att.kiosk_pair),
    path("kiosk/status/", att.kiosk_status),
    path("kiosk/roster/", att.kiosk_roster),
    path("kiosk/identify/", att.kiosk_identify),
    path("kiosk/pin/", att.kiosk_pin),
    path("telegram/", botv.telegram_link),
    path("files/<str:token>/", core.file_view),
    path("", include(router.urls)),
]


def spa(request, *args, **kwargs):
    """React ilovasi: barcha front yo'llari index.html ga tushadi."""
    tail = request.path.rsplit("/", 1)[-1]
    if request.path.startswith(("/assets/", "/models/")) or "." in tail:
        return HttpResponse("Topilmadi", status=404, content_type="text/plain; charset=utf-8")
    index = settings.FRONTEND_DIR / "index.html"
    if not index.exists():
        return HttpResponse("<h1>SchoolPro</h1><p>Frontend build topilmadi: <code>cd frontend && npm install && npm run build</code></p>", status=503)
    resp = FileResponse(open(index, "rb"), content_type="text/html; charset=utf-8")
    resp["Cache-Control"] = "no-cache"
    return resp


def api_404(request, *args, **kwargs):
    from django.http import JsonResponse
    return JsonResponse({"detail": "Topilmadi"}, status=404)


urlpatterns = [
    path("api/", include(api)),
    re_path(r"^api/.*$", api_404),
    re_path(r"^(?!static/|media/).*$", spa),
]
