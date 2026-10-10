"""Direktor Telegram botini ishga tushiradi (long polling)."""
import threading
import time

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import close_old_connections

from bot.handlers import handle_update
from bot.models import BotOffset
from bot.telegram import flush_outbox, tg_call

COMMANDS = [
    ("today", "Bugungi davomat"), ("came", "Kelganlar"), ("late", "Kechikkanlar"), ("absent", "Kelmaganlar"),
    ("excused", "Sababli kelmaganlar"), ("classes", "Sinflar"), ("report", "Hisobot"), ("announce", "E'lon yuborish"),
    ("settings", "Sozlamalar"),
]


def outbox_loop(stop):
    while not stop.is_set():
        try:
            flush_outbox()
        except Exception:
            pass
        finally:
            close_old_connections()
        stop.wait(3)


class Command(BaseCommand):
    help = "Direktor Telegram boti"

    def handle(self, *args, **opts):
        if not settings.TELEGRAM_BOT_TOKEN:
            raise CommandError("TELEGRAM_BOT_TOKEN .env faylida yo'q")
        tg_call("deleteWebhook", drop_pending_updates=False)
        tg_call("setMyCommands", commands=[{"command": c, "description": d} for c, d in COMMANDS])
        stop = threading.Event()
        threading.Thread(target=outbox_loop, args=(stop,), daemon=True, name="tg-outbox").start()
        off, _ = BotOffset.objects.get_or_create(pk=1)
        self.stdout.write(self.style.SUCCESS("🤖 Bot ishga tushdi"))
        try:
            while True:
                res = tg_call("getUpdates", _timeout=45, timeout=30, offset=off.offset, allowed_updates=["message", "callback_query"])
                if not res or not res.get("ok"):
                    if res and res.get("error_code") == 401:
                        raise CommandError("Bot tokeni noto'g'ri")
                    time.sleep(5)
                    continue
                for upd in res.get("result", []):
                    off.offset = upd["update_id"] + 1
                    off.save(update_fields=["offset"])
                    handle_update(upd)
                    close_old_connections()
        finally:
            stop.set()
