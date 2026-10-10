"""Davomat biznes mantiqi: kutilgan kelish vaqti, kechikish, kirish/chiqish, hisobotlar.

Barcha statistikalar shu yerda haqiqiy yozuvlardan hisoblanadi.
"""
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta

from django.db import transaction
from django.utils import timezone

from school.models import Lesson, Period, SchoolSettings, TeacherProfile

from .models import Absence, AttendanceEvent, AttendanceRecord


class Status:
    PRESENT = "present"      # o'z vaqtida keldi
    LATE = "late"            # kechikdi
    ABSENT = "absent"        # sababsiz kelmadi
    EXCUSED = "excused"      # sababli (tasdiqlangan) kelmadi
    PENDING = "pending"      # hali vaqti kelmadi
    OFF = "off"              # bugun ish kuni emas / darsi yo'q


STATUS_LABELS = {
    Status.PRESENT: "Keldi",
    Status.LATE: "Kechikdi",
    Status.ABSENT: "Kelmadi",
    Status.EXCUSED: "Sababli",
    Status.PENDING: "Kutilmoqda",
    Status.OFF: "Dam olish",
}


def now():
    return timezone.localtime()


def today():
    return now().date()


def aware(d, t):
    return timezone.make_aware(datetime.combine(d, t), timezone.get_current_timezone())


@dataclass
class Context:
    """Bir necha kun/o'qituvchi uchun hisoblashda takroriy so'rovlarsiz ishlash."""

    settings: SchoolSettings
    periods: dict
    first_period: dict  # (teacher_id, weekday) -> eng birinchi dars raqami
    has_lessons: set    # jadvalda darsi bor o'qituvchilar

    @classmethod
    def load(cls):
        s = SchoolSettings.get()
        periods = {p.number: p for p in Period.objects.all()}
        first = {}
        has = set()
        for tid, wd, per in Lesson.objects.filter(teacher__isnull=False).values_list("teacher_id", "weekday", "period"):
            has.add(tid)
            key = (tid, wd)
            if key not in first or per < first[key]:
                first[key] = per
        return cls(s, periods, first, has)

    def expected_at(self, teacher_id, d):
        """O'qituvchi shu kuni qachon kelishi kerak. None — ish kuni emas."""
        s = self.settings
        wd = d.isoweekday()
        if wd not in (s.work_days or []):
            return None
        if s.use_timetable_for_arrival and teacher_id in self.has_lessons and self.periods:
            per = self.first_period.get((teacher_id, wd))
            if per is None:
                return None  # bugun darsi yo'q
            p = self.periods.get(per)
            if p:
                return aware(d, p.start) - timedelta(minutes=s.arrive_before_lesson_minutes)
        return aware(d, s.work_start)


def compute_status(expected, record, excused, at=None):
    """Bitta kun uchun holat."""
    at = at or now()
    if record and record.check_in:
        return Status.LATE if record.late_minutes > 0 else Status.PRESENT
    if excused:
        return Status.EXCUSED
    if expected is None:
        return Status.OFF
    if at < expected:
        return Status.PENDING
    return Status.ABSENT


def late_minutes_for(expected, check_in, grace):
    if not expected or not check_in:
        return 0
    diff = (check_in - expected).total_seconds() / 60
    return int(diff) if diff > grace else 0


def absences_map(start, end, teacher_ids=None):
    qs = Absence.objects.filter(date_from__lte=end, date_to__gte=start)
    if teacher_ids is not None:
        qs = qs.filter(teacher_id__in=teacher_ids)
    m = defaultdict(list)
    for a in qs:
        m[a.teacher_id].append(a)
    return m


def find_absence(absences, d):
    for a in absences:
        if a.date_from <= d <= a.date_to:
            return a
    return None


@transaction.atomic
def register_scan(teacher, method, device=None, distance=None, photo="", at=None, actor=None, note="", force_type=None):
    """Kiosk skani yoki qo'lda kiritish. Kirish/chiqishni o'zi aniqlaydi.

    Qaytaradi: (action, record) — action: "in" | "out" | "duplicate"
    """
    at = at or now()
    d = timezone.localtime(at).date()
    ctx = Context.load()
    s = ctx.settings
    record, _ = AttendanceRecord.objects.select_for_update().get_or_create(teacher=teacher, date=d)

    if force_type == "in" or (force_type is None and record.check_in is None):
        expected = ctx.expected_at(teacher.id, d)
        record.check_in = at
        record.in_method = method
        record.expected_at = expected
        record.late_minutes = late_minutes_for(expected, at, s.late_grace_minutes)
        if note:
            record.note = note[:255]
        record.save()
        AttendanceEvent.objects.create(teacher=teacher, type="in", at=at, method=method, device=device,
                                       distance=distance, photo=photo, created_by=actor, note=note[:255])
        return "in", record

    # chiqish: kirishdan keyin kamida N daqiqa o'tgan bo'lishi kerak (tasodifiy qayta skan himoyasi)
    if force_type is None:
        last = record.check_out or record.check_in
        if (at - record.check_in) < timedelta(minutes=s.checkout_min_minutes) or (record.check_out and at - last < timedelta(minutes=2)):
            return "duplicate", record
    record.check_out = at
    record.out_method = method
    if note:
        record.note = note[:255]
    record.save()
    AttendanceEvent.objects.create(teacher=teacher, type="out", at=at, method=method, device=device,
                                   distance=distance, photo=photo, created_by=actor, note=note[:255])
    return "out", record


def _teachers():
    return TeacherProfile.objects.filter(user__is_active=True, track_attendance=True).select_related("user")


def day_board(d=None):
    """Bir kun uchun barcha o'qituvchilar holati (direktor paneli va bot uchun)."""
    d = d or today()
    ctx = Context.load()
    teachers = list(_teachers())
    records = {r.teacher_id: r for r in AttendanceRecord.objects.filter(date=d)}
    abs_map = absences_map(d, d)
    at = now()
    rows = []
    for t in teachers:
        rec = records.get(t.id)
        exp = rec.expected_at if rec and rec.expected_at else ctx.expected_at(t.id, d)
        ab = find_absence(abs_map.get(t.id, []), d)
        st = compute_status(exp, rec, ab, at if d == at.date() else aware(d, ctx.settings.work_end) + timedelta(hours=6))
        rows.append({
            "teacher": t,
            "status": st,
            "expected_at": exp,
            "record": rec,
            "absence": ab,
            "late_minutes": rec.late_minutes if rec else 0,
        })
    order = {Status.LATE: 0, Status.ABSENT: 1, Status.PRESENT: 2, Status.PENDING: 3, Status.EXCUSED: 4, Status.OFF: 5}
    rows.sort(key=lambda r: (order[r["status"]], r["teacher"].user.last_name, r["teacher"].user.first_name))
    summary = defaultdict(int)
    for r in rows:
        summary[r["status"]] += 1
    expected_total = sum(1 for r in rows if r["status"] != Status.OFF)
    came = summary[Status.PRESENT] + summary[Status.LATE]
    return {
        "date": d,
        "rows": rows,
        "summary": {
            "total": len(rows),
            "expected": expected_total,
            "present": summary[Status.PRESENT],
            "late": summary[Status.LATE],
            "absent": summary[Status.ABSENT],
            "excused": summary[Status.EXCUSED],
            "pending": summary[Status.PENDING],
            "off": summary[Status.OFF],
            "came": came,
            "rate": round(came * 100 / max(1, expected_total - summary[Status.EXCUSED] - summary[Status.PENDING]), 1) if expected_total else 0,
        },
    }


def period_range(period, anchor):
    if period == "week":
        start = anchor - timedelta(days=anchor.isoweekday() - 1)
        end = start + timedelta(days=6)
    elif period == "month":
        start = anchor.replace(day=1)
        nxt = (start + timedelta(days=32)).replace(day=1)
        end = nxt - timedelta(days=1)
    else:
        start = end = anchor
    return start, end


def range_report(start, end, teacher_ids=None):
    """Davr bo'yicha har bir o'qituvchi va har kun uchun haqiqiy statistikalar."""
    ctx = Context.load()
    at = now()
    last_day = min(end, at.date())
    teachers = list(_teachers().filter(id__in=teacher_ids) if teacher_ids else _teachers())
    tids = [t.id for t in teachers]
    recs = defaultdict(dict)
    for r in AttendanceRecord.objects.filter(date__range=(start, end), teacher_id__in=tids):
        recs[r.teacher_id][r.date] = r
    abs_map = absences_map(start, end, tids)
    days = []
    d = start
    while d <= last_day:
        days.append(d)
        d += timedelta(days=1)

    per_teacher = []
    daily = {dd: defaultdict(int) for dd in days}
    for t in teachers:
        agg = defaultdict(int)
        arrivals = []
        worked = 0.0
        for dd in days:
            rec = recs[t.id].get(dd)
            exp = rec.expected_at if rec and rec.expected_at else ctx.expected_at(t.id, dd)
            ab = find_absence(abs_map.get(t.id, []), dd)
            st = compute_status(exp, rec, ab, at if dd == at.date() else aware(dd, ctx.settings.work_end) + timedelta(hours=6))
            agg[st] += 1
            daily[dd][st] += 1
            if rec and rec.check_in:
                lt = timezone.localtime(rec.check_in)
                arrivals.append(lt.hour * 60 + lt.minute)
                agg["late_minutes"] += rec.late_minutes
                if rec.check_out:
                    worked += (rec.check_out - rec.check_in).total_seconds() / 3600
        workdays = agg[Status.PRESENT] + agg[Status.LATE] + agg[Status.ABSENT] + agg[Status.EXCUSED]
        came = agg[Status.PRESENT] + agg[Status.LATE]
        avg = round(sum(arrivals) / len(arrivals)) if arrivals else None
        per_teacher.append({
            "teacher": t,
            "workdays": workdays,
            "present": agg[Status.PRESENT],
            "late": agg[Status.LATE],
            "absent": agg[Status.ABSENT],
            "excused": agg[Status.EXCUSED],
            "late_minutes": agg["late_minutes"],
            "avg_arrival": f"{avg // 60:02d}:{avg % 60:02d}" if avg is not None else None,
            "worked_hours": round(worked, 1),
            "rate": round(came * 100 / max(1, workdays - agg[Status.EXCUSED]), 1) if workdays else None,
        })
    per_teacher.sort(key=lambda x: (-(x["late"] + x["absent"]), x["teacher"].user.last_name))
    totals = defaultdict(int)
    for p in per_teacher:
        for k in ("workdays", "present", "late", "absent", "excused", "late_minutes"):
            totals[k] += p[k]
    tw = totals["workdays"] - totals["excused"]
    totals["rate"] = round((totals["present"] + totals["late"]) * 100 / tw, 1) if tw > 0 else None
    totals["punctuality"] = round(totals["present"] * 100 / max(1, totals["present"] + totals["late"]), 1) if (totals["present"] + totals["late"]) else None
    series = [{
        "date": dd.isoformat(),
        "present": daily[dd][Status.PRESENT],
        "late": daily[dd][Status.LATE],
        "absent": daily[dd][Status.ABSENT],
        "excused": daily[dd][Status.EXCUSED],
    } for dd in days]
    return {"start": start, "end": end, "teachers": per_teacher, "totals": dict(totals), "series": series}
