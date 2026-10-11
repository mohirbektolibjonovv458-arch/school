import re

from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.decorators import api_view, parser_classes, permission_classes, throttle_classes
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken

from core.files import delete_file, store_upload
from core.models import audit

from .models import Approval, User
from .serializers import ChangePasswordSerializer, MeSerializer, ProfileUpdateSerializer


class LoginThrottle(ScopedRateThrottle):
    scope = "login"

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


def tokens_for(user):
    refresh = RefreshToken.for_user(user)
    refresh["role"] = user.role
    return {"refresh": str(refresh), "access": str(refresh.access_token)}


def phone_digits(value):
    d = re.sub(r"\D", "", value or "")
    if len(d) == 9:
        d = "998" + d
    return d


def find_users(identifier):
    """Login, telefon (istalgan ko'rinishda) yoki email bo'yicha foydalanuvchilarni topadi."""
    ident = identifier.strip()
    q = Q(username__iexact=ident)
    if "@" in ident:
        q |= Q(email__iexact=ident)
    d = phone_digits(ident)
    if len(d) >= 9:
        q |= Q(username__in=[d, "+" + d]) | Q(phone__in=["+" + d, d])
    return list(User.objects.filter(q).exclude(role="")[:5])


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@throttle_classes([LoginThrottle])
def login(request):
    identifier = (request.data.get("username") or "").strip()
    password = request.data.get("password") or ""
    if not identifier or not password:
        raise ValidationError({"detail": "Login va parolni kiriting"})
    matched = [u for u in find_users(identifier) if u.check_password(password)]
    if len(matched) != 1:
        audit(request, "login_failed", identifier[:60], actor=None)
        return Response({"detail": "Login yoki parol noto'g'ri"}, status=status.HTTP_401_UNAUTHORIZED)
    user = matched[0]
    if user.approval == Approval.PENDING:
        return Response({"detail": "Hisobingiz maktab ma'muriyati tasdig'ini kutmoqda. Tasdiqlangach kira olasiz.", "code": "pending"},
                        status=status.HTTP_403_FORBIDDEN)
    if user.approval == Approval.REJECTED:
        reason = f" Sabab: {user.reject_reason}" if user.reject_reason else ""
        return Response({"detail": f"Ro'yxatdan o'tish so'rovingiz rad etilgan.{reason}", "code": "rejected"}, status=status.HTTP_403_FORBIDDEN)
    if not user.is_active:
        return Response({"detail": "Hisobingiz o'chirilgan. Maktab ma'muriyatiga murojaat qiling."}, status=status.HTTP_403_FORBIDDEN)
    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])
    audit(request, "login", user.username, actor=user)
    return Response({**tokens_for(user), "user": MeSerializer(user).data})


@api_view(["GET", "PATCH"])
def me(request):
    if request.method == "PATCH":
        s = ProfileUpdateSerializer(request.user, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
    return Response(MeSerializer(request.user).data)


@api_view(["POST", "DELETE"])
@parser_classes([MultiPartParser])
def avatar(request):
    user = request.user
    if request.method == "DELETE":
        delete_file(user.avatar)
        user.avatar = ""
        user.save(update_fields=["avatar"])
        return Response(MeSerializer(user).data)
    f = request.FILES.get("file")
    if not f:
        raise ValidationError({"detail": "Rasm tanlang"})
    info = store_upload(f, kind="image", folder="avatars")
    delete_file(user.avatar)
    user.avatar = info["path"]
    user.save(update_fields=["avatar"])
    return Response(MeSerializer(user).data)


@api_view(["POST"])
def change_password(request):
    s = ChangePasswordSerializer(data=request.data, context={"request": request})
    s.is_valid(raise_exception=True)
    user = request.user
    user.set_password(s.validated_data["new_password"])
    user.must_change_password = False
    user.tokens_valid_after = timezone.now().replace(microsecond=0)
    user.save(update_fields=["password", "must_change_password", "tokens_valid_after"])
    audit(request, "password_changed", user.username)
    return Response({**tokens_for(user), "user": MeSerializer(user).data})
