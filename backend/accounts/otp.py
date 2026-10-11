"""Telefon raqam + Telegram bot orqali bir martalik kod bilan kirish va ro'yxatdan o'tish.

1) Foydalanuvchi botda «📱 Raqamni ulashish» qiladi — Telegram raqam shu akkauntniki ekanini kafolatlaydi.
2) Ilova 4 xonali kodni o'sha chatga yuboradi (3 daqiqa amal qiladi, urinishlar cheklangan).
3) Kod to'g'ri bo'lsa — kirish (token) yoki ro'yxatdan o'tish uchun imzolangan «tasdiqlangan raqam» belgisi.
"""
import hashlib
import hmac
import secrets
from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from core.models import audit

from .models import Approval, PhoneCode, PhoneLinkToken, TelegramLink, User
from .serializers import MeSerializer, clean_phone
from .views import phone_digits, tokens_for

CODE_TTL = 180          # soniya
RESEND_AFTER = 45       # qayta yuborish oralig'i
MAX_PER_HOUR = 6        # bir raqamga soatiga kodlar
MAX_ATTEMPTS = 5        # bitta kod uchun urinishlar
PHONE_SALT = "schoolpro.verified-phone"


class OtpThrottle(ScopedRateThrottle):
    scope = "otp"


def otp_enabled():
    return bool(settings.TELEGRAM_BOT_TOKEN)


def norm(phone):
    """+998XXXXXXXXX ko'rinishiga keltiradi (faqat O'zbekiston raqamlari)."""
    d = phone_digits(phone)
    if not (len(d) == 12 and d.startswith("998")):
        raise ValidationError({"phone": "Telefon raqamini to'liq kiriting: +998 90 123 45 67"})
    return "+" + d


def code_hash(phone, code):
    return hmac.new(settings.SECRET_KEY.encode(), f"{phone}:{code}".encode(), hashlib.sha256).hexdigest()


def users_by_phone(phone):
    d = phone.lstrip("+")
    return User.objects.filter(Q(phone__in=[phone, d]) | Q(username__in=[d, phone])).exclude(role="")


def bot_link(token=None):
    from bot.views import bot_username

    name = bot_username()
    if not name:
        return None
    return f"https://t.me/{name}" + (f"?start={token}" if token else "")


def send_code_message(chat_id, code, purpose):
    from bot.telegram import enqueue, tg_call

    what = "ro'yxatdan o'tish" if purpose == "register" else "kirish"
    text = (f"🔐 <b>SchoolPro</b> {what} kodi:\n\n<code>{code}</code>\n\n"
            f"Kod {CODE_TTL // 60} daqiqa amal qiladi. Uni hech kimga bermang — maktab xodimlari ham so'ramaydi.")
    res = tg_call("sendMessage", _timeout=10, chat_id=chat_id, text=text, parse_mode="HTML")
    if not (res and res.get("ok")):
        enqueue(chat_id, text)  # tarmoq uzilsa — navbat orqali qayta urinadi


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@throttle_classes([OtpThrottle])
def send_code(request):
    if not otp_enabled():
        raise ValidationError({"detail": "Telegram orqali kod yuborish sozlanmagan. Parol bilan kiring."})
    purpose = request.data.get("purpose")
    if purpose not in ("login", "register"):
        raise ValidationError({"purpose": "login | register"})
    phone = norm(clean_phone(request.data.get("phone") or ""))
    users = list(users_by_phone(phone))
    if purpose == "login":
        if not users:
            return Response({"detail": "Bu raqam bilan hisob topilmadi. Avval ro'yxatdan o'ting.", "code": "no_account"}, status=status.HTTP_404_NOT_FOUND)
        u = users[0]
        if u.approval == Approval.PENDING:
            return Response({"detail": "Hisobingiz maktab ma'muriyati tasdig'ini kutmoqda. Tasdiqlangach kira olasiz.", "code": "pending"}, status=status.HTTP_403_FORBIDDEN)
        if u.approval == Approval.REJECTED or not u.is_active:
            return Response({"detail": "Hisobingiz faol emas. Maktab ma'muriyatiga murojaat qiling.", "code": "inactive"}, status=status.HTTP_403_FORBIDDEN)
    elif any(u.approval != Approval.REJECTED for u in users):
        return Response({"detail": "Bu raqam bilan hisob allaqachon bor. «Kirish» orqali kiring.", "code": "exists"}, status=status.HTTP_400_BAD_REQUEST)

    link = TelegramLink.objects.filter(phone=phone).first()
    if not link:
        tok = "ph-" + secrets.token_urlsafe(16)
        PhoneLinkToken.objects.filter(phone=phone).delete()
        PhoneLinkToken.objects.create(token=tok, phone=phone)
        return Response({"status": "link", "link_token": tok, "bot_url": bot_link(tok)})

    now = timezone.now()
    recent = PhoneCode.objects.filter(phone=phone, created_at__gte=now - timedelta(hours=1))
    # qayta yuborish oralig'i faqat shu maqsaddagi, hali ishlatilmagan kodga taalluqli
    last = recent.filter(purpose=purpose, used=False).order_by("-created_at").first()
    if last and (now - last.created_at).total_seconds() < RESEND_AFTER:
        wait = RESEND_AFTER - int((now - last.created_at).total_seconds())
        return Response({"status": "sent", "resend_in": wait, "expires_in": CODE_TTL, "bot_url": bot_link()})
    if recent.count() >= MAX_PER_HOUR:
        raise ValidationError({"detail": "Juda ko'p kod so'raldi. Bir soatdan keyin qayta urinib ko'ring."})
    code = f"{secrets.randbelow(10000):04d}"
    PhoneCode.objects.filter(phone=phone, used=False).update(used=True)
    PhoneCode.objects.create(phone=phone, purpose=purpose, code_hash=code_hash(phone, code))
    send_code_message(link.chat_id, code, purpose)
    return Response({"status": "sent", "resend_in": RESEND_AFTER, "expires_in": CODE_TTL, "bot_url": bot_link()})


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def link_status(request, token):
    t = PhoneLinkToken.objects.filter(token=token, created_at__gte=timezone.now() - timedelta(minutes=30)).first()
    if not t:
        return Response({"linked": False, "expired": True})
    return Response({"linked": TelegramLink.objects.filter(phone=t.phone).exists()})


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@throttle_classes([OtpThrottle])
def verify_code(request):
    purpose = request.data.get("purpose")
    phone = norm(clean_phone(request.data.get("phone") or ""))
    code = str(request.data.get("code") or "").strip()
    obj = PhoneCode.objects.filter(phone=phone, purpose=purpose, used=False).order_by("-created_at").first()
    if not obj or (timezone.now() - obj.created_at).total_seconds() > CODE_TTL:
        raise ValidationError({"code": "Kod muddati tugagan. Yangi kod oling."})
    if obj.attempts >= MAX_ATTEMPTS:
        raise ValidationError({"code": "Urinishlar tugadi. Yangi kod oling."})
    if not hmac.compare_digest(obj.code_hash, code_hash(phone, code)):
        obj.attempts += 1
        obj.save(update_fields=["attempts"])
        left = MAX_ATTEMPTS - obj.attempts
        raise ValidationError({"code": f"Kod noto'g'ri. Yana {left} ta urinish qoldi." if left else "Urinishlar tugadi. Yangi kod oling."})
    obj.used = True
    obj.save(update_fields=["used"])

    if purpose == "register":
        return Response({"phone": phone, "phone_token": signing.dumps(phone, salt=PHONE_SALT)})

    users = [u for u in users_by_phone(phone) if u.is_active and u.approval == Approval.APPROVED]
    if len(users) != 1:
        raise ValidationError({"detail": "Hisob topilmadi yoki faol emas"})
    u = users[0]
    link = TelegramLink.objects.filter(phone=phone).first()
    fields = ["last_login"]
    u.last_login = timezone.now()
    if u.must_change_password:  # raqam egaligi tasdiqlandi — vaqtinchalik parolni almashtirish shart emas
        u.must_change_password = False
        fields.append("must_change_password")
    if link and u.telegram_chat_id != link.chat_id and not User.objects.filter(telegram_chat_id=link.chat_id).exclude(pk=u.pk).exists():
        u.telegram_chat_id = link.chat_id
        fields.append("telegram_chat_id")
    u.save(update_fields=fields)
    audit(request, "login", u.username, actor=u, via="telegram_code")
    return Response({**tokens_for(u), "user": MeSerializer(u).data})


def verified_phone(token):
    """Ro'yxatdan o'tishda: kod bilan tasdiqlangan raqam (30 daqiqa amal qiladi)."""
    try:
        return signing.loads(token, salt=PHONE_SALT, max_age=30 * 60)
    except signing.BadSignature:
        raise ValidationError({"detail": "Telefon tasdig'i muddati o'tgan. Qaytadan kod oling."})
