"""Fon vazifalari (har daqiqada): kelmaganlik ogohlantirishi, kunlik hisobot,
vazifa muddati eslatmalari, tadbir eslatmalari, eski suratlarni tozalash."""
import logging
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from attendance.logic import Status, day_board
from attendance.models import AlertLog, AttendanceEvent, FaceEnrollment
from core.files import delete_file
from homework.models import Homework, Submission
from school.models import Event, Notification, SchoolSettings, StudentProfile
from school.services import audience_users, managers, notify

from .handlers import text_today
from .telegram import esc, notify_managers

log = logging.getLogger("schoolpro")


def absent_alerts(now):
    s = SchoolSettings.get()
    b = day_board(now.date())
    fresh = []
    for r in b["rows"]:
        if r["status"] != Status.ABSENT or not r["expected_at"]:
            continue
        if now < r["expected_at"] + timedelta(minutes=s.absent_alert_after_minutes):
            continue
        if AlertLog.once(f"absent:{r['teacher'].id}:{now.date()}"):
            fresh.append(r)
    if fresh:
        lines = "\n".join(f"• {esc(r['teacher'].user.full_name)} (kutilgan {timezone.localtime(r['expected_at']):%H:%M})" for r in fresh)
        notify_managers(f"❌ <b>Kelmaganlar</b> — {len(fresh)} kishi\n\n{lines}\n\n<i>Sababli bo'lsa, panelda «Sababli» deb belgilang.</i>")
        notify(managers(), "absent", f"{len(fresh)} o'qituvchi hali kelmadi", ", ".join(r["teacher"].user.full_name for r in fresh)[:200], "/d/attendance")
    return len(fresh)


def daily_report(now):
    s = SchoolSettings.get()
    if now.isoweekday() not in (s.work_days or []):
        return False
    if now.time() < s.daily_report_time:
        return False
    if not AlertLog.once(f"daily:{now.date()}"):
        return False
    notify_managers("🌙 <b>Kun yakuni</b>\n\n" + text_today(), only_alerts=False)
    return True


def homework_reminders(now):
    n = 0
    for hw in Homework.objects.filter(reminded=False, is_closed=False, due_at__gt=now, due_at__lte=now + timedelta(hours=24)).select_related("subject"):
        done = Submission.objects.filter(homework=hw).values("student_id")
        students = [sp.user for sp in StudentProfile.objects.filter(school_class_id=hw.school_class_id, user__is_active=True).exclude(id__in=done).select_related("user")]
        notify(students, "deadline", f"⏳ Muddat yaqin: {hw.subject.name}", f"«{hw.title}» — {timezone.localtime(hw.due_at):%d.%m %H:%M} gacha", f"/s/homework/{hw.id}")
        hw.reminded = True
        hw.save(update_fields=["reminded"])
        n += 1
    return n


def event_reminders(now):
    n = 0
    for ev in Event.objects.filter(reminded=False, starts_at__gt=now, starts_at__lte=now + timedelta(hours=2)).prefetch_related("classes"):
        users = audience_users(ev.audience, [c.id for c in ev.classes.all()])
        notify(users, "event", f"Tez orada: {ev.title}", f"{timezone.localtime(ev.starts_at):%H:%M}{' · ' + ev.location if ev.location else ''}", "/calendar")
        if ev.kind in ("meeting", "parents"):
            notify_managers(f"📅 <b>{esc(ev.title)}</b> — bugun {timezone.localtime(ev.starts_at):%H:%M}" + (f", {esc(ev.location)}" if ev.location else ""))
        ev.reminded = True
        ev.save(update_fields=["reminded"])
        n += 1
    return n


def cleanup(now):
    if not AlertLog.once(f"cleanup:{now.date()}"):
        return
    s = SchoolSettings.get()
    cutoff = now - timedelta(days=s.photo_retention_days)
    for ev in AttendanceEvent.objects.filter(at__lt=cutoff).exclude(photo=""):
        delete_file(ev.photo)
        ev.photo = ""
        ev.save(update_fields=["photo"])
    for e in FaceEnrollment.objects.filter(status="rejected", created_at__lt=now - timedelta(days=7)):
        delete_file(e.photo)
        e.delete()
    Notification.objects.filter(created_at__lt=now - timedelta(days=180)).delete()
    AlertLog.objects.filter(created_at__lt=now - timedelta(days=60)).delete()
    from .models import LinkCode, OutgoingMessage
    LinkCode.objects.filter(expires_at__lt=now).delete()
    OutgoingMessage.objects.filter(Q(sent=True) | Q(attempts__gte=5), created_at__lt=now - timedelta(days=14)).delete()


JOBS = [absent_alerts, daily_report, homework_reminders, event_reminders, cleanup]


def run_jobs(now=None):
    now = now or timezone.localtime()
    for job in JOBS:
        try:
            job(now)
        except Exception:
            log.exception("Fon vazifasi xatosi: %s", job.__name__)
