"""Ro'yxatdan o'tish, direktor tasdig'i, parolni tiklash so'rovi, Google orqali kirish."""
import logging

from django.conf import settings
from django.contrib.auth import password_validation
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, serializers, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from core.files import signed_url
from core.models import audit

from .models import MANAGER_ROLES, Approval, Role, User
from .permissions import IsManager
from .serializers import MeSerializer, clean_phone, translate_pw
from .views import LoginThrottle, find_users, phone_digits, tokens_for

log = logging.getLogger("schoolpro")


class RegisterThrottle(ScopedRateThrottle):
    scope = "register"


class ForgotThrottle(ScopedRateThrottle):
    scope = "forgot"


def has_manager():
    return User.objects.filter(role__in=MANAGER_ROLES, is_active=True, approval=Approval.APPROVED).exists()


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def public_info(request):
    """Kirish va ro'yxatdan o'tish sahifalari uchun ochiq ma'lumot (shaxsiy ma'lumot yo'q)."""
    from school.models import SchoolClass, SchoolSettings, Subject

    s = SchoolSettings.get()
    return Response({
        "school": s.name if s.name != "Maktab" else "",
        "logo_url": signed_url(s.logo) if s.logo else None,
        "splash_url": signed_url(s.splash) if s.splash else None,
        "has_director": has_manager(),
        "allow_registration": s.allow_registration,
        "classes": [{"id": c.id, "name": c.name} for c in SchoolClass.objects.filter(is_active=True)],
        "subjects": [{"id": x.id, "name": x.name} for x in Subject.objects.all()],
        "google_client_id": settings.GOOGLE_CLIENT_ID or None,
        "otp": bool(settings.TELEGRAM_BOT_TOKEN),
    })


class RegisterSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=["student", "teacher", "director"])
    first_name = serializers.CharField(max_length=64)
    last_name = serializers.CharField(max_length=64)
    middle_name = serializers.CharField(max_length=64, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    phone_token = serializers.CharField(required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    password = serializers.CharField(min_length=8, max_length=128, required=False, allow_blank=True)
    birth_date = serializers.DateField(required=False, allow_null=True)
    school_class = serializers.IntegerField(required=False, allow_null=True)
    parent_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    subjects = serializers.ListField(child=serializers.IntegerField(), required=False)
    position = serializers.CharField(max_length=80, required=False, allow_blank=True)
    school_name = serializers.CharField(max_length=150, required=False, allow_blank=True)

    def validate_first_name(self, v):
        v = v.strip()
        if len(v) < 2:
            raise serializers.ValidationError("Ismni to'liq kiriting")
        return v

    def validate_last_name(self, v):
        v = v.strip()
        if len(v) < 2:
            raise serializers.ValidationError("Familiyani to'liq kiriting")
        return v

    def _check_phone_free(self, v):
        d = phone_digits(v)
        if User.objects.filter(Q(username__in=[d, "+" + d]) | Q(phone__in=["+" + d, d])).exclude(approval=Approval.REJECTED).exists():
            raise serializers.ValidationError({"phone": "Bu telefon raqami bilan hisob allaqachon bor. «Kirish» orqali kiring."})

    def validate_email(self, v):
        v = (v or "").strip().lower()
        if v and User.objects.filter(email__iexact=v).exclude(approval=Approval.REJECTED).exists():
            raise serializers.ValidationError("Bu email bilan hisob allaqachon bor")
        return v

    def validate_parent_phone(self, v):
        return clean_phone(v)

    def validate(self, data):
        from school.models import SchoolClass

        from .otp import otp_enabled, verified_phone

        if data.get("phone_token"):
            data["phone"] = verified_phone(data["phone_token"])  # Telegram kodi bilan tasdiqlangan
        elif otp_enabled():
            raise serializers.ValidationError({"phone": "Avval telefon raqamingizni Telegram kodi bilan tasdiqlang"})
        else:
            data["phone"] = clean_phone(data.get("phone", ""))
            if not data["phone"]:
                raise serializers.ValidationError({"phone": "Telefon raqamini kiriting"})
            if not data.get("password"):
                raise serializers.ValidationError({"password": "Parol kiriting"})
        self._check_phone_free(data["phone"])
        if data.get("password"):
            try:
                password_validation.validate_password(data["password"], User(first_name=data["first_name"], last_name=data["last_name"]))
            except Exception as exc:  # noqa: BLE001
                raise serializers.ValidationError({"password": [translate_pw(m) for m in getattr(exc, "messages", [str(exc)])]})
        if data["role"] == "student":
            cid = data.get("school_class")
            if not cid or not SchoolClass.objects.filter(pk=cid, is_active=True).exists():
                raise serializers.ValidationError({"school_class": "Sinfingizni tanlang"})
        return data


def _notify_managers_about(user):
    from bot.telegram import esc, notify_managers
    from school.services import managers, notify

    role = {"student": "O'quvchi", "teacher": "O'qituvchi", "admin": "Administrator"}.get(user.role, user.role)
    extra = ""
    if user.role == Role.STUDENT and hasattr(user, "student") and user.student.school_class:
        extra = f" · {user.student.school_class.name} sinf"
    notify(managers(), "registration", f"Yangi ro'yxatdan o'tish: {user.full_name}", f"{role}{extra} · {user.phone}", "/d/requests")
    notify_managers(f"📝 <b>Ro'yxatdan o'tish so'rovi</b>\n{esc(user.full_name)} — {role}{esc(extra)}\n📞 {esc(user.phone)}\n\nPanel → So'rovlar bo'limida tasdiqlang.")


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@throttle_classes([RegisterThrottle])
@transaction.atomic
def register(request):
    from school.models import SchoolClass, SchoolSettings, StudentProfile, Subject, TeacherProfile

    s = SchoolSettings.get()
    ser = RegisterSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    d = ser.validated_data
    role = d["role"]
    first_director = role == "director" and not has_manager()
    if not s.allow_registration and not first_director:
        raise ValidationError({"detail": "Ro'yxatdan o'tish yopilgan. Hisobni maktab ma'muriyati ochib beradi."})

    pd = phone_digits(d["phone"])
    User.objects.filter(Q(username__in=[pd, "+" + pd]) | Q(phone__in=["+" + pd, pd]), approval=Approval.REJECTED, self_registered=True).delete()
    user = User(
        username=pd, phone=d["phone"], email=d.get("email", ""),
        first_name=d["first_name"], last_name=d["last_name"], middle_name=d.get("middle_name", "").strip(),
        birth_date=d.get("birth_date"), self_registered=True,
    )
    if role == "director":
        user.role = Role.DIRECTOR if first_director else Role.ADMIN
    else:
        user.role = role
    if first_director:
        user.approval, user.is_active = Approval.APPROVED, True
    else:
        user.approval, user.is_active = Approval.PENDING, False
    if d.get("password"):
        user.set_password(d["password"])
    else:
        user.set_unusable_password()  # faqat Telegram kodi orqali kiradi
    user.save()

    if role == "student":
        sp = StudentProfile.objects.create(user=user, school_class=SchoolClass.objects.get(pk=d["school_class"]), parent_phone=d.get("parent_phone", ""))
        sp.student_no = f"{sp.id:05d}"
        sp.save(update_fields=["student_no"])
    elif role == "teacher":
        tp = TeacherProfile.objects.create(user=user, position=(d.get("position") or "O'qituvchi").strip())
        tp.subjects.set(Subject.objects.filter(id__in=d.get("subjects") or []))

    audit(request, "registered", user.full_name, actor=user, role=user.role)
    if first_director:
        name = (d.get("school_name") or "").strip()
        if name:
            s.name = name[:150]
            s.save(update_fields=["name", "updated_at"])
        return Response({"status": "active", **tokens_for(user), "user": MeSerializer(user).data}, status=status.HTTP_201_CREATED)
    _notify_managers_about(user)
    return Response({"status": "pending", "role": user.role, "username": user.username}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@throttle_classes([ForgotThrottle])
def forgot_password(request):
    """Parolni tiklash so'rovi ma'muriyatga yuboriladi (SMS/email xizmati ulanmagan).
    Javob har doim bir xil — kimning hisobi borligini bilib bo'lmaydi."""
    from bot.telegram import esc, notify_managers
    from school.services import managers, notify

    ident = (request.data.get("login") or "").strip()
    if len(ident) < 3:
        raise ValidationError({"login": "Telefon raqami yoki loginni kiriting"})
    users = [u for u in find_users(ident) if u.is_active and u.approval == Approval.APPROVED]
    if len(users) == 1:
        u = users[0]
        link = f"/d/teachers/{u.teacher.id}" if u.is_teacher and hasattr(u, "teacher") else "/d/students" if u.is_student else "/d/settings"
        notify(managers().exclude(pk=u.pk), "password", f"Parolni tiklash so'rovi: {u.full_name}", f"Login: {u.username} · {u.phone}", link)
        notify_managers(f"🔑 <b>Parolni tiklash so'rovi</b>\n{esc(u.full_name)} (login: {esc(u.username)})\nPanelda «Parolni tiklash» tugmasini bosing va yangi parolni egasiga bering.")
        audit(request, "password_reset_requested", u.username, actor=None)
    return Response({"detail": "So'rov yuborildi. Maktab ma'muriyati yangi vaqtinchalik parol beradi."})


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@throttle_classes([LoginThrottle])
def google_login(request):
    if not settings.GOOGLE_CLIENT_ID:
        raise ValidationError({"detail": "Google orqali kirish sozlanmagan"})
    cred = request.data.get("credential") or ""
    try:
        import jwt

        client = jwt.PyJWKClient("https://www.googleapis.com/oauth2/v3/certs", cache_keys=True)
        key = client.get_signing_key_from_jwt(cred).key
        payload = jwt.decode(cred, key, algorithms=["RS256"], audience=settings.GOOGLE_CLIENT_ID,
                             issuer=["accounts.google.com", "https://accounts.google.com"])
    except Exception as exc:  # noqa: BLE001
        log.info("Google token xatosi: %s", exc)
        raise ValidationError({"detail": "Google tasdig'i o'tmadi. Qayta urinib ko'ring."})
    if not payload.get("email_verified"):
        raise ValidationError({"detail": "Google emailingiz tasdiqlanmagan"})
    email = payload["email"].lower()
    users = list(User.objects.filter(email__iexact=email))
    if len(users) != 1:
        return Response({"detail": f"{email} bilan bog'langan hisob topilmadi. Avval telefon orqali kiring va profilingizga shu emailni yozing yoki ro'yxatdan o'ting.",
                         "code": "not_linked", "email": email}, status=status.HTTP_404_NOT_FOUND)
    u = users[0]
    if u.approval == Approval.PENDING:
        return Response({"detail": "Hisobingiz maktab ma'muriyati tasdig'ini kutmoqda.", "code": "pending"}, status=status.HTTP_403_FORBIDDEN)
    if not u.is_active or u.approval != Approval.APPROVED:
        return Response({"detail": "Hisobingiz faol emas. Maktab ma'muriyatiga murojaat qiling."}, status=status.HTTP_403_FORBIDDEN)
    u.last_login = timezone.now()
    u.save(update_fields=["last_login"])
    audit(request, "login", u.username, actor=u, via="google")
    return Response({**tokens_for(u), "user": MeSerializer(u).data})



# ---------------- Direktor: so'rovlarni ko'rib chiqish ----------------

def _request_row(u):
    row = {"id": u.id, "full_name": u.full_name, "first_name": u.first_name, "last_name": u.last_name, "middle_name": u.middle_name,
           "role": u.role, "phone": u.phone, "email": u.email, "birth_date": u.birth_date, "created_at": u.date_joined,
           "approval": u.approval, "reject_reason": u.reject_reason}
    if u.role == Role.STUDENT and hasattr(u, "student"):
        c = u.student.school_class
        row.update(school_class=c.id if c else None, class_name=c.name if c else None, parent_phone=u.student.parent_phone)
    if u.role == Role.TEACHER and hasattr(u, "teacher"):
        row.update(subjects=[x.id for x in u.teacher.subjects.all()], subject_names=[x.name for x in u.teacher.subjects.all()],
                   position=u.teacher.position)
    return row


@api_view(["GET"])
@permission_classes([IsManager])
def registrations(request):
    st = request.query_params.get("status", "pending")
    qs = User.objects.filter(self_registered=True).select_related("student__school_class", "teacher").prefetch_related("teacher__subjects")
    if st in ("pending", "rejected", "approved"):
        qs = qs.filter(approval=st)
    return Response([_request_row(u) for u in qs.order_by("-date_joined")[:300]])


@api_view(["POST"])
@permission_classes([IsManager])
@transaction.atomic
def registration_review(request, pk):
    from school.models import SchoolClass, Subject
    from school.services import notify

    u = get_object_or_404(User, pk=pk, self_registered=True)
    action = request.data.get("action")
    if action == "approve":
        if u.role == Role.ADMIN and request.user.role != Role.DIRECTOR:
            raise ValidationError({"detail": "Administratorni faqat direktor tasdiqlaydi"})
        if u.role == Role.STUDENT and request.data.get("school_class"):
            u.student.school_class = get_object_or_404(SchoolClass, pk=request.data["school_class"])
            u.student.save(update_fields=["school_class"])
        if u.role == Role.TEACHER and isinstance(request.data.get("subjects"), list):
            u.teacher.subjects.set(Subject.objects.filter(id__in=request.data["subjects"]))
        u.approval, u.is_active, u.reject_reason = Approval.APPROVED, True, ""
        u.save(update_fields=["approval", "is_active", "reject_reason"])
        notify([u], "welcome", "Xush kelibsiz! Hisobingiz tasdiqlandi", "Endi SchoolPro'dan to'liq foydalanishingiz mumkin", "/")
        audit(request, "registration_approved", u.full_name)
    elif action == "reject":
        u.approval, u.is_active = Approval.REJECTED, False
        u.reject_reason = (request.data.get("reason") or "").strip()[:255]
        u.save(update_fields=["approval", "is_active", "reject_reason"])
        audit(request, "registration_rejected", u.full_name, reason=u.reject_reason)
    else:
        raise ValidationError({"action": "approve | reject"})
    return Response(_request_row(u))
