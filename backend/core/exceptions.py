import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_handler

log = logging.getLogger("schoolpro")


def _first_message(data):
    if isinstance(data, list) and data:
        return _first_message(data[0])
    if isinstance(data, dict) and data:
        if "detail" in data:
            return _first_message(data["detail"])
        k, v = next(iter(data.items()))
        return _first_message(v)
    return str(data)


def exception_handler(exc, context):
    """Barcha xatolar bir xil shaklda: {"detail": "...", "errors": {...}}"""
    if isinstance(exc, DjangoValidationError):
        exc = exceptions.ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages)
    response = drf_handler(exc, context)
    if response is None:
        log.exception("Kutilmagan xato", exc_info=exc)
        return Response({"detail": "Serverda kutilmagan xato yuz berdi. Birozdan keyin qayta urinib ko'ring."},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    data = response.data
    if isinstance(exc, Http404) or response.status_code == 404:
        response.data = {"detail": "Topilmadi"}
    elif isinstance(exc, exceptions.ValidationError):
        response.data = {"detail": _first_message(data), "errors": data}
    elif isinstance(exc, exceptions.NotAuthenticated):
        response.data = {"detail": "Tizimga kiring", "code": "not_authenticated"}
    elif isinstance(exc, exceptions.PermissionDenied):
        response.data = {"detail": str(exc.detail) if exc.detail != exceptions.PermissionDenied.default_detail else "Bu amal uchun ruxsat yo'q"}
    elif isinstance(exc, exceptions.Throttled):
        response.data = {"detail": f"Juda ko'p urinish. {int(exc.wait or 60)} soniyadan keyin qayta urinib ko'ring."}
    elif isinstance(data, dict) and "detail" in data:
        response.data = {"detail": str(data["detail"]), **({"code": data.get("code")} if data.get("code") else {})}
    return response
