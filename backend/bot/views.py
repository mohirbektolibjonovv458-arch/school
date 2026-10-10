import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsManager

from .models import LinkCode
from .telegram import tg_call

_bot_cache = {}


def bot_username():
    if not settings.TELEGRAM_BOT_TOKEN:
        return None
    if "username" not in _bot_cache:
        res = tg_call("getMe", _timeout=8)
        if res and res.get("ok"):
            _bot_cache["username"] = res["result"]["username"]
        else:
            return None
    return _bot_cache["username"]


@api_view(["GET", "POST", "DELETE"])
@permission_classes([IsManager])
def telegram_link(request):
    user = request.user
    if request.method == "DELETE":
        user.telegram_chat_id = None
        user.save(update_fields=["telegram_chat_id"])
    data = {"configured": bool(settings.TELEGRAM_BOT_TOKEN), "linked": bool(user.telegram_chat_id), "alerts": user.telegram_alerts,
            "bot_username": bot_username()}
    if request.method == "POST":
        LinkCode.objects.filter(user=user).delete()
        code = secrets.token_urlsafe(18)
        LinkCode.objects.create(code=code, user=user, expires_at=timezone.now() + timedelta(minutes=15))
        data["code"] = code
        data["url"] = f"https://t.me/{data['bot_username']}?start={code}" if data["bot_username"] else None
    return Response(data)
