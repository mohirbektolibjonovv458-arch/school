import tempfile
from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone

from core.testutils import SchoolFixture, client_for, jpeg_file, pdf_file
from homework.models import Submission
from school.models import Notification


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class HomeworkFlowTests(TestCase):
    def setUp(self):
        self.f = SchoolFixture()
        self.t = client_for(self.f.t1u)

    def create_hw(self, **kw):
        data = {"school_class": self.f.c9a.id, "subject": self.f.math.id, "title": "Tenglamalar", "description": "1-10 misollar",
                "due_at": (timezone.now() + timedelta(days=2)).isoformat(), "max_score": 5, **kw}
        return self.t.post("/api/homework/", data, format="multipart")

    def test_full_flow(self):
        r = self.create_hw(files=[pdf_file("topshiriq.pdf")])
        self.assertEqual(r.status_code, 201, r.content)
        hid = r.data["id"]
        self.assertEqual(len(r.data["files"]), 1)
        self.assertEqual(Notification.objects.filter(kind="homework").count(), 2)

        s1 = client_for(self.f.s1u)
        lst = s1.get("/api/homework/?state=active").data["results"]
        self.assertEqual([h["id"] for h in lst], [hid])
        self.assertEqual(lst[0]["my"]["state"], "pending")
        # boshqa sinf o'quvchisi ko'rmaydi va topshira olmaydi
        s3 = client_for(self.f.s3u)
        self.assertEqual(s3.get("/api/homework/").data["results"], [])
        self.assertEqual(s3.post(f"/api/homework/{hid}/submit/", {"files": [jpeg_file()]}, format="multipart").status_code, 404)

        # bo'sh topshiriq rad etiladi
        self.assertEqual(s1.post(f"/api/homework/{hid}/submit/", {}, format="multipart").status_code, 400)
        r = s1.post(f"/api/homework/{hid}/submit/", {"files": [jpeg_file(), pdf_file()], "comment": "Bajardim"}, format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        sid = r.data["id"]
        self.assertEqual(r.data["status"], "submitted")
        self.assertEqual(len(r.data["files"]), 2)
        self.assertTrue(Notification.objects.filter(user=self.f.t1u, kind="submission").exists())
        # tekshirilayotganda qayta yuborib bo'lmaydi
        self.assertEqual(s1.post(f"/api/homework/{hid}/submit/", {"files": [jpeg_file()]}, format="multipart").status_code, 400)

        # boshqa o'qituvchi tekshira olmaydi
        t2 = client_for(self.f.t2u)
        self.assertIn(t2.post(f"/api/submissions/{sid}/review/", {"action": "accept", "score": 5}, format="json").status_code, (403, 404))

        # qayta ishlashga qaytarish — izoh majburiy
        self.assertEqual(self.t.post(f"/api/submissions/{sid}/review/", {"action": "revision"}, format="json").status_code, 400)
        r = self.t.post(f"/api/submissions/{sid}/review/", {"action": "revision", "feedback": "3-misolni qayta yeching"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["status"], "revision")
        d = s1.get(f"/api/homework/{hid}/").data
        self.assertEqual(d["my_submission"]["feedback"], "3-misolni qayta yeching")

        r = s1.post(f"/api/homework/{hid}/submit/", {"files": [jpeg_file()]}, format="multipart")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["attempt"], 2)

        # baho chegaradan oshmasin
        self.assertEqual(self.t.post(f"/api/submissions/{sid}/review/", {"action": "accept", "score": 7}, format="json").status_code, 400)
        r = self.t.post(f"/api/submissions/{sid}/review/", {"action": "accept", "score": 4, "feedback": "Yaxshi"}, format="json")
        self.assertEqual(r.data["status"], "accepted")
        self.assertEqual([e["action"] for e in r.data["events"]], ["submitted", "revision", "resubmitted", "accepted"])

        g = s1.get("/api/my/grades/").data
        self.assertEqual(g["average"], 4.0)
        sub_list = self.t.get(f"/api/homework/{hid}/submissions/").data["rows"]
        self.assertEqual({r["state"] for r in sub_list}, {"accepted", "pending"})

    def test_teacher_cannot_post_to_unassigned_class(self):
        r = self.create_hw(school_class=self.f.c9b.id)
        self.assertEqual(r.status_code, 400)

    def test_bad_file_type_rejected(self):
        hid = self.create_hw().data["id"]
        from django.core.files.uploadedfile import SimpleUploadedFile
        bad = SimpleUploadedFile("virus.exe", b"MZ\x90\x00binary", content_type="application/octet-stream")
        r = client_for(self.f.s1u).post(f"/api/homework/{hid}/submit/", {"files": [bad]}, format="multipart")
        self.assertEqual(r.status_code, 400)
        fake = SimpleUploadedFile("rasm.jpg", b"not an image at all", content_type="image/jpeg")
        r = client_for(self.f.s1u).post(f"/api/homework/{hid}/submit/", {"files": [fake]}, format="multipart")
        self.assertEqual(r.status_code, 400)
        self.assertFalse(Submission.objects.exists())

    def test_closed_homework(self):
        hid = self.create_hw(allow_late=False).data["id"]
        from homework.models import Homework
        Homework.objects.filter(pk=hid).update(due_at=timezone.now() - timedelta(hours=1))
        r = client_for(self.f.s1u).post(f"/api/homework/{hid}/submit/", {"files": [jpeg_file()]}, format="multipart")
        self.assertEqual(r.status_code, 400)

    def test_signed_file_link(self):
        r = self.create_hw(files=[pdf_file("a.pdf")])
        url = r.data["files"][0]["url"]
        from django.test import Client
        resp = Client().get(url)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp["Content-Type"], "application/pdf")
        self.assertEqual(Client().get(url[:-5] + "xxxx/").status_code, 404)
