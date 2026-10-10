"""Telegram Bot API bilan ishlash va xabarlar navbati."""
import html
import logging

import requests
from django.conf import settings
from django.utils import timezone

from .models import OutgoingMessage

log = logging.getLogger("schoolpro")
API = "https://api.telegram.org/bot{token}/{method}"


def esc(text):
    return html.escape(str(text or ""), quote=False)


def tg_call(method, _timeout=20, token=None, **params):
    token = token or settings.TELEGRAM_BOT_TOKEN
    if not token:
        return None
    try:
        r = requests.post(API.format(token=token, method=method), json=params, timeout=_timeout)
        return r.json()
    except (requests.RequestException, ValueError) as exc:
        log.warning("Telegram %s xatosi: %s", method, exc)
        return None


def enqueue(chat_id, text):
    if chat_id:
        OutgoingMessage.objects.create(chat_id=chat_id, text=text[:4000])


def notify_managers(text, only_alerts=True):
    """Botga ulangan barcha direktor/administratorlarga xabar navbatga qo'yiladi."""
    from accounts.models import MANAGER_ROLES, User

    qs = User.objects.filter(is_active=True, role__in=MANAGER_ROLES, telegram_chat_id__isnull=False)
    if only_alerts:
        qs = qs.filter(telegram_alerts=True)
    n = 0
    for chat_id in qs.values_list("telegram_chat_id", flat=True):
        enqueue(chat_id, text)
        n += 1
    return n


def flush_outbox(limit=30):
    """Navbatdagi xabarlarni yuboradi. Bot oqimi har bir necha soniyada chaqiradi."""
    if not settings.TELEGRAM_BOT_TOKEN:
        return 0
    sent = 0
    for m in OutgoingMessage.objects.filter(sent=False, attempts__lt=5)[:limit]:
        res = tg_call("sendMessage", chat_id=m.chat_id, text=m.text, parse_mode="HTML", disable_web_page_preview=True)
        m.attempts += 1
        if res and res.get("ok"):
            m.sent = True
            m.sent_at = timezone.now()
            sent += 1
        else:
            m.error = str((res or {}).get("description", "tarmoq xatosi"))[:255]
            if res and res.get("error_code") in (400, 403):  # bot bloklangan / chat yo'q
                m.attempts = 5
        m.save(update_fields=["attempts", "sent", "sent_at", "error"])
    return sent
