from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models


class Role(models.TextChoices):
    DIRECTOR = "director", "Direktor"
    ADMIN = "admin", "Administrator"
    TEACHER = "teacher", "O'qituvchi"
    STUDENT = "student", "O'quvchi"


MANAGER_ROLES = (Role.DIRECTOR, Role.ADMIN)


class User(AbstractUser):
    """Login — `username` (o'qituvchilarda odatda telefon, o'quvchilarda maktab beradigan ID)."""

    email = models.EmailField(blank=True)
    role = models.CharField(max_length=16, choices=Role.choices, db_index=True)
    middle_name = models.CharField("Otasining ismi", max_length=64, blank=True)
    phone = models.CharField(max_length=20, blank=True, db_index=True)
    avatar = models.CharField(max_length=255, blank=True)  # saqlangan fayl yo'li
    birth_date = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=1, choices=[("m", "Erkak"), ("f", "Ayol")], blank=True)
    must_change_password = models.BooleanField(default=False)
    telegram_chat_id = models.BigIntegerField(null=True, blank=True, unique=True)
    telegram_alerts = models.BooleanField(default=True)
    theme = models.CharField(max_length=8, default="system")
    # Parol o'zgarganda / bloklanganda shu vaqtdan oldingi barcha tokenlar bekor
    tokens_valid_after = models.DateTimeField(null=True, blank=True)

    objects = UserManager()

    REQUIRED_FIELDS = ["role"]

    class Meta:
        ordering = ["last_name", "first_name"]

    @property
    def full_name(self):
        return " ".join(x for x in (self.last_name, self.first_name) if x) or self.username

    @property
    def is_manager(self):
        return self.role in MANAGER_ROLES

    @property
    def is_teacher(self):
        return self.role == Role.TEACHER

    @property
    def is_student(self):
        return self.role == Role.STUDENT

    def __str__(self):
        return self.full_name
