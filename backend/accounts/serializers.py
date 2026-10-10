import re

from django.contrib.auth import password_validation
from rest_framework import serializers

from core.files import signed_url

from .models import User

PHONE_RE = re.compile(r"^\+?\d{9,15}$")


def clean_phone(value):
    v = re.sub(r"[\s\-()]", "", value or "")
    if v and not PHONE_RE.match(v):
        raise serializers.ValidationError("Telefon raqami noto'g'ri. Masalan: +998901234567")
    if v and len(v) == 9:
        v = "+998" + v
    if v and v.startswith("998"):
        v = "+" + v
    return v


class UserBriefSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "full_name", "first_name", "last_name", "middle_name", "role", "phone", "avatar_url"]

    def get_avatar_url(self, obj):
        return signed_url(obj.avatar) if obj.avatar else None


class MeSerializer(UserBriefSerializer):
    teacher_id = serializers.SerializerMethodField()
    student = serializers.SerializerMethodField()
    telegram_linked = serializers.SerializerMethodField()

    class Meta(UserBriefSerializer.Meta):
        fields = UserBriefSerializer.Meta.fields + [
            "email", "birth_date", "gender", "must_change_password", "theme", "telegram_alerts",
            "teacher_id", "student", "telegram_linked", "date_joined", "last_login",
        ]
        read_only_fields = ["username", "role", "must_change_password", "date_joined", "last_login"]

    def get_teacher_id(self, obj):
        tp = getattr(obj, "teacher", None) if obj.is_teacher else None
        return tp.id if tp else None

    def get_student(self, obj):
        if not obj.is_student:
            return None
        sp = getattr(obj, "student", None)
        if not sp:
            return None
        c = sp.school_class
        return {"id": sp.id, "class_id": c.id if c else None, "class_name": c.name if c else None, "student_no": sp.student_no}

    def get_telegram_linked(self, obj):
        return bool(obj.telegram_chat_id)


class ProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["phone", "email", "theme", "telegram_alerts"]

    def validate_phone(self, v):
        return clean_phone(v)

    def validate_theme(self, v):
        if v not in ("system", "light", "dark"):
            raise serializers.ValidationError("Noto'g'ri mavzu")
        return v


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField()
    new_password = serializers.CharField(min_length=8, max_length=128)

    def validate(self, data):
        user = self.context["request"].user
        if not user.check_password(data["old_password"]):
            raise serializers.ValidationError({"old_password": "Joriy parol noto'g'ri"})
        if data["old_password"] == data["new_password"]:
            raise serializers.ValidationError({"new_password": "Yangi parol eskisidan farq qilishi kerak"})
        try:
            password_validation.validate_password(data["new_password"], user)
        except Exception as exc:  # noqa: BLE001
            msgs = getattr(exc, "messages", [str(exc)])
            raise serializers.ValidationError({"new_password": [translate_pw(m) for m in msgs]})
        return data


def translate_pw(msg):
    m = msg.lower()
    if "too short" in m:
        return "Parol kamida 8 belgidan iborat bo'lishi kerak"
    if "too common" in m:
        return "Bu parol juda oddiy. Murakkabroq parol tanlang"
    if "entirely numeric" in m:
        return "Parol faqat raqamlardan iborat bo'lmasin"
    if "similar" in m:
        return "Parol login yoki ismingizga juda o'xshash"
    return msg
