import tempfile
from datetime import date, datetime, time, timedelta
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from attendance import biometrics
from attendance.logic import Context, Status, day_board, range_report, register_scan
from attendance.models import Absence, AttendanceRecord, FaceEnrollment, KioskDevice, Method
from bot.models import OutgoingMessage
from core.testutils import SchoolFixture, client_for, near, random_vec
from school.models import Lesson, SchoolSettings


def at(d, h, m=0):
    return timezone.make_aware(datetime.combine(d, time(h, m)))


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class LogicTests(TestCase):
    def setUp(self):
        self.f = SchoolFixture()
        self.d = date(2026, 10, 5)  # dushanba

    def test_on_time_and_late(self):
        act, rec = register_scan(self.f.t1, Method.FACE, at=at(self.d, 7, 50))
        self.assertEqual((act, rec.late_minutes), ("in", 0))
        act, rec = register_scan(self.f.t2, Method.FACE, at=at(self.d, 8, 20))
        self.assertEqual((act, rec.late_minutes), ("in", 20))

    def test_grace_period(self):
        _, rec = register_scan(self.f.t1, Method.FACE, at=at(self.d, 8, 4))
        self.assertEqual(rec.late_minutes, 0)  # 5 daqiqa imtiyoz

    def test_checkout_and_duplicate(self):
        register_scan(self.f.t1, Method.FACE, at=at(self.d, 7, 55))
        act, _ = register_scan(self.f.t1, Method.FACE, at=at(self.d, 8, 10))
        self.assertEqual(act, "duplicate")  # 60 daqiqadan oldin — chiqish emas
        act, rec = register_scan(self.f.t1, Method.FACE, at=at(self.d, 14, 0))
        self.assertEqual(act, "out")
        self.assertEqual(timezone.localtime(rec.check_out).hour, 14)

    def test_timetable_based_expected_time(self):
        s = SchoolSettings.get()
        s.use_timetable_for_arrival = True
        s.save()
        Lesson.objects.create(school_class=self.f.c9a, subject=self.f.math, teacher=self.f.t1, weekday=1, period=3)  # 10:20
        ctx = Context.load()
        self.assertEqual(timezone.localtime(ctx.expected_at(self.f.t1.id, self.d)).time(), time(10, 10))
        self.assertIsNone(ctx.expected_at(self.f.t1.id, self.d + timedelta(days=1)))  # seshanba darsi yo'q
        self.assertEqual(timezone.localtime(ctx.expected_at(self.f.t2.id, self.d)).time(), time(8, 0))  # jadvalda yo'q
        _, rec = register_scan(self.f.t1, Method.FACE, at=at(self.d, 10, 0))
        self.assertEqual(rec.late_minutes, 0)

    def test_board_and_report(self):
        register_scan(self.f.t1, Method.FACE, at=at(self.d, 8, 30))
        Absence.objects.create(teacher=self.f.t2, date_from=self.d, date_to=self.d, reason="sick")
        with mock.patch("attendance.logic.now", return_value=timezone.localtime(at(self.d, 12))):
            b = day_board(self.d)
            st = {r["teacher"].id: r["status"] for r in b["rows"]}
            self.assertEqual(st[self.f.t1.id], Status.LATE)
            self.assertEqual(st[self.f.t2.id], Status.EXCUSED)
            self.assertEqual(b["summary"]["late"], 1)
            rep = range_report(self.d, self.d + timedelta(days=1))
        t1 = next(r for r in rep["teachers"] if r["teacher"].id == self.f.t1.id)
        self.assertEqual((t1["late"], t1["late_minutes"]), (1, 30))

    def test_absent_after_expected(self):
        with mock.patch("attendance.logic.now", return_value=timezone.localtime(at(self.d, 7))):
            self.assertEqual(day_board(self.d)["summary"]["pending"], 2)
        with mock.patch("attendance.logic.now", return_value=timezone.localtime(at(self.d, 9))):
            self.assertEqual(day_board(self.d)["summary"]["absent"], 2)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class BiometricTests(TestCase):
    def setUp(self):
        self.f = SchoolFixture()
        self.face1 = random_vec(1)
        self.face2 = random_vec(2)

    def enroll(self, user, face, seed=0):
        c = client_for(user)
        self.assertEqual(c.post("/api/my/face/", {"agree": True}, format="json").status_code, 200)
        return c.post("/api/my/face/enroll/", {"descriptors": [near(face, seed + i) for i in range(5)]}, format="json")

    def test_encryption_roundtrip(self):
        blob = biometrics.encrypt_templates([self.face1])
        self.assertNotIn(b"0.0", bytes(blob)[:20])
        self.assertAlmostEqual(biometrics.decrypt_templates(blob)[0][0], self.face1[0], places=5)

    def test_enroll_requires_consent(self):
        r = client_for(self.f.t1u).post("/api/my/face/enroll/", {"descriptors": [self.face1] * 3}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_enroll_rejects_mixed_people(self):
        c = client_for(self.f.t1u)
        c.post("/api/my/face/", {"agree": True}, format="json")
        r = c.post("/api/my/face/enroll/", {"descriptors": [self.face1, self.face1, self.face2]}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_full_kiosk_flow(self):
        self.assertEqual(self.enroll(self.f.t1u, self.face1).status_code, 201)
        self.assertEqual(self.enroll(self.f.t2u, self.face2, 100).status_code, 201)
        # tasdiqlanmagan namuna ishlamaydi
        d = client_for(self.f.director)
        dev = d.post("/api/attendance/kiosks/", {"name": "Darvoza"}, format="json").data
        k = APIClient()
        self.assertEqual(k.post("/api/kiosk/pair/", {"code": "WRONG123"}, format="json").status_code, 400)
        tok = k.post("/api/kiosk/pair/", {"code": dev["pair_code"]}, format="json").data["token"]
        k.credentials(HTTP_X_KIOSK_TOKEN=tok)
        s = SchoolSettings.get()
        s.require_liveness = True
        s.save()
        r = k.post("/api/kiosk/identify/", {"descriptor": near(self.face1, 999), "liveness": True}, format="json")
        self.assertEqual(r.data["reason"], "no_templates")
        for e in FaceEnrollment.objects.all():
            self.assertEqual(d.post(f"/api/attendance/enrollments/{e.id}/review/", {"action": "approve"}, format="json").status_code, 200)
        # jonlilik tasdig'isiz rad etiladi
        self.assertEqual(k.post("/api/kiosk/identify/", {"descriptor": near(self.face1, 999)}, format="json").status_code, 400)
        r = k.post("/api/kiosk/identify/", {"descriptor": near(self.face1, 999), "liveness": True}, format="json")
        self.assertTrue(r.data["ok"], r.data)
        self.assertEqual(r.data["teacher"]["id"], self.f.t1.id)
        self.assertEqual(r.data["action"], "in")
        self.assertTrue(AttendanceRecord.objects.filter(teacher=self.f.t1, in_method="face").exists())
        # notanish yuz
        r = k.post("/api/kiosk/identify/", {"descriptor": random_vec(77), "liveness": True}, format="json")
        self.assertFalse(r.data["ok"])
        self.assertEqual(r.data["reason"], "unknown")
        # tokensiz / o'chirilgan qurilma
        self.assertEqual(APIClient().post("/api/kiosk/identify/", {"descriptor": self.face1}, format="json").status_code, 401)
        d.delete(f"/api/attendance/kiosks/{dev['id']}/")
        self.assertEqual(k.post("/api/kiosk/identify/", {"descriptor": self.face1, "liveness": True}, format="json").status_code, 401)

    def test_consent_withdraw_deletes_templates(self):
        self.enroll(self.f.t1u, self.face1)
        self.assertEqual(FaceEnrollment.objects.count(), 1)
        client_for(self.f.t1u).delete("/api/my/face/")
        self.assertEqual(FaceEnrollment.objects.count(), 0)

    def test_cannot_enroll_someone_elses_face(self):
        self.enroll(self.f.t1u, self.face1)
        FaceEnrollment.objects.update(status="approved")
        r = self.enroll(self.f.t2u, self.face1, 50)
        self.assertEqual(r.status_code, 400)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp(), TELEGRAM_BOT_TOKEN="test")
class PinAndAlertsTests(TestCase):
    def setUp(self):
        self.f = SchoolFixture()
        self.f.director.telegram_chat_id = 555
        self.f.director.save()
        dev = KioskDevice.objects.create(name="Gate")
        self.k = APIClient()
        self.k.credentials(HTTP_X_KIOSK_TOKEN=dev.issue_token())

    def test_pin_flow_and_lockout(self):
        c = client_for(self.f.t1u)
        self.assertEqual(c.post("/api/my/pin/", {"pin": "1234", "password": "Secr3t-pass!"}, format="json").status_code, 400)  # oddiy
        self.assertEqual(c.post("/api/my/pin/", {"pin": "4826", "password": "wrong"}, format="json").status_code, 400)
        self.assertEqual(c.post("/api/my/pin/", {"pin": "4826", "password": "Secr3t-pass!"}, format="json").status_code, 200)
        roster = self.k.get("/api/kiosk/roster/").data
        self.assertEqual([t["id"] for t in roster], [self.f.t1.id])
        for _ in range(5):
            self.assertEqual(self.k.post("/api/kiosk/pin/", {"teacher": self.f.t1.id, "pin": "0000"}, format="json").status_code, 400)
        r = self.k.post("/api/kiosk/pin/", {"teacher": self.f.t1.id, "pin": "4826"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("daqiqa", r.data["detail"])
        self.assertTrue(OutgoingMessage.objects.filter(chat_id=555, text__contains="PIN").exists())

    def test_late_alert_sent_to_director(self):
        from attendance.views import after_scan
        _, rec = register_scan(self.f.t2, Method.PIN, at=timezone.localtime().replace(hour=9, minute=0))
        after_scan(self.f.t2, "in", rec)
        msg = OutgoingMessage.objects.get(chat_id=555)
        self.assertIn("Kechikish", msg.text)
        self.assertIn("Aliyev", msg.text)

    def test_manual_mark_requires_note(self):
        d = client_for(self.f.director)
        today = timezone.localdate()
        r = d.post("/api/attendance/manual/", {"teacher": self.f.t1.id, "type": "in", "date": today, "time": "07:45"}, format="json")
        self.assertEqual(r.status_code, 400)
        r = d.post("/api/attendance/manual/", {"teacher": self.f.t1.id, "type": "in", "date": today, "time": "07:45", "note": "Qurilma o'chiq edi"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(AttendanceRecord.objects.get(teacher=self.f.t1).in_method, "manual")

    def test_report_endpoints(self):
        d = client_for(self.f.director)
        for p in ("day", "week", "month"):
            self.assertEqual(d.get(f"/api/attendance/report/?period={p}").status_code, 200)
        r = d.get("/api/attendance/report/?period=week&export=csv")
        self.assertEqual(r.status_code, 200)
        self.assertIn("O'qituvchi", r.content.decode("utf-8-sig"))
        self.assertEqual(d.get("/api/attendance/board/").status_code, 200)
        self.assertEqual(client_for(self.f.t1u).get("/api/my/attendance/").status_code, 200)
