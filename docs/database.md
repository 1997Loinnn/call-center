# Ma'lumotlar bazasi sxemasi

PostgreSQL 16, 31 ta jadval, 8 guruh. Manba: [`apps/backend/prisma/schema.prisma`](../apps/backend/prisma/schema.prisma), migratsiyalar: [`apps/backend/prisma/migrations`](../apps/backend/prisma/migrations).

Markazda **Murojaat (tickets)** turadi: u fuqaro, toifa, hudud, mas'ul bo'linma, ijrochi va qo'ng'iroqlar bilan bog'lanadi. Har bir o'zgarish `ticket_events` jadvaliga yoziladi.

## ER-diagramma (asosiy ob'ektlar)

```mermaid
erDiagram
    REGION ||--o{ DISTRICT : "tumanlari"
    REGION |o--o{ ORG_UNIT : "hududi"
    ORG_UNIT |o--o{ ORG_UNIT : "quyi bo'linmalar"
    ORG_UNIT ||--o{ USER : "xodimlar"
    USER ||--o{ USER_ROLE : "rollari"
    ROLE ||--o{ USER_ROLE : "egalari"

    CITIZEN |o--o{ TICKET : "murojaatlari"
    CATEGORY |o--o{ TICKET : "toifasi"
    ORG_UNIT |o--o{ TICKET : "mas'ul bo'linma"
    USER |o--o{ TICKET : "yaratgan, ijrochi"
    TICKET ||--o{ TICKET_EVENT : "tarix"
    TICKET ||--o{ ATTACHMENT : "ilovalar"
    CATEGORY |o--o{ ROUTING_RULE : "qoida"
    ORG_UNIT ||--o{ ROUTING_RULE : "maqsad"

    QUEUE |o--o{ CALL : "navbat"
    USER |o--o{ CALL : "operator"
    TICKET |o--o{ CALL : "qo'ng'iroqlar"
    CALL ||--o| RECORDING : "audio"
    CALL ||--o| CALL_CHARGE : "narx"
    TARIFF |o--o{ CALL_CHARGE : "tarif"
    CALL ||--o| TRANSCRIPT : "matn (AI)"

    CONVERSATION ||--o{ MESSAGE : "xabarlar"
    USER |o--o{ AUDIT_LOG : "harakatlar"

    ORG_UNIT {
        int id PK
        int parentId FK
        enum type "AGENCY, CHAMBER_BRANCH, ..."
        string code UK
        string path "materialized path: /1/5/23/"
    }
    ROLE {
        string code UK
        enum scope "OWN, UNIT, UNIT_TREE, ALL"
        string[] permissions
    }
    TICKET {
        int id PK
        string number UK "1097-2026-000123"
        enum status "NEW ... CLOSED"
        enum type
        bool isConfidential
        bool isAnonymous
        datetime dueAt "ijro muddati"
    }
    CALL {
        int id PK
        string pbxCallId UK "UCM uniqueid"
        enum result
        int waitSeconds
        int talkSeconds
    }
    RECORDING {
        string storageKey "MinIO"
        datetime retainUntil "3 oy"
        bool legalHold
    }
```

## Jadvallar

| Guruh | Jadval | Vazifasi |
| --- | --- | --- |
| Tuzilma | `regions`, `districts` | Viloyat va tumanlar (SOATO kodi bilan) |
| | `org_units` | Agentlik tuzilmasi daraxti: markaziy apparat, hududiy boshqarmalar, DKP va filiallar, tasarrufidagi tashkilotlar, call-markaz |
| Foydalanuvchilar | `users` | Xodimlar: bo'linma, SIP ichki raqami, bloklash maydonlari, 2FA |
| | `roles`, `user_roles` | Rollar: ko'rish doirasi (`scope`) va ruxsatlar ro'yxati |
| Fuqarolar | `citizens` | Murojaatchi: telefon (E.164, noyob), F.I.Sh., JShShIR |
| Murojaatlar | `tickets` | Murojaat: raqam, kanal, turi, holati, toifa, hudud, mas'ul bo'linma, ijrochi, muddat, javob |
| | `ticket_events` | Holatlar tarixi va izohlar |
| | `ticket_counters` | Yillik raqam hisoblagichi |
| | `attachments` | Ilova fayllar (MinIO kaliti) |
| | `categories` | Toifalar: ijro muddati, maxfiylik belgisi |
| | `routing_rules` | Yo'naltirish jadvali: toifa va hudud bo'yicha bo'linma |
| Telefoniya | `calls` | CDR: raqamlar, navbat, operator, kutish va suhbat vaqti, natija |
| | `recordings` | Audio yozuvlar: saqlash muddati, nizoli yozuv belgisi |
| | `queues` | UCM6510 navbatlari |
| | `agent_status_logs` | Operator holatlari va ularning davomiyligi |
| | `callback_requests` | Qayta qo'ng'iroq buyurtmalari |
| | `blacklisted_numbers` | Bezori va spam raqamlar |
| Billing | `tariffs`, `call_charges` | Tariflar va har bir qo'ng'iroq narxi |
| Sifat va AI | `surveys`, `qa_evaluations` | Fuqaro bahosi va supervisor baholash varaqasi |
| | `transcripts` | Suhbat matni, qisqacha mazmuni, kayfiyati |
| | `knowledge_articles` | Operatorlar uchun bilimlar bazasi |
| Omnikanal | `conversations`, `messages` | Telegram, veb-chat va email yozishmalari |
| Tizim | `notifications` | Xodimlarga bildirishnomalar |
| | `audit_logs` | Audit jurnali (faqat qo'shiladi) |
| | `holidays`, `settings` | Bayram kunlari va sozlamalar |

## Loyihaviy qarorlar

- **Tuzilma daraxti: materialized path.** `org_units.path` (`/1/5/23/`) bo'linma va uning barcha quyi bo'linmalarini bitta `LIKE '/1/5/%'` so'rovi bilan topadi. Rolning `UNIT_TREE` ko'rish doirasi shu asosda ishlaydi ([`data-scope.ts`](../apps/backend/src/common/data-scope.ts)). Oxiridagi `/` tufayli `/1/2/` prefiksi `/1/20/` ga mos kelmaydi.
- **Murojaat raqami.** `ticket_counters` jadvalida `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` bilan atomik oshiriladi, shuning uchun bir vaqtdagi so'rovlarda ham raqamlar takrorlanmaydi.
- **Holat o'zgarishi: optimistik qulf.** `UPDATE ... WHERE id = ? AND status = <eski holat>`. Ikki foydalanuvchi bir murojaatni bir vaqtda o'zgartirsa, ikkinchisi 409 oladi.
- **Audit jurnali o'zgarmas.** `20261003000100_audit_log_append_only` migratsiyasi `UPDATE`, `DELETE` va `TRUNCATE` ni trigger bilan taqiqlaydi. Bu PostgreSQL'da tekshirilgan.
- **Maxfiylik.** `tickets.isConfidential` (korrupsiya xabarlari) faqat `tickets.confidential` ruxsati bilan ko'rinadi. `isAnonymous` bo'lsa, fuqaro ma'lumotlari javoblardan olib tashlanadi.
- **Audio bazada saqlanmaydi.** Bazada faqat MinIO kaliti va `retainUntil` (3 oy) turadi. Muddati o'tgan yozuvlar fon vazifasi bilan o'chiriladi, `legalHold` bo'lsa o'chirilmaydi.

## Migratsiyalar

```bash
cd apps/backend
npx prisma migrate deploy      # mavjud migratsiyalarni qo'llash
npx prisma migrate dev --name <nom>   # sxema o'zgarganda yangi migratsiya
npm run db:seed                # boshlang'ich ma'lumotlar (qayta ishga tushirish xavfsiz)
```

Seed: 14 hudud, 45 bo'linma (kadastr.uz ma'lumotlari asosida), 9 rol, 10 toifa, yo'naltirish jadvali, 6 navbat va demo foydalanuvchilar. Bo'linmalarning rasmiy nomlari, SOATO kodlari va tuman filiallari ro'yxati buyurtmachi bilan tasdiqlanadi.
