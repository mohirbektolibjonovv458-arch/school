from django.utils import timezone
from rest_framework import serializers

from core.files import signed_url
from school.models import SchoolClass, Subject, TeachingAssignment

from .models import Homework, HomeworkFile, Submission, SubmissionEvent, SubmissionFile


def file_payload(f):
    return {"id": f.id, "name": f.name, "mime": f.mime, "size": f.size, "is_image": f.mime.startswith("image/"),
            "url": signed_url(f.path, f.name), **({"attempt": f.attempt} if hasattr(f, "attempt") else {})}


def student_state(hw, sub, now=None):
    """O'quvchi nuqtai nazaridan vazifa holati."""
    now = now or timezone.now()
    if sub:
        return sub.status  # submitted / revision / accepted
    if now > hw.due_at:
        return "missed" if (hw.is_closed or not hw.allow_late) else "overdue"
    return "pending"


class HomeworkListSerializer(serializers.ModelSerializer):
    subject = serializers.SerializerMethodField()
    school_class = serializers.SerializerMethodField()
    teacher_name = serializers.CharField(source="teacher.user.full_name", read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    file_count = serializers.SerializerMethodField()
    stats = serializers.SerializerMethodField()
    my = serializers.SerializerMethodField()

    class Meta:
        model = Homework
        fields = ["id", "title", "subject", "school_class", "teacher_name", "due_at", "max_score", "allow_late", "is_closed",
                  "is_overdue", "created_at", "file_count", "stats", "my"]

    def get_subject(self, obj):
        return {"id": obj.subject_id, "name": obj.subject.name, "color": obj.subject.color, "icon": obj.subject.icon}

    def get_school_class(self, obj):
        return {"id": obj.school_class_id, "name": obj.school_class.name}

    def get_file_count(self, obj):
        return getattr(obj, "file_count", None) if hasattr(obj, "file_count") else obj.files.count()

    def get_stats(self, obj):
        req = self.context.get("request")
        if not req or req.user.is_student:
            return None
        if not hasattr(obj, "submitted"):
            return None
        return {
            "submitted": obj.submitted,
            "to_review": getattr(obj, "to_review", None),
            "accepted": getattr(obj, "accepted", None),
            "students": getattr(obj, "student_total", None),
        }

    def get_my(self, obj):
        req = self.context.get("request")
        if not req or not req.user.is_student:
            return None
        subs = self.context.get("my_subs")
        sub = subs.get(obj.id) if subs is not None else obj.submissions.filter(student__user=req.user).first()
        return {
            "state": student_state(obj, sub),
            "score": sub.score if sub else None,
            "submitted_at": sub.submitted_at if sub else None,
            "submission_id": sub.id if sub else None,
        }


class SubmissionEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.full_name", read_only=True, default=None)

    class Meta:
        model = SubmissionEvent
        fields = ["id", "action", "actor_name", "note", "score", "created_at"]


class SubmissionSerializer(serializers.ModelSerializer):
    student = serializers.SerializerMethodField()
    files = serializers.SerializerMethodField()
    events = SubmissionEventSerializer(many=True, read_only=True)
    homework = serializers.SerializerMethodField()
    reviewed_by_name = serializers.CharField(source="reviewed_by.full_name", read_only=True, default=None)

    class Meta:
        model = Submission
        fields = ["id", "homework", "student", "status", "comment", "attempt", "is_late", "submitted_at", "score", "feedback",
                  "reviewed_at", "reviewed_by_name", "files", "events"]

    def get_student(self, obj):
        u = obj.student.user
        return {"id": obj.student_id, "full_name": u.full_name, "avatar_url": signed_url(u.avatar) if u.avatar else None}

    def get_files(self, obj):
        return [file_payload(f) for f in obj.files.all().order_by("-attempt", "id")]

    def get_homework(self, obj):
        h = obj.homework
        return {"id": h.id, "title": h.title, "max_score": h.max_score, "due_at": h.due_at, "class_name": h.school_class.name,
                "subject": {"name": h.subject.name, "color": h.subject.color}}


class HomeworkDetailSerializer(HomeworkListSerializer):
    files = serializers.SerializerMethodField()
    my_submission = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()

    class Meta(HomeworkListSerializer.Meta):
        fields = HomeworkListSerializer.Meta.fields + ["description", "files", "my_submission", "can_edit", "updated_at"]

    def get_files(self, obj):
        return [file_payload(f) for f in obj.files.all()]

    def get_file_count(self, obj):
        return obj.files.count()

    def get_my_submission(self, obj):
        req = self.context.get("request")
        if not req or not req.user.is_student:
            return None
        sub = obj.submissions.filter(student__user=req.user).prefetch_related("files", "events__actor").first()
        return SubmissionSerializer(sub).data if sub else None

    def get_can_edit(self, obj):
        req = self.context.get("request")
        if not req:
            return False
        u = req.user
        return u.is_manager or (u.is_teacher and obj.teacher.user_id == u.id)


class HomeworkWriteSerializer(serializers.ModelSerializer):
    school_class = serializers.PrimaryKeyRelatedField(queryset=SchoolClass.objects.all())
    subject = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all())

    class Meta:
        model = Homework
        fields = ["school_class", "subject", "title", "description", "due_at", "max_score", "allow_late", "is_closed"]

    def validate_title(self, v):
        v = v.strip()
        if len(v) < 3:
            raise serializers.ValidationError("Sarlavha kamida 3 belgidan iborat bo'lsin")
        return v

    def validate_max_score(self, v):
        if v not in (5, 10, 12, 100):
            raise serializers.ValidationError("Maksimal ball 5, 10, 12 yoki 100 bo'lishi mumkin")
        return v

    def validate(self, data):
        teacher = self.context["teacher"]
        cls = data.get("school_class", getattr(self.instance, "school_class", None))
        subj = data.get("subject", getattr(self.instance, "subject", None))
        if teacher is not None and not TeachingAssignment.objects.filter(teacher=teacher, school_class=cls, subject=subj).exists():
            raise serializers.ValidationError({"school_class": f"Siz {cls.name} sinfida «{subj.name}» fanini o'qitmaysiz"})
        due = data.get("due_at")
        if due is not None and (self.instance is None or due != self.instance.due_at):
            if due < timezone.now() + timezone.timedelta(minutes=10):
                raise serializers.ValidationError({"due_at": "Topshirish muddati kamida 10 daqiqadan keyin bo'lishi kerak"})
            if due > timezone.now() + timezone.timedelta(days=120):
                raise serializers.ValidationError({"due_at": "Muddat 4 oydan uzoq bo'lmasin"})
        return data


class ReviewSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["accept", "revision"])
    score = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    feedback = serializers.CharField(required=False, allow_blank=True, max_length=3000)

    def validate(self, data):
        hw = self.context["homework"]
        if data["action"] == "accept":
            if data.get("score") is None:
                raise serializers.ValidationError({"score": "Baho qo'ying"})
            if data["score"] > hw.max_score:
                raise serializers.ValidationError({"score": f"Baho {hw.max_score} dan oshmasin"})
        else:
            if not (data.get("feedback") or "").strip():
                raise serializers.ValidationError({"feedback": "Nimani qayta ishlash kerakligini yozing"})
            data["score"] = None
        return data


__all__ = ["HomeworkListSerializer", "HomeworkDetailSerializer", "HomeworkWriteSerializer", "SubmissionSerializer",
           "ReviewSerializer", "HomeworkFile", "SubmissionFile", "student_state", "file_payload"]
