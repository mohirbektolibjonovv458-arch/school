import re
import secrets

from django.db import transaction
from rest_framework import serializers

from accounts.models import Role, User
from accounts.serializers import UserBriefSerializer, clean_phone
from core.files import signed_url

from .models import (
    Announcement, Audience, Event, Lesson, Notification, Period, SchoolClass, SchoolSettings,
    StudentProfile, Subject, TeacherProfile, TeachingAssignment,
)

PW_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generate_password():
    while True:
        pw = "".join(secrets.choice(PW_ALPHABET) for _ in range(10))
        if re.search(r"\d", pw) and re.search(r"[a-z]", pw) and re.search(r"[A-Z]", pw):
            return pw


def unique_username(base):
    base = re.sub(r"[^a-zA-Z0-9_.+]", "", base)[:30] or "user"
    name, i = base, 1
    while User.objects.filter(username__iexact=name).exists():
        i += 1
        name = f"{base}{i}"
    return name


class PeriodSerializer(serializers.ModelSerializer):
    class Meta:
        model = Period
        fields = ["id", "number", "start", "end"]

    def validate(self, data):
        if data["start"] >= data["end"]:
            raise serializers.ValidationError(f"{data['number']}-dars: tugash vaqti boshlanishidan keyin bo'lsin")
        return data


class SettingsSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = SchoolSettings
        exclude = ["logo"]
        read_only_fields = ["updated_at"]

    def get_logo_url(self, obj):
        return signed_url(obj.logo) if obj.logo else None

    def validate_work_days(self, v):
        if not isinstance(v, list) or not v or any(d not in range(1, 8) for d in v):
            raise serializers.ValidationError("Ish kunlarini tanlang")
        return sorted(set(v))

    def validate_face_threshold(self, v):
        if not 0.3 <= v <= 0.65:
            raise serializers.ValidationError("Chegara 0.30 – 0.65 oralig'ida bo'lishi kerak")
        return v

    def validate(self, data):
        ws, we = data.get("work_start", getattr(self.instance, "work_start", None)), data.get("work_end", getattr(self.instance, "work_end", None))
        if ws and we and ws >= we:
            raise serializers.ValidationError({"work_end": "Ish tugashi boshlanishidan keyin bo'lsin"})
        return data


class SubjectSerializer(serializers.ModelSerializer):
    teacher_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Subject
        fields = ["id", "name", "short", "color", "icon", "teacher_count"]

    def validate_color(self, v):
        if not re.match(r"^#[0-9A-Fa-f]{6}$", v):
            raise serializers.ValidationError("Rang #RRGGBB ko'rinishida bo'lsin")
        return v

    def validate_name(self, v):
        v = v.strip()
        qs = Subject.objects.filter(name__iexact=v)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Bunday fan allaqachon bor")
        return v


# ---------------- Odamlar ----------------

class PersonMixin(serializers.Serializer):
    first_name = serializers.CharField(source="user.first_name", max_length=64)
    last_name = serializers.CharField(source="user.last_name", max_length=64)
    middle_name = serializers.CharField(source="user.middle_name", max_length=64, required=False, allow_blank=True)
    username = serializers.CharField(source="user.username", max_length=40, required=False, allow_blank=True)
    phone = serializers.CharField(source="user.phone", max_length=20, required=False, allow_blank=True)
    birth_date = serializers.DateField(source="user.birth_date", required=False, allow_null=True)
    gender = serializers.ChoiceField(source="user.gender", choices=[("m", "m"), ("f", "f"), ("", "")], required=False, allow_blank=True)
    is_active = serializers.BooleanField(source="user.is_active", required=False)
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    full_name = serializers.CharField(source="user.full_name", read_only=True)
    avatar_url = serializers.SerializerMethodField()
    last_login = serializers.DateTimeField(source="user.last_login", read_only=True)

    def get_avatar_url(self, obj):
        return signed_url(obj.user.avatar) if obj.user.avatar else None

    def validate_phone(self, v):
        return clean_phone(v)

    def validate_username(self, v):
        v = (v or "").strip()
        if not v:
            return v
        if not re.match(r"^[a-zA-Z0-9_.+]{3,40}$", v):
            raise serializers.ValidationError("Login faqat lotin harflari, raqamlar va _ . + belgilaridan iborat bo'lsin (3–40)")
        qs = User.objects.filter(username__iexact=v)
        if self.instance:
            qs = qs.exclude(pk=self.instance.user_id)
        if qs.exists():
            raise serializers.ValidationError("Bu login band")
        return v

    def _save_user(self, user_data, role, default_username):
        if self.instance is None:
            username = user_data.pop("username", "") or unique_username(default_username)
            password = generate_password()
            user = User(username=username, role=role, must_change_password=True)
            for k, v in user_data.items():
                setattr(user, k, v)
            user.set_password(password)
            user.save()
            self._temp_password = password
            return user
        user = self.instance.user
        changed = []
        for k, v in user_data.items():
            if k == "username" and not v:
                continue
            setattr(user, k, v)
            changed.append(k)
        if "is_active" in user_data and not user_data["is_active"]:
            from django.utils import timezone
            user.tokens_valid_after = timezone.now().replace(microsecond=0)
            changed.append("tokens_valid_after")
        if changed:
            user.save()
        return user

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if getattr(self, "_temp_password", None):
            data["temp_password"] = self._temp_password
        return data


class TeacherSerializer(PersonMixin, serializers.ModelSerializer):
    subjects = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all(), many=True, required=False)
    subject_names = serializers.SerializerMethodField()
    classes = serializers.SerializerMethodField()
    face_status = serializers.SerializerMethodField()
    pin_set = serializers.SerializerMethodField()

    class Meta:
        model = TeacherProfile
        fields = [
            "id", "user_id", "full_name", "first_name", "last_name", "middle_name", "username", "phone", "birth_date", "gender",
            "is_active", "avatar_url", "last_login", "position", "subjects", "subject_names", "category", "hired_at", "bio",
            "track_attendance", "classes", "face_status", "pin_set",
        ]

    def get_subject_names(self, obj):
        return [s.name for s in obj.subjects.all()]

    def get_classes(self, obj):
        seen = {}
        for a in obj.assignments.all():
            seen.setdefault(a.school_class_id, {"id": a.school_class_id, "name": a.school_class.name, "subjects": []})["subjects"].append(a.subject.name)
        return sorted(seen.values(), key=lambda c: (len(c["name"]), c["name"]))

    def get_face_status(self, obj):
        consent = getattr(obj, "face_consent", None)
        if not consent or not consent.active:
            return "no_consent"
        statuses = {e.status for e in obj.face_enrollments.all()}
        if "approved" in statuses:
            return "approved"
        if "pending" in statuses:
            return "pending"
        return "consent"

    def get_pin_set(self, obj):
        return bool(obj.pin_hash)

    @transaction.atomic
    def create(self, validated):
        user_data = validated.pop("user", {})
        subjects = validated.pop("subjects", [])
        default = (user_data.get("phone") or "").lstrip("+") or f"t{secrets.randbelow(10**6):06d}"
        user = self._save_user(user_data, Role.TEACHER, default)
        tp = TeacherProfile.objects.create(user=user, **validated)
        tp.subjects.set(subjects)
        return tp

    @transaction.atomic
    def update(self, instance, validated):
        user_data = validated.pop("user", {})
        subjects = validated.pop("subjects", None)
        self._save_user(user_data, Role.TEACHER, "")
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        if subjects is not None:
            instance.subjects.set(subjects)
        return instance


class StudentSerializer(PersonMixin, serializers.ModelSerializer):
    school_class = serializers.PrimaryKeyRelatedField(queryset=SchoolClass.objects.all(), allow_null=True, required=False)
    class_name = serializers.CharField(source="school_class.name", read_only=True, default=None)

    class Meta:
        model = StudentProfile
        fields = [
            "id", "user_id", "full_name", "first_name", "last_name", "middle_name", "username", "phone", "birth_date", "gender",
            "is_active", "avatar_url", "last_login", "school_class", "class_name", "student_no", "parent_name", "parent_phone", "address",
        ]

    def validate_parent_phone(self, v):
        return clean_phone(v)

    @transaction.atomic
    def create(self, validated):
        user_data = validated.pop("user", {})
        user = self._save_user(user_data, Role.STUDENT, f"s{secrets.randbelow(10**6):06d}")
        sp = StudentProfile.objects.create(user=user, **validated)
        if not sp.student_no:
            sp.student_no = f"{sp.id:05d}"
            sp.save(update_fields=["student_no"])
        return sp

    @transaction.atomic
    def update(self, instance, validated):
        user_data = validated.pop("user", {})
        self._save_user(user_data, Role.STUDENT, "")
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        return instance


# ---------------- Sinflar va jadval ----------------

class SchoolClassSerializer(serializers.ModelSerializer):
    name = serializers.CharField(read_only=True)
    homeroom_teacher = serializers.PrimaryKeyRelatedField(queryset=TeacherProfile.objects.all(), allow_null=True, required=False)
    homeroom_teacher_name = serializers.SerializerMethodField()
    student_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = SchoolClass
        fields = ["id", "grade", "letter", "name", "room", "shift", "homeroom_teacher", "homeroom_teacher_name", "student_count", "is_active"]

    def get_homeroom_teacher_name(self, obj):
        return obj.homeroom_teacher.user.full_name if obj.homeroom_teacher else None

    def validate_grade(self, v):
        if not 1 <= v <= 11:
            raise serializers.ValidationError("Sinf 1 dan 11 gacha bo'lishi kerak")
        return v

    def validate(self, data):
        letter = (data.get("letter") or getattr(self.instance, "letter", "")).strip().upper()
        if not re.match(r"^[A-ZА-ЯЁʻ'0-9]{1,4}$", letter):
            raise serializers.ValidationError({"letter": "Sinf harfi 1–4 belgidan iborat bo'lsin (masalan: A)"})
        data["letter"] = letter
        grade = data.get("grade", getattr(self.instance, "grade", None))
        qs = SchoolClass.objects.filter(grade=grade, letter=letter)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError({"letter": f"{grade}-{letter} sinf allaqachon mavjud"})
        return data


class TeachingAssignmentSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source="teacher.user.full_name", read_only=True)
    class_name = serializers.CharField(source="school_class.name", read_only=True)
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    subject_color = serializers.CharField(source="subject.color", read_only=True)

    class Meta:
        model = TeachingAssignment
        fields = ["id", "teacher", "teacher_name", "school_class", "class_name", "subject", "subject_name", "subject_color", "hours_per_week"]
        validators = []

    def validate(self, data):
        cls = data.get("school_class", getattr(self.instance, "school_class", None))
        subj = data.get("subject", getattr(self.instance, "subject", None))
        qs = TeachingAssignment.objects.filter(school_class=cls, subject=subj)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        other = qs.select_related("teacher__user").first()
        if other:
            raise serializers.ValidationError(f"{cls.name} sinfida «{subj.name}» fanini allaqachon {other.teacher.user.full_name} o'qitadi")
        return data

    def save(self, **kwargs):
        obj = super().save(**kwargs)
        obj.teacher.subjects.add(obj.subject)
        # Jadvaldagi shu sinf+fan darslariga ham o'qituvchini qo'yamiz
        Lesson.objects.filter(school_class=obj.school_class, subject=obj.subject).update(teacher=obj.teacher)
        return obj


class LessonSerializer(serializers.ModelSerializer):
    class_name = serializers.CharField(source="school_class.name", read_only=True)
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    subject_color = serializers.CharField(source="subject.color", read_only=True)
    subject_icon = serializers.CharField(source="subject.icon", read_only=True)
    teacher_name = serializers.SerializerMethodField()
    start = serializers.SerializerMethodField()
    end = serializers.SerializerMethodField()

    class Meta:
        model = Lesson
        fields = ["id", "school_class", "class_name", "subject", "subject_name", "subject_color", "subject_icon", "teacher", "teacher_name",
                  "weekday", "period", "start", "end", "room"]
        validators = []

    def _period(self, obj):
        periods = self.context.get("periods")
        if periods is None:
            periods = {p.number: p for p in Period.objects.all()}
            self.context["periods"] = periods
        return periods.get(obj.period)

    def get_start(self, obj):
        p = self._period(obj)
        return p.start.strftime("%H:%M") if p else None

    def get_end(self, obj):
        p = self._period(obj)
        return p.end.strftime("%H:%M") if p else None

    def get_teacher_name(self, obj):
        return obj.teacher.user.full_name if obj.teacher else None

    def validate_weekday(self, v):
        if v not in range(1, 7):
            raise serializers.ValidationError("Kun dushanbadan shanbagacha bo'lsin")
        return v

    def validate(self, data):
        inst = self.instance
        cls = data.get("school_class", getattr(inst, "school_class", None))
        subj = data.get("subject", getattr(inst, "subject", None))
        wd = data.get("weekday", getattr(inst, "weekday", None))
        per = data.get("period", getattr(inst, "period", None))
        if not Period.objects.filter(number=per).exists():
            raise serializers.ValidationError({"period": f"{per}-dars vaqti qo'ng'iroq jadvalida yo'q. Avval Sozlamalar → Qo'ng'iroqlarni to'ldiring"})
        if "teacher" not in data or data.get("teacher") is None:
            ta = TeachingAssignment.objects.filter(school_class=cls, subject=subj).first()
            if ta:
                data["teacher"] = ta.teacher
        teacher = data.get("teacher", getattr(inst, "teacher", None))
        clash = Lesson.objects.filter(school_class=cls, weekday=wd, period=per)
        if inst:
            clash = clash.exclude(pk=inst.pk)
        if clash.exists():
            raise serializers.ValidationError(f"{cls.name} sinfida bu vaqtda boshqa dars bor")
        if teacher:
            tclash = Lesson.objects.filter(teacher=teacher, weekday=wd, period=per).select_related("school_class")
            if inst:
                tclash = tclash.exclude(pk=inst.pk)
            c = tclash.first()
            if c:
                raise serializers.ValidationError(f"{teacher.user.full_name} shu vaqtda {c.school_class.name} sinfida dars o'tadi")
        return data


# ---------------- E'lonlar, tadbirlar, bildirishnomalar ----------------

class _AudienceMixin:
    def validate(self, data):
        request = self.context["request"]
        audience = data.get("audience", getattr(self.instance, "audience", Audience.ALL))
        classes = data.get("classes", None)
        if classes is None and self.instance is not None:
            classes = list(self.instance.classes.all())
        classes = classes or []
        if audience == Audience.CLASSES and not classes:
            raise serializers.ValidationError({"classes": "Kamida bitta sinf tanlang"})
        if request.user.is_teacher:
            from .services import teacher_class_ids
            allowed = set(teacher_class_ids(request.user))
            if audience != Audience.CLASSES:
                raise serializers.ValidationError({"audience": "O'qituvchi faqat o'z sinflariga yubora oladi"})
            bad = [c.name for c in classes if c.id not in allowed]
            if bad:
                raise serializers.ValidationError({"classes": f"Bu sinflarga ruxsat yo'q: {', '.join(bad)}"})
        return data


class AnnouncementSerializer(_AudienceMixin, serializers.ModelSerializer):
    author = UserBriefSerializer(read_only=True)
    classes = serializers.PrimaryKeyRelatedField(queryset=SchoolClass.objects.all(), many=True, required=False)
    class_names = serializers.SerializerMethodField()
    attachment_url = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = ["id", "title", "body", "author", "audience", "classes", "class_names", "pinned", "important",
                  "attachment_url", "attachment_name", "source", "created_at", "can_edit"]
        read_only_fields = ["attachment_name", "source", "created_at"]

    def get_class_names(self, obj):
        return [c.name for c in obj.classes.all()]

    def get_attachment_url(self, obj):
        return signed_url(obj.attachment, obj.attachment_name) if obj.attachment else None

    def get_can_edit(self, obj):
        u = self.context["request"].user
        return u.is_manager or obj.author_id == u.id

    def validate_title(self, v):
        if len(v.strip()) < 3:
            raise serializers.ValidationError("Sarlavha juda qisqa")
        return v.strip()


class EventSerializer(_AudienceMixin, serializers.ModelSerializer):
    classes = serializers.PrimaryKeyRelatedField(queryset=SchoolClass.objects.all(), many=True, required=False)
    class_names = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default=None)
    can_edit = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = ["id", "title", "description", "kind", "starts_at", "ends_at", "location", "audience", "classes", "class_names",
                  "created_by_name", "created_at", "can_edit"]
        read_only_fields = ["created_at"]

    def get_class_names(self, obj):
        return [c.name for c in obj.classes.all()]

    def get_can_edit(self, obj):
        u = self.context["request"].user
        return u.is_manager or obj.created_by_id == u.id

    def validate(self, data):
        data = super().validate(data)
        s, e = data.get("starts_at", getattr(self.instance, "starts_at", None)), data.get("ends_at", getattr(self.instance, "ends_at", None))
        if s and e and e < s:
            raise serializers.ValidationError({"ends_at": "Tugash vaqti boshlanishdan oldin bo'lishi mumkin emas"})
        return data


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "kind", "title", "body", "link", "read_at", "created_at"]
