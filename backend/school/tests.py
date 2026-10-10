import tempfile

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from core.testutils import SchoolFixture, client_for
from school.models import Lesson, Notification


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class AuthTests(TestCase):
    def setUp(self):
        self.f = SchoolFixture()

    def test_login_and_me(self):
        c = APIClient()
        r = c.post("/api/auth/login/", {"username": "teacher1", "password": "Secr3t-pass!"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["user"]["role"], "teacher")
        c.credentials(HTTP_AUTHORIZATION="Bearer " + r.data["access"])
        self.assertEqual(c.get("/api/auth/me/").data["username"], "teacher1")

    def test_wrong_password(self):
        r = APIClient().post("/api/auth/login/", {"username": "teacher1", "password": "nope"}, format="json")
        self.assertEqual(r.status_code, 401)
        self.assertIn("detail", r.data)

    def test_password_change_revokes_old_tokens(self):
        c = APIClient()
        r = c.post("/api/auth/login/", {"username": "student1", "password": "Secr3t-pass!"}, format="json")
        old_access, old_refresh = r.data["access"], r.data["refresh"]
        c.credentials(HTTP_AUTHORIZATION="Bearer " + old_access)
        import time
        time.sleep(1.1)
        r = c.post("/api/auth/change-password/", {"old_password": "Secr3t-pass!", "new_password": "Yangi-parol-2026"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        new_access = r.data["access"]
        c2 = APIClient()
        c2.credentials(HTTP_AUTHORIZATION="Bearer " + old_access)
        self.assertEqual(c2.get("/api/auth/me/").status_code, 401)
        self.assertEqual(APIClient().post("/api/auth/refresh/", {"refresh": old_refresh}, format="json").status_code, 401)
        c2.credentials(HTTP_AUTHORIZATION="Bearer " + new_access)
        self.assertEqual(c2.get("/api/auth/me/").status_code, 200)

    def test_unauthenticated(self):
        self.assertEqual(APIClient().get("/api/dashboard/").status_code, 401)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class PermissionTests(TestCase):
    def setUp(self):
        self.f = SchoolFixture()

    def test_student_cannot_manage(self):
        c = client_for(self.f.s1u)
        self.assertEqual(c.get("/api/teachers/").status_code, 403)
        self.assertEqual(c.get("/api/students/").status_code, 403)
        self.assertEqual(c.post("/api/classes/", {"grade": 5, "letter": "A"}, format="json").status_code, 403)
        self.assertEqual(c.get("/api/attendance/board/").status_code, 403)

    def test_teacher_sees_only_own_classes_and_students(self):
        c = client_for(self.f.t1u)
        names = [x["name"] for x in c.get("/api/classes/").data]
        self.assertEqual(names, ["9-A"])
        students = c.get("/api/students/").data["results"]
        self.assertEqual({s["id"] for s in students}, {self.f.s1.id, self.f.s2.id})
        self.assertEqual(c.post("/api/teachers/", {}, format="json").status_code, 403)

    def test_student_sees_only_own_class(self):
        c = client_for(self.f.s3u)
        self.assertEqual([x["name"] for x in c.get("/api/classes/").data], ["9-B"])

    def test_director_creates_teacher_with_temp_password(self):
        c = client_for(self.f.director)
        r = c.post("/api/teachers/", {"first_name": "Dilnoza", "last_name": "Rahimova", "phone": "90 123 45 67", "subjects": [self.f.math.id]}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertTrue(r.data["temp_password"])
        u = User.objects.get(pk=r.data["user_id"])
        self.assertTrue(u.must_change_password)
        self.assertEqual(u.phone, "+998901234567")
        login = APIClient().post("/api/auth/login/", {"username": u.username, "password": r.data["temp_password"]}, format="json")
        self.assertEqual(login.status_code, 200)

    def test_assignment_conflict(self):
        c = client_for(self.f.director)
        r = c.post("/api/teaching/", {"teacher": self.f.t2.id, "school_class": self.f.c9a.id, "subject": self.f.math.id}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("Karimova", r.data["detail"])

    def test_timetable_teacher_clash(self):
        c = client_for(self.f.director)
        r = c.post("/api/lessons/", {"school_class": self.f.c9a.id, "subject": self.f.math.id, "weekday": 1, "period": 1}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["teacher"], self.f.t1.id)  # biriktirishdan avtomatik
        from school.models import TeachingAssignment
        TeachingAssignment.objects.create(teacher=self.f.t1, school_class=self.f.c9b, subject=self.f.math)
        r = c.post("/api/lessons/", {"school_class": self.f.c9b.id, "subject": self.f.math.id, "weekday": 1, "period": 1}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("9-A", r.data["detail"])
        self.assertEqual(Lesson.objects.count(), 1)

    def test_announcement_audience(self):
        t = client_for(self.f.t1u)
        r = t.post("/api/announcements/", {"title": "Hammaga", "body": "x", "audience": "all"}, format="json")
        self.assertEqual(r.status_code, 400)  # o'qituvchi faqat o'z sinflariga
        r = t.post("/api/announcements/", {"title": "Ertaga nazorat", "body": "Tayyorlaning", "audience": "classes", "classes": [self.f.c9b.id]}, format="json")
        self.assertEqual(r.status_code, 400)
        r = t.post("/api/announcements/", {"title": "Ertaga nazorat", "body": "Tayyorlaning", "audience": "classes", "classes": [self.f.c9a.id]}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Notification.objects.filter(kind="announcement").count(), 2)  # 9-A dagi 2 o'quvchi
        self.assertEqual(len(client_for(self.f.s1u).get("/api/announcements/").data["results"]), 1)
        self.assertEqual(len(client_for(self.f.s3u).get("/api/announcements/").data["results"]), 0)

    def test_dashboards(self):
        for u in (self.f.director, self.f.t1u, self.f.s1u):
            r = client_for(u).get("/api/dashboard/")
            self.assertEqual(r.status_code, 200, (u.role, r.content[:300]))

    def test_csv_import(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        csv = "Familiya;Ism;Otasining ismi;Sinf;Telefon\nSobirov;Jasur;Akmalovich;9-A;901234567\nX;Y;;12-Z;\n".encode()
        r = client_for(self.f.director).post("/api/students/import/", {"file": SimpleUploadedFile("s.csv", csv)}, format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(len(r.data["created"]), 1)
        self.assertEqual(len(r.data["errors"]), 1)
