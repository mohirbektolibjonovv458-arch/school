import getpass

from django.core.management.base import BaseCommand, CommandError

from accounts.models import User


class Command(BaseCommand):
    help = "Direktor akkauntini yaratadi yoki parolini yangilaydi"

    def add_arguments(self, parser):
        parser.add_argument("--username")
        parser.add_argument("--password")
        parser.add_argument("--name", default="")
        parser.add_argument("--phone", default="")
        parser.add_argument("--role", default="director", choices=["director", "admin"])

    def handle(self, *args, username=None, password=None, name="", phone="", role="director", **opts):
        username = username or input("Direktor logini (masalan telefon: 998901234567): ").strip()
        if not username:
            raise CommandError("Login bo'sh")
        if not password:
            password = getpass.getpass("Parol (kamida 8 belgi): ")
        if len(password) < 8:
            raise CommandError("Parol kamida 8 belgidan iborat bo'lsin")
        parts = name.split()
        user, created = User.objects.get_or_create(username=username, defaults={"role": role})
        user.role = role
        if parts:
            user.last_name = parts[0]
            user.first_name = " ".join(parts[1:])
        if phone:
            user.phone = phone
        user.is_active = True
        user.set_password(password)
        user.save()
        self.stdout.write(self.style.SUCCESS(f"✅ {'Yaratildi' if created else 'Yangilandi'}: {username} ({user.get_role_display()})"))
