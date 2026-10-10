from django.conf import settings
from django.db import models
from django.utils import timezone

from school.models import SchoolClass, StudentProfile, Subject, TeacherProfile


class Homework(models.Model):
    teacher = models.ForeignKey(TeacherProfile, on_delete=models.CASCADE, related_name="homeworks")
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE, related_name="homeworks")
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name="homeworks")
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    due_at = models.DateTimeField(db_index=True)
    max_score = models.PositiveSmallIntegerField(default=5)
    allow_late = models.BooleanField(default=True)
    is_closed = models.BooleanField(default=False)
    reminded = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def is_overdue(self):
        return timezone.now() > self.due_at

    def accepts_submissions(self):
        if self.is_closed:
            return False
        return self.allow_late or not self.is_overdue


class HomeworkFile(models.Model):
    homework = models.ForeignKey(Homework, on_delete=models.CASCADE, related_name="files")
    path = models.CharField(max_length=255)
    name = models.CharField(max_length=200)
    mime = models.CharField(max_length=100)
    size = models.PositiveIntegerField()


class Submission(models.Model):
    class Status(models.TextChoices):
        SUBMITTED = "submitted", "Tekshirilmoqda"
        REVISION = "revision", "Qayta ishlash kerak"
        ACCEPTED = "accepted", "Qabul qilindi"

    homework = models.ForeignKey(Homework, on_delete=models.CASCADE, related_name="submissions")
    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name="submissions")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.SUBMITTED, db_index=True)
    comment = models.TextField(blank=True)
    attempt = models.PositiveSmallIntegerField(default=1)
    is_late = models.BooleanField(default=False)
    submitted_at = models.DateTimeField(default=timezone.now)
    score = models.PositiveSmallIntegerField(null=True, blank=True)
    feedback = models.TextField(blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-submitted_at"]
        constraints = [models.UniqueConstraint(fields=["homework", "student"], name="uniq_submission")]


class SubmissionFile(models.Model):
    submission = models.ForeignKey(Submission, on_delete=models.CASCADE, related_name="files")
    attempt = models.PositiveSmallIntegerField(default=1)
    path = models.CharField(max_length=255)
    name = models.CharField(max_length=200)
    mime = models.CharField(max_length=100)
    size = models.PositiveIntegerField()
    uploaded_at = models.DateTimeField(auto_now_add=True)


class SubmissionEvent(models.Model):
    """Topshiriq tarixi: yuborildi → qaytarildi → qayta yuborildi → qabul qilindi."""

    submission = models.ForeignKey(Submission, on_delete=models.CASCADE, related_name="events")
    action = models.CharField(max_length=16)  # submitted, resubmitted, revision, accepted
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    note = models.TextField(blank=True)
    score = models.PositiveSmallIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
