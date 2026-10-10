class SecurityHeadersMiddleware:
    """Har bir javobga xavfsizlik sarlavhalari."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response.setdefault("X-Content-Type-Options", "nosniff")
        response.setdefault("Referrer-Policy", "same-origin")
        # Kamera faqat o'z saytimizda (kiosk va yuzni ro'yxatdan o'tkazish uchun)
        response.setdefault("Permissions-Policy", "camera=(self), microphone=(), geolocation=()")
        if request.path.startswith("/api/"):
            response.setdefault("Cache-Control", "no-store")
        return response
