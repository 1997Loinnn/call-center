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
| Murojaatlar (CRM) | F-CRM-01..10 | Asosiy oqim tayyor: yaratish, yo'naltirish jadvali, 6 holat, ijro muddati, tarix. Keyin: SMS, takrorlarni aniqlash, fayl ilovalari, eskalatsiya |
| Operator paneli | F-OP-01..07 | Fuqaro kartasi, murojaat formasi, real vaqt qo'ng'iroq hodisalari. WebRTC softfon — 3-oy |
| Telefoniya | F-TEL | PBX adapteri, mock drayver, UCM6510 adapteri skeleti (API login). AMI, CDR va click-to-call UCM6510 tekshiruvidan keyin |
| Qo'ng'iroqlar jurnali | F-REC-04, 06 | CDR yozish va ro'yxat. Audio arxiv (NAS/MinIO) — 2-oy |
| Dashboard | F-REP-06 | Bugungi qo'ng'iroqlar va murojaatlar ko'rsatkichlari |
| Billing, omnikanal, AI, monitoring | F-BIL, F-OMNI, F-AI, F-MON | Bazada jadvallari tayyor, menyuda yo'l xaritasi sahifalari bor |

## Ishlab chiqarishdan oldin

- `JWT_SECRET` ni yangi tasodifiy qiymatga almashtiring va HTTPS orqasida `COOKIE_SECURE=true` qiling.
- `SEED_DEMO_USERS=false` qo'ying va demo foydalanuvchilarni o'chiring.
- Bo'linmalar nomlari, SOATO kodlari va tuman filiallari ro'yxatini buyurtmachi bilan tasdiqlang (TZ 16-bo'lim).
