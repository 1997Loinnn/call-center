/**
 * Boshlang'ich ma'lumotlar: hududlar, agentlik tuzilmasi, rollar, toifalar, yo'naltirish jadvali,
 * navbatlar, sozlamalar va (ixtiyoriy) demo foydalanuvchilar. Qayta ishga tushirish xavfsiz (upsert).
 *
 * Tuzilma manbasi: kadastr.uz (2026-yil oktabr holati). Bo'lim va tashkilotlarning rasmiy nomlari,
 * SOATO kodlari va tuman filiallari ro'yxati buyurtmachi bilan tasdiqlanadi (TZ 16-bo'lim).
 */
import { IvrAction, OrgUnit, OrgUnitType, Prisma, PrismaClient, TicketType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { SYSTEM_ROLES } from '../src/common/roles';

const prisma = new PrismaClient();

// ───────────── Hududlar ─────────────

const REGIONS = [
  { key: 'qr', soato: '1735', nameUz: "Qoraqalpog'iston Respublikasi", nameRu: 'Республика Каракалпакстан' },
  { key: 'andijon', soato: '1703', nameUz: 'Andijon viloyati', nameRu: 'Андижанская область' },
  { key: 'buxoro', soato: '1706', nameUz: 'Buxoro viloyati', nameRu: 'Бухарская область' },
  { key: 'jizzax', soato: '1708', nameUz: 'Jizzax viloyati', nameRu: 'Джизакская область' },
  { key: 'qashqadaryo', soato: '1710', nameUz: 'Qashqadaryo viloyati', nameRu: 'Кашкадарьинская область' },
  { key: 'navoiy', soato: '1712', nameUz: 'Navoiy viloyati', nameRu: 'Навоийская область' },
  { key: 'namangan', soato: '1714', nameUz: 'Namangan viloyati', nameRu: 'Наманганская область' },
  { key: 'samarqand', soato: '1718', nameUz: 'Samarqand viloyati', nameRu: 'Самаркандская область' },
  { key: 'surxondaryo', soato: '1722', nameUz: 'Surxondaryo viloyati', nameRu: 'Сурхандарьинская область' },
  { key: 'sirdaryo', soato: '1724', nameUz: 'Sirdaryo viloyati', nameRu: 'Сырдарьинская область' },
  { key: 'toshkent-sh', soato: '1726', nameUz: 'Toshkent shahri', nameRu: 'город Ташкент' },
  { key: 'toshkent-v', soato: '1727', nameUz: 'Toshkent viloyati', nameRu: 'Ташкентская область' },
  { key: 'fargona', soato: '1730', nameUz: "Farg'ona viloyati", nameRu: 'Ферганская область' },
  { key: 'xorazm', soato: '1733', nameUz: 'Xorazm viloyati', nameRu: 'Хорезмская область' },
] as const;

type RegionKey = (typeof REGIONS)[number]['key'];

// Tumanlar va viloyatga bo'ysunuvchi shaharlar. Rasmiy SOATO kodlari buyurtmachidan olinadi (TZ 16-bo'lim);
// ungacha "1726-05" ko'rinishidagi vaqtinchalik kod qo'yiladi. Tuman hudud va nom bo'yicha topiladi,
// shuning uchun administrator kodni almashtirsa, seed uni qayta yozmaydi.
const DISTRICTS: Record<RegionKey, string[]> = {
  qr: [
    'Nukus shahri', 'Amudaryo tumani', 'Beruniy tumani', "Bo'zatov tumani", 'Chimboy tumani', "Ellikqal'a tumani",
    'Kegeyli tumani', "Mo'ynoq tumani", 'Nukus tumani', "Qanliko'l tumani", "Qorao'zak tumani", "Qo'ng'irot tumani",
    'Shumanay tumani', 'Taxiatosh tumani', "Taxtako'pir tumani", "To'rtko'l tumani", "Xo'jayli tumani",
  ],
  andijon: [
    'Andijon shahri', 'Xonobod shahri', 'Andijon tumani', 'Asaka tumani', 'Baliqchi tumani', "Bo'ston tumani",
    'Buloqboshi tumani', 'Izboskan tumani', 'Jalaquduq tumani', 'Marhamat tumani', "Oltinko'l tumani", 'Paxtaobod tumani',
    "Qo'rg'ontepa tumani", 'Shahrixon tumani', "Ulug'nor tumani", "Xo'jaobod tumani",
  ],
  buxoro: [
    'Buxoro shahri', 'Kogon shahri', 'Buxoro tumani', "G'ijduvon tumani", 'Jondor tumani', 'Kogon tumani', 'Olot tumani',
    'Peshku tumani', "Qorako'l tumani", 'Qorovulbozor tumani', 'Romitan tumani', 'Shofirkon tumani', 'Vobkent tumani',
  ],
  jizzax: [
    'Jizzax shahri', 'Arnasoy tumani', 'Baxmal tumani', "Do'stlik tumani", 'Forish tumani', "G'allaorol tumani",
    "Mirzacho'l tumani", 'Paxtakor tumani', 'Sharof Rashidov tumani', 'Yangiobod tumani', 'Zafarobod tumani',
    'Zarbdor tumani', 'Zomin tumani',
  ],
  qashqadaryo: [
    'Qarshi shahri', 'Shahrisabz shahri', 'Chiroqchi tumani', 'Dehqonobod tumani', "G'uzor tumani", 'Kasbi tumani',
    'Kitob tumani', 'Koson tumani', "Ko'kdala tumani", 'Mirishkor tumani', 'Muborak tumani', 'Nishon tumani',
    'Qamashi tumani', 'Qarshi tumani', 'Shahrisabz tumani', "Yakkabog' tumani",
  ],
  navoiy: [
    'Navoiy shahri', 'Zarafshon shahri', "G'ozg'on shahri", 'Karmana tumani', 'Konimex tumani', 'Navbahor tumani',
    'Nurota tumani', 'Qiziltepa tumani', 'Tomdi tumani', 'Uchquduq tumani', 'Xatirchi tumani',
  ],
  namangan: [
    'Namangan shahri', 'Chortoq tumani', 'Chust tumani', 'Kosonsoy tumani', 'Mingbuloq tumani', 'Namangan tumani',
    'Norin tumani', 'Pop tumani', "To'raqo'rg'on tumani", "Uchqo'rg'on tumani", 'Uychi tumani', "Yangiqo'rg'on tumani",
  ],
  samarqand: [
    'Samarqand shahri', "Kattaqo'rg'on shahri", "Bulung'ur tumani", 'Ishtixon tumani', 'Jomboy tumani',
    "Kattaqo'rg'on tumani", 'Narpay tumani', 'Nurobod tumani', 'Oqdaryo tumani', "Pastdarg'om tumani", 'Paxtachi tumani',
    'Payariq tumani', "Qo'shrabot tumani", 'Samarqand tumani', 'Toyloq tumani', 'Urgut tumani',
  ],
  surxondaryo: [
    'Termiz shahri', 'Angor tumani', 'Bandixon tumani', 'Boysun tumani', 'Denov tumani', "Jarqo'rg'on tumani",
    'Muzrabot tumani', 'Oltinsoy tumani', 'Qiziriq tumani', "Qumqo'rg'on tumani", 'Sariosiyo tumani', 'Sherobod tumani',
    "Sho'rchi tumani", 'Termiz tumani', 'Uzun tumani',
  ],
  sirdaryo: [
    'Guliston shahri', 'Shirin shahri', 'Yangiyer shahri', 'Boyovut tumani', 'Guliston tumani', 'Mirzaobod tumani',
    'Oqoltin tumani', 'Sardoba tumani', 'Sayxunobod tumani', 'Sirdaryo tumani', 'Xovos tumani',
  ],
  'toshkent-sh': [
    'Bektemir tumani', 'Chilonzor tumani', 'Mirobod tumani', "Mirzo Ulug'bek tumani", 'Olmazor tumani', 'Sergeli tumani',
    'Shayxontohur tumani', 'Uchtepa tumani', 'Yakkasaroy tumani', 'Yangihayot tumani', 'Yashnobod tumani',
    'Yunusobod tumani',
  ],
  'toshkent-v': [
    'Nurafshon shahri', 'Angren shahri', 'Bekobod shahri', 'Chirchiq shahri', 'Olmaliq shahri', 'Ohangaron shahri',
    "Yangiyo'l shahri", 'Bekobod tumani', "Bo'ka tumani", "Bo'stonliq tumani", 'Chinoz tumani', 'Ohangaron tumani',
    "Oqqo'rg'on tumani", "O'rtachirchiq tumani", 'Parkent tumani', 'Piskent tumani', 'Qibray tumani',
    'Quyichirchiq tumani', 'Toshkent tumani', "Yangiyo'l tumani", 'Yuqorichirchiq tumani', 'Zangiota tumani',
  ],
  fargona: [
    "Farg'ona shahri", "Marg'ilon shahri", "Qo'qon shahri", 'Quvasoy shahri', "Bag'dod tumani", 'Beshariq tumani',
    'Buvayda tumani', "Dang'ara tumani", "Farg'ona tumani", 'Furqat tumani', 'Oltiariq tumani', "O'zbekiston tumani",
    "Qo'shtepa tumani", 'Quva tumani', 'Rishton tumani', "So'x tumani", 'Toshloq tumani', "Uchko'prik tumani",
    'Yozyovon tumani',
  ],
  xorazm: [
    'Urganch shahri', 'Xiva shahri', "Bog'ot tumani", 'Gurlan tumani', 'Hazorasp tumani', "Qo'shko'pir tumani",
    'Shovot tumani', "Tuproqqal'a tumani", 'Urganch tumani', 'Xiva tumani', 'Xonqa tumani', 'Yangiariq tumani',
    'Yangibozor tumani',
  ],
};

// Dam olish kunlari (ijro muddati va ish vaqti hisobi uchun). Hayit kunlari har yili rasman e'lon qilinadi:
// 2026-yil sanalari taxminiy, tasdiqlanadi; keyingi yillar uchun ularni administrator qo'shadi.
const HOLIDAYS = [
  { date: '2026-01-01', name: 'Yangi yil' },
  { date: '2026-03-08', name: 'Xalqaro xotin-qizlar kuni' },
  { date: '2026-03-20', name: 'Ramazon hayiti' },
  { date: '2026-03-21', name: "Navro'z bayrami" },
  { date: '2026-05-09', name: 'Xotira va qadrlash kuni' },
  { date: '2026-05-27', name: 'Qurbon hayiti' },
  { date: '2026-09-01', name: 'Mustaqillik kuni' },
  { date: '2026-10-01', name: "O'qituvchi va murabbiylar kuni" },
  { date: '2026-12-08', name: 'Konstitutsiya kuni' },
  { date: '2027-01-01', name: 'Yangi yil' },
  { date: '2027-03-08', name: 'Xalqaro xotin-qizlar kuni' },
  { date: '2027-03-21', name: "Navro'z bayrami" },
  { date: '2027-05-09', name: 'Xotira va qadrlash kuni' },
  { date: '2027-09-01', name: 'Mustaqillik kuni' },
  { date: '2027-10-01', name: "O'qituvchi va murabbiylar kuni" },
  { date: '2027-12-08', name: 'Konstitutsiya kuni' },
];

// Agentlikning hududiy boshqarmalari (kadastr.uz/uz/hududiy-boshqarmalar). Toshkent shahri ro'yxatda yo'q.
const REGIONAL_OFFICES: { region: RegionKey; address: string; phone: string; email: string }[] = [
  { region: 'qr', address: 'Nukus sh., "Shimbay Shayxana" MFY, Tan Nuri ko\'chasi, 183-uy', phone: '+998 61 224-02-59', email: 'kadastr.basqarmasi@exat.uz' },
  { region: 'andijon', address: "Andijon sh., A.Temur shoh ko'chasi, 7-uy", phone: '+998 74 224-20-25', email: '170301@ygk.uz' },
  { region: 'buxoro', address: "Buxoro sh., I.Mo'minov ko'chasi, 4-uy", phone: '+998 65 221-01-34', email: 'buhoro@kadastr.uz' },
  { region: 'jizzax', address: "Jizzax sh., Zilol mahallasi, Yangiqo'rg'on ko'chasi, 14a-uy", phone: '+998 72 223-70-62', email: 'jiz.yer-resurslari@exat.uz' },
  { region: 'qashqadaryo', address: "Qarshi sh., Nasaf ko'chasi, 1a-uy", phone: '+998 75 227-81-95', email: 'kashverdkb@mail.ru' },
  { region: 'navoiy', address: "Navoiy sh., Ma'rifat ko'chasi, 8-uy", phone: '+998 79 222-12-07', email: 'navkadastragentlik@umail.uz' },
  { region: 'namangan', address: "Namangan sh., Xiva ko'chasi, 3-uy", phone: '+998 69 233-27-64', email: 'namygk@umail.uz' },
  { region: 'samarqand', address: "Samarqand sh., Gulobod ko'chasi, 56A-uy", phone: '+998 78 210-01-33', email: '171802@ygk.uz' },
  { region: 'sirdaryo', address: "Guliston sh., Sayqal MFY, Islom Karimov ko'chasi, 16-uy", phone: '+998 67 225-41-64', email: 'Sirdaryo-kadastr@umail.uz' },
  { region: 'surxondaryo', address: "Termiz sh., Shukrona ko'chasi, 12-uy", phone: '+998 55 451-22-14', email: 'survilkadastr@umail.uz' },
  { region: 'toshkent-v', address: "Nurafshon sh., Toshkent yo'li ko'chasi, 24-uy", phone: '+998 71 502-02-07', email: 'kadastr@umail.uz' },
  { region: 'fargona', address: "Farg'ona sh., Bobur ko'chasi, 9-uy", phone: '+998 73 249-70-77', email: '173001@ygk.uz' },
  { region: 'xorazm', address: "Urganch sh., Istiqlol ko'chasi, 14-uy", phone: '+998 62 224-67-05', email: 'kadastr_62@exat.uz' },
];

// Markaziy apparat bo'limlari (kadastr.uz/uz/markaziy-apparati; nomlar tasdiqlanadi)
const DEPARTMENTS = [
  { code: 'central.legal', name: "Yuridik bo'lim", phone: '+998 71 202-55-61' },
  { code: 'central.press', name: 'Matbuot xizmati', phone: '+998 71 202-55-60' },
  { code: 'central.anti-corruption', name: "Korrupsiyaga qarshi kurash bo'limi", phone: '+998 71 273-19-66' },
  { code: 'central.monitoring', name: "Yer va kadastr monitoringi bo'limi", phone: '+998 71 202-55-96' },
  { code: 'central.geodesy', name: 'Geodeziya va kartografiya boshqarmasi', phone: '+998 71 202-56-07' },
  { code: 'central.finance', name: "Moliya bo'limi", phone: undefined },
  { code: 'central.border', name: "Davlat chegarasini delimitatsiya qilish bo'limi", phone: '+998 71 202-55-80' },
];

// Tasarrufidagi tashkilotlar, DKP dan tashqari (kadastr.uz/uz/tasarrufidagi-tashkilotlar; nomlar tasdiqlanadi)
const SUBORDINATES = [
  { code: 'org.geoinnovatsiya', name: '"Geoinnovatsiya markazi" DUK', phone: '+998 71 276-10-76', website: 'geoic.uz' },
  { code: 'org.aerogeodeziya', name: 'Respublika aerogeodeziya markazi', phone: '+998 71 234-10-98', website: 'aerogeodeziya.uz' },
  { code: 'org.geoinfocom', name: 'Kompyuterlashtirish va geoaxborot texnologiyalari markazi', phone: '+998 71 202-01-23', website: 'geoinfocom.uz' },
  { code: 'org.fond', name: 'Davlat kartografiya-geodeziya fondi', phone: '+998 71 246-77-32', website: undefined },
  { code: 'org.baholash', name: "Ko'chmas mulkni baholash milliy markazi", phone: undefined, website: undefined },
  { code: 'org.fazoviy', name: "Fazoviy ma'lumotlar infratuzilmasi va kadrlar malakasini oshirish markazi", phone: '+998 55 508-03-02', website: undefined },
  { code: 'org.kartografiya', name: '"Kartografiya" davlat ilmiy-ishlab chiqarish korxonasi', phone: '+998 71 262-59-07', website: 'kartografiya.uz' },
];

// Murojaat toifalari: agentlik ko'rsatadigan davlat xizmatlari asosida (kadastr.uz/uz/aboutagency)
const CATEGORIES = [
  { code: 'application-status', nameUz: 'Ariza holati' },
  { code: 'property-registration', nameUz: "Ko'chmas mulk huquqini davlat ro'yxatidan o'tkazish" },
  { code: 'cadastre-passport', nameUz: 'Kadastr pasporti' },
  { code: 'lease-registration', nameUz: "Ijara shartnomalarini ro'yxatdan o'tkazish" },
  { code: 'mortgage-servitude', nameUz: 'Ipoteka va servitut' },
  { code: 'address', nameUz: "Manzil berish va o'zgartirish" },
  { code: 'geodesy', nameUz: 'Geodeziya, kartografiya va litsenziyalash' },
  { code: 'staff-complaint', nameUz: 'Xodimlar faoliyati ustidan shikoyat' },
  { code: 'corruption', nameUz: 'Korrupsiya holati haqida xabar', isConfidential: true },
  { code: 'other', nameUz: 'Boshqa masalalar' },
];

// Qo'ng'iroq mavzulari: toifaning quyi bandlari, operator panelida raqamli karta bo'lib chiqadi.
// Raqam = tartib (sortOrder). types — mavzu qaysi murojaat turlarida chiqadi (bo'sh = barchasida).
// Namuna ro'yxat — buyurtmachi bilan tasdiqlanadi.
const T = TicketType;
const TOPICS: { code: string; parent: string; nameUz: string; types: TicketType[] }[] = [
  { code: 'topic.01', parent: 'application-status', nameUz: "Ariza holatini bilish (ariza raqami bo'yicha)", types: [T.INFO] },
  { code: 'topic.02', parent: 'application-status', nameUz: "Ariza ko'rib chiqish muddati o'tib ketgan", types: [T.INFO, T.COMPLAINT] },
  { code: 'topic.03', parent: 'property-registration', nameUz: "Uy-joyni ro'yxatdan o'tkazish tartibi va hujjatlar", types: [T.INFO, T.APPLICATION] },
  { code: 'topic.04', parent: 'property-registration', nameUz: "Meros bo'yicha mulk huquqini rasmiylashtirish", types: [T.INFO, T.APPLICATION] },
  { code: 'topic.05', parent: 'property-registration', nameUz: "Oldi-sotdidan keyin huquqni ro'yxatga olish", types: [T.INFO, T.APPLICATION] },
  { code: 'topic.06', parent: 'property-registration', nameUz: "Ro'yxatdan o'tkazish rad etilgan — sababini bilish", types: [T.INFO, T.COMPLAINT] },
  { code: 'topic.07', parent: 'cadastre-passport', nameUz: 'Kadastr pasportini olish tartibi', types: [T.INFO, T.APPLICATION] },
  { code: 'topic.08', parent: 'cadastre-passport', nameUz: 'Kadastr pasportidagi xatoni tuzatish', types: [T.INFO, T.APPLICATION, T.COMPLAINT] },
  { code: 'topic.09', parent: 'cadastre-passport', nameUz: "Kadastr hujjati uchun to'lov miqdori", types: [T.INFO] },
  { code: 'topic.10', parent: 'lease-registration', nameUz: "Ijara shartnomasini ro'yxatdan o'tkazish", types: [T.INFO, T.APPLICATION] },
  { code: 'topic.11', parent: 'lease-registration', nameUz: 'Ijara shartnomasini bekor qilish', types: [T.INFO, T.APPLICATION] },
  { code: 'topic.12', parent: 'mortgage-servitude', nameUz: 'Ipoteka (garov) taqiqini olib tashlash', types: [T.INFO, T.APPLICATION] },
  { code: 'topic.13', parent: 'mortgage-servitude', nameUz: 'Servitut belgilash tartibi', types: [T.INFO, T.APPLICATION] },
  { code: 'topic.14', parent: 'address', nameUz: "Ko'chmas mulkka yangi manzil berish", types: [T.INFO, T.APPLICATION] },
  { code: 'topic.15', parent: 'address', nameUz: "Manzilni o'zgartirish yoki aniqlashtirish", types: [T.INFO, T.APPLICATION] },
  { code: 'topic.16', parent: 'geodesy', nameUz: 'Geodeziya-kartografiya litsenziyasi', types: [T.INFO, T.APPLICATION] },
  { code: 'topic.17', parent: 'geodesy', nameUz: "Yer uchastkasi chegaralarini o'lchash", types: [T.INFO, T.APPLICATION, T.COMPLAINT] },
  { code: 'topic.18', parent: 'staff-complaint', nameUz: "Xodim qabulda qo'pol muomala qildi", types: [T.COMPLAINT] },
  { code: 'topic.19', parent: 'staff-complaint', nameUz: "Hujjat qabul qilinmadi yoki asossiz talab qo'yildi", types: [T.COMPLAINT] },
  { code: 'topic.20', parent: 'corruption', nameUz: "Pora yoki noqonuniy to'lov so'ralgani haqida", types: [T.CORRUPTION] },
  { code: 'topic.21', parent: 'other', nameUz: 'my.gov.uz orqali ariza berishda muammo', types: [T.INFO, T.COMPLAINT] },
  { code: 'topic.22', parent: 'other', nameUz: "Hududiy bo'linma manzili va qabul vaqti", types: [T.INFO] },
  { code: 'topic.23', parent: 'other', nameUz: 'Xizmatdan minnatdorchilik', types: [T.GRATITUDE] },
  { code: 'topic.24', parent: 'other', nameUz: 'Boshqa masala (tavsifda yozing)', types: [] },
];

// UCM6510 dagi haqiqiy navbat raqamlari bilan almashtiriladi
const QUEUES = [
  { pbxNumber: '6500', name: 'Umumiy navbat', language: 'uz' },
  { pbxNumber: '6501', name: "Ro'yxatga olish", language: 'uz' },
  { pbxNumber: '6502', name: 'Boshqa xizmatlar', language: 'uz' },
  { pbxNumber: '6503', name: 'Geodeziya', language: 'uz' },
  { pbxNumber: '6505', name: 'Korrupsiya xabarlari', language: 'uz' },
  { pbxNumber: '6509', name: 'Rus tilidagi navbat', language: 'ru' },
  { pbxNumber: '6510', name: "Qayta qo'ng'iroq va kampaniyalar", language: 'uz' },
];

const SETTINGS: Record<string, Prisma.InputJsonValue> = {
  working_hours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00', lunch: { start: '13:00', end: '14:00' } },
  recording_retention_days: 90,
  ticket_sla_reminder_days: 3,
  // Xizmat darajasi maqsadlari (jonli holat va hisobotlar): 20 soniyada javob — 80%, o'rtacha kutish ≤ 30 s
  service_level: { answerWithinSeconds: 20, targetPercent: 80, avgWaitTargetSeconds: 30 },
  // Ogohlantirish ochilganda kimga xabar beriladi
  alert_notify: { bell: true, sms: true, telegram: false },
  // Murojaatlar bo'yicha avtomatik amallar (Sozlamalar → Yo'naltirish qoidalari)
  automation: {
    dueSoonReminder: true, // muddatga 1 ish kuni qolsa: ijrochi va bo'linma rahbariga bildirishnoma + SMS
    overdueEscalation: true, // muddat o'tsa: supervisor va bo'linma rahbariga eskalatsiya
    smsOnCreate: true, // murojaat qabul qilinganda (shu jumladan "Joyida hal qilindi") fuqaroga SMS
    returnToSupervisor: true, // bo'linma qaytargan murojaat supervisor navbatiga tushadi
    duplicateDetection: { enabled: true, windowHours: 720, minTickets: 3 }, // TZ F-CRM-08: bir raqamdan, bir mavzuda, 30 kun
  },
  sms_templates: {
    ticket_created: 'Kadastr agentligi 1097: murojaatingiz qabul qilindi. Raqami: {raqam}. Holatini 1097 orqali bilishingiz mumkin.',
    ticket_closed: "Kadastr agentligi 1097: {raqam} raqamli murojaatingiz ko'rib chiqildi va yopildi. Javob bilan 1097 orqali tanishishingiz mumkin.",
    callback: "Kadastr agentligi 1097: qo'ng'iroqingiz qayd etildi, operator tez orada siz bilan bog'lanadi.",
    document_ready: 'Kadastr agentligi: hujjatingiz tayyor. Manzil: {manzil}. Qabul vaqti: {qabul_vaqti}.',
  },
};

// IVR (TZ 5-bo'lim "IVR menyusi (taklif)"): til tanlash, keyin asosiy menyu. Matn buyurtmachi bilan kelishiladi,
// diktor ovozi yozib olingach "Navbatlar va IVR → Ovozli xabarlar" bo'limida yuklanadi.
const IVR_PROMPTS = {
  welcome: {
    name: 'Salomlashish va til tanlash',
    language: 'uz',
    text: "Assalomu alaykum! Kadastr agentligining 1097 ishonch telefoniga xush kelibsiz. Suhbat xizmat sifatini nazorat qilish uchun yozib olinadi. O'zbek tilida davom etish uchun 1 ni bosing. Для продолжения на русском языке нажмите 2.",
  },
  mainUz: {
    name: "Asosiy menyu (o'zbek)",
    language: 'uz',
    text: "Ariza holatini bilish uchun 1 ni bosing. Ko'chmas mulk huquqini ro'yxatdan o'tkazish va kadastr pasporti — 2. Manzil berish, ijara, ipoteka va servitut — 3. Geodeziya, kartografiya va litsenziyalash — 4. Korrupsiya holati haqida xabar berish — 5. Operator bilan bog'lanish uchun 0 ni bosing. Menyuni qayta eshitish uchun yulduzchani bosing.",
  },
  mainRu: {
    name: 'Asosiy menyu (rus)',
    language: 'ru',
    text: 'Чтобы узнать статус заявления, нажмите 1. Регистрация прав на недвижимость и кадастровый паспорт — 2. Присвоение адреса, аренда, ипотека, сервитут — 3. Геодезия, картография и лицензирование — 4. Сообщить о коррупции — 5. Для связи с оператором нажмите 0. Чтобы прослушать меню ещё раз, нажмите звёздочку.',
  },
  afterHours: {
    name: 'Ish vaqtidan tashqari',
    language: 'uz',
    text: "Kadastr agentligining 1097 ishonch telefoniga qo'ng'iroq qilganingiz uchun rahmat. Operatorlar dushanbadan jumagacha soat 9:00 dan 18:00 gacha ishlaydi. Signaldan keyin ism-sharifingiz, telefon raqamingiz va murojaatingiz mazmunini qoldiring — ish vaqtida siz bilan bog'lanamiz.",
  },
  holiday: {
    name: 'Bayram kuni',
    language: 'uz',
    text: "Bugun bayram kuni, call-markaz ishlamaydi. Signaldan keyin xabaringizni qoldiring — birinchi ish kunida siz bilan bog'lanamiz.",
  },
} as const;

type SeedOption = { digit: string; label: string; action: IvrAction; queue?: string; menu?: string };

const IVR_MENUS: { code: string; name: string; language: string; prompt: keyof typeof IVR_PROMPTS; retries: number; fallback: string; options: SeedOption[] }[] = [
  {
    code: 'lang',
    name: 'Til tanlash',
    language: 'uz',
    prompt: 'welcome',
    retries: 2,
    fallback: '6500',
    options: [
      { digit: '1', label: "O'zbek tili", action: IvrAction.SUBMENU, menu: 'main.uz' },
      { digit: '2', label: 'Rus tili', action: IvrAction.SUBMENU, menu: 'main.ru' },
    ],
  },
  {
    code: 'main.uz',
    name: "Asosiy menyu (o'zbek)",
    language: 'uz',
    prompt: 'mainUz',
    retries: 3,
    fallback: '6500',
    options: [
      { digit: '1', label: 'Ariza holatini bilish', action: IvrAction.TICKET_STATUS },
      { digit: '2', label: "Ro'yxatga olish, kadastr pasporti", action: IvrAction.QUEUE, queue: '6501' },
      { digit: '3', label: 'Manzil, ijara, ipoteka, servitut', action: IvrAction.QUEUE, queue: '6502' },
      { digit: '4', label: 'Geodeziya, kartografiya, litsenziyalash', action: IvrAction.QUEUE, queue: '6503' },
      { digit: '5', label: 'Korrupsiya holati haqida xabar', action: IvrAction.QUEUE, queue: '6505' },
      { digit: '0', label: "Operator bilan bog'lanish", action: IvrAction.QUEUE, queue: '6500' },
      { digit: '*', label: 'Menyuni qayta eshitish', action: IvrAction.REPEAT },
    ],
  },
  {
    code: 'main.ru',
    name: 'Asosiy menyu (rus)',
    language: 'ru',
    prompt: 'mainRu',
    retries: 3,
    fallback: '6509',
    options: [
      { digit: '1', label: 'Ariza holatini bilish', action: IvrAction.TICKET_STATUS },
      { digit: '2', label: "Ro'yxatga olish, kadastr pasporti", action: IvrAction.QUEUE, queue: '6509' },
      { digit: '3', label: 'Manzil, ijara, ipoteka, servitut', action: IvrAction.QUEUE, queue: '6509' },
      { digit: '4', label: 'Geodeziya, kartografiya, litsenziyalash', action: IvrAction.QUEUE, queue: '6509' },
      { digit: '5', label: 'Korrupsiya holati haqida xabar', action: IvrAction.QUEUE, queue: '6505' },
      { digit: '0', label: "Operator bilan bog'lanish", action: IvrAction.QUEUE, queue: '6509' },
      { digit: '*', label: 'Menyuni qayta eshitish', action: IvrAction.REPEAT },
    ],
  },
];

// Bilimlar bazasi (F-OP-06): operator uchun namuna maqolalar. Matnlar agentlikning rasmiy tartibi bilan
// solishtirilib, «Bilimlar bazasi» bo'limida tahrirlanadi; seed faqat bo'sh bazaga qo'shadi.
const KNOWLEDGE: { category: string; title: string; body: string }[] = [
  {
    category: 'application-status',
    title: 'Ariza holatini qanday aytish kerak',
    body: `Fuqarodan ariza raqamini so'rang (my.gov.uz yoki davlat xizmatlari markazi bergan raqam).
- Murojaat raqami (1097-YYYY-NNNNNN) bo'lsa — operator panelidagi qidiruvga kiriting, holat va ijro muddati ko'rinadi.
- Ariza raqami bo'lsa — holatni kadastr axborot tizimida tekshiring (integratsiya ulangach panelda ko'rinadi).
- Muddat o'tgan bo'lsa — «Ariza ko'rib chiqish muddati o'tib ketgan» mavzusida murojaat yarating.
Fuqaroga murojaat raqamini ayting: holatni IVR (1-tugma), Telegram bot yoki sayt chati orqali o'zi bilib oladi.`,
  },
  {
    category: 'property-registration',
    title: "Ko'chmas mulk huquqini ro'yxatdan o'tkazish: umumiy tartib",
    body: `Ariza davlat xizmatlari markazi yoki my.gov.uz orqali beriladi.
Odatda talab qilinadigan hujjatlar (aniq ro'yxat mulk turiga qarab farq qiladi):
- shaxsni tasdiqlovchi hujjat;
- huquqni belgilovchi hujjat (oldi-sotdi, hadya, meros guvohnomasi va h.k.);
- kadastr pasporti (bo'lsa);
- davlat boji to'langanini tasdiqlovchi hujjat.
Rad etilgan bo'lsa — rad etish xatidagi sababni so'rang va «Ro'yxatdan o'tkazish rad etilgan» mavzusida murojaat yarating.`,
  },
  {
    category: 'cadastre-passport',
    title: 'Kadastr pasportini olish',
    body: `Kadastr pasporti davlat kadastrlari palatasining hududiy filialida tayyorlanadi; ariza my.gov.uz yoki davlat xizmatlari markazi orqali beriladi.
- Joyiga chiqib o'lchash talab qilinsa, mutaxassis fuqaro bilan vaqtni kelishadi.
- To'lov miqdori va tayyorlanish muddati xizmat turiga bog'liq — joriy tarifni rasmiy saytdan tekshirib ayting.
- Pasportdagi xato bo'yicha alohida mavzu bor: «Kadastr pasportidagi xatoni tuzatish».`,
  },
  {
    category: 'lease-registration',
    title: "Ijara shartnomasini ro'yxatdan o'tkazish",
    body: `Ijara shartnomasi taraflar tomonidan imzolangach, ro'yxatdan o'tkazish uchun ariza beriladi.
- Kerak: taraflarning shaxsini tasdiqlovchi hujjatlari, shartnoma, mulkka huquq hujjati.
- Shartnomani muddatidan oldin bekor qilish — «Ijara shartnomasini bekor qilish» mavzusi.`,
  },
  {
    category: 'mortgage-servitude',
    title: 'Ipoteka (garov) taqiqini olib tashlash',
    body: `Kredit to'liq yopilgach, bank garovdan chiqarish to'g'risida xat beradi.
- Fuqaro bank xati bilan taqiqni olib tashlash uchun ariza beradi.
- Bank xati bo'lmasa — avval bankka murojaat qilish tavsiya etiladi.`,
  },
  {
    category: 'address',
    title: "Manzil berish va o'zgartirish",
    body: `Yangi qurilgan yoki manzili aniq bo'lmagan obyektga manzil hokimlik qarori asosida beriladi.
- Fuqaro hududiy filialga yoki my.gov.uz orqali ariza beradi.
- Kadastr hujjatlarida manzilni o'zgartirish — hokimlik qaroridan keyin.`,
  },
  {
    category: 'geodesy',
    title: 'Geodeziya va kartografiya faoliyatiga litsenziya',
    body: `Litsenziya bo'yicha savollar Geodeziya va kartografiya boshqarmasiga yo'naltiriladi (yo'naltirish jadvali buni avtomatik taklif qiladi).
- Litsenziya holati, talablar va hujjatlar ro'yxati — rasmiy saytda e'lon qilinadi.`,
  },
  {
    category: 'corruption',
    title: 'Korrupsiya haqidagi xabarni qabul qilish',
    body: `Fuqaroni xotirjamlik bilan tinglang, faktlarni (kim, qayerda, qachon, nima so'raldi) aniq yozing.
- Murojaat turi — «Korrupsiya xabari»: u maxfiy bo'ladi va faqat korrupsiyaga qarshi kurash bo'limiga boradi.
- Fuqaro so'rasa «Anonim» belgisini qo'ying — ism va telefon saqlanmaydi.
- Shaxsiy fikr bildirmang va natijani va'da qilmang.`,
  },
  {
    category: 'other',
    title: 'Fuqaro bilan muloqot qoidalari',
    body: `- Salomlashing va o'zingizni tanishtiring: «1097, Kadastr agentligi, operator …».
- Fuqaroni bo'lmasdan tinglang, savolni aniqlashtiring.
- Ma'lumotni faqat tasdiqlangan manbadan bering; aniq bilmasangiz — murojaat yarating va muddatini ayting.
- Suhbat yakunida murojaat raqamini va keyingi qadamni takrorlang.`,
  },
];

// Ogohlantirish limitlari (F-MON-03). Mavjud qoida qayta yozilmaydi: supervisor o'zgartirgan chegara saqlanadi.
const ALERT_RULES: Prisma.AlertRuleCreateInput[] = [
  { code: 'queue.wait.warning', name: 'Navbatda kutish vaqti', metric: 'queue.longest_wait', threshold: 20, unit: 'seconds', severity: 'WARNING' },
  { code: 'queue.wait.critical', name: 'Navbatda kutish (kritik)', metric: 'queue.longest_wait', threshold: 60, unit: 'seconds', severity: 'CRITICAL' },
  { code: 'queue.no_agents', name: "Bo'sh operator yo'q, navbat bor", metric: 'queue.waiting_without_agents', threshold: 3, unit: 'count', severity: 'CRITICAL' },
  { code: 'calls.abandoned_rate', name: "Javobsiz qo'ng'iroqlar (1 soat)", metric: 'calls.abandoned_rate_1h', threshold: 10, unit: 'percent', severity: 'WARNING' },
  { code: 'trunk.down', name: 'SIP trunk ulanmagan', metric: 'trunk.down_seconds', threshold: 30, unit: 'seconds', severity: 'CRITICAL' },
  { code: 'storage.recordings', name: "Arxiv diski to'lishi", metric: 'storage.recordings_used', threshold: 85, unit: 'percent', severity: 'WARNING' },
  { code: 'agent.break_long', name: 'Operator tanaffusi', metric: 'agent.break_seconds', threshold: 1200, unit: 'seconds', severity: 'WARNING' },
];

// Eksport shablonlari (F-REP-05): standart to'plam, administrator keyin o'zgartiradi
const EXPORT_TEMPLATES: Prisma.ExportTemplateCreateInput[] = [
  {
    code: 'daily-summary',
    name: 'Kunlik hisobot',
    format: 'XLSX',
    source: 'daily_summary',
    columns: ['Sana', 'Kiruvchi', 'Javob berildi', 'Javobsiz', 'Murojaatlar', 'Joyida hal'],
    schedule: '0 18 * * *',
    recipientRoles: ['DIRECTOR', 'LEADERSHIP'],
  },
  {
    code: 'tickets-full',
    name: "Murojaatlar ro'yxati (to'liq)",
    format: 'XLSX',
    source: 'tickets',
    columns: ['Raqam', 'Sana', 'Fuqaro', 'Telefon', 'Turi', 'Toifa', 'Mavzu', "Bo'linma", 'Holat', 'Muddat'],
  },
  {
    code: 'units-execution',
    name: "Bo'linmalar kesimida ijro",
    format: 'PDF',
    source: 'org_units',
    columns: ["Bo'linma", 'Jami', 'Ijroda', "Muddati o'tgan", 'Yopildi', "O'rt. ijro kuni"],
    schedule: '0 9 * * 1',
    recipientRoles: ['UNIT_HEAD'],
  },
  {
    code: 'operators-performance',
    name: 'Operatorlar kesimida',
    format: 'XLSX',
    source: 'operators',
    columns: ['Operator', 'SIP', "Qo'ng'iroq", "O'rt. suhbat", 'Murojaat', 'Joyida hal', 'Baho'],
  },
  {
    code: 'topics-summary',
    name: 'Mavzular va toifalar kesimida',
    format: 'XLSX',
    source: 'topics',
    columns: ['Raqam', 'Toifa', 'Mavzu', 'Murojaatlar', 'Yopilgan', "Muddati o'tgan"],
  },
  {
    code: 'overdue-tickets',
    name: "Muddati o'tgan murojaatlar",
    format: 'XLSX',
    source: 'overdue',
    columns: ['Raqam', 'Qabul qilingan', 'Mavzu', "Bo'linma", 'Ijrochi', 'Ijro muddati', 'Kechikish (kun)'],
    schedule: '0 9 * * 1',
    recipientRoles: ['SUPERVISOR', 'UNIT_HEAD'],
  },
  {
    code: 'billing-directions',
    name: "Billing: yo'nalishlar bo'yicha xarajat",
    format: 'XLSX',
    source: 'billing',
    columns: ["Yo'nalish", "Qo'ng'iroqlar", 'Daqiqa', "Summa (so'm)"],
    schedule: '0 9 1 * *',
    recipientRoles: ['DIRECTOR'],
  },
  {
    code: 'answer-letter',
    name: 'Javob xati',
    format: 'DOCX',
    source: 'ticket_answer',
    columns: ['{raqam}', '{fuqaro}', '{sana}', '{javob_matni}', '{ijrochi}', '{bolinma}'],
  },
];

// ───────────── Yordamchi funksiyalar ─────────────

interface UnitInput {
  code: string;
  name: string;
  type: OrgUnitType;
  parent?: OrgUnit;
  regionId?: number;
  phone?: string;
  email?: string;
  address?: string;
  website?: string;
}

async function upsertUnit(input: UnitInput): Promise<OrgUnit> {
  const { parent, code, ...fields } = input;
  const data = { ...fields, parentId: parent?.id ?? null, depth: parent ? parent.depth + 1 : 0 };
  const existing = await prisma.orgUnit.findUnique({ where: { code } });
  const unit = existing
    ? await prisma.orgUnit.update({ where: { id: existing.id }, data })
    : await prisma.orgUnit.create({ data: { ...data, code, path: '' } });
  return prisma.orgUnit.update({ where: { id: unit.id }, data: { path: `${parent?.path ?? '/'}${unit.id}/` } });
}

// ───────────── Seed ─────────────

async function main(): Promise<void> {
  const regionIds = new Map<RegionKey, number>();
  for (const { key, ...region } of REGIONS) {
    const row = await prisma.region.upsert({ where: { soato: region.soato }, update: region, create: region });
    regionIds.set(key, row.id);
  }
  const regionName = (key: RegionKey) => REGIONS.find((r) => r.key === key)!.nameUz;

  let districtCount = 0;
  for (const region of REGIONS) {
    const regionId = regionIds.get(region.key)!;
    for (const [index, nameUz] of DISTRICTS[region.key].entries()) {
      const existing = await prisma.district.findFirst({ where: { regionId, nameUz }, select: { id: true } });
      if (!existing) {
        await prisma.district.create({ data: { regionId, nameUz, soato: `${region.soato}-${String(index + 1).padStart(2, '0')}` } });
      }
      districtCount++;
    }
  }

  for (const holiday of HOLIDAYS) {
    const date = new Date(`${holiday.date}T00:00:00Z`);
    await prisma.holiday.upsert({ where: { date }, update: {}, create: { date, name: holiday.name } });
  }

  // Tuzilma daraxti
  const agency = await upsertUnit({
    code: 'agency',
    name: 'Kadastr agentligi',
    type: OrgUnitType.AGENCY,
    phone: '+998 71 202-55-76',
    email: 'info@kadastr.uz',
    address: "Toshkent sh., Chilonzor tumani, Cho'ponota ko'chasi, 6V",
    website: 'kadastr.uz',
  });
  const callCenter = await upsertUnit({ code: 'call-center', name: 'Call-markaz 1097', type: OrgUnitType.CALL_CENTER, parent: agency, phone: '1097' });
  const central = await upsertUnit({ code: 'central', name: 'Markaziy apparat', type: OrgUnitType.CENTRAL_OFFICE, parent: agency });
  const departments = new Map<string, OrgUnit>();
  for (const dep of DEPARTMENTS) {
    departments.set(dep.code, await upsertUnit({ ...dep, type: OrgUnitType.DEPARTMENT, parent: central }));
  }
  for (const office of REGIONAL_OFFICES) {
    await upsertUnit({
      code: `region.${office.region}`,
      name: `${regionName(office.region)} hududiy boshqarmasi`,
      type: OrgUnitType.REGIONAL_OFFICE,
      parent: agency,
      regionId: regionIds.get(office.region),
      address: office.address,
      phone: office.phone,
      email: office.email,
    });
  }
  const chamber = await upsertUnit({
    code: 'dkp',
    name: 'Davlat kadastrlari palatasi',
    type: OrgUnitType.CHAMBER,
    parent: agency,
    phone: '+998 71 276-43-16',
    website: 'uzdkp.uz',
  });
  const chamberBoards = new Map<RegionKey, OrgUnit>();
  for (const region of REGIONS) {
    chamberBoards.set(
      region.key,
      await upsertUnit({
        code: `dkp.${region.key}`,
        name: `DKP ${region.nameUz} boshqarmasi`,
        type: OrgUnitType.CHAMBER_REGIONAL,
        parent: chamber,
        regionId: regionIds.get(region.key),
      }),
    );
  }
  for (const org of SUBORDINATES) {
    await upsertUnit({ ...org, type: OrgUnitType.SUBORDINATE_ORG, parent: agency });
  }

  // Rollar
  const roleIds = new Map<string, number>();
  for (const role of SYSTEM_ROLES) {
    // Mavjud rol qayta yozilmaydi: administrator o'zgartirgan nom, doira va ruxsatlar saqlanib qoladi.
    // Tizim roliga yangi ruxsat kerak bo'lsa, u migratsiya orqali qo'shiladi.
    const row = await prisma.role.upsert({
      where: { code: role.code },
      update: { isSystem: true },
      create: { ...role, isSystem: true },
    });
    roleIds.set(role.code, row.id);
  }

  // Toifalar. Mavjud toifa qayta yozilmaydi: administrator CRM sozlamalarida o'zgartirgan nom, muddat va maxfiylik saqlanadi
  const categoryIds = new Map<string, number>();
  for (const [index, category] of CATEGORIES.entries()) {
    const row = await prisma.category.upsert({
      where: { code: category.code },
      update: {},
      create: { ...category, sortOrder: index },
    });
    categoryIds.set(category.code, row.id);
  }

  // Mavzular: maxfiylik va ijro muddati ota toifadan olinadi. Mavjud mavzuga faqat murojaat turlari
  // hali belgilanmagan bo'lsa standart ro'yxat yoziladi (administrator tanlovi saqlanadi)
  for (const [index, topic] of TOPICS.entries()) {
    const parent = await prisma.category.findUniqueOrThrow({ where: { id: categoryIds.get(topic.parent)! } });
    const existing = await prisma.category.findUnique({ where: { code: topic.code }, select: { id: true, ticketTypes: true } });
    if (existing) {
      if (existing.ticketTypes.length === 0 && topic.types.length > 0) {
        await prisma.category.update({ where: { id: existing.id }, data: { ticketTypes: topic.types } });
      }
      continue;
    }
    await prisma.category.create({
      data: {
        code: topic.code,
        nameUz: topic.nameUz,
        parentId: parent.id,
        slaDays: parent.slaDays,
        isConfidential: parent.isConfidential,
        ticketTypes: topic.types,
        sortOrder: index + 1,
      },
    });
  }

  // Yo'naltirish jadvali: faqat bo'sh bo'lsa (administrator o'zgartirgan qoidalar saqlanib qoladi)
  if ((await prisma.routingRule.count()) === 0) {
    const rules: Prisma.RoutingRuleCreateManyInput[] = [
      { categoryId: categoryIds.get('corruption'), targetOrgUnitId: departments.get('central.anti-corruption')!.id, priority: 10 },
      { categoryId: categoryIds.get('geodesy'), targetOrgUnitId: departments.get('central.geodesy')!.id, priority: 50 },
      ...REGIONS.map((region) => ({
        regionId: regionIds.get(region.key),
        targetOrgUnitId: chamberBoards.get(region.key)!.id,
        priority: 100,
      })),
      // Hudud aniqlanmasa: call-markaz supervisori qo'lda yo'naltiradi
      { targetOrgUnitId: callCenter.id, priority: 1000 },
    ];
    await prisma.routingRule.createMany({ data: rules });
  }

  for (const queue of QUEUES) {
    await prisma.queue.upsert({ where: { pbxNumber: queue.pbxNumber }, update: queue, create: queue });
  }
  for (const [key, value] of Object.entries(SETTINGS)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }
  for (const rule of ALERT_RULES) {
    await prisma.alertRule.upsert({ where: { code: rule.code }, update: {}, create: rule });
  }
  for (const template of EXPORT_TEMPLATES) {
    await prisma.exportTemplate.upsert({ where: { code: template.code }, update: {}, create: template });
  }

  if (process.env.SEED_DEMO_USERS !== 'false') {
    await seedDemoUsers(roleIds, {
      agency,
      callCenter,
      dkpTashkent: chamberBoards.get('toshkent-sh')!,
      antiCorruption: departments.get('central.anti-corruption')!,
    });
  }

  await seedIvr();
  await seedKnowledge();

  const units = await prisma.orgUnit.count();
  console.log(
    `Seed tayyor: ${REGIONS.length} hudud, ${districtCount} tuman, ${units} bo'linma, ${SYSTEM_ROLES.length} rol, ` +
      `${CATEGORIES.length} toifa, ${HOLIDAYS.length} bayram, ${ALERT_RULES.length} limit, ${EXPORT_TEMPLATES.length} eksport shabloni`,
  );
}

/**
 * Standart IVR va navbat a'zolari — faqat birinchi marta (IVR menyusi hali yo'q bo'lsa):
 * administrator keyin o'zgartirgan tuzilma qayta yozilmaydi.
 */
async function seedIvr(): Promise<void> {
  if ((await prisma.ivrMenu.count()) > 0) return;
  const queues = new Map((await prisma.queue.findMany()).map((q) => [q.pbxNumber, q.id]));
  const prompts = new Map<string, number>();
  for (const [key, prompt] of Object.entries(IVR_PROMPTS)) {
    prompts.set(key, (await prisma.voicePrompt.create({ data: prompt })).id);
  }
  const menus = new Map<string, number>();
  for (const [index, menu] of IVR_MENUS.entries()) {
    const row = await prisma.ivrMenu.create({
      data: {
        code: menu.code,
        name: menu.name,
        language: menu.language,
        promptId: prompts.get(menu.prompt),
        maxRetries: menu.retries,
        fallbackQueueId: queues.get(menu.fallback),
        sortOrder: index,
      },
    });
    menus.set(menu.code, row.id);
  }
  for (const menu of IVR_MENUS) {
    await prisma.ivrOption.createMany({
      data: menu.options.map((o) => ({
        menuId: menus.get(menu.code)!,
        digit: o.digit,
        label: o.label,
        action: o.action,
        queueId: o.queue ? queues.get(o.queue) : null,
        targetMenuId: o.menu ? menus.get(o.menu) : null,
      })),
    });
  }
  await prisma.setting.upsert({
    where: { key: 'ivr' },
    update: {},
    create: {
      key: 'ivr',
      value: { entryMenuId: menus.get('lang')!, afterHoursPromptId: prompts.get('afterHours')!, holidayPromptId: prompts.get('holiday')!, voicemailAfterHours: true },
    },
  });
  // Korrupsiya xabarlari navbati: faqat vakolatli xodimlar, qayta qo'ng'iroq taklif qilinmaydi (anonimlik)
  await prisma.queue.updateMany({ where: { pbxNumber: '6505' }, data: { isRestricted: true, callbackEnabled: false } });
  await prisma.queue.updateMany({ where: { pbxNumber: '6510' }, data: { description: "Chiquvchi qo'ng'iroqlar: qayta aloqa va kampaniyalar" } });

  // Navbat a'zolari: operatorlar umumiy va yo'nalish navbatlarida, rus tilini biladiganlar — 6509 da;
  // supervisorlar yo'nalish navbatlarida zaxira (penalty 2), korrupsiya navbatida asosiy
  if ((await prisma.queueMember.count()) > 0) return;
  const agents = await prisma.user.findMany({
    where: { isActive: true, sipExtension: { not: null }, roles: { some: { role: { permissions: { has: 'telephony.use' } } } } },
    select: { id: true, languages: true, roles: { select: { role: { select: { code: true } } } } },
    orderBy: { id: 'asc' },
  });
  const rows: Prisma.QueueMemberCreateManyInput[] = [];
  const add = (queue: string, userId: number, penalty: number) => {
    const queueId = queues.get(queue);
    if (queueId) rows.push({ queueId, userId, penalty });
  };
  agents.forEach((agent, i) => {
    if (agent.roles.some((r) => r.role.code === 'SUPERVISOR')) {
      add('6505', agent.id, 0);
      for (const q of ['6500', '6501', '6502', '6503']) add(q, agent.id, 2);
      return;
    }
    add('6500', agent.id, 0);
    // Yo'nalish navbatlari operatorlar orasida navbat bilan taqsimlanadi: asosiy yoki zaxira
    add('6501', agent.id, i % 3 === 0 ? 0 : 1);
    add('6502', agent.id, i % 3 === 1 ? 0 : 1);
    add('6503', agent.id, i % 3 === 2 ? 0 : 2);
    if (agent.languages.includes('ru')) add('6509', agent.id, 0);
    add('6510', agent.id, 1);
  });
  if (rows.length > 0) await prisma.queueMember.createMany({ data: rows, skipDuplicates: true });
}

/** Bilimlar bazasi namunalari — faqat bo'sh bazaga. */
async function seedKnowledge(): Promise<void> {
  if ((await prisma.knowledgeArticle.count()) > 0) return;
  const categories = new Map((await prisma.category.findMany({ where: { parentId: null }, select: { id: true, code: true } })).map((c) => [c.code, c.id]));
  await prisma.knowledgeArticle.createMany({
    data: KNOWLEDGE.map((a) => ({ title: a.title, body: a.body, categoryId: categories.get(a.category) ?? null, isPublished: true })),
  });
}

async function seedDemoUsers(
  roleIds: Map<string, number>,
  units: { agency: OrgUnit; callCenter: OrgUnit; dkpTashkent: OrgUnit; antiCorruption: OrgUnit },
): Promise<void> {
  const password = process.env.SEED_DEFAULT_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error("SEED_DEFAULT_PASSWORD (kamida 12 belgi) .env faylida berilishi kerak yoki SEED_DEMO_USERS=false qo'ying");
  }
  const passwordHash = await bcrypt.hash(password, 12);

  const demo = [
    { username: 'admin', fullName: 'Demo Administrator', role: 'ADMIN', unit: units.agency },
    { username: 'direktor', fullName: 'Demo Direktor', role: 'DIRECTOR', unit: units.agency },
    { username: 'rahbariyat', fullName: "Demo Direktor o'rinbosari", role: 'LEADERSHIP', unit: units.agency },
    { username: 'supervisor', fullName: 'Demo Supervisor', role: 'SUPERVISOR', unit: units.callCenter, sip: '1000' },
    { username: 'operator1', fullName: 'Demo Operator 1', role: 'OPERATOR', unit: units.callCenter, sip: '1001' },
    { username: 'operator2', fullName: 'Demo Operator 2', role: 'OPERATOR', unit: units.callCenter, sip: '1002' },
    { username: 'dkp.toshkent', fullName: 'Demo DKP Toshkent rahbari', role: 'UNIT_HEAD', unit: units.dkpTashkent },
    { username: 'ijrochi.toshkent', fullName: 'Demo DKP Toshkent ijrochisi', role: 'EXECUTOR', unit: units.dkpTashkent },
    { username: 'korrupsiya', fullName: "Demo Korrupsiyaga qarshi kurash bo'limi", role: 'ANTI_CORRUPTION', unit: units.antiCorruption },
    { username: 'auditor', fullName: 'Demo Auditor', role: 'AUDITOR', unit: units.agency },
  ];

  for (const user of demo) {
    const roleId = roleIds.get(user.role)!;
    await prisma.user.upsert({
      where: { username: user.username },
      update: {},
      create: {
        username: user.username,
        fullName: user.fullName,
        passwordHash,
        orgUnitId: user.unit.id,
        sipExtension: user.sip,
        roles: { create: [{ roleId }] },
      },
    });
  }
  console.log(`Demo foydalanuvchilar: ${demo.map((u) => u.username).join(', ')} (parol: .env dagi SEED_DEFAULT_PASSWORD)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
