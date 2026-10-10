import tempfile
from datetime import timedelta
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone

from bot import handlers
from bot.models import LinkCode, OutgoingMessage
from bot.scheduler import absent_alerts
from core.testutils import SchoolFixture, client_for
from school.models import Announcement, Notification


@override_settings(MEDIA_ROOT=tempfile.mkdtemp(), TELEGRAM_BOT_TOKEN="test")
class BotTests(TestCase):
    def setUp(self):
        self.f = SchoolFixture()
        self.sent = []
        p = mock.patch("bot.handlers.tg_call", side_effect=lambda method, **kw: self.sent.append((method, kw)) or {"ok": True})
        p.start()
        self.addCleanup(p.stop)

    def msg(self, text=None, chat=100, **extra):
        m = {"chat": {"id": chat, "type": "private"}, "from": {"id": chat}, **extra}
        if text is not None:
            m["text"] = text
        handlers.handle_update({"update_id": 1, "message": m})
        return self.sent[-1][1]

    def test_stranger_is_rejected(self):
        self.assertIn("Ruxsat yo'q", self.msg("📊 Bugungi davomat")["text"])

    def test_link_via_code_and_menu(self):
        with mock.patch("bot.views.bot_username", return_value="school_bot"):
            r = client_for(self.f.director).post("/api/telegram/")
        self.assertTrue(r.data["url"].startswith("https://t.me/school_bot?start="))
        self.msg(f"/start {r.data['code']}")
        self.f.director.refresh_from_db()
        self.assertEqual(self.f.director.telegram_chat_id, 100)
        self.assertFalse(LinkCode.objects.exists())
        self.assertIn("Davomat", self.msg(handlers.B_TODAY)["text"])
        self.assertIn("Kechikkanlar", self.msg(handlers.B_LATE)["text"])
        self.assertIn("Sinflar", self.msg(handlers.B_CLASSES)["text"])

    def test_teacher_cannot_link(self):
        LinkCode.objects.create(code="abc", user=self.f.t1u, expires_at=timezone.now() + timedelta(minutes=5))
        self.msg("/start abc")
        self.f.t1u.refresh_from_db()
        self.assertIsNone(self.f.t1u.telegram_chat_id)

    def test_link_via_contact(self):
        self.msg(contact={"phone_number": "998901111111", "user_id": 100})
        self.f.director.refresh_from_db()
        self.assertEqual(self.f.director.telegram_chat_id, 100)
        # birovning kontakti qabul qilinmaydi
        self.f.director.telegram_chat_id = None
        self.f.director.save()
        self.msg(contact={"phone_number": "998901111111", "user_id": 999})
        self.f.director.refresh_from_db()
        self.assertIsNone(self.f.director.telegram_chat_id)

    def test_announcement_via_bot(self):
        self.f.director.telegram_chat_id = 100
        self.f.director.save()
        self.msg(handlers.B_ANNOUNCE)
        cb = lambda data: handlers.handle_update({"update_id": 2, "callback_query": {"id": "1", "data": data, "message": {"chat": {"id": 100}, "message_id": 5}}})  # noqa: E731
        cb("ann:staff")
        self.msg("Pedagogik kengash\nErtaga soat 15:00 da majlis zalida")
        cb("ann:send")
        a = Announcement.objects.get()
        self.assertEqual((a.title, a.audience, a.source), ("Pedagogik kengash", "staff", "telegram"))
        self.assertEqual(Notification.objects.filter(kind="announcement").count(), 2)  # 2 o'qituvchi

    def test_absent_alert_once(self):
        self.f.director.telegram_chat_id = 100
        self.f.director.save()
        now = timezone.localtime().replace(hour=10, minute=0)
        with mock.patch("attendance.logic.now", return_value=now):
            self.assertEqual(absent_alerts(now), 2)
            self.assertEqual(absent_alerts(now), 0)
        self.assertEqual(OutgoingMessage.objects.filter(chat_id=100).count(), 1)
