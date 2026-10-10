import base64
import binascii
import csv
import io
from datetime import date as Date, timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action, api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from accounts.permissions import IsManager, IsTeacher
from bot.telegram import esc, notify_managers
from core.files import delete_file, signed_url, store_bytes
from core.models import audit, client_ip
from school.models import Lesson, Period, SchoolSettings, TeacherProfile
from school.services import managers, notify
from school.views import teacher_of

from . import biometrics
from .logic import (
    STATUS_LABELS, Context, Status, aware, day_board, now, period_range, range_report, register_scan, today,
)
from .models import (
    CONSENT_VERSION, Absence, AlertLog, AttendanceEvent, AttendanceRecord, FaceConsent, FaceEnrollment, KioskDevice, Method,
)


def _parse_date(value, default=None):
    if not value:
        return default
    try:
        return Date.fromisoformat(value)
    except ValueError:
        raise ValidationError({"date": "Sana YYYY-MM-DD ko'rinishida bo'lsin"})


def _t(dt):
    return timezone.localtime(dt).strftime("%H:%M") if dt else None


def teacher_brief(t):
    return {"id": t.id, "full_name": t.user.full_name, "position": t.position,
            "avatar_url": signed_url(t.user.avatar) if t.user.avatar else None}


def board_row(r):
    rec = r["record"]
    ab = r["absence"]
    return {
        "teacher": teacher_brief(r["teacher"]),
        "status": r["status"],
        "status_label": STATUS_LABELS[r["status"]],
        "expected_at": _t(r["expected_at"]),
        "check_in": _t(rec.check_in) if rec else None,
        "check_out": _t(rec.check_out) if rec else None,
        "in_method": rec.in_method if rec else None,
        "out_method": rec.out_method if rec else None,
        "late_minutes": r["late_minutes"],
        "note": rec.note if rec else "",
        "absence": {"id": ab.id, "reason": ab.get_reason_display(), "note": ab.note} if ab else None,
    }


# ---------------- Direktor: davomat ----------------

@api_view(["GET"])
@permission_classes([IsManager])
def board(request):
    d = _parse_date(request.query_params.get("date"), today())
    data = day_board(d)
    events = AttendanceEvent.objects.filter(at__date=d).select_related("teacher__user", "device")[:50]
    return Response({
        "date": d,
        "summary": data["summary"],
        "rows": [board_row(r) for r in data["rows"]],
        "events": [{
            "id": e.id, "type": e.type, "at": _t(e.at), "method": e.method, "teacher": teacher_brief(e.teacher),
            "device": e.device.name if e.device else None, "photo_url": signed_url(e.photo) if e.photo else None,
            "note": e.note,
        } for e in events],
    })


@api_view(["GET"])
@permission_classes([IsManager])
def report(request):
    p = request.query_params
    period = p.get("period", "week")
    if period not in ("day", "week", "month", "custom"):
        raise ValidationError({"period": "day | week | month | custom"})
    anchor = _parse_date(p.get("date"), today())
    if period == "custom":
        start = _parse_date(p.get("from"))
        end = _parse_date(p.get("to"))
        if not start or not end or start > end or (end - start).days > 366:
            raise ValidationError({"detail": "Sanalar oralig'ini to'g'ri tanlang (ko'pi bilan 1 yil)"})
    else:
        start, end = period_range(period, anchor)
    tids = [int(p["teacher"])] if p.get("teacher", "").isdigit() else None
    rep = range_report(start, end, tids)
    rows = [{**{k: v for k, v in r.items() if k != "teacher"}, "teacher": teacher_brief(r["teacher"])} for r in rep["teachers"]]
    if p.get("export") == "csv":
        buf = io.StringIO()
        buf.write("﻿")
        w = csv.writer(buf, delimiter=";")
        w.writerow(["O'qituvchi", "Lavozim", "Ish kunlari", "O'z vaqtida", "Kechikkan", "Kechikish (daq.)", "Sababsiz kelmagan",
                    "Sababli", "O'rtacha kelish", "Ishlagan soat", "Davomat %"])
        for r in rows:
            w.writerow([r["teacher"]["full_name"], r["teacher"]["position"], r["workdays"], r["present"], r["late"], r["late_minutes"],
                        r["absent"], r["excused"], r["avg_arrival"] or "", r["worked_hours"], r["rate"] if r["rate"] is not None else ""])
        resp = HttpResponse(buf.getvalue(), content_type="text/csv; charset=utf-8")
        resp["Content-Disposition"] = f'attachment; filename="davomat_{start}_{end}.csv"'
        return resp
    return Response({"period": period, "start": start, "end": end, "totals": rep["totals"], "series": rep["series"], "teachers": rows})


@api_view(["GET"])
@permission_classes([IsManager])
def teacher_history(request, teacher_id):
    t = get_object_or_404(TeacherProfile.objects.select_related("user"), pk=teacher_id)
    return Response(_history(t, request))


@api_view(["GET"])
@permission_classes([IsTeacher])
def my_attendance(request):
    return Response(_history(teacher_of(request.user), request))


def _history(t, request):
    p = request.query_params
    end = _parse_date(p.get("to"), today())
    start = _parse_date(p.get("from"), end - timedelta(days=30))
    if (end - start).days > 400:
        raise ValidationError({"detail": "Oraliq juda katta"})
    ctx = Context.load()
    recs = {r.date: r for r in AttendanceRecord.objects.filter(teacher=t, date__range=(start, end))}
    absences = list(Absence.objects.filter(teacher=t, date_from__lte=end, date_to__gte=start))
    from .logic import compute_status, find_absence
    days = []
    d = end
    cur = now()
    while d >= start:
        rec = recs.get(d)
        exp = rec.expected_at if rec and rec.expected_at else ctx.expected_at(t.id, d)
        ab = find_absence(absences, d)
        st = compute_status(exp, rec, ab, cur if d == cur.date() else aware(d, ctx.settings.work_end) + timedelta(hours=6))
        if st != Status.OFF or rec:
            days.append({
                "date": d, "weekday": d.isoweekday(), "status": st, "status_label": STATUS_LABELS[st], "expected_at": _t(exp),
                "check_in": _t(rec.check_in) if rec else None, "check_out": _t(rec.check_out) if rec else None,
                "in_method": rec.in_method if rec else None, "late_minutes": rec.late_minutes if rec else 0,
                "absence": ab.get_reason_display() if ab else None, "note": rec.note if rec else "",
            })
        d -= timedelta(days=1)
    rep = range_report(start, end, [t.id])
    summary = rep["teachers"][0] if rep["teachers"] else {}
    summary = {k: v for k, v in summary.items() if k != "teacher"}
    return {"teacher": teacher_brief(t), "start": start, "end": end, "days": days, "summary": summary,
            "absences": [{"id": a.id, "date_from": a.date_from, "date_to": a.date_to, "reason": a.reason,
                          "reason_label": a.get_reason_display(), "note": a.note} for a in absences]}


class ManualSerializer(serializers.Serializer):
    teacher = serializers.PrimaryKeyRelatedField(queryset=TeacherProfile.objects.all())
    type = serializers.ChoiceField(choices=["in", "out"])
    date = serializers.DateField()
    time = serializers.TimeField()
    note = serializers.CharField(max_length=255)


@api_view(["POST"])
@permission_classes([IsManager])
def manual_mark(request):
    """Direktor qo'lda kiritadi (masalan, qurilma ishlamagan kun). Sabab majburiy — jurnalda saqlanadi."""
    s = ManualSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    d = s.validated_data
    at = aware(d["date"], d["time"])
    if at > now() + timedelta(minutes=5):
        raise ValidationError({"time": "Kelajakdagi vaqtni kiritib bo'lmaydi"})
    rec = AttendanceRecord.objects.filter(teacher=d["teacher"], date=d["date"]).first()
    if d["type"] == "out" and (not rec or not rec.check_in):
        raise ValidationError({"detail": "Avval kelish vaqtini kiriting"})
    if d["type"] == "out" and at <= rec.check_in:
        raise ValidationError({"time": "Ketish vaqti kelish vaqtidan keyin bo'lishi kerak"})
    action_name, rec = register_scan(d["teacher"], Method.MANUAL, at=at, actor=request.user, note=d["note"].strip(), force_type=d["type"])
    audit(request, "attendance_manual", d["teacher"].user.full_name, type=d["type"], at=at.isoformat(), note=d["note"])
    return Response({"ok": True, "action": action_name})


class AbsenceSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source="teacher.user.full_name", read_only=True)
    reason_label = serializers.CharField(source="get_reason_display", read_only=True)
    approved_by_name = serializers.CharField(source="approved_by.full_name", read_only=True, default=None)

    class Meta:
        model = Absence
        fields = ["id", "teacher", "teacher_name", "date_from", "date_to", "reason", "reason_label", "note", "approved_by_name", "created_at"]

    def validate(self, data):
        if data["date_to"] < data["date_from"]:
            raise serializers.ValidationError({"date_to": "Tugash sanasi boshlanishdan oldin bo'lmasin"})
        if (data["date_to"] - data["date_from"]).days > 180:
            raise serializers.ValidationError({"date_to": "Ko'pi bilan 180 kun"})
        return data


class AbsenceViewSet(viewsets.ModelViewSet):
    serializer_class = AbsenceSerializer
    permission_classes = [IsManager]

    def get_queryset(self):
        qs = Absence.objects.select_related("teacher__user", "approved_by")
        p = self.request.query_params
        if p.get("teacher"):
            qs = qs.filter(teacher_id=p["teacher"])
        if p.get("active") == "1":
            qs = qs.filter(date_to__gte=today())
        return qs

    def perform_create(self, serializer):
        obj = serializer.save(approved_by=self.request.user)
        audit(self.request, "absence_created", obj.teacher.user.full_name, reason=obj.reason, date_from=str(obj.date_from), date_to=str(obj.date_to))

    def perform_destroy(self, instance):
        audit(self.request, "absence_deleted", instance.teacher.user.full_name)
        instance.delete()


# ---------------- Biometrika: rozilik va ro'yxatdan o'tish ----------------

CONSENT_TEXT = (
    "Men maktab davomatini yuritish maqsadida yuzimning raqamli namunasi (128 ta sondan iborat vektor) "
    "olinishiga va saqlanishiga roziman. Namuna shifrlangan holda faqat shu maktab serverida saqlanadi, "
    "uchinchi shaxslarga berilmaydi va boshqa maqsadda ishlatilmaydi. Kirish vaqtida tasdiq uchun kichik surat "
    "{days} kun saqlanadi va keyin avtomatik o'chiriladi. Rozilikni istalgan vaqtda ilovada qaytarib olishim mumkin — "
    "shunda barcha namunalarim darhol o'chiriladi va men PIN-kod yoki qo'lda belgilash orqali davomatdan o'taman. "
    "(O'zbekiston Respublikasining «Shaxsga doir ma'lumotlar to'g'risida»gi Qonuni asosida.)"
)


def _face_state(t):
    consent = FaceConsent.objects.filter(teacher=t).first()
    enrollments = list(t.face_enrollments.all()[:5])
    s = SchoolSettings.get()
    return {
        "consent": {"active": bool(consent and consent.active), "given_at": consent.given_at if consent else None,
                    "withdrawn_at": consent.withdrawn_at if consent else None, "version": CONSENT_VERSION},
        "consent_text": CONSENT_TEXT.format(days=s.photo_retention_days),
        "enrollments": [{"id": e.id, "status": e.status, "samples": e.samples, "created_at": e.created_at,
                         "reject_reason": e.reject_reason, "reviewed_at": e.reviewed_at} for e in enrollments],
        "pin_set": bool(t.pin_hash),
        "require_liveness": s.require_liveness,
    }


@api_view(["GET", "POST", "DELETE"])
@permission_classes([IsTeacher])
def my_face(request):
    t = teacher_of(request.user)
    if request.method == "POST":  # rozilik berish
        if request.data.get("agree") is not True:
            raise ValidationError({"detail": "Rozilik matnini o'qib, tasdiqlang"})
        FaceConsent.objects.update_or_create(teacher=t, defaults={"given_at": timezone.now(), "withdrawn_at": None,
                                                                    "version": CONSENT_VERSION, "ip": client_ip(request)})
        audit(request, "face_consent_given", t.user.full_name)
    elif request.method == "DELETE":  # rozilikni qaytarib olish → namunalar o'chadi
        withdraw_consent(t, request)
    return Response(_face_state(t))


def withdraw_consent(t, request):
    FaceConsent.objects.filter(teacher=t).update(withdrawn_at=timezone.now())
    for e in t.face_enrollments.all():
        delete_file(e.photo)
    t.face_enrollments.all().delete()
    audit(request, "face_consent_withdrawn", t.user.full_name)


def _decode_photo(b64, max_bytes=400_000):
    if not b64:
        return None
    if "," in b64[:40]:
        b64 = b64.split(",", 1)[1]
    try:
        raw = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError):
        raise ValidationError({"photo": "Surat noto'g'ri"})
    if len(raw) > max_bytes or raw[:3] != b"\xff\xd8\xff":
        raise ValidationError({"photo": "Surat JPEG va 400 KB dan kichik bo'lishi kerak"})
    from core.files import _reencode_image
    raw, _, _ = _reencode_image(raw, max_side=480)
    return raw


@api_view(["POST"])
@permission_classes([IsTeacher])
def my_face_enroll(request):
    t = teacher_of(request.user)
    return Response(_enroll(t, request), status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsManager])
def teacher_face_enroll(request, teacher_id):
    """Direktor o'qituvchini o'z qurilmasida ro'yxatdan o'tkazadi (rozilik oldindan berilgan bo'lishi shart)."""
    t = get_object_or_404(TeacherProfile, pk=teacher_id)
    return Response(_enroll(t, request, auto_approve=True), status=status.HTTP_201_CREATED)


def _enroll(t, request, auto_approve=False):
    consent = FaceConsent.objects.filter(teacher=t).first()
    if not consent or not consent.active:
        raise ValidationError({"detail": "Avval o'qituvchi biometrik ma'lumotlarga rozilik berishi kerak"})
    vectors = request.data.get("descriptors")
    if not isinstance(vectors, list) or not biometrics.MIN_SAMPLES <= len(vectors) <= biometrics.MAX_SAMPLES:
        raise ValidationError({"detail": f"{biometrics.MIN_SAMPLES}–{biometrics.MAX_SAMPLES} ta namuna kerak"})
    vectors = [biometrics.validate_descriptor(v) for v in vectors]
    spread = biometrics.consistency(vectors)
    if spread > 0.65:
        raise ValidationError({"detail": "Namunalar bir-biriga mos emas (kadrda boshqa odam bo'lgan bo'lishi mumkin). Qaytadan, yaxshi yorug'likda urinib ko'ring."})
    # Boshqa o'qituvchining yuziga juda o'xshash bo'lsa — ro'yxatdan o'tkazilmaydi (birovning o'rniga yozilish himoyasi)
    s = SchoolSettings.get()
    gallery = biometrics.load_gallery()
    centroid = [sum(c) / len(vectors) for c in zip(*vectors)]
    for tid, vecs in gallery.items():
        if tid != t.id and vecs and min(biometrics.distance(centroid, v) for v in vecs) < s.face_threshold:
            raise ValidationError({"detail": "Bu yuz boshqa o'qituvchining namunasiga juda o'xshash. Direktorga murojaat qiling."})
    raw = _decode_photo(request.data.get("photo"))
    photo = store_bytes(raw, "faces/enroll") if raw else ""
    with transaction.atomic():
        old = list(t.face_enrollments.filter(status__in=["pending", "rejected"]))
        for e in old:
            delete_file(e.photo)
            e.delete()
        e = FaceEnrollment.objects.create(
            teacher=t, templates=biometrics.encrypt_templates(vectors), samples=len(vectors), photo=photo, created_by=request.user,
            status=FaceEnrollment.Status.APPROVED if auto_approve else FaceEnrollment.Status.PENDING,
            reviewed_by=request.user if auto_approve else None, reviewed_at=timezone.now() if auto_approve else None,
        )
        if auto_approve:
            for prev in t.face_enrollments.filter(status="approved").exclude(pk=e.pk):
                delete_file(prev.photo)
                prev.delete()
    audit(request, "face_enrolled", t.user.full_name, samples=len(vectors), spread=round(spread, 3))
    if not auto_approve:
        notify(managers(), "face", f"Yuz namunasi tasdiq kutmoqda: {t.user.full_name}", "Biometrika bo'limida tekshiring", "/d/biometrics")
    return _face_state(t)


@api_view(["GET"])
@permission_classes([IsManager])
def enrollments(request):
    qs = FaceEnrollment.objects.select_related("teacher__user", "reviewed_by")
    st = request.query_params.get("status")
    if st:
        qs = qs.filter(status=st)
    consents = {c.teacher_id: c for c in FaceConsent.objects.all()}
    teachers = TeacherProfile.objects.filter(user__is_active=True).select_related("user").prefetch_related("face_enrollments")
    overview = []
    for t in teachers:
        c = consents.get(t.id)
        sts = {e.status for e in t.face_enrollments.all()}
        overview.append({**teacher_brief(t), "consent": bool(c and c.active), "approved": "approved" in sts, "pending": "pending" in sts,
                         "pin_set": bool(t.pin_hash)})
    return Response({
        "items": [{"id": e.id, "teacher": teacher_brief(e.teacher), "status": e.status, "samples": e.samples, "created_at": e.created_at,
                   "photo_url": signed_url(e.photo) if e.photo else None, "reviewed_by": e.reviewed_by.full_name if e.reviewed_by else None,
                   "reject_reason": e.reject_reason} for e in qs[:100]],
        "teachers": overview,
    })


@api_view(["POST"])
@permission_classes([IsManager])
def enrollment_review(request, pk):
    e = get_object_or_404(FaceEnrollment.objects.select_related("teacher__user"), pk=pk)
    act = request.data.get("action")
    if act == "approve":
        with transaction.atomic():
            for prev in e.teacher.face_enrollments.filter(status="approved").exclude(pk=e.pk):
                delete_file(prev.photo)
                prev.delete()
            e.status = FaceEnrollment.Status.APPROVED
            e.reviewed_by = request.user
            e.reviewed_at = timezone.now()
            e.save()
        notify([e.teacher.user], "face", "Yuz orqali davomat yoqildi", "Endi darvozadagi qurilmada yuzingiz bilan belgilanasiz", "/t/face")
        audit(request, "face_approved", e.teacher.user.full_name)
    elif act == "reject":
        e.status = FaceEnrollment.Status.REJECTED
        e.reject_reason = (request.data.get("reason") or "Surat sifatsiz yoki boshqa odam")[:255]
        e.reviewed_by = request.user
        e.reviewed_at = timezone.now()
        e.save()
        notify([e.teacher.user], "face", "Yuz namunasi rad etildi", e.reject_reason, "/t/face")
        audit(request, "face_rejected", e.teacher.user.full_name)
    else:
        raise ValidationError({"action": "approve | reject"})
    return Response({"ok": True, "status": e.status})


@api_view(["DELETE"])
@permission_classes([IsManager])
def teacher_face_delete(request, teacher_id):
    t = get_object_or_404(TeacherProfile, pk=teacher_id)
    for e in t.face_enrollments.all():
        delete_file(e.photo)
    t.face_enrollments.all().delete()
    audit(request, "face_deleted", t.user.full_name)
    return Response({"ok": True})


# ---------------- PIN ----------------

def validate_and_hash_pin(pin):
    if not pin.isdigit() or not 4 <= len(pin) <= 6:
        raise ValidationError({"pin": "PIN 4–6 ta raqamdan iborat bo'lsin"})
    if len(set(pin)) == 1 or pin in "0123456789" or pin in "9876543210":
        raise ValidationError({"pin": "Juda oddiy PIN (1111, 1234 kabi) tanlamang"})
    return make_password(pin)


@api_view(["POST", "DELETE"])
@permission_classes([IsTeacher])
def my_pin(request):
    t = teacher_of(request.user)
    if request.method == "DELETE":
        t.pin_hash = ""
    else:
        if not request.user.check_password(request.data.get("password") or ""):
            raise ValidationError({"password": "Parol noto'g'ri"})
        t.pin_hash = validate_and_hash_pin(str(request.data.get("pin", "")).strip())
    t.pin_failed = 0
    t.pin_locked_until = None
    t.save(update_fields=["pin_hash", "pin_failed", "pin_locked_until"])
    audit(request, "pin_set" if t.pin_hash else "pin_removed", t.user.full_name)
    return Response({"pin_set": bool(t.pin_hash)})


# ---------------- Kiosk qurilmalar ----------------

class KioskSerializer(serializers.ModelSerializer):
    is_paired = serializers.BooleanField(read_only=True)

    class Meta:
        model = KioskDevice
        fields = ["id", "name", "is_active", "is_paired", "pair_code", "pair_expires", "last_seen", "created_at"]
        read_only_fields = ["pair_code", "pair_expires", "last_seen", "created_at"]


class KioskViewSet(viewsets.ModelViewSet):
    serializer_class = KioskSerializer
    permission_classes = [IsManager]
    pagination_class = None
    queryset = KioskDevice.objects.order_by("-created_at")

    def perform_create(self, serializer):
        d = serializer.save(created_by=self.request.user)
        d.new_pair_code()
        audit(self.request, "kiosk_created", d.name)

    def perform_destroy(self, instance):
        audit(self.request, "kiosk_revoked", instance.name)
        instance.delete()

    @action(detail=True, methods=["post"], url_path="pair-code")
    def pair_code(self, request, pk=None):
        d = self.get_object()
        d.token_hash = ""  # qayta juftlash: eski qurilma darhol uziladi
        d.save(update_fields=["token_hash"])
        d.new_pair_code()
        return Response(KioskSerializer(d).data)


class KioskThrottle(ScopedRateThrottle):
    scope = "kiosk"


class PinThrottle(ScopedRateThrottle):
    scope = "pin"


class KioskAuthFailed(APIException):
    status_code = 401
    default_detail = "Qurilma ulanmagan yoki o'chirilgan. Direktor panelidan qayta juftlang."
    default_code = "kiosk_unpaired"


def kiosk_device(request):
    d = KioskDevice.by_token(request.headers.get("X-Kiosk-Token", ""))
    if not d:
        raise KioskAuthFailed()
    KioskDevice.objects.filter(pk=d.pk).update(last_seen=timezone.now())
    return d


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([PinThrottle])
def kiosk_pair(request):
    code = str(request.data.get("code", "")).strip().upper().replace("-", "").replace(" ", "")
    d = KioskDevice.objects.filter(pair_code=code, is_active=True, pair_expires__gt=timezone.now()).first() if code else None
    if not d:
        raise ValidationError({"detail": "Kod noto'g'ri yoki muddati o'tgan. Direktor panelida yangi kod oling."})
    token = d.issue_token()
    audit(request, "kiosk_paired", d.name, actor=d.created_by)
    s = SchoolSettings.get()
    return Response({"token": token, "device": d.name, "school": s.name})


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([KioskThrottle])
def kiosk_status(request):
    d = kiosk_device(request)
    s = SchoolSettings.get()
    enrolled = FaceEnrollment.objects.filter(status="approved").values("teacher").distinct().count()
    board_data = day_board()
    return Response({
        "device": d.name, "school": s.name, "logo_url": signed_url(s.logo) if s.logo else None, "server_time": now(),
        "require_liveness": s.require_liveness, "store_photos": s.store_checkin_photos, "enrolled": enrolled,
        "today": {"came": board_data["summary"]["came"], "expected": board_data["summary"]["expected"]},
    })


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([KioskThrottle])
def kiosk_roster(request):
    """PIN orqali belgilash uchun: faqat PIN o'rnatgan o'qituvchilar (ism va surat)."""
    kiosk_device(request)
    qs = TeacherProfile.objects.filter(user__is_active=True, track_attendance=True).exclude(pin_hash="").select_related("user")
    return Response([teacher_brief(t) for t in qs.order_by("user__last_name")])


def _scan_response(t, action_name, rec, distance=None):
    msg = {
        "in": "Xush kelibsiz!",
        "out": "Xayr, yaxshi dam oling!",
        "duplicate": "Siz allaqachon belgilangansiz",
    }[action_name]
    return {
        "ok": True, "action": action_name, "message": msg, "teacher": teacher_brief(t),
        "time": _t(rec.check_out if action_name == "out" else rec.check_in),
        "check_in": _t(rec.check_in), "check_out": _t(rec.check_out),
        "late_minutes": rec.late_minutes if action_name == "in" else 0, "distance": distance,
    }


def after_scan(t, action_name, rec):
    """Direktorga avtomatik xabar: kechikish va dars tugamasdan ketish."""
    if action_name == "in" and rec.late_minutes > 0:
        text = (f"⏰ <b>Kechikish</b>\n{esc(t.user.full_name)} — {_t(rec.check_in)} da keldi\n"
                f"Kutilgan vaqt: {_t(rec.expected_at)} · <b>{rec.late_minutes} daqiqa</b> kechikdi")
        notify_managers(text)
        notify(managers(), "late", f"{t.user.full_name} {rec.late_minutes} daq. kechikdi", f"Keldi: {_t(rec.check_in)}", "/d/attendance")
    elif action_name == "out":
        last = Lesson.objects.filter(teacher=t, weekday=rec.date.isoweekday()).order_by("-period").first()
        if last:
            p = Period.objects.filter(number=last.period).first()
            if p and rec.check_out < aware(rec.date, p.end) and AlertLog.once(f"early:{t.id}:{rec.date}"):
                text = (f"🚪 <b>Erta ketish</b>\n{esc(t.user.full_name)} — {_t(rec.check_out)} da chiqdi\n"
                        f"Oxirgi darsi {p.end:%H:%M} da tugaydi ({last.school_class.name})")
                notify_managers(text)


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([KioskThrottle])
def kiosk_identify(request):
    device = kiosk_device(request)
    s = SchoolSettings.get()
    probe = biometrics.validate_descriptor(request.data.get("descriptor"))
    if s.require_liveness and request.data.get("liveness") is not True:
        raise ValidationError({"detail": "Jonlilik tekshiruvi o'tmadi. Kameraga qarab, bir marta ko'z qisib qo'ying."})
    tid, dist, reason = biometrics.identify(probe, s.face_threshold)
    if not tid:
        msg = {"no_templates": "Hali hech kim yuz orqali ro'yxatdan o'tmagan",
               "ambiguous": "Aniq tanib bo'lmadi. Kameraga to'g'ri qarab qayta urinib ko'ring",
               "unknown": "Yuz tanilmadi. Qayta urinib ko'ring yoki PIN-kod bilan belgilaning"}[reason]
        return Response({"ok": False, "reason": reason, "message": msg, "distance": dist}, status=status.HTTP_200_OK)
    t = TeacherProfile.objects.select_related("user").get(pk=tid)
    photo = ""
    if s.store_checkin_photos:
        try:
            raw = _decode_photo(request.data.get("photo"))
            photo = store_bytes(raw, "faces/checkins") if raw else ""
        except ValidationError:
            photo = ""
    action_name, rec = register_scan(t, Method.FACE, device=device, distance=dist, photo=photo)
    if action_name == "duplicate":
        delete_file(photo)
    else:
        after_scan(t, action_name, rec)
    return Response(_scan_response(t, action_name, rec, dist))


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([PinThrottle])
def kiosk_pin(request):
    device = kiosk_device(request)
    t = get_object_or_404(TeacherProfile.objects.select_related("user"), pk=request.data.get("teacher"), user__is_active=True)
    pin = str(request.data.get("pin", ""))
    if not t.pin_hash:
        raise ValidationError({"detail": "Bu o'qituvchi PIN o'rnatmagan"})
    if t.pin_locked_until and t.pin_locked_until > timezone.now():
        mins = int((t.pin_locked_until - timezone.now()).total_seconds() // 60) + 1
        raise ValidationError({"detail": f"Ko'p xato urinish. {mins} daqiqadan keyin qayta urinib ko'ring."})
    if not check_password(pin, t.pin_hash):
        t.pin_failed += 1
        if t.pin_failed >= 5:
            t.pin_locked_until = timezone.now() + timedelta(minutes=15)
            t.pin_failed = 0
            notify_managers(f"🔐 {esc(t.user.full_name)} PIN-kodi 5 marta noto'g'ri kiritildi ({esc(device.name)}). 15 daqiqaga bloklandi.")
        t.save(update_fields=["pin_failed", "pin_locked_until"])
        raise ValidationError({"detail": "PIN noto'g'ri"})
    t.pin_failed = 0
    t.save(update_fields=["pin_failed"])
    action_name, rec = register_scan(t, Method.PIN, device=device)
    if action_name != "duplicate":
        after_scan(t, action_name, rec)
    return Response(_scan_response(t, action_name, rec))
