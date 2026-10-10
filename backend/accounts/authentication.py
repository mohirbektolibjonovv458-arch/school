from datetime import datetime, timezone as dt_tz

from django.contrib.auth import get_user_model
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed, InvalidToken
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken


def token_still_valid(user, token):
    if not user.tokens_valid_after:
        return True
    iat = token.get("iat")
    if iat is None:
        return False
    return datetime.fromtimestamp(int(iat), tz=dt_tz.utc) >= user.tokens_valid_after.replace(microsecond=0)


class Authentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if not token_still_valid(user, validated_token):
            raise AuthenticationFailed("Sessiya tugagan. Qaytadan kiring.", code="token_revoked")
        return user


class RefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        refresh = RefreshToken(attrs["refresh"])
        user = get_user_model().objects.filter(id=refresh.get("user_id")).first()
        if user is None or not user.is_active or not token_still_valid(user, refresh):
            raise InvalidToken("Sessiya tugagan. Qaytadan kiring.")
        return super().validate(attrs)
