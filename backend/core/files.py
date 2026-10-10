"""Yuklangan fayllarni tekshirish, xavfsiz saqlash va imzolangan havolalar.

Fayllar ochiq papkada emas: har biri faqat ruxsati bor foydalanuvchiga beriladigan,
muddati cheklangan imzoli havola (/api/files/<token>/) orqali ochiladi.
"""
import io
import mimetypes
import os
import uuid
from datetime import datetime

from django.conf import settings
from django.core import signing
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework.exceptions import ValidationError

Image.MAX_IMAGE_PIXELS = 50_000_000  # "decompression bomb" himoyasi

FILE_SALT = "schoolpro.files"
LINK_MAX_AGE = 60 * 60 * 3  # 3 soat

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}
OFFICE_EXT = {".docx", ".xlsx", ".pptx"}
KINDS = {
    # talaba topshirig'i: rasm yoki PDF
    "submission": {"image", "pdf"},
    # o'qituvchi materiali: rasm, PDF, Word/Excel/PowerPoint
    "material": {"image", "pdf", "office"},
    "image": {"image"},
}


def _kind_of(name, head):
    ext = os.path.splitext(name.lower())[1]
    if head.startswith(b"%PDF-"):
        return "pdf", ".pdf"
    if ext in OFFICE_EXT and head.startswith(b"PK\x03\x04"):
        return "office", ext
    if ext in IMAGE_EXT or head[:3] == b"\xff\xd8\xff" or head.startswith(b"\x89PNG") or head[:4] == b"RIFF":
        return "image", ext
    return None, ext


def _reencode_image(raw, max_side=2400):
    try:
        img = Image.open(io.BytesIO(raw))
        img.verify()
        img = Image.open(io.BytesIO(raw))
        img = ImageOps.exif_transpose(img)  # aylanishni to'g'rilaydi, EXIF (GPS va h.k.) olib tashlanadi
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError):
        raise ValidationError("Rasm fayli buzilgan yoki qo'llab-quvvatlanmaydi. JPG yoki PNG yuboring.")
    img.thumbnail((max_side, max_side))
    out = io.BytesIO()
    if img.mode in ("RGBA", "LA", "P") and "transparency" in img.info or img.mode in ("RGBA", "LA"):
        img.save(out, "PNG", optimize=True)
        return out.getvalue(), ".png", "image/png"
    img.convert("RGB").save(out, "JPEG", quality=85, optimize=True, progressive=True)
    return out.getvalue(), ".jpg", "image/jpeg"


def store_upload(upload, kind="submission", folder="uploads"):
    """Faylni tekshiradi va saqlaydi. Qaytaradi: dict(path, name, mime, size, is_image)."""
    allowed = KINDS[kind]
    max_bytes = settings.MAX_UPLOAD_FILE_MB * 1024 * 1024
    if upload.size > max_bytes:
        raise ValidationError(f"«{upload.name}» juda katta. Eng ko'pi {settings.MAX_UPLOAD_FILE_MB} MB.")
    if upload.size == 0:
        raise ValidationError(f"«{upload.name}» bo'sh fayl.")
    raw = upload.read()
    ftype, ext = _kind_of(upload.name, raw[:16])
    if ftype not in allowed:
        human = {"submission": "rasm (JPG, PNG) yoki PDF", "material": "rasm, PDF, Word, Excel yoki PowerPoint", "image": "rasm"}[kind]
        raise ValidationError(f"«{upload.name}» turi qabul qilinmaydi. Faqat {human}.")
    if ftype == "image":
        raw, ext, mime = _reencode_image(raw)
    elif ftype == "pdf":
        if b"%%EOF" not in raw[-2048:]:
            raise ValidationError(f"«{upload.name}» PDF fayli to'liq emas yoki buzilgan.")
        mime = "application/pdf"
    else:
        mime = mimetypes.types_map.get(ext, "application/octet-stream")
    base = os.path.splitext(os.path.basename(upload.name))[0][:80] or "fayl"
    path = f"{folder}/{datetime.now():%Y/%m}/{uuid.uuid4().hex}{ext}"
    saved = default_storage.save(path, ContentFile(raw))
    return {"path": saved, "name": f"{base}{ext}", "mime": mime, "size": len(raw), "is_image": ftype == "image"}


def store_bytes(raw, folder, ext=".jpg"):
    path = f"{folder}/{datetime.now():%Y/%m}/{uuid.uuid4().hex}{ext}"
    return default_storage.save(path, ContentFile(raw))


def delete_file(path):
    if path:
        try:
            default_storage.delete(path)
        except OSError:
            pass


def signed_url(path, name=""):
    if not path:
        return None
    token = signing.dumps({"p": path, "n": name}, salt=FILE_SALT, compress=True)
    return f"/api/files/{token}/"


def unsign(token):
    return signing.loads(token, salt=FILE_SALT, max_age=LINK_MAX_AGE)
