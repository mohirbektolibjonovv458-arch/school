# SchoolPro

**Maktab boshqaruvi uchun yagona platforma.** Direktor, o'qituvchi va o'quvchilar bitta ilovadan foydalanadi: dars jadvali, uy vazifalari (rasm/PDF bilan topshirish va baholash), e'lonlar, taqvim, yuz orqali o'qituvchilar davomati va direktor uchun Telegram bot.

Ilova avvalo **telefon** uchun qurilgan: pastki menyu, katta tugmalar va pastdan chiqadigan oynalar bor. Planshet va kompyuterda yon panelli to'liq ko'rinishga o'tadi. Uni telefonga ilova sifatida o'rnatish ham mumkin (PWA): brauzer menyusidan «Bosh ekranga qo'shish».

> Bu loyiha mustaqil: uning backend, frontend, baza va sozlamalari faqat shu `schoolpro/` papkasida.

---

## Imkoniyatlar

### O'quvchi
- **Bosh sahifa:** hozirgi va keyingi dars, bajarilishi kerak bo'lgan vazifalar, o'rtacha baho, yaqin tadbirlar va e'lonlar.
- **Dars jadvali:** hafta kunlari bo'yicha. Hozirgi dars ajratib ko'rsatiladi.
- **Uy vazifalari:** «Bajarish kerak / Tekshiruvda / Baholangan / O'tib ketgan» bo'limlari va muddatgacha qolgan vaqt.
  - Topshirish: telefon kamerasidan suratga olish yoki rasm/PDF yuklash (10 tagacha fayl). Rasmlar yuborishdan oldin siqiladi, yuklanish foizi ko'rinadi.
  - O'qituvchi bahosi, izohi va to'liq tarix (yuborildi → qaytarildi → qayta yuborildi → qabul qilindi).
- **Fanlar va o'qituvchilar:** har bir fan bo'yicha o'rtacha baho va bajarilgan vazifalar.
- **Baholarim:** fanlar kesimidagi o'rtacha baholar va so'nggi baholar.
- **E'lonlar, taqvim, bildirishnomalar:** yangi vazifa, baho, qayta ishlash talabi va muddat yaqinlashganda (24 soat qolganda) xabar keladi.

### O'qituvchi
- **Bosh sahifa:** bugungi darslar, tekshirilishi kerak bo'lgan ishlar, faol vazifalar, bugungi kelish/ketish vaqti.
- **Sinflarim:** biriktirilgan sinflar, o'quvchilar ro'yxati (ota-onaga qo'ng'iroq tugmasi bilan) va sinf vazifalari.
- **Uy vazifasi berish:** sinf va fan tanlash (faqat biriktirilganlari), muddat, 5/10/12/100 ballik tizim, kech topshirishga ruxsat, materiallar (rasm, PDF, Word, Excel, PowerPoint).
- **Tekshirish:** har bir o'quvchining holati, fayllarni ko'rish, bir bosishda baho qo'yish, izoh bilan qayta ishlashga qaytarish, keyingi ishga o'tish.
- **Mening davomatim:** oxirgi 30 kun, kechikishlar va ishlagan soatlar.
- **Yuz orqali kirish:** biometrik rozilik, yuzni o'z telefonida ro'yxatdan o'tkazish (direktor tasdiqlaydi) va zaxira PIN-kod.

### Direktor (va administrator)
- **Boshqaruv paneli:** bugungi davomat (keldi, kechikdi, kelmadi, sababli), haftalik grafik, e'tibor talab qiladigan o'qituvchilar, sinflar bo'yicha vazifa bajarilishi, tekshirilmagan ishlar soni va maktabni sozlash ro'yxati.
- **Davomat:** istalgan kun bo'yicha ro'yxat, filtrlar va hodisalar jurnali (kirish suratlari bilan). Qo'lda kiritish faqat sabab yozilganda saqlanadi, sababli kelmasliklar (kasallik, ta'til, safar) ham shu yerda kiritiladi.
- **Hisobotlar:** kunlik, haftalik va oylik. Davomat %, o'z vaqtida kelish %, kechikish daqiqalari va o'rtacha kelish vaqti. **CSV (Excel)** eksport bor.
- **Sinflar:** o'quvchilar, o'qituvchi biriktirish, **dars jadvali muharriri** (o'qituvchi to'qnashuvi tekshiriladi) va vazifalar.
- **O'qituvchilar / o'quvchilar:** qo'shish (login va vaqtinchalik parol avtomatik beriladi), tahrirlash, parolni tiklash, arxivlash, **CSV import**, sinfga ko'chirish.
- **Fanlar:** standart maktab fanlarini bir bosishda qo'shish.
- **Biometrika:** yuz namunalarini tasdiqlash yoki rad etish, rozilik holatlari.
- **Kiosk qurilmalar:** darvozadagi planshetni kod bilan juftlash, o'chirish va onlayn holati.
- **Telegram bot**, **sozlamalar** (ish vaqti, qo'ng'iroq jadvali, davomat qoidalari, yuz tanish aniqligi) va **amallar tarixi** (audit).

### Qo'shimcha imkoniyatlar
- **Kelish vaqti dars jadvaliga qarab hisoblanadi.** 3-darsdan boshlaydigan o'qituvchi soat 08:00 da «kechikkan» bo'lib qolmaydi. Darsi yo'q kun dam olish hisoblanadi.
- **Erta ketish ogohlantirishi:** o'qituvchi oxirgi darsi tugamasdan chiqsa, direktorga xabar boradi.
- **Kelmaganlar haqida avtomatik xabar** belgilangan vaqtdan keyin keladi, **kun yakunidagi hisobot** esa Telegramga.
- **Tadbir eslatmalari:** yig'ilishdan 2 soat oldin ishtirokchilarga xabar.
- **Qorong'i mavzu**, PWA va har bir sahifada yuklanish/xato/bo'sh holatlar.

---

## Yuz orqali davomat: qanday ishlaydi

1. **Rozilik.** O'qituvchi ilovada rozilik matnini o'qib tasdiqlaydi (vaqti va IP manzili saqlanadi). Rozilik bermasa, PIN-kod yoki direktor orqali qo'lda belgilanadi.
2. **Ro'yxatdan o'tish.** Kamera 5 ta namuna oladi: to'g'ri, ikki yonga burilgan va ko'z qisgan holatda. Neyron tarmoq ([face-api](https://github.com/vladmandic/face-api), TensorFlow.js) brauzerning o'zida ishlaydi va har bir kadrdan **128 ta sondan iborat yuz vektori** hosil qiladi.
3. **Tasdiqlash.** Direktor kichik tasdiq suratini ko'rib tasdiqlaydi. Shu tufayli birovning yuzini o'z nomiga yozdirib bo'lmaydi. Server qo'shimcha tekshiruv ham qiladi: yangi namuna boshqa o'qituvchinikiga juda o'xshash bo'lsa, rad etiladi.
4. **Darvozada.** Planshet yuzni aniqlaydi va jonlilik tekshiruvini o'tkazadi (ko'zni yumib-ochish). Keyin vektorni serverga yuboradi. Server uni tasdiqlangan namunalar bilan solishtiradi: eng yaqin masofa chegaradan kichik bo'lishi va ikkinchi eng o'xshash odamdan aniq farq qilishi kerak. Birinchi skan kelish, kamida 60 daqiqadan keyingisi ketish deb yoziladi.

**Ma'lumotlar himoyasi**
- Serverda yuz **rasmi emas, vektor** saqlanadi va u **Fernet (AES) bilan shifrlangan** (kalit: `BIOMETRIC_KEY`).
- Hech kimning namunasi kiosk qurilmaga yuborilmaydi: solishtirish faqat serverda bajariladi.
- Faqat juftlangan, faol kiosk davomat yoza oladi (tokenli). Direktor qurilmani bir bosishda o'chiradi.
- Kirishdagi tasdiq suratlari belgilangan muddatdan keyin (standart 30 kun) avtomatik o'chiriladi. Bu funksiyani butunlay o'chirish ham mumkin.
- Rozilik qaytarib olinsa, barcha namunalar darhol o'chiriladi.
- PIN-kod hash ko'rinishida saqlanadi. 5 marta noto'g'ri kiritilsa, 15 daqiqaga bloklanadi va direktorga xabar boradi.

**Cheklovlar (halol aytamiz)**
- Jonlilik tekshiruvi ko'z qisishga asoslangan. Bu telefon yoki qog'ozdagi oddiy suratdan himoya qiladi, ammo sertifikatlangan anti-spoofing emas: maxsus tayyorlangan video bilan aldash nazariy jihatdan mumkin. Shuning uchun tasdiq suratlarini saqlash yoqiq turishi tavsiya etiladi, shubhali holatni direktor jurnalda ko'radi.
- Kamera faqat **HTTPS** orqali ishlaydi (lokal sinovda `localhost` ham bo'ladi). Docker varianti HTTPS'ni avtomatik sozlaydi.
- Yorug'lik yomon bo'lsa, tanish sekinlashadi. Planshetni yuzga yaxshi yorug'lik tushadigan joyga o'rnating.

---

## Ishga tushirish (kompyuterda)

**Kerak:** Python 3.11+ va Node.js 18+.

```bash
cd schoolpro
./start.sh            # Windows: start.bat ni ikki marta bosing
```

Birinchi marta kutubxonalar o'rnatiladi, frontend yig'iladi va **direktor logini hamda paroli** so'raladi. Keyin quyidagilarni oching:
- Ilova: http://localhost:8000
- Kiosk (darvoza ekrani): http://localhost:8000/kiosk

### Sinov uchun namunaviy ma'lumotlar (ixtiyoriy)
Bo'sh bazada 9 o'qituvchi, 4 sinf, 48 o'quvchi, jadval, vazifalar va 3 haftalik davomat yaratadi:
```bash
cd backend && source venv/bin/activate
python manage.py seed_demo
```
Demo akkauntlar: `oqituvchi1`, `oquvchi1`, … (parol: `Demo12345`). **Haqiqiy maktabda ishlatmang.**

### Ishlab chiqish rejimi
```bash
# 1-terminal
cd backend && source venv/bin/activate && DEBUG=1 python manage.py start --no-bot
# 2-terminal
cd frontend && npm run dev     # http://localhost:5173 (API 8000 ga proksi qilinadi)
```

---

## Railway'ga joylash (eng oson yo'l)

1. Bu papka tarkibini **alohida GitHub repozitoriyasiga** yuklang. Repo ildizida `Dockerfile`, `railway.json`, `backend/` va `frontend/` bo'lishi kerak.
2. Railway → **New Project → Deploy from GitHub repo** → repozitoriyni tanlang. Railway `Dockerfile` ni o'zi topadi.
3. Shu loyihaga **+ New → Database → PostgreSQL** qo'shing.
4. Ilova servisida **Variables** bo'limiga quyidagilarni yozing:

   | O'zgaruvchi | Qiymat |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Railway taklif qiladi) |
   | `SECRET_KEY` | uzun tasodifiy satr (50+ belgi) |
   | `BIOMETRIC_KEY` | `python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"` natijasi |
   | `DIRECTOR_USERNAME` | direktor logini |
   | `DIRECTOR_PASSWORD` | direktor paroli (8+ belgi) |
   | `DIRECTOR_NAME` | masalan `Xasanov Anvar` |
   | `TELEGRAM_BOT_TOKEN` | ixtiyoriy, @BotFather'dan |

5. **Settings → Networking → Generate Domain** — sizga `https://...up.railway.app` manzili beriladi (HTTPS bilan, kamera ishlaydi).
6. Yuklangan fayllar (vazifa rasmlari, PDF) deploydan keyin yo'qolmasligi uchun: servisda **+ Volume** qo'shing, mount path: `/app/media`, hamda Variables'ga `RAILWAY_RUN_UID=0` yozing (volume'ga yozish ruxsati uchun).

> `SECRET_KEY` va `BIOMETRIC_KEY` ni bir marta qo'ying va o'zgartirmang. Aks holda hamma tizimdan chiqib ketadi yoki yuz namunalarini o'qib bo'lmay qoladi.

Sinov ma'lumotlari kerak bo'lsa (faqat bo'sh bazada): Railway servisida **⋮ → Shell** (yoki `railway run`) → `python manage.py seed_demo`.

## O'z serveringizga joylash (Docker + avtomatik HTTPS)

1. Domenni (masalan `maktab.uz`) server IP manziliga yo'naltiring.
2. `backend/.env.example` faylini `backend/.env` ga nusxalang va to'ldiring: `SECRET_KEY`, `BIOMETRIC_KEY`, `POSTGRES_PASSWORD`, `DOMAIN`, `DIRECTOR_USERNAME`, `DIRECTOR_PASSWORD`, `TELEGRAM_BOT_TOKEN`.
3. Ishga tushiring:
   ```bash
   docker compose --env-file backend/.env up -d --build
   ```
Natijada PostgreSQL, ilova, Caddy (bepul HTTPS sertifikati) va har kungi zaxira nusxa (`./backups`, oxirgi 14 kun) ishga tushadi.

> ⚠️ `BIOMETRIC_KEY` ni o'zgartirmang va yo'qotmang. Usiz saqlangan yuz namunalarini o'qib bo'lmaydi, o'qituvchilar yuzini qayta ro'yxatdan o'tkazishga to'g'ri keladi.

---

## Birinchi sozlash tartibi
Direktor panelidagi «Maktabni sozlash» ro'yxati shu qadamlarni ko'rsatib boradi:
1. **Sozlamalar** → maktab nomi, ish kunlari, **qo'ng'iroq jadvali** («Avto» tugmasi bilan 10 soniyada).
2. **Fanlar** → «Standart fanlarni qo'shish».
3. **Sinflar** → 1-A … 11-B.
4. **O'qituvchilar** → har biriga login va vaqtinchalik parol beriladi («Nusxalash» yoki «Ulashish» orqali yuboring).
5. **Sinf → O'qituvchilar** → fanga o'qituvchi biriktirish.
6. **O'quvchilar** → bittalab qo'shish yoki **CSV import**:
   ```
   Familiya;Ism;Otasining ismi;Sinf;Ota-ona telefoni;Tug'ilgan sana
   Karimov;Jasur;Akmalovich;9-A;901234567;2011-05-14
   ```
   Import tugagach, barcha login va parollarni bitta faylda yuklab olasiz.
7. **Sinf → Jadval** → dars jadvalini to'ldirish.
8. **Kiosk qurilmalar** → «Qurilma qo'shish» → planshetda `https://domen/kiosk` → 8 belgili kod.
9. **Telegram bot** → «Botni ulash».

## Direktor Telegram boti
1. Telegramda **@BotFather** → `/newbot` → tokenni `backend/.env` dagi `TELEGRAM_BOT_TOKEN` ga yozing va qayta ishga tushiring.
2. Panel → **Telegram bot** → «Botni ulash» (bir martalik, 15 daqiqalik shaxsiy havola). Yoki botga tizimdagi telefon raqamingizni ulashing.

Botda quyidagi menyu bor: 📊 Bugungi davomat · ✅ Kelganlar · ⏰ Kechikkanlar · ❌ Kelmaganlar · 🟡 Sababli · 🏫 Sinflar · 📈 Hisobot (kun/hafta/oy) · 📢 E'lon yuborish · ⚙️ Sozlamalar.
Bot **faqat** direktor va administratorlarga javob beradi, boshqalar uchun yopiq. Xabarlar navbat orqali yuboriladi, internet uzilsa ham yo'qolmaydi.

---

## Texnik tuzilma

| Qism | Texnologiya |
|---|---|
| Backend | Django 5, Django REST Framework, JWT (access 30 daq. + refresh, parol o'zgarsa barcha sessiyalar bekor), Argon2 parollar |
| Baza | PostgreSQL (server) yoki SQLite (lokal) |
| Frontend | React 18 + TypeScript + Vite, sahifalar alohida yuklanadi (asosiy bundle ~75 KB gzip) |
| Yuz tanish | @vladmandic/face-api (TensorFlow.js, brauzerda), server tomonda shifrlangan vektorlarni solishtirish |
| Bot va fon vazifalari | Telegram Bot API (long polling), har daqiqalik rejalashtiruvchi |

```
schoolpro/
├── backend/
│   ├── accounts/     foydalanuvchilar, rollar, JWT, parol
│   ├── school/       sinflar, fanlar, jadval, e'lonlar, tadbirlar, bildirishnomalar, dashboardlar
│   ├── homework/     vazifalar, topshiriqlar, baholash
│   ├── attendance/   davomat mantiqi, biometrika, kiosk, hisobotlar
│   ├── bot/          Telegram bot, xabar navbati, fon vazifalari
│   └── core/         fayllar (tekshirish + imzolangan havolalar), audit, start buyrug'i
└── frontend/src/
    ├── pages/{student,teacher,director,common,kiosk}
    ├── ui/           dizayn tizimi komponentlari
    └── lib/          API, autentifikatsiya, yuz tanish
```

### Xavfsizlik
- Har bir so'rov backendda rol va tegishlilik bo'yicha tekshiriladi. O'quvchi faqat o'z sinfini va o'z topshiriqlarini ko'radi. O'qituvchi faqat biriktirilgan sinflari va o'z vazifalari bilan ishlaydi.
- Fayllar ochiq papkada emas: ular faqat **muddati cheklangan imzoli havola** orqali ochiladi.
- Yuklanadigan fayllar mazmuni (magic bytes) bo'yicha tekshiriladi. Rasmlar qayta kodlanadi, shu bilan EXIF va GPS ma'lumotlari tozalanadi. PDF butunligi tekshiriladi, hajm cheklangan.
- Kirish urinishlari, PIN va kiosk so'rovlari sonida chegara bor (rate limit). Muhim amallar audit jurnaliga yoziladi.
- Xavfsizlik sarlavhalari qo'yilgan (`X-Frame-Options`, `nosniff`, `Permissions-Policy`, HSTS).

### Testlar
```bash
cd backend && source venv/bin/activate && python manage.py test     # 40 ta test
cd frontend && npx tsc -b                                           # tiplar
```
Testlar quyidagilarni qamrab oladi: ruxsatlar, vazifa oqimi, fayl tekshiruvi, davomat mantig'i (kechikish, imtiyoz, jadvalga qarab kutilgan vaqt), biometrik shifrlash va solishtirish, kiosk juftlash, PIN bloklash, Telegram bot (ulash, menyu, e'lon), avtomatik ogohlantirishlar.
