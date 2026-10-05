# "Zamonaviy Call-markaz" yagona axborot tizimi

Kadastr agentligining 1097 ishonch telefoni va fuqarolar murojaatlari bilan ishlash platformasi. Talablar: [Texnik topshiriq](https://claude.ai/code/artifact/a20e4871-e934-4568-8199-3b618d1eab3c). Ma'lumotlar bazasi: [docs/database.md](docs/database.md).

## Tuzilma

```
call-center/
├── apps/
│   ├── backend/          NestJS 11 + Prisma 6 + PostgreSQL 16
│   │   ├── prisma/       sxema, migratsiyalar, seed (agentlik tuzilmasi)
│   │   └── src/          auth, RBAC, tuzilma, murojaatlar, telefoniya, audit, hisobotlar
│   └── frontend/         React 18 + Vite + Ant Design (o'zbek tilida)
├── docs/database.md      ER-diagramma va jadvallar tavsifi
└── docker-compose.yml    PostgreSQL; --profile full bilan butun stek
```

## Talablar

- Node.js 24 LTS (kamida 22)
- PostgreSQL 16: Docker Desktop orqali yoki serverga o'rnatilgan

## Ishlab chiqish muhitida ishga tushirish

1. Bazani ko'tarish:

   ```bash
   docker compose up -d postgres
   ```

2. Backend (`http://localhost:3000/api`, Swagger: `/api/docs`):

   ```bash
   cd apps/backend
   cp .env.example .env
   npm install
   npx prisma generate
   npx prisma migrate deploy
   npm run db:seed
   npm run start:dev
   ```

3. Frontend (`http://localhost:5173`):

   ```bash
   cd apps/frontend
   npm install
   npm run dev
   ```

### Bitta buyruq bilan

Ildiz papkada backend va frontend birga ishga tushadi (chiqishi `[backend]` / `[frontend]` belgisi bilan, to'xtatish: Ctrl+C):

```bash
npm run setup     # bir marta: ikkala ilova paketlari va Prisma klienti
npm run start
```

Bazani tayyorlash 1–2-qadamdagidek: `docker compose up -d postgres`, keyin `npm run db:migrate` va `npm run db:seed`.

### Demo foydalanuvchilar

Seed quyidagi foydalanuvchilarni yaratadi. Parol `apps/backend/.env` dagi `SEED_DEFAULT_PASSWORD`. Ishlab chiqarishda `SEED_DEMO_USERS=false` qo'ying.

| Login | Rol | Bo'linma |
| --- | --- | --- |
| `admin` | Tizim administratori | Kadastr agentligi |
| `direktor` | Direktor (maxfiy murojaatlar bilan) | Kadastr agentligi |
| `rahbariyat` | Rahbariyat | Kadastr agentligi |
| `supervisor` | Supervisor, SIP 1000 | Call-markaz 1097 |
| `operator1`, `operator2` | Operator, SIP 1001 / 1002 | Call-markaz 1097 |
| `dkp.toshkent` | Bo'linma rahbari | DKP Toshkent shahri boshqarmasi |
| `ijrochi.toshkent` | Ijrochi | DKP Toshkent shahri boshqarmasi |
| `korrupsiya` | Korrupsiyaga qarshi kurash bo'limi | Markaziy apparat |
| `auditor` | Auditor | Kadastr agentligi |

### Demo ma'lumotlar

Barcha sahifalar va hisobotlarni to'ldirish uchun (faqat ishlab chiqish yoki test bazasida, seed'dan keyin):

```bash
npm run db:fake                   # 100 kunlik qo'ng'iroqlar, murojaatlar, kampaniyalar, audit va h.k.
npm run db:fake -- --work-today   # bugun dam olish kuni bo'lsa ham "bugungi" ko'rsatkichlar to'lsin
```

Qo'shimcha ~80 xodim demo foydalanuvchilar paroli bilan kiradi. Bir marta ishlaydi; qaytadan: `npx prisma migrate reset` va yana `npm run db:fake`. Batafsil: [docs/database.md](docs/database.md#demo-malumotlar-faker).

### Muhit o'zgaruvchilari (ishlab chiqish)

- `MOCK_QUEUE_SIMULATION=false` — `PBX_DRIVER=mock` rejimida navbat taqlidini o'chiradi (standart: yoqilgan; jonli holat va ogohlantirishlarni sinash uchun soat 8–20 oralig'ida navbatga qo'ng'iroqlar tushadi).
- `ALERTS_EVALUATOR=false` — ogohlantirishlarni avtomatik baholashni o'chiradi (masalan, test bazasida).

### UCM6510'siz test qo'ng'irog'i

`PBX_DRIVER=mock` rejimida `operator1` sifatida kirib, operator panelidagi **Test qo'ng'iroq** tugmasini bosing. Qo'ng'iroq real vaqtda keladi, fuqaro kartasi o'zi ochiladi, 20 soniyadan keyin CDR qo'ng'iroqlar jurnaliga yoziladi.

## To'liq stek (Docker)

```bash
cp .env.example .env      # JWT_SECRET ni to'ldiring
docker compose --profile full up -d --build
```

Interfeys `http://localhost:8080` da ochiladi. Konteyner ishga tushganda migratsiyalarni o'zi qo'llaydi. Seed host'dan ishga tushiriladi (`apps/backend/.env` dagi `DATABASE_URL` 5432-portga qaraydi): `cd apps/backend && npm run db:seed`.

## Testlar

```bash
cd apps/backend
npm test            # unit testlar: RBAC ko'rish doirasi, holatlar mashinasi, yo'naltirish, telefon formati
npm run typecheck
```

## Modullar holati

| Modul | TZ | Holat |
| --- | --- | --- |
| Kirish va xavfsizlik | 9-bo'lim | Tayyor: httpOnly cookie, 5 xatodan keyin bloklash, so'rovlar chegarasi, audit jurnali (bazada o'zgartirib bo'lmaydi) |
| Rollar va ko'rish doirasi | 4-bo'lim | Tayyor: 9 ta tizim roli, OWN / UNIT / UNIT_TREE / ALL, maxfiy va anonim murojaatlar |
| Tashkiliy tuzilma | 5-bo'lim | Tayyor: 45 bo'linma (kadastr.uz), daraxt, quyi bo'linma qo'shish |
| Murojaatlar (CRM) | F-CRM-01..10 | Asosiy oqim tayyor: yaratish (bir nechta mavzu), yo'naltirish jadvali, 6 holat, ijro muddati, tarix, ichki vazifalar, ishtirokchi bo'linmalar, karta (PDF) va javob xati (DOCX), holat o'zgarishlari audit jurnalida. Keyin: SMS, takrorlarni aniqlash, fayl ilovalari, eskalatsiya |
| CRM sozlamalari | F-ADM-02, F-REP-05 | Tayyor: toifalar va mavzular (ijro muddati, maxfiylik, murojaat turlari), yo'naltirish qoidalari va tekshirish, avtomatik amallar sozlamasi, eksport shablonlari (XLSX, CSV, PDF). Jadval bo'yicha email — SMTP ulangach |
| Operator paneli | F-OP-01..07 | Fuqaro kartasi (qo'shimcha raqamlar bilan), murojaat formasi (bir nechta mavzu, murojaat turi bo'yicha), bog'lanish uchun kontaktlar, real vaqt qo'ng'iroq hodisalari, Ctrl+S / Ctrl+K. WebRTC softfon — 3-oy |
| Telefoniya | F-TEL | PBX adapteri, mock drayver (navbat taqlidi bilan), UCM6510 adapteri skeleti (API login). AMI (navbat, tinglash), CDR va click-to-call UCM6510 tekshiruvidan keyin |
| Navbatlar va IVR | F-TEL-02..06, F-ADM-03 | Tayyor: ko'p darajali IVR muharriri, navbatlar (taqsimlash, callback chegarasi, o'rnini aytish) va operatorlarni biriktirish (asosiy/zaxira), ovozli xabarlar (matn + audio yuklash), ish vaqtidan tashqari avtojavob va ovozli xabar, tekshiruv va qo'ng'iroq simulyatori, «PBX'ga yuklash» (versiya va holat). UCM6510 ga avtomatik yuklash API amallari tasdiqlangach (2-etap) |
| Chiquvchi qo'ng'iroqlar | — | Tayyor: kampaniyalar (qayta aloqa, so'rovnoma, eslatma, xabardor qilish), kontaktlar ro'yxat yoki yopilgan murojaatlardan, "ko'rib chiqib terish", natija va so'rovnoma, qayta urinishlar |
| Qo'ng'iroqlar jurnali | F-REC-04, 06 | CDR yozish va ro'yxat, yozuvni tinglash. Audio arxiv (NAS/MinIO) — 2-oy |
| Jonli holat va ogohlantirishlar | F-MON-01..03 | Tayyor: operatorlar holati, navbat, bugungi SLA, soatlik grafik; limitlar bo'yicha avtomatik ogohlantirishlar (har 30 s), supervisorlarga bildirishnoma. Navbat va trunk holati UCM6510'da AMI ulangach |
| Analitika va hisobotlar | F-REP-01..06, F-BIL-04 | Tayyor: davr bo'yicha ko'rsatkichlar, kunlik/soatlik grafik, mavzular, operatorlar samaradorligi, billing, tayyor hisobotlar va XLSX eksport |
| Audit jurnali | 9-bo'lim | Tayyor: toifalar, qidiruv, foydalanuvchi va davr filtri, o'zgarishlar (avval → keyin), XLSX eksport |
| Tizim sozlamalari | F-ADM-01..04 | Tayyor: ish vaqti, xizmat darajasi maqsadlari, yozuvlarni saqlash muddati, SMS shablonlari, bayramlar, integratsiyalar holati |
| Omnikanal | F-OMNI-01..04, F-CRM-10 | Tayyor: operator oynasi (suhbatlar, biriktirish, tez javoblar, yozishmadan murojaat), veb-chat vidjeti (`/webchat.js`), Telegram bot (long polling yoki webhook), email (kiruvchi xat `/api/public/email/inbound`, javob SMTP orqali), murojaat raqami bo'yicha avtomatik holat javobi, fuqaro kartasida yozishmalar. Kanal ulanmasa javoblar navbatda turadi va ulangach yuboriladi |
| Foydalanuvchi qo'llanmasi | 14-bo'lim | Tayyor: rollar bo'yicha qadam-baqadam yo'riqnoma, qidiruv, chop etish |
| AI | F-AI | Bazada jadvallari tayyor (`transcripts`) |

## Ishlab chiqarishdan oldin

- `JWT_SECRET` ni yangi tasodifiy qiymatga almashtiring va HTTPS orqasida `COOKIE_SECURE=true` qiling.
- `SEED_DEMO_USERS=false` qo'ying va demo foydalanuvchilarni o'chiring.
- Bo'linmalar nomlari, SOATO kodlari va tuman filiallari ro'yxatini buyurtmachi bilan tasdiqlang (TZ 16-bo'lim).
#   c a l l - c e n t e r  
 