"""Yuz namunalarini shifrlash va solishtirish.

- Kamera tasviri qurilmadan chiqmaydi: brauzerdagi neyron tarmoq (face-api / TensorFlow.js)
  yuzdan 128 o'lchamli raqamli vektor (embedding) hosil qiladi.
- Serverda faqat shu vektorlar saqlanadi va ular Fernet (AES-128-CBC + HMAC) bilan shifrlangan.
- Solishtirish serverda bajariladi: kiosk qurilmaga hech kimning namunasi yuborilmaydi.
"""
import base64
import hashlib
import json
import math

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from rest_framework.exceptions import ValidationError

DIM = 128
MIN_SAMPLES = 3
MAX_SAMPLES = 10


def _fernet():
    key = settings.BIOMETRIC_KEY
    if not key:
        digest = hashlib.sha256(("schoolpro-biometric:" + settings.SECRET_KEY).encode()).digest()
        key = base64.urlsafe_b64encode(digest).decode()
    return Fernet(key.encode() if isinstance(key, str) else key)


def validate_descriptor(vec):
    if not isinstance(vec, (list, tuple)) or len(vec) != DIM:
        raise ValidationError("Yuz vektori noto'g'ri (128 ta son bo'lishi kerak)")
    out = []
    for x in vec:
        if not isinstance(x, (int, float)) or isinstance(x, bool) or not math.isfinite(x) or abs(x) > 2:
            raise ValidationError("Yuz vektorida noto'g'ri qiymat")
        out.append(float(x))
    norm = math.sqrt(sum(v * v for v in out))
    if not 0.3 < norm < 3:
        raise ValidationError("Yuz vektori sifatsiz. Qayta urinib ko'ring.")
    return out


def encrypt_templates(vectors):
    return _fernet().encrypt(json.dumps([[round(v, 6) for v in vec] for vec in vectors]).encode())


def decrypt_templates(blob):
    try:
        return json.loads(_fernet().decrypt(bytes(blob)))
    except (InvalidToken, ValueError):
        return []


def distance(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def consistency(vectors):
    """Bir kishining namunalari bir-biriga yaqinmi (ro'yxatdan o'tishda boshqa odam aralashmaganini tekshiradi)."""
    worst = 0.0
    for i in range(len(vectors)):
        for j in range(i + 1, len(vectors)):
            worst = max(worst, distance(vectors[i], vectors[j]))
    return worst


def load_gallery():
    """Tasdiqlangan namunalar: [(teacher_id, [vectors])]. Har chaqiriqda bazadan o'qiladi."""
    from .models import FaceEnrollment

    gallery = {}
    qs = FaceEnrollment.objects.filter(
        status=FaceEnrollment.Status.APPROVED,
        teacher__user__is_active=True,
        teacher__face_consent__given_at__isnull=False,
        teacher__face_consent__withdrawn_at__isnull=True,
    ).values_list("teacher_id", "templates")
    for tid, blob in qs:
        gallery.setdefault(tid, []).extend(decrypt_templates(blob))
    return gallery


def identify(probe, threshold, margin=0.06):
    """Eng yaqin o'qituvchini topadi.

    Qaytaradi: (teacher_id | None, best_distance, reason)
    Ishonchlilik: eng yaqin masofa chegaradan kichik VA ikkinchi eng yaqin odamdan
    yetarlicha uzoq bo'lishi kerak (o'xshash odamlarni adashtirmaslik uchun).
    """
    gallery = load_gallery()
    if not gallery:
        return None, None, "no_templates"
    scores = []
    for tid, vecs in gallery.items():
        if not vecs:
            continue
        ds = sorted(distance(probe, v) for v in vecs)
        # eng yaqin 2 ta namunaning o'rtachasi — bitta tasodifiy o'xshashlikka chidamli
        top = ds[:2]
        scores.append((sum(top) / len(top), ds[0], tid))
    if not scores:
        return None, None, "no_templates"
    scores.sort()
    best_avg, best_min, best_tid = scores[0]
    if best_min > threshold or best_avg > threshold + 0.05:
        return None, round(best_min, 4), "unknown"
    if len(scores) > 1 and scores[1][0] - best_avg < margin:
        return None, round(best_min, 4), "ambiguous"
    return best_tid, round(best_min, 4), "ok"
