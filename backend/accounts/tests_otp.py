import re
import tempfile
from unittest import mock

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import PhoneCode, TelegramLink, User
from bot import handlers
from core.testutils import SchoolFixture


@override_settings(MEDIA_ROOT=tempfile.mkdtemp(), TELEGRAM_BOT_TOKEN="test")
class OtpTests(TestCase):
    def setUp(self):
        self.f = SchoolFixture()
        self.c = APIClient()
        self.sent = []
        def fake(method, **kw):
            self.sent.append((method, kw))
            if method == "getMe":
                return {"ok": True, "result": {"username": "schoolpro_test_bot"}}
            return {"ok": True}
        for target in ("bot.telegram.tg_call", "bot.handlers.tg_call", "bot.views.tg_call"):
            p = mock.patch(target, side_effect=fake)
            p.start()
            self.addCleanup(p.stop)
        from bot import views
        views._bot_cache.clear()

    def share_contact(self, phone, chat=777):
        handlers.handle_update({"update_id": 1, "message": {"chat": {"id": chat, "type": "private"}, "from": {"id": chat}, "contact": {"phone_number": phone, "user_id": chat}}})

    def last_code(self):
        texts = [kw.get("text", "") for m, kw in self.sent if m == "sendMessage"]
        return re.search(r"<code>(\d{4})</code>", texts[-1]).group(1)

    def test_full_registration_and_login_with_code(self):
        r = self.c.post("/api/auth/otp/send/", {"phone": "90 777 11 22", "purpose": "register"}, format="json")
        self.assertEqual(r.data["status"], "link")
        self.assertEqual(r.data["bot_url"], f"https://t.me/schoolpro_test_bot?start={r.data['link_token']}")
        self.assertFalse(self.c.get(f"/api/auth/otp/link/{r.data['link_token']}/").data["linked"])
        # botda raqam ulashildi
        self.share_contact("998907771122")
        self.assertTrue(self.c.get(f"/api/auth/otp/link/{r.data['link_token']}/").data["linked"])
        r = self.c.post("/api/auth/otp/send/", {"phone": "+998907771122", "purpose": "register"}, format="json")
        self.assertEqual(r.data["status"], "sent")
        code = self.last_code()
        self.assertFalse(PhoneCode.objects.filter(code_hash__contains=code).exists())  # kod ochiq saqlanmaydi
        bad = "0000" if code != "0000" else "1111"
        r = self.c.post("/api/auth/otp/verify/", {"phone": "+998907771122", "purpose": "register", "code": bad}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("urinish", r.data["detail"])
        r = self.c.post("/api/auth/otp/verify/", {"phone": "+998907771122", "purpose": "register", "code": code}, format="json")
        token = r.data["phone_token"]
        # parolsiz ro'yxatdan o'tish (raqam tasdiqlangan)
        r = self.c.post("/api/auth/register/", {"role": "student", "first_name": "Jasur", "last_name": "Karimov", "phone_token": token, "school_class": self.f.c9a.id}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        u = User.objects.get(phone="+998907771122")
        self.assertFalse(u.has_usable_password())
        # tasdiqlanmagan — kod yuborilmaydi
        r = self.c.post("/api/auth/otp/send/", {"phone": "+998907771122", "purpose": "login"}, format="json")
        self.assertEqual(r.data["code"], "pending")
        u.approval, u.is_active = "approved", True
        u.save()
        r = self.c.post("/api/auth/otp/send/", {"phone": "+998907771122", "purpose": "login"}, format="json")
        self.assertEqual(r.data["status"], "sent")
        r = self.c.post("/api/auth/otp/verify/", {"phone": "907771122", "purpose": "login", "code": self.last_code()}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["user"]["role"], "student")
        self.assertFalse(r.data["user"]["has_password"])
        # kod bir martalik
        r = self.c.post("/api/auth/otp/verify/", {"phone": "907771122", "purpose": "login", "code": self.last_code()}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_register_requires_verified_phone_when_bot_enabled(self):
        r = self.c.post("/api/auth/register/", {"role": "student", "first_name": "Ali", "last_name": "Valiyev", "phone": "+998907770000", "password": "Maktab-2026!", "school_class": self.f.c9a.id}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.c.post("/api/auth/register/", {"role": "student", "first_name": "Ali", "last_name": "Valiyev", "phone_token": "soxta", "school_class": self.f.c9a.id}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_login_unknown_phone_and_resend_cooldown(self):
        r = self.c.post("/api/auth/otp/send/", {"phone": "+998939999999", "purpose": "login"}, format="json")
        self.assertEqual(r.data["code"], "no_account")
        self.f.t1u.phone = "+998931234567"
        self.f.t1u.must_change_password = True
        self.f.t1u.save()
        self.share_contact("+998931234567", chat=555)
        r1 = self.c.post("/api/auth/otp/send/", {"phone": "+998931234567", "purpose": "login"}, format="json")
        n = len([1 for m, _ in self.sent if m == "sendMessage"])
        r2 = self.c.post("/api/auth/otp/send/", {"phone": "+998931234567", "purpose": "login"}, format="json")
        self.assertEqual(len([1 for m, _ in self.sent if m == "sendMessage"]), n)  # 45 soniya ichida qayta yuborilmaydi
        self.assertGreater(r2.data["resend_in"], 0)
        self.assertEqual(r1.data["status"], "sent")
        r = self.c.post("/api/auth/otp/verify/", {"phone": "+998931234567", "purpose": "login", "code": self.last_code()}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.data["user"]["must_change_password"])
        self.assertEqual(User.objects.get(pk=self.f.t1u.pk).telegram_chat_id, 555)

    def test_attempt_limit(self):
        self.f.t1u.phone = "+998931234567"
        self.f.t1u.save()
        TelegramLink.objects.create(phone="+998931234567", chat_id=5)
        self.c.post("/api/auth/otp/send/", {"phone": "+998931234567", "purpose": "login"}, format="json")
        code = self.last_code()
        wrong = "0000" if code != "0000" else "1111"
        for _ in range(5):
            self.c.post("/api/auth/otp/verify/", {"phone": "+998931234567", "purpose": "login", "code": wrong}, format="json")
        r = self.c.post("/api/auth/otp/verify/", {"phone": "+998931234567", "purpose": "login", "code": code}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_foreign_contact_rejected(self):
        handlers.handle_update({"update_id": 1, "message": {"chat": {"id": 9, "type": "private"}, "from": {"id": 9}, "contact": {"phone_number": "998901112233", "user_id": 10}}})
        self.assertFalse(TelegramLink.objects.exists())
