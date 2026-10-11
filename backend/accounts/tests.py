import tempfile
from unittest import mock

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from core.testutils import SchoolFixture, client_for
from school.models import Notification, SchoolSettings


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class SignupTests(TestCase):
    def setUp(self):
        self.f = SchoolFixture()
        self.c = APIClient()

    def reg(self, **kw):
        data = {"role": "student", "first_name": "Jasur", "last_name": "Karimov", "phone": "90 777 11 22", "password": "Maktab-2026!", "school_class": self.f.c9a.id}
        data.update(kw)
        return self.c.post("/api/auth/register/", data, format="json")

    def test_public_info(self):
        r = self.c.get("/api/public/")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data["has_director"])
        self.assertEqual([x["name"] for x in r.data["classes"]], ["9-A", "9-B"])

    def test_student_pending_until_approved(self):
        r = self.reg()
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["status"], "pending")
        self.assertTrue(Notification.objects.filter(user=self.f.director, kind="registration").exists())
        # tasdiqlanmagan — kira olmaydi, aniq sabab bilan
        r = self.c.post("/api/auth/login/", {"username": "+998 90 777 11 22", "password": "Maktab-2026!"}, format="json")
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.data.get("code"), "pending")
        # ro'yxatlarda ko'rinmaydi
        self.assertEqual(client_for(self.f.director).get("/api/students/?class=%d" % self.f.c9a.id).data["count"], 2)
        # o'qituvchi tasdiqlay olmaydi, direktor tasdiqlaydi
        u = User.objects.get(username="998907771122")
        self.assertEqual(client_for(self.f.t1u).post(f"/api/registrations/{u.id}/review/", {"action": "approve"}, format="json").status_code, 403)
        r = client_for(self.f.director).post(f"/api/registrations/{u.id}/review/", {"action": "approve", "school_class": self.f.c9b.id}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["class_name"], "9-B")
        r = self.c.post("/api/auth/login/", {"username": "907771122", "password": "Maktab-2026!"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["user"]["student"]["class_name"], "9-B")

    def test_validation(self):
        self.assertEqual(self.reg(school_class=None).status_code, 400)
        self.assertEqual(self.reg(password="12345678").status_code, 400)
        self.assertEqual(self.reg(phone="123").status_code, 400)
        self.assertEqual(self.reg().status_code, 201)
        r = self.reg(first_name="Boshqa")
        self.assertEqual(r.status_code, 400)
        self.assertIn("allaqachon", r.data["detail"])

    def test_rejected_can_register_again(self):
        self.reg()
        u = User.objects.get(username="998907771122")
        client_for(self.f.director).post(f"/api/registrations/{u.id}/review/", {"action": "reject", "reason": "Bunday o'quvchi yo'q"}, format="json")
        r = self.c.post("/api/auth/login/", {"username": "907771122", "password": "Maktab-2026!"}, format="json")
        self.assertEqual(r.data.get("code"), "rejected")
        self.assertIn("Bunday o'quvchi yo'q", r.data["detail"])
        self.assertEqual(self.reg().status_code, 201)

    def test_teacher_registration(self):
        r = self.reg(role="teacher", school_class=None, subjects=[self.f.math.id], phone="+998931112233")
        self.assertEqual(r.data["status"], "pending")
        rows = client_for(self.f.director).get("/api/registrations/").data
        self.assertEqual(rows[0]["subject_names"], ["Matematika"])

    def test_director_when_exists_becomes_pending_admin(self):
        r = self.reg(role="director", school_class=None, phone="+998941112233")
        self.assertEqual(r.data["status"], "pending")
        self.assertEqual(r.data["role"], "admin")

    def test_first_director_logs_in_immediately(self):
        User.objects.filter(role__in=["director", "admin"]).delete()
        r = self.reg(role="director", school_class=None, phone="+998951112233", school_name="Test 7-maktab")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["status"], "active")
        self.assertEqual(r.data["user"]["role"], "director")
        self.assertEqual(SchoolSettings.get().name, "Test 7-maktab")

    def test_registration_can_be_closed(self):
        s = SchoolSettings.get()
        s.allow_registration = False
        s.save()
        self.assertEqual(self.reg().status_code, 400)

    def test_login_by_email(self):
        self.f.t1u.email = "aziza@maktab.uz"
        self.f.t1u.save()
        r = self.c.post("/api/auth/login/", {"username": "Aziza@Maktab.uz", "password": "Secr3t-pass!"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)

    def test_forgot_password_does_not_leak(self):
        r1 = self.c.post("/api/auth/forgot/", {"login": "teacher1"}, format="json")
        r2 = self.c.post("/api/auth/forgot/", {"login": "nobody-here"}, format="json")
        self.assertEqual((r1.status_code, r1.data), (r2.status_code, r2.data))
        self.assertEqual(Notification.objects.filter(kind="password").count(), 1)

    @override_settings(GOOGLE_CLIENT_ID="cid.apps.googleusercontent.com")
    def test_google_login(self):
        self.f.t1u.email = "aziza@gmail.com"
        self.f.t1u.save()
        with mock.patch("jwt.PyJWKClient") as jwk, mock.patch("jwt.decode", return_value={"email": "aziza@gmail.com", "email_verified": True}):
            jwk.return_value.get_signing_key_from_jwt.return_value.key = "k"
            r = self.c.post("/api/auth/google/", {"credential": "x"}, format="json")
            self.assertEqual(r.status_code, 200, r.content)
            self.assertEqual(r.data["user"]["username"], "teacher1")
        with mock.patch("jwt.PyJWKClient"), mock.patch("jwt.decode", return_value={"email": "begona@gmail.com", "email_verified": True}):
            r = self.c.post("/api/auth/google/", {"credential": "x"}, format="json")
            self.assertEqual(r.status_code, 404)
