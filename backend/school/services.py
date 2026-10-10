from django.db.models import Q

from accounts.models import Role, User

from .models import Audience, Notification


def notify(users, kind, title, body="", link=""):
    """Ilova ichidagi bildirishnoma (bir nechta foydalanuvchiga)."""
    objs = [Notification(user=u, kind=kind, title=title[:200], body=body, link=link) for u in users if u is not None]
    Notification.objects.bulk_create(objs, batch_size=500)
    return len(objs)


def audience_users(audience, class_ids=()):
    qs = User.objects.filter(is_active=True)
    if audience == Audience.ALL:
        return qs.filter(role__in=[Role.TEACHER, Role.STUDENT, Role.ADMIN, Role.DIRECTOR])
    if audience == Audience.STAFF:
        return qs.filter(role__in=[Role.TEACHER, Role.ADMIN, Role.DIRECTOR])
    if audience == Audience.STUDENTS:
        return qs.filter(role=Role.STUDENT)
    # tanlangan sinflar: o'quvchilar + shu sinflarda dars beradigan o'qituvchilar
    return qs.filter(
        Q(student__school_class_id__in=class_ids)
        | Q(teacher__assignments__school_class_id__in=class_ids)
        | Q(teacher__homeroom_classes__id__in=class_ids)
    ).distinct()


def teacher_class_ids(user):
    tp = getattr(user, "teacher", None)
    if not tp:
        return []
    ids = set(tp.assignments.values_list("school_class_id", flat=True))
    ids.update(tp.homeroom_classes.values_list("id", flat=True))
    return list(ids)


def visible_filter(user):
    """E'lon va tadbirlardan foydalanuvchiga ko'rinadiganlari."""
    if user.is_manager:
        return Q()
    if user.is_teacher:
        return Q(audience__in=[Audience.ALL, Audience.STAFF]) | Q(audience=Audience.CLASSES, classes__id__in=teacher_class_ids(user))
    sp = getattr(user, "student", None)
    cid = sp.school_class_id if sp else None
    return Q(audience__in=[Audience.ALL, Audience.STUDENTS]) | Q(audience=Audience.CLASSES, classes__id=cid)


def managers():
    return User.objects.filter(is_active=True, role__in=[Role.DIRECTOR, Role.ADMIN])
