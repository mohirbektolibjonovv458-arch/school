"""SINOV uchun namunaviy maktab ma'lumotlari: python manage.py seed_demo

Faqat bo'sh bazada ishlaydi (haqiqiy ma'lumotlarni buzmaslik uchun).
Barcha demo akkauntlar paroli: Demo12345
"""
import random
from datetime import datetime, time, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import Role, User
from attendance.logic import Context, late_minutes_for
from attendance.models import Absence, AttendanceEvent, AttendanceRecord
from homework.models import Homework, Submission, SubmissionEvent
from school.models import (
    Announcement, Event, Lesson, Period, SchoolClass, SchoolSettings, StudentProfile, Subject, TeacherProfile, TeachingAssignment,
)

PASSWORD = "Demo12345"
TEACHERS = [
    ("Karimova", "Dilnoza", "f", ["Matematika", "Algebra"]), ("Rahimov", "Jamshid", "m", ["Fizika"]), ("Yusupova", "Malika", "f", ["Ona tili", "Adabiyot"]),
    ("Abdullayev", "Sardor", "m", ["Ingliz tili"]), ("Toshmatova", "Gulnora", "f", ["Kimyo", "Biologiya"]), ("Nazarov", "Bekzod", "m", ["Tarix", "Geografiya"]),
    ("Ismoilova", "Nodira", "f", ["Informatika"]), ("Qodirov", "Akmal", "m", ["Jismoniy tarbiya"]), ("Ergasheva", "Feruza", "f", ["Rus tili"]),
]
SUBJECTS = [("Matematika", "calculator", "#4F46E5"), ("Algebra", "calculator", "#7C3AED"), ("Fizika", "atom", "#0891B2"), ("Ona tili", "pen", "#DB2777"),
            ("Adabiyot", "book", "#E11D48"), ("Ingliz tili", "languages", "#2563EB"), ("Kimyo", "flask", "#16A34A"), ("Biologiya", "leaf", "#0D9488"),
            ("Tarix", "landmark", "#D97706"), ("Geografiya", "globe", "#EA580C"), ("Informatika", "code", "#475569"), ("Jismoniy tarbiya", "dumbbell", "#65A30D"),
            ("Rus tili", "languages", "#9333EA")]
FIRST_M = ["Jasur", "Bobur", "Sherzod", "Azizbek", "Diyorbek", "Javohir", "Otabek", "Ulugbek", "Sardor", "Islom", "Abdulloh", "Muhammad"]
FIRST_F = ["Madina", "Sevara", "Zarina", "Nilufar", "Shahzoda", "Mohinur", "Dildora", "Malika", "Kamola", "Sabina", "Gulshan", "Robiya"]
LAST = ["Aliyev", "Karimov", "Toshpulatov", "Rasulov", "Saidov", "Xolmatov", "Yo'ldoshev", "Mirzayev", "Hamidov", "Sobirov", "Umarov", "Usmonov", "Ergashev", "Jo'rayev"]
CLASS_PLAN = {
    (9, "A"): ["Algebra", "Fizika", "Ona tili", "Ingliz tili", "Kimyo", "Tarix", "Informatika", "Jismoniy tarbiya"],
    (9, "B"): ["Algebra", "Fizika", "Adabiyot", "Ingliz tili", "Biologiya", "Geografiya", "Rus tili"],
    (7, "A"): ["Matematika", "Ona tili", "Ingliz tili", "Biologiya", "Tarix", "Informatika", "Jismoniy tarbiya"],
    (5, "A"): ["Matematika", "Ona tili", "Adabiyot", "Ingliz tili", "Tarix", "Rus tili"],
}
HW_TITLES = {
    "Algebra": ["Kvadrat tenglamalar: 145–152 misollar", "Funksiya grafigi: 3-mashq"], "Matematika": ["Kasrlar: 210–218 misollar", "Masalalar to'plami 5-bet"],
    "Fizika": ["Nyuton qonunlari: 4 ta masala", "Laboratoriya hisoboti"], "Ona tili": ["Insho: «Mening maktabim»", "45-mashq"],
    "Adabiyot": ["She'rni yod olish", "Asar tahlili"], "Ingliz tili": ["Unit 5: Exercise 3, 4", "Essay: My hobby"], "Kimyo": ["Davriy jadval: 1–20 elementlar"],
    "Biologiya": ["Hujayra tuzilishi chizmasi"], "Tarix": ["Amir Temur davri: konspekt"], "Geografiya": ["O'zbekiston xaritasi"],
    "Informatika": ["Python: 5 ta topshiriq"], "Rus tili": ["Упражнение 112"], "Jismoniy tarbiya": ["Ertalabki mashqlar kundaligi"],
}


class Command(BaseCommand):
    help = "Sinov uchun namunaviy maktab ma'lumotlarini yaratadi (faqat bo'sh bazada)"

    @transaction.atomic
    def handle(self, *args, **opts):
        if SchoolClass.objects.exists() or TeacherProfile.objects.exists():
            raise CommandError("Bazada allaqachon ma'lumot bor — demo yaratilmaydi.")
        rnd = random.Random(42)
        s = SchoolSettings.get()
        s.name = "SchoolPro namunaviy maktabi"
        s.address = "Toshkent sh., Yunusobod tumani"
        s.work_days = [1, 2, 3, 4, 5, 6]
        s.save()
        starts = [(8, 30), (9, 25), (10, 20), (11, 25), (12, 20), (13, 15)]
        for i, (h, m) in enumerate(starts, start=1):
            st = time(h, m)
            en = (datetime.combine(datetime.today(), st) + timedelta(minutes=45)).time()
            Period.objects.create(number=i, start=st, end=en)
        subjects = {n: Subject.objects.create(name=n, icon=i, color=c) for n, i, c in SUBJECTS}

        def mk(username, role, first, last, gender="", **kw):
            u = User(username=username, role=role, first_name=first, last_name=last, gender=gender, **kw)
            u.set_password(PASSWORD)
            u.save()
            return u

        if not User.objects.filter(role__in=[Role.DIRECTOR, Role.ADMIN]).exists():
            mk("direktor", Role.DIRECTOR, "Anvar", "Xasanov", "m", phone="+998901000000")
        teachers = {}
        for i, (last, first, g, subs) in enumerate(TEACHERS):
            u = mk(f"oqituvchi{i + 1}", Role.TEACHER, first, last, g, phone=f"+99890{1100000 + i:07d}")
            t = TeacherProfile.objects.create(user=u, position="O'qituvchi", category=rnd.choice(["Oliy toifa", "1-toifa", "2-toifa"]))
            t.subjects.set([subjects[x] for x in subs])
            for x in subs:
                teachers.setdefault(x, t)
        classes = []
        n = 1
        for (grade, letter), subs in CLASS_PLAN.items():
            c = SchoolClass.objects.create(grade=grade, letter=letter, room=str(100 + grade * 10 + ord(letter) - 64))
            classes.append(c)
            for x in subs:
                TeachingAssignment.objects.create(teacher=teachers[x], school_class=c, subject=subjects[x], hours_per_week=2)
            c.homeroom_teacher = teachers[subs[0]]
            c.save()
            for k in range(12):
                g = "m" if k % 2 == 0 else "f"
                first = rnd.choice(FIRST_M if g == "m" else FIRST_F)
                last = rnd.choice(LAST) + ("a" if g == "f" else "")
                u = mk(f"oquvchi{n}", Role.STUDENT, first, last, g)
                StudentProfile.objects.create(user=u, school_class=c, student_no=f"{n:05d}", parent_name=f"{rnd.choice(LAST)} {rnd.choice(FIRST_M)}",
                                              parent_phone=f"+99893{2000000 + n:07d}")
                n += 1
            # dars jadvali: har kuni 5 dars, o'qituvchi to'qnashuvisiz
            for wd in range(1, 7):
                order = subs[:]
                rnd.shuffle(order)
                period = 1
                for x in order:
                    if period > 5:
                        break
                    t = teachers[x]
                    if Lesson.objects.filter(teacher=t, weekday=wd, period=period).exists():
                        continue
                    Lesson.objects.create(school_class=c, subject=subjects[x], teacher=t, weekday=wd, period=period, room=c.room)
                    period += 1

        now = timezone.now()
        for c in classes:
            for ta in TeachingAssignment.objects.filter(school_class=c).select_related("subject", "teacher"):
                for j, title in enumerate(HW_TITLES.get(ta.subject.name, ["Mashqlar"])):
                    created = now - timedelta(days=rnd.randint(2, 12))
                    hw = Homework.objects.create(teacher=ta.teacher, school_class=c, subject=ta.subject, title=title,
                                                 description="Darslikdagi topshiriqlarni daftarga bajaring va rasmga olib yuboring.",
                                                 due_at=now + timedelta(days=rnd.choice([-3, -1, 1, 2, 4])), max_score=5)
                    Homework.objects.filter(pk=hw.pk).update(created_at=created)
                    for sp in c.students.all():
                        r = rnd.random()
                        if r < 0.35:
                            continue
                        sub = Submission.objects.create(homework=hw, student=sp, submitted_at=created + timedelta(days=1), comment="")
                        SubmissionEvent.objects.create(submission=sub, action="submitted", actor=sp.user)
                        if r > 0.6:
                            sub.status = "accepted"
                            sub.score = rnd.choice([3, 4, 4, 5, 5, 5])
                            sub.feedback = rnd.choice(["Yaxshi!", "Barakalla", "Xatolarni tuzating", ""])
                            sub.reviewed_at = created + timedelta(days=2)
                            sub.reviewed_by = ta.teacher.user
                            sub.save()
                            SubmissionEvent.objects.create(submission=sub, action="accepted", actor=ta.teacher.user, score=sub.score, note=sub.feedback)

        # So'nggi 3 hafta davomati (bugungi kun ham — hozirgi vaqtgacha)
        ctx = Context.load()
        today = timezone.localdate()
        all_teachers = list(TeacherProfile.objects.all())
        Absence.objects.create(teacher=all_teachers[4], date_from=today - timedelta(days=9), date_to=today - timedelta(days=7), reason="sick", note="Kasallik varaqasi")
        for back in range(21, -1, -1):
            d = today - timedelta(days=back)
            for t in all_teachers:
                exp = ctx.expected_at(t.id, d)
                if exp is None or (t == all_teachers[4] and 7 <= back <= 9):
                    continue
                r = rnd.random()
                if r < 0.04:
                    continue  # kelmagan
                delta = rnd.randint(-25, -2) if r < 0.82 else rnd.randint(3, 35)
                cin = exp + timedelta(minutes=delta)
                if cin > timezone.now():
                    continue
                rec = AttendanceRecord.objects.create(teacher=t, date=d, check_in=cin, in_method=rnd.choice(["face", "face", "face", "pin"]),
                                                      expected_at=exp, late_minutes=late_minutes_for(exp, cin, s.late_grace_minutes))
                AttendanceEvent.objects.create(teacher=t, type="in", at=cin, method=rec.in_method)
                cout = timezone.make_aware(datetime.combine(d, time(rnd.randint(13, 16), rnd.randint(0, 59))))
                if cout < timezone.now():
                    rec.check_out = cout
                    rec.out_method = "face"
                    rec.save()
                    AttendanceEvent.objects.create(teacher=t, type="out", at=cout, method="face")

        director = User.objects.filter(role=Role.DIRECTOR).first()
        Announcement.objects.create(title="Yangi o'quv choragi boshlandi", body="Hurmatli o'quvchilar va ustozlar! 2-chorak darslari dushanbadan boshlanadi. Dars jadvalini ilovada tekshiring.",
                                    author=director, audience="all", pinned=True)
        Announcement.objects.create(title="Pedagogik kengash", body="Juma kuni soat 15:00 da majlislar zalida pedagogik kengash bo'ladi. Barcha o'qituvchilar ishtiroki shart.",
                                    author=director, audience="staff", important=True)
        Event.objects.create(title="Pedagogik kengash", kind="meeting", starts_at=now + timedelta(days=2, hours=3), location="Majlislar zali", audience="staff", created_by=director)
        Event.objects.create(title="Matematika olimpiadasi", kind="exam", starts_at=now + timedelta(days=6), location="201-xona", audience="students", created_by=director)
        Event.objects.create(title="Ota-onalar majlisi", kind="parents", starts_at=now + timedelta(days=9), location="Faollar zali", audience="all", created_by=director)
        self.stdout.write(self.style.SUCCESS(
            f"✅ Demo tayyor: {len(all_teachers)} o'qituvchi, {len(classes)} sinf, {n - 1} o'quvchi.\n"
            f"   Kirish: {director.username if director else '-'} / oqituvchi1 / oquvchi1 — demo parol: {PASSWORD}"))
