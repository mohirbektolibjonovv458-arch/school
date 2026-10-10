import hashlib
import secrets

from django.conf import settings
from django.db import models
from django.utils import timezone

from school.models import TeacherProfile


class Method(models.TextChoices):
    FACE = "face", "Yuz orqali"
    PIN = "pin", "PIN-kod"
    MANUAL = "manual", "Qo'lda (direktor)"


class AttendanceRecord(models.Model):
    """O'qituvchining bir kunlik davomati."""

    teacher = models.ForeignKey(TeacherProfile, on_delete=models.CASCADE, related_name="attendance")
    date = models.DateField(db_index=True)
    check_in = models.DateTimeField(null=True, blank=True)
    check_out = models.DateTimeField(null=True, blank=True)
    in_method = models.CharField(max_length=8, choices=Method.choices, blank=True)
    out_method = models.CharField(max_length=8, choices=Method.choices, blank=True)
    expected_at = models.DateTimeField(null=True, blank=True)
    late_minutes = models.PositiveIntegerField(default=0)
    note = models.CharField(max_length=255, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date"]
        constraints = [models.UniqueConstraint(fields=["teacher", "date"], name="uniq_attendance_day")]


class AttendanceEvent(models.Model):
    """Har bir skan / qo'lda kiritish — o'zgarmas jurnal."""

    class Type(models.TextChoices):
        IN = "in", "Kirish"
        OUT = "out", "Chiqish"

    teacher = models.ForeignKey(TeacherProfile, on_delete=models.CASCADE, related_name="attendance_events")
    type = models.CharField(max_length=3, choices=Type.choices)
    at = models.DateTimeField(default=timezone.now, db_index=True)
    method = models.CharField(max_length=8, choices=Method.choices)
    device = models.ForeignKey("KioskDevice", null=True, blank=True, on_delete=models.SET_NULL, related_name="events")
    distance = models.FloatField(null=True, blank=True)
    photo = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-at"]


class Absence(models.Model):
    """Sababli kelmaslik (kasallik, ta'til, xizmat safari) — direktor tasdiqlaydi."""

    class Reason(models.TextChoices):
        SICK = "sick", "Kasallik"
        VACATION = "vacation", "Ta'til"
        TRIP = "trip", "Xizmat safari"
        TRAINING = "training", "Malaka oshirish"
        FAMILY = "family", "Oilaviy sabab"
        OTHER = "other", "Boshqa"

    teacher = models.ForeignKey(TeacherProfile, on_delete=models.CASCADE, related_name="absences")
    date_from = models.DateField()
    date_to = models.DateField()
    reason = models.CharField(max_length=10, choices=Reason.choices, default=Reason.OTHER)
    note = models.CharField(max_length=255, blank=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date_from"]


class AlertLog(models.Model):
    """Bir xil ogohlantirish ikki marta yuborilmasligi uchun."""

    key = models.CharField(max_length=120, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @classmethod
    def once(cls, key):
        _, created = cls.objects.get_or_create(key=key)
        return created


# ---------------- Biometrika ----------------

CONSENT_VERSION = "1.0"


class FaceConsent(models.Model):
    """O'qituvchining biometrik ma'lumotlarga yozma (elektron) roziligi."""

    teacher = models.OneToOneField(TeacherProfile, on_delete=models.CASCADE, related_name="face_consent")
    version = models.CharField(max_length=10, default=CONSENT_VERSION)
    given_at = models.DateTimeField(null=True, blank=True)
    withdrawn_at = models.DateTimeField(null=True, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)

    @property
    def active(self):
        return bool(self.given_at and not self.withdrawn_at)


class FaceEnrollment(models.Model):
    """Yuz namunalari to'plami. Direktor tasdiqlamaguncha davomatda ishlatilmaydi."""

    class Status(models.TextChoices):
        PENDING = "pending", "Tasdiq kutilmoqda"
        APPROVED = "approved", "Tasdiqlangan"
        REJECTED = "rejected", "Rad etilgan"

    teacher = models.ForeignKey(TeacherProfile, on_delete=models.CASCADE, related_name="face_enrollments")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    # Shifrlangan (Fernet) 128 o'lchamli vektorlar ro'yxati. Rasm emas.
    templates = models.BinaryField()
    samples = models.PositiveSmallIntegerField(default=0)
    photo = models.CharField(max_length=255, blank=True)  # tasdiqlash uchun bitta kichik surat
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reject_reason = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


def _hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


class KioskDevice(models.Model):
    """Darvozadagi planshet/telefon. Faqat juftlangan qurilma davomat yoza oladi."""

    name = models.CharField(max_length=80)
    token_hash = models.CharField(max_length=64, blank=True, db_index=True)
    pair_code = models.CharField(max_length=12, blank=True, db_index=True)
    pair_expires = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    last_seen = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def is_paired(self):
        return bool(self.token_hash)

    def new_pair_code(self):
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        self.pair_code = "".join(secrets.choice(alphabet) for _ in range(8))
        self.pair_expires = timezone.now() + timezone.timedelta(minutes=15)
        self.save(update_fields=["pair_code", "pair_expires"])
        return self.pair_code

    def issue_token(self):
        token = secrets.token_urlsafe(32)
        self.token_hash = _hash(token)
        self.pair_code = ""
        self.pair_expires = None
        self.save(update_fields=["token_hash", "pair_code", "pair_expires"])
        return token

    @classmethod
    def by_token(cls, token):
        if not token:
            return None
        return cls.objects.filter(token_hash=_hash(token), is_active=True).first()
