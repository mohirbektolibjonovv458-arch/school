from django.db import models


class OutgoingMessage(models.Model):
    """Telegramga yuboriladigan xabarlar navbati (bot ishlamasa ham yo'qolmaydi)."""

    chat_id = models.BigIntegerField()
    text = models.TextField()
    sent = models.BooleanField(default=False, db_index=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    error = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]


class BotState(models.Model):
    """Suhbat holati (masalan, e'lon matnini kutish) va oxirgi update_id."""

    chat_id = models.BigIntegerField(unique=True)
    state = models.CharField(max_length=32, blank=True)
    data = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)


class BotOffset(models.Model):
    offset = models.BigIntegerField(default=0)


class LinkCode(models.Model):
    """Web paneldan olingan bir martalik havola: t.me/<bot>?start=<code>"""

    code = models.CharField(max_length=32, unique=True)
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="+")
    expires_at = models.DateTimeField()
