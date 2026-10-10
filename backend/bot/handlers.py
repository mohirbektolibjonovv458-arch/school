"""Direktor Telegram boti: davomat, sinflar, hisobotlar, e'lon yuborish.

Faqat maktab panelida direktor/administrator roliga ega va botga ulangan foydalanuvchilar ishlata oladi.
Ulash: panel → Sozlamalar → Telegram → «Botni ulash» (bir martalik havola) yoki botga telefon raqamini ulashish.
"""
import logging
import re
from django.db.models import Count, Q
from django.utils import timezone

from accounts.models import MANAGER_ROLES, User
from attendance.logic import Status, day_board, period_range, range_report, today
from core.models import audit
from homework.models import Homework
from school.models import Announcement, Lesson, Period, SchoolClass, SchoolSettings, StudentProfile, TeachingAssignment

from .models import BotState, LinkCode
from .telegram import esc, tg_call

log = logging.getLogger("schoolpro")

B_TODAY = "📊 Bugungi davomat"
B_CAME = "✅ Kelganlar"
B_LATE = "⏰ Kechikkanlar"
B_ABSENT = "❌ Kelmaganlar"
B_EXCUSED = "🟡 Sababli"
B_CLASSES = "🏫 Sinflar"
B_REPORT = "📈 Hisobot"
B_ANNOUNCE = "📢 E'lon yuborish"
B_SETTINGS = "⚙️ Sozlamalar"

MENU = {"keyboard": [[B_TODAY, B_CAME], [B_LATE, B_ABSENT], [B_EXCUSED, B_CLASSES], [B_REPORT, B_ANNOUNCE], [B_SETTINGS]],
        "resize_keyboard": True, "is_persistent": True}
CONTACT_KB = {"keyboard": [[{"text": "📱 Raqamni ulashish", "request_contact": True}]], "resize_keyboard": True, "one_time_keyboard": True}
WD = ["", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"]


def send(chat_id, text, markup=None):
    params = {"chat_id": chat_id, "text": text[:4090], "parse_mode": "HTML", "disable_web_page_preview": True}
    if markup is not None:
        params["reply_markup"] = markup
    return tg_call("sendMessage", **params)


def edit(chat_id, message_id, text, markup=None):
    params = {"chat_id": chat_id, "message_id": message_id, "text": text[:4090], "parse_mode": "HTML"}
    if markup is not None:
        params["reply_markup"] = markup
    return tg_call("editMessageText", **params)


def manager_for(chat_id):
    return User.objects.filter(telegram_chat_id=chat_id, is_active=True, role__in=MANAGER_ROLES).first()


def set_state(chat_id, state="", **data):
    BotState.objects.update_or_create(chat_id=chat_id, defaults={"state": state, "data": data})


def get_state(chat_id):
    return BotState.objects.filter(chat_id=chat_id).first()


def link_user(user, chat_id, via):
    User.objects.filter(telegram_chat_id=chat_id).exclude(pk=user.pk).update(telegram_chat_id=None)
    user.telegram_chat_id = chat_id
    user.save(update_fields=["telegram_chat_id"])
    audit(None, "telegram_linked", user.full_name, actor=user, via=via)
    s = SchoolSettings.get()
    send(chat_id, f"✅ <b>{esc(user.full_name)}</b>, siz «{esc(s.name)}» boshqaruv botiga ulandingiz.\n\n"
                  "Kechikishlar va muhim davomat hodisalari haqida avtomatik xabar olasiz.", MENU)


def _norm_phone(p):
    d = re.sub(r"\D", "", p or "")
    return d[-9:] if len(d) >= 9 else d


# ---------------- Matnlar ----------------

def _line(r, with_time=True):
    t = r["teacher"]
    rec = r["record"]
    parts = [f"• {esc(t.user.full_name)}"]
    if with_time and rec and rec.check_in:
        parts.append(f"— {timezone.localtime(rec.check_in):%H:%M}")
        if rec.late_minutes:
            parts.append(f"(+{rec.late_minutes} daq.)")
        if rec.check_out:
            parts.append(f"→ {timezone.localtime(rec.check_out):%H:%M}")
    elif r["status"] == Status.ABSENT and r["expected_at"]:
        parts.append(f"(kutilgan {timezone.localtime(r['expected_at']):%H:%M})")
    elif r["status"] == Status.EXCUSED and r["absence"]:
        parts.append(f"— {esc(r['absence'].get_reason_display())}")
    return " ".join(parts)


def text_today():
    b = day_board()
    s = b["summary"]
    d = b["date"]
    return (f"📊 <b>Davomat — {d:%d.%m.%Y}, {WD[d.isoweekday()]}</b>\n\n"
            f"👥 Bugun kutilgan: <b>{s['expected']}</b>\n"
            f"✅ Kelgan: <b>{s['came']}</b> (o'z vaqtida {s['present']}, kechikkan {s['late']})\n"
            f"❌ Sababsiz kelmagan: <b>{s['absent']}</b>\n"
            f"🟡 Sababli: <b>{s['excused']}</b>\n"
            f"⏳ Hali vaqti kelmagan: <b>{s['pending']}</b>\n"
            f"📈 Davomat: <b>{s['rate']}%</b>\n\n"
            f"<i>Yangilangan: {timezone.localtime():%H:%M}</i>")


def text_list(statuses, title, empty):
    b = day_board()
    rows = [r for r in b["rows"] if r["status"] in statuses]
    if not rows:
        return f"{title}\n\n{empty}"
    rows.sort(key=lambda r: (r["record"].check_in if r["record"] and r["record"].check_in else timezone.now()))
    body = "\n".join(_line(r) for r in rows[:80])
    more = f"\n… va yana {len(rows) - 80} kishi" if len(rows) > 80 else ""
    return f"{title} — <b>{len(rows)}</b>\n\n{body}{more}"


def text_report(period):
    start, end = period_range(period, today())
    rep = range_report(start, end)
    t = rep["totals"]
    name = {"day": "Bugungi", "week": "Haftalik", "month": "Oylik"}[period]
    lines = [f"📈 <b>{name} hisobot</b> ({start:%d.%m} – {min(end, today()):%d.%m})\n",
             f"Davomat: <b>{t.get('rate') if t.get('rate') is not None else '—'}%</b>",
             f"O'z vaqtida kelish: <b>{t.get('punctuality') if t.get('punctuality') is not None else '—'}%</b>",
             f"Kechikishlar: <b>{t.get('late', 0)}</b> marta, jami {t.get('late_minutes', 0)} daqiqa",
             f"Sababsiz kelmaslik: <b>{t.get('absent', 0)}</b> kun",
             f"Sababli: <b>{t.get('excused', 0)}</b> kun"]
    worst = [r for r in rep["teachers"] if r["late"] or r["absent"]][:10]
    if worst:
        lines.append("\n<b>E'tibor talab qiladi:</b>")
        for r in worst:
            lines.append(f"• {esc(r['teacher'].user.full_name)} — kechikish {r['late']} ({r['late_minutes']} daq.), kelmagan {r['absent']}")
    hw = Homework.objects.filter(created_at__date__range=(start, end)).count()
    lines.append(f"\n📚 Shu davrda berilgan uy vazifalari: <b>{hw}</b>")
    return "\n".join(lines)


def classes_markup():
    rows, row = [], []
    for c in SchoolClass.objects.filter(is_active=True):
        row.append({"text": c.name, "callback_data": f"cls:{c.id}"})
        if len(row) == 4:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    return {"inline_keyboard": rows}


def text_classes():
    qs = SchoolClass.objects.filter(is_active=True).annotate(n=Count("students", filter=Q(students__user__is_active=True)))
    if not qs:
        return "🏫 Hali sinflar yaratilmagan."
    total = sum(c.n for c in qs)
    return f"🏫 <b>Sinflar: {qs.count()}</b> · o'quvchilar: <b>{total}</b>\n\nBatafsil ko'rish uchun sinfni tanlang:"


def text_class(cid):
    c = SchoolClass.objects.filter(pk=cid).select_related("homeroom_teacher__user").first()
    if not c:
        return "Sinf topilmadi"
    n = StudentProfile.objects.filter(school_class=c, user__is_active=True).count()
    lines = [f"🏫 <b>{c.name} sinf</b>", f"O'quvchilar: <b>{n}</b>"]
    if c.homeroom_teacher:
        lines.append(f"Sinf rahbari: {esc(c.homeroom_teacher.user.full_name)}")
    if c.room:
        lines.append(f"Xona: {esc(c.room)}")
    ta = TeachingAssignment.objects.filter(school_class=c).select_related("teacher__user", "subject")
    if ta:
        lines.append("\n<b>O'qituvchilar:</b>")
        lines += [f"• {esc(a.subject.name)} — {esc(a.teacher.user.full_name)}" for a in ta]
    wd = timezone.localdate().isoweekday()
    periods = {p.number: p for p in Period.objects.all()}
    lessons = Lesson.objects.filter(school_class=c, weekday=wd).select_related("subject", "teacher__user")
    if lessons:
        lines.append(f"\n<b>Bugungi darslar ({WD[wd]}):</b>")
        for l in lessons:
            p = periods.get(l.period)
            tm = f"{p.start:%H:%M}" if p else f"{l.period}-dars"
            lines.append(f"{l.period}. {tm} {esc(l.subject.name)}" + (f" — {esc(l.teacher.user.full_name)}" if l.teacher else ""))
    active = Homework.objects.filter(school_class=c, is_closed=False, due_at__gte=timezone.now()).count()
    lines.append(f"\n📚 Faol uy vazifalari: <b>{active}</b>")
    return "\n".join(lines)


def settings_markup(user):
    on = "🔔 Ogohlantirishlar: YONIQ" if user.telegram_alerts else "🔕 Ogohlantirishlar: O'CHIQ"
    return {"inline_keyboard": [[{"text": on, "callback_data": "alerts:toggle"}], [{"text": "🚪 Botdan uzilish", "callback_data": "unlink"}]]}


# ---------------- E'lon yuborish ----------------

AUD_MARKUP = {"inline_keyboard": [
    [{"text": "👥 Hammaga", "callback_data": "ann:all"}],
    [{"text": "👨‍🏫 O'qituvchilarga", "callback_data": "ann:staff"}, {"text": "🎒 O'quvchilarga", "callback_data": "ann:students"}],
    [{"text": "✖️ Bekor qilish", "callback_data": "ann:cancel"}],
]}
AUD_LABEL = {"all": "Hammaga", "staff": "O'qituvchilarga", "students": "O'quvchilarga"}


def publish(user, audience, title, body, important=False):
    from school.views import publish_announcement

    a = Announcement.objects.create(title=title[:200], body=body, author=user, audience=audience, important=important, source="telegram")
    publish_announcement(a)
    audit(None, "announcement_created", a.title, actor=user, via="telegram")
    return a


# ---------------- Asosiy ishlov berish ----------------

def handle_update(upd):
    try:
        if "callback_query" in upd:
            return handle_callback(upd["callback_query"])
        msg = upd.get("message")
        if msg and msg.get("chat", {}).get("type") == "private":
            return handle_message(msg)
    except Exception:  # bitta xato butun botni to'xtatmasin
        log.exception("Bot update xatosi")


def handle_message(msg):
    chat_id = msg["chat"]["id"]
    text = (msg.get("text") or "").strip()
    user = manager_for(chat_id)

    if text.startswith("/start"):
        code = text[6:].strip()
        if code:
            lc = LinkCode.objects.filter(code=code, expires_at__gt=timezone.now()).select_related("user").first()
            if lc and lc.user.is_active and lc.user.role in MANAGER_ROLES:
                lc.delete()
                return link_user(lc.user, chat_id, "link")
            return send(chat_id, "❌ Havola noto'g'ri yoki muddati o'tgan. Paneldan yangi havola oling.")
        if user:
            return send(chat_id, f"Assalomu alaykum, {esc(user.first_name or user.full_name)}! Kerakli bo'limni tanlang 👇", MENU)
        return send(chat_id, "👋 Bu — maktab rahbariyati uchun yopiq bot.\n\nUlanish uchun panel → <b>Sozlamalar → Telegram</b> bo'limidagi "
                             "havolani bosing yoki tizimdagi raqamingizni ulashing.", CONTACT_KB)

    if "contact" in msg:
        c = msg["contact"]
        if c.get("user_id") != msg.get("from", {}).get("id"):
            return send(chat_id, "Faqat o'zingizning raqamingizni ulashing.")
        tail = _norm_phone(c.get("phone_number"))
        cand = [u for u in User.objects.filter(is_active=True, role__in=MANAGER_ROLES).exclude(phone="") if _norm_phone(u.phone) == tail]
        if len(cand) == 1:
            return link_user(cand[0], chat_id, "contact")
        return send(chat_id, "❌ Bu raqam bilan direktor yoki administrator topilmadi.\nPanelda profilingizga telefon raqamini kiriting yoki ulash havolasidan foydalaning.",
                    {"remove_keyboard": True})

    if not user:
        return send(chat_id, "🔒 Ruxsat yo'q. Bot faqat maktab direktori va administratorlari uchun.", CONTACT_KB)

    st = get_state(chat_id)
    if st and st.state == "ann_text" and text and not text.startswith("/") and text not in sum(MENU["keyboard"], []):
        lines = text.split("\n", 1)
        title = lines[0].strip()[:200]
        body = (lines[1].strip() if len(lines) > 1 else "") or title
        if len(title) < 3:
            return send(chat_id, "Sarlavha juda qisqa. Qaytadan yozing.")
        set_state(chat_id, "ann_confirm", audience=st.data.get("audience"), title=title, body=body)
        return send(chat_id, f"📢 <b>Tekshiring</b>\nKimga: {AUD_LABEL.get(st.data.get('audience'), '')}\n\n<b>{esc(title)}</b>\n{esc(body) if body != title else ''}",
                    {"inline_keyboard": [[{"text": "✅ Yuborish", "callback_data": "ann:send"}, {"text": "❗ Muhim deb yuborish", "callback_data": "ann:send_imp"}],
                                         [{"text": "✖️ Bekor qilish", "callback_data": "ann:cancel"}]]})

    if text in ("/today", B_TODAY):
        return send(chat_id, text_today(), MENU)
    if text in ("/came", B_CAME):
        return send(chat_id, text_list({Status.PRESENT, Status.LATE}, "✅ <b>Kelganlar</b>", "Hali hech kim kelmagan."))
    if text in ("/late", B_LATE):
        return send(chat_id, text_list({Status.LATE}, "⏰ <b>Kechikkanlar</b>", "Bugun kechikkanlar yo'q 👍"))
    if text in ("/absent", B_ABSENT):
        return send(chat_id, text_list({Status.ABSENT}, "❌ <b>Sababsiz kelmaganlar</b>", "Sababsiz kelmaganlar yo'q 👍"))
    if text in ("/excused", B_EXCUSED):
        return send(chat_id, text_list({Status.EXCUSED}, "🟡 <b>Tasdiqlangan (sababli) kelmaganlar</b>", "Bugun sababli kelmaganlar yo'q."))
    if text in ("/classes", B_CLASSES):
        return send(chat_id, text_classes(), classes_markup())
    if text in ("/report", B_REPORT):
        return send(chat_id, "📈 Qaysi davr uchun hisobot?", {"inline_keyboard": [[
            {"text": "Bugun", "callback_data": "rep:day"}, {"text": "Shu hafta", "callback_data": "rep:week"}, {"text": "Shu oy", "callback_data": "rep:month"}]]})
    if text in ("/announce", B_ANNOUNCE):
        set_state(chat_id, "ann_aud")
        return send(chat_id, "📢 E'lon kimga yuborilsin?", AUD_MARKUP)
    if text in ("/settings", B_SETTINGS):
        return send(chat_id, "⚙️ Sozlamalar", settings_markup(user))
    if text == "/help":
        return send(chat_id, "Buyruqlar: /today /came /late /absent /excused /classes /report /announce /settings", MENU)
    return send(chat_id, "Menyudan bo'limni tanlang 👇", MENU)


def handle_callback(cq):
    chat_id = cq["message"]["chat"]["id"]
    mid = cq["message"]["message_id"]
    data = cq.get("data", "")
    tg_call("answerCallbackQuery", callback_query_id=cq["id"])
    user = manager_for(chat_id)
    if not user:
        return send(chat_id, "🔒 Ruxsat yo'q.")
    if data.startswith("rep:"):
        period = data[4:]
        if period in ("day", "week", "month"):
            return send(chat_id, text_report(period))
    if data.startswith("cls:") and data[4:].isdigit():
        return send(chat_id, text_class(int(data[4:])))
    if data == "alerts:toggle":
        user.telegram_alerts = not user.telegram_alerts
        user.save(update_fields=["telegram_alerts"])
        return edit(chat_id, mid, "⚙️ Sozlamalar", settings_markup(user))
    if data == "unlink":
        user.telegram_chat_id = None
        user.save(update_fields=["telegram_chat_id"])
        audit(None, "telegram_unlinked", user.full_name, actor=user)
        return send(chat_id, "Siz botdan uzildingiz.", {"remove_keyboard": True})
    if data.startswith("ann:"):
        act = data[4:]
        if act == "cancel":
            set_state(chat_id)
            return edit(chat_id, mid, "✖️ E'lon bekor qilindi.")
        if act in ("all", "staff", "students"):
            set_state(chat_id, "ann_text", audience=act)
            return edit(chat_id, mid, f"Kimga: <b>{AUD_LABEL[act]}</b>\n\nEndi e'lon matnini yozing.\n<i>Birinchi qator — sarlavha, qolgani — matn.</i>")
        if act in ("send", "send_imp"):
            st = get_state(chat_id)
            if not st or st.state != "ann_confirm":
                return edit(chat_id, mid, "Bu e'lon allaqachon yuborilgan yoki bekor qilingan.")
            a = publish(user, st.data["audience"], st.data["title"], st.data["body"], important=act == "send_imp")
            set_state(chat_id)
            from school.models import Notification
            n = Notification.objects.filter(kind="announcement", link=f"/announcements/{a.id}").count()
            return edit(chat_id, mid, f"✅ E'lon joylandi va <b>{n}</b> kishiga bildirishnoma yuborildi.\n\n<b>{esc(a.title)}</b>")
    return None
