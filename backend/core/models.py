from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    """Muhim amallar tarixi (kim, qachon, nima qildi) — direktor ko'radi."""

    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    action = models.CharField(max_length=64, db_index=True)
    target = models.CharField(max_length=200, blank=True)
    details = models.JSONField(default=dict, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]


def client_ip(request):
    if request is None:
        return None
    return request.META.get("REMOTE_ADDR")


def audit(request, action, target="", actor=None, **details):
    AuditLog.objects.create(
        actor=actor if actor is not None else (request.user if request is not None and request.user.is_authenticated else None),
        action=action, target=str(target)[:200], details=details, ip=client_ip(request),
    )
