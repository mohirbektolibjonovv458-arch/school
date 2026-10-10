"""SchoolPro ni bitta buyruq bilan ishga tushirish:  python manage.py start

1) bazani yangilaydi  2) direktor bo'lmasa — yaratadi  3) Telegram botni fonda ishga tushiradi
4) fon rejalashtiruvchini yoqadi  5) sayt + API ni http://0.0.0.0:8000 da ochadi (waitress)"""
import os
import socket
import sys
import threading
import time

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import close_old_connections

from accounts.models import MANAGER_ROLES, User


def local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return None


class Command(BaseCommand):
    help = "Sayt, API, Telegram bot va fon vazifalarini birga ishga tushiradi"

    def add_arguments(self, parser):
        parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "8000")))
        parser.add_argument("--no-bot", action="store_true")

    def handle(self, *args, port, no_bot, **opts):
        ok = lambda t: self.stdout.write(self.style.SUCCESS(t))  # noqa: E731
        warn = lambda t: self.stdout.write(self.style.WARNING(t))  # noqa: E731
        self.stdout.write("\n🎓  SchoolPro ishga tushirilmoqda...\n")
        if not settings.DEBUG:
            if not os.getenv("SECRET_KEY"):
                warn("⚠️  SECRET_KEY o'rnatilmagan. Serverda (Railway) qayta deploy bo'lganda hamma tizimdan chiqib ketadi — Variables'ga SECRET_KEY qo'shing.")
            if not os.getenv("BIOMETRIC_KEY"):
                warn("⚠️  BIOMETRIC_KEY o'rnatilmagan. Yuz namunalari SECRET_KEY'dan hosil qilingan kalit bilan shifrlanadi — kalitni o'zgartirmang.")
        call_command("migrate", verbosity=0, interactive=False)
        call_command("collectstatic", verbosity=0, interactive=False)
        ok("✅ Baza tayyor")

        if not User.objects.filter(role__in=MANAGER_ROLES).exists():
            u, p = os.getenv("DIRECTOR_USERNAME"), os.getenv("DIRECTOR_PASSWORD")
            if u and p:
                call_command("create_director", username=u, password=p, name=os.getenv("DIRECTOR_NAME", ""))
            elif sys.stdin.isatty():
                warn("\nDirektor akkaunti hali yo'q — hozir yaratamiz (faqat bir marta):")
                call_command("create_director")
            else:
                warn("⚠️  Direktor yaratilmadi: .env da DIRECTOR_USERNAME va DIRECTOR_PASSWORD yozing")

        if not (settings.FRONTEND_DIR / "index.html").exists():
            warn("⚠️  Frontend build topilmadi: cd frontend && npm install && npm run build")

        if not no_bot and settings.TELEGRAM_BOT_TOKEN:
            def bot_loop():
                while True:
                    try:
                        call_command("run_bot")
                    except Exception as exc:  # noqa: BLE001
                        warn(f"Bot to'xtadi: {exc}. 10 soniyadan keyin qayta...")
                    finally:
                        close_old_connections()
                    time.sleep(10)
            threading.Thread(target=bot_loop, daemon=True, name="bot").start()
        elif not settings.TELEGRAM_BOT_TOKEN:
            warn("ℹ️  TELEGRAM_BOT_TOKEN yo'q — direktor boti o'chiq (.env ga yozing)")

        def scheduler_loop():
            from bot.scheduler import run_jobs
            while True:
                try:
                    run_jobs()
                finally:
                    close_old_connections()
                time.sleep(60)
        threading.Thread(target=scheduler_loop, daemon=True, name="scheduler").start()

        from waitress import serve
        from config.wsgi import application
        ip = local_ip()
        ok(f"\n🌐 Sayt:        http://localhost:{port}")
        if ip:
            ok(f"📱 Telefondan:  http://{ip}:{port}  (bir Wi-Fi tarmog'ida)")
        ok(f"🚪 Kiosk:       http://localhost:{port}/kiosk\n")
        kw = {}
        if os.getenv("TRUSTED_PROXY"):
            kw = {"trusted_proxy": os.getenv("TRUSTED_PROXY"), "trusted_proxy_headers": {"x-forwarded-for", "x-forwarded-proto"},
                  "clear_untrusted_proxy_headers": True}
        serve(application, host="0.0.0.0", port=port, threads=int(os.getenv("WEB_THREADS", "8")), ident="SchoolPro",
              max_request_body_size=settings.MAX_UPLOAD_FILE_MB * 1024 * 1024 * settings.MAX_UPLOAD_FILES + 1024 * 1024, **kw)
