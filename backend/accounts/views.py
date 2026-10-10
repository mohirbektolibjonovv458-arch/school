from django.contrib.auth import authenticate
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


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@throttle_classes([LoginThrottle])
def login(request):
    username = (request.data.get("username") or "").strip()
    password = request.data.get("password") or ""
    if not username or not password:
        raise ValidationError({"detail": "Login va parolni kiriting"})
    user = authenticate(request, username=username, password=password)
    if user is None:
        # Login ko'pincha telefon raqami: +998 bilan va usiz yozilsa ham ishlasin
        alt = username.lstrip("+")
        for cand in (alt, "+" + alt, "+998" + alt if len(alt) == 9 else None):
            if cand and cand != username:
                user = authenticate(request, username=cand, password=password)
                if user:
                    break
    if user is None or not user.is_active or not user.role:
        audit(request, "login_failed", username, actor=None)
        return Response({"detail": "Login yoki parol noto'g'ri"}, status=status.HTTP_401_UNAUTHORIZED)
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
