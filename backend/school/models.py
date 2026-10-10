from datetime import time

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

User = settings.AUTH_USER_MODEL

WEEKDAYS = [(1, "Dushanba"), (2, "Seshanba"), (3, "Chorshanba"), (4, "Payshanba"), (5, "Juma"), (6, "Shanba"), (7, "Yakshanba")]


class SchoolSettings(models.Model):
    """Maktabning yagona sozlamalari (bitta yozuv)."""

    name = models.CharField(max_length=150, default="Maktab")
    short_name = models.CharField(max_length=40, blank=True)
    address = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    logo = models.CharField(max_length=255, blank=True)
    academic_year = models.CharField(max_length=20, default="2026-2027")
    work_days = models.JSONField(default=list)  # [1..6]
    work_start = models.TimeField(default=time(8, 0))
    work_end = models.TimeField(default=time(17, 0))
    # Kechikish: kutilgan vaqtdan necha daqiqa o'tgach kechikkan hisoblanadi
    late_grace_minutes = models.PositiveSmallIntegerField(default=5)
    # O'qituvchi birinchi darsidan necha daqiqa oldin kelishi kerak
    arrive_before_lesson_minutes = models.PositiveSmallIntegerField(default=10)
    # Jadvalga qarab kutilgan vaqtni hisoblash (o'chiq bo'lsa hamma uchun work_start)
    use_timetable_for_arrival = models.BooleanField(default=True)
    # Kelmaganlik haqida ogohlantirish: kutilgan vaqtdan necha daqiqa keyin
    absent_alert_after_minutes = models.PositiveSmallIntegerField(default=30)
    # Kiosk: kirishdan keyin qancha vaqt o'tib skan "chiqish" deb olinadi
    checkout_min_minutes = models.PositiveSmallIntegerField(default=60)
    face_threshold = models.FloatField(default=0.48)
    require_liveness = models.BooleanField(default=True)
    store_checkin_photos = models.BooleanField(default=True)
    photo_retention_days = models.PositiveSmallIntegerField(default=30)
    daily_report_time = models.TimeField(default=time(18, 0))
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def get(cls):
        obj = cls.objects.order_by("id").first()
        if obj is None:
            obj = cls.objects.create(work_days=[1, 2, 3, 4, 5, 6])
        return obj


class Period(models.Model):
    """Qo'ng'iroq jadvali: 1-dars 08:00–08:45 va h.k."""

    number = models.PositiveSmallIntegerField(unique=True)
    start = models.TimeField()
    end = models.TimeField()

    class Meta:
        ordering = ["number"]

    def clean(self):
        if self.start >= self.end:
            raise ValidationError("Dars tugash vaqti boshlanishidan keyin bo'lishi kerak")


class Subject(models.Model):
    name = models.CharField(max_length=80, unique=True)
    short = models.CharField(max_length=12, blank=True)
    color = models.CharField(max_length=9, default="#6366F1")
    icon = models.CharField(max_length=32, default="book")

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class SchoolClass(models.Model):
    grade = models.PositiveSmallIntegerField()
    letter = models.CharField(max_length=4)
    room = models.CharField(max_length=20, blank=True)
    shift = models.PositiveSmallIntegerField(default=1, choices=[(1, "1-smena"), (2, "2-smena")])
    homeroom_teacher = models.ForeignKey("TeacherProfile", null=True, blank=True, on_delete=models.SET_NULL, related_name="homeroom_classes")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["grade", "letter"]
        constraints = [models.UniqueConstraint(fields=["grade", "letter"], name="uniq_class_grade_letter")]

    @property
    def name(self):
        return f"{self.grade}-{self.letter}"

    def clean(self):
        if not 1 <= self.grade <= 11:
            raise ValidationError({"grade": "Sinf 1 dan 11 gacha bo'lishi kerak"})
        self.letter = (self.letter or "").strip().upper()
        if not self.letter:
            raise ValidationError({"letter": "Sinf harfini kiriting"})

    def __str__(self):
        return self.name


class TeacherProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="teacher")
    position = models.CharField(max_length=80, default="O'qituvchi")
    subjects = models.ManyToManyField(Subject, blank=True, related_name="teachers")
    category = models.CharField(max_length=40, blank=True)
    hired_at = models.DateField(null=True, blank=True)
    bio = models.TextField(blank=True)
    # Kiosk uchun zaxira PIN (hash). Yuz tanilmasa ishlatiladi.
    pin_hash = models.CharField(max_length=200, blank=True)
    pin_failed = models.PositiveSmallIntegerField(default=0)
    pin_locked_until = models.DateTimeField(null=True, blank=True)
    track_attendance = models.BooleanField(default=True)

    def __str__(self):
        return self.user.full_name


class StudentProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="student")
    school_class = models.ForeignKey(SchoolClass, null=True, blank=True, on_delete=models.SET_NULL, related_name="students")
    student_no = models.CharField(max_length=20, blank=True)
    parent_name = models.CharField(max_length=120, blank=True)
    parent_phone = models.CharField(max_length=20, blank=True)
    address = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return self.user.full_name


class TeachingAssignment(models.Model):
    """O'qituvchi qaysi sinfda qaysi fanni o'qitadi (biriktirish)."""

    teacher = models.ForeignKey(TeacherProfile, on_delete=models.CASCADE, related_name="assignments")
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE, related_name="assignments")
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name="assignments")
    hours_per_week = models.PositiveSmallIntegerField(default=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["school_class", "subject"], name="uniq_class_subject_teacher")]
        ordering = ["school_class__grade", "school_class__letter", "subject__name"]


class Lesson(models.Model):
    """Dars jadvali katagi."""

    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE, related_name="lessons")
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name="lessons")
    teacher = models.ForeignKey(TeacherProfile, null=True, blank=True, on_delete=models.SET_NULL, related_name="lessons")
    weekday = models.PositiveSmallIntegerField(choices=WEEKDAYS)
    period = models.PositiveSmallIntegerField()
    room = models.CharField(max_length=20, blank=True)

    class Meta:
        ordering = ["weekday", "period"]
        constraints = [models.UniqueConstraint(fields=["school_class", "weekday", "period"], name="uniq_lesson_slot")]


class Audience(models.TextChoices):
    ALL = "all", "Hammaga"
    STAFF = "staff", "O'qituvchilarga"
    STUDENTS = "students", "O'quvchilarga"
    CLASSES = "classes", "Tanlangan sinflarga"


class Announcement(models.Model):
    title = models.CharField(max_length=200)
    body = models.TextField()
    author = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name="announcements")
    audience = models.CharField(max_length=10, choices=Audience.choices, default=Audience.ALL)
    classes = models.ManyToManyField(SchoolClass, blank=True, related_name="announcements")
    pinned = models.BooleanField(default=False)
    important = models.BooleanField(default=False)
    attachment = models.CharField(max_length=255, blank=True)
    attachment_name = models.CharField(max_length=200, blank=True)
    source = models.CharField(max_length=10, default="web")  # web | telegram
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-pinned", "-created_at"]


class Event(models.Model):
    class Kind(models.TextChoices):
        MEETING = "meeting", "Yig'ilish"
        EXAM = "exam", "Imtihon / nazorat"
        EVENT = "event", "Tadbir"
        HOLIDAY = "holiday", "Bayram / dam olish"
        PARENTS = "parents", "Ota-onalar majlisi"

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.MEETING)
    starts_at = models.DateTimeField(db_index=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    location = models.CharField(max_length=120, blank=True)
    audience = models.CharField(max_length=10, choices=Audience.choices, default=Audience.STAFF)
    classes = models.ManyToManyField(SchoolClass, blank=True, related_name="events")
    created_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name="+")
    reminded = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["starts_at"]

    def clean(self):
        if self.ends_at and self.ends_at < self.starts_at:
            raise ValidationError({"ends_at": "Tugash vaqti boshlanishdan oldin bo'lishi mumkin emas"})


class Notification(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=32)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    link = models.CharField(max_length=200, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "read_at"])]
