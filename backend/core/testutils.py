import io
import random
from datetime import time

from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import Role, User
from school.models import Period, SchoolClass, SchoolSettings, StudentProfile, Subject, TeacherProfile, TeachingAssignment


def make_user(username, role, password="Secr3t-pass!", **kw):
    u = User(username=username, role=role, first_name=kw.pop("first_name", username.title()), last_name=kw.pop("last_name", "Test"), **kw)
    u.set_password(password)
    u.save()
    return u


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def jpeg_file(name="photo.jpg", color=(200, 30, 30)):
    buf = io.BytesIO()
    Image.new("RGB", (64, 48), color).save(buf, "JPEG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/jpeg")


def pdf_file(name="work.pdf"):
    raw = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
    return SimpleUploadedFile(name, raw, content_type="application/pdf")


def random_vec(seed, scale=0.09):
    r = random.Random(seed)
    return [r.uniform(-scale, scale) * 1.0 + 0.0 for _ in range(128)]


def near(vec, seed, noise=0.004):
    r = random.Random(seed)
    return [v + r.uniform(-noise, noise) for v in vec]


class SchoolFixture:
    """Kichik maktab: 1 direktor, 2 o'qituvchi, 2 sinf, 3 o'quvchi."""

    def __init__(self):
        s = SchoolSettings.get()
        s.name = "Test maktab"
        s.work_days = [1, 2, 3, 4, 5, 6, 7]
        s.work_start = time(8, 0)
        s.use_timetable_for_arrival = False
        s.save()
        for n, (a, b) in enumerate([(time(8, 30), time(9, 15)), (time(9, 25), time(10, 10)), (time(10, 20), time(11, 5))], start=1):
            Period.objects.create(number=n, start=a, end=b)
        self.director = make_user("director", Role.DIRECTOR, phone="+998901111111")
        self.math = Subject.objects.create(name="Matematika", color="#2563EB")
        self.lit = Subject.objects.create(name="Adabiyot", color="#DB2777")
        self.t1u = make_user("teacher1", Role.TEACHER, first_name="Aziza", last_name="Karimova")
        self.t2u = make_user("teacher2", Role.TEACHER, first_name="Bobur", last_name="Aliyev")
        self.t1 = TeacherProfile.objects.create(user=self.t1u)
        self.t2 = TeacherProfile.objects.create(user=self.t2u)
        self.c9a = SchoolClass.objects.create(grade=9, letter="A")
        self.c9b = SchoolClass.objects.create(grade=9, letter="B")
        TeachingAssignment.objects.create(teacher=self.t1, school_class=self.c9a, subject=self.math)
        TeachingAssignment.objects.create(teacher=self.t2, school_class=self.c9b, subject=self.lit)
        self.s1u = make_user("student1", Role.STUDENT)
        self.s2u = make_user("student2", Role.STUDENT)
        self.s3u = make_user("student3", Role.STUDENT)
        self.s1 = StudentProfile.objects.create(user=self.s1u, school_class=self.c9a)
        self.s2 = StudentProfile.objects.create(user=self.s2u, school_class=self.c9a)
        self.s3 = StudentProfile.objects.create(user=self.s3u, school_class=self.c9b)
