from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsManager(BasePermission):
    message = "Faqat direktor yoki administrator uchun"

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_manager)


class IsTeacher(BasePermission):
    message = "Faqat o'qituvchilar uchun"

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_teacher)


class IsStudent(BasePermission):
    message = "Faqat o'quvchilar uchun"

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_student)


class IsStaff(BasePermission):
    """Direktor, administrator yoki o'qituvchi."""

    message = "Faqat maktab xodimlari uchun"

    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and (u.is_manager or u.is_teacher))


class ManagerWriteOrReadOnly(BasePermission):
    message = "O'zgartirish faqat direktor yoki administrator uchun"

    def has_permission(self, request, view):
        u = request.user
        if not (u and u.is_authenticated):
            return False
        return request.method in SAFE_METHODS or u.is_manager
