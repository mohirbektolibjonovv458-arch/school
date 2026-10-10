import mimetypes
import os
from urllib.parse import quote

from django.core import signing
from django.core.files.storage import default_storage
from django.http import FileResponse, Http404, JsonResponse
from django.views.decorators.http import require_GET

from .files import unsign


@require_GET
def file_view(request, token):
    try:
        data = unsign(token)
    except signing.SignatureExpired:
        return JsonResponse({"detail": "Havola muddati tugagan. Sahifani yangilang."}, status=410)
    except signing.BadSignature:
        raise Http404
    path = data["p"]
    if ".." in path or path.startswith("/") or not default_storage.exists(path):
        raise Http404
    mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
    resp = FileResponse(default_storage.open(path, "rb"), content_type=mime)
    name = data.get("n") or os.path.basename(path)
    inline = mime.startswith("image/") or mime == "application/pdf"
    disp = "inline" if inline and request.GET.get("download") != "1" else "attachment"
    resp["Content-Disposition"] = f"{disp}; filename*=UTF-8''{quote(name)}"
    resp["Cache-Control"] = "private, max-age=3600"
    resp["Content-Security-Policy"] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox"
    return resp


def health(request):
    return JsonResponse({"ok": True, "service": "schoolpro"})
