import { P } from '../../constants';

/**
 * Foydalanuvchi qo'llanmasi (TZ 14-bo'lim): har bir rol uchun qadam-baqadam yo'riqnoma.
 * Matn tizimdagi haqiqiy sahifa va tugma nomlari bilan yozilgan — interfeys o'zgarsa, shu yerda ham yangilang.
 */

export interface ManualStep {
  title: string;
  text: string;
  /** Tegishli sahifa (tugma "Sahifani ochish") */
  link?: string;
}

export interface ManualSection {
  key: string;
  title: string;
  /** Kim uchun: yon menyuda qisqa izoh */
  audience: string;
  /** Foydalanuvchining roli: ruxsatlardan biri bo'lsa shu bo'lim (OWN_ORDER tartibida tekshiriladi) */
  permissions: string[];
  intro: string;
  steps: ManualStep[];
}

export const MANUAL: ManualSection[] = [
  {
    key: 'start',
    title: 'Tizimga kirish va interfeys',
    audience: 'Barcha xodimlar',
    permissions: [],
    intro: "Tizim brauzerda ishlaydi, alohida dastur o'rnatilmaydi. Har bir xodim faqat o'z roliga ruxsat etilgan bo'limlarni ko'radi.",
    steps: [
      { title: 'Kirish', text: "Login va parolingizni kiriting. Parol 5 marta noto'g'ri terilsa, hisob vaqtincha bloklanadi — administratorga murojaat qiling. Ishni tugatgach, chap pastdagi «Tizimdan chiqish» tugmasini bosing." },
      { title: 'Yon menyu', text: "Bo'limlar guruhlangan: CRM, Telefoniya, Xabar almashish, Boshqaruv markazi, Kirish boshqaruvi va Tizim. Menyudagi raqam — amal kutayotgan murojaatlar, faol ogohlantirishlar yoki javobsiz yozishmalar soni." },
      { title: "Yuqori panel", text: "Kun ko'rsatkichlari (qo'ng'iroqlar, o'rtacha kutish, hal qilingan va ijrodagi murojaatlar), softfon tugmasi va bildirishnomalar qo'ng'irog'i shu yerda." },
      { title: 'Klaviatura yorliqlari', text: "Ctrl+K — sahifadagi qidiruv maydoniga o'tish. Ctrl+S — operator panelida murojaatni saqlash. Ctrl+Enter — omnikanalda javobni yuborish." },
      { title: 'Shaxsiy ma\'lumotlar', text: "Fuqaro kartasini ochish, yozuvni tinglash va eksport audit jurnaliga yoziladi. Ma'lumotni faqat xizmat vazifasi uchun ko'ring, ekranni begonalarga ko'rsatmang." },
    ],
  },
  {
    key: 'operator',
    title: 'Operator',
    audience: "Qo'ng'iroq va yozishmalarni qabul qiluvchi",
    permissions: [P.TicketsCreate, P.TelephonyUse],
    intro: "Operator 1097 ga kelgan qo'ng'iroqni qabul qiladi, fuqaro kartasini ko'radi, murojaatni ro'yxatga oladi va mas'ul bo'linmaga yo'naltiradi.",
    steps: [
      { title: 'Smenani boshlash', text: "Yuqori paneldagi softfon tugmasini bosib holatni «Tayyor» qiling. Tanaffusga chiqsangiz — «Tanaffus», sababini tanlang. Har bir holat vaqti hisobga olinadi.", link: '/operator' },
      { title: "Qo'ng'iroq kelganda", text: "Operator panelida qo'ng'iroq paneli chiqadi va fuqaro kartasi raqam bo'yicha o'zi ochiladi: oldingi murojaatlar, qo'ng'iroqlar va yozishmalar. Takroriy murojaatni shu yerdan aniqlang.", link: '/operator' },
      { title: 'Fuqaroni qidirish', text: "Karta ochilmasa, «Telefon yoki murojaat raqami» maydoniga raqamni kiriting. Yangi fuqaro bo'lsa — «Qo'lda kiritish»." },
      { title: 'Murojaat yaratish', text: "Murojaat turini tanlang (ma'lumot, ariza, shikoyat, korrupsiya, minnatdorchilik), mavzu kartasini bosing (bir nechta mavzu tanlash mumkin — birinchisi asosiy), tavsifni fuqaro so'zlari bilan yozing, hudud va tumanni belgilang. Mas'ul bo'linma yo'naltirish jadvalidan avtomatik taklif qilinadi; kerak bo'lsa «O'zgartirish»." },
      { title: 'Joyida hal qilindi', text: "Ma'lumot so'rash va minnatdorchilik murojaati suhbatda hal bo'lsa, «Joyida hal qilindi» belgisini qo'ying va berilgan ma'lumotni yozing — murojaat darhol yopiladi va ijroga yuborilmaydi." },
      { title: 'Korrupsiya xabari', text: "Korrupsiya turini tanlasangiz, murojaat maxfiy bo'ladi va faqat korrupsiyaga qarshi kurash bo'limiga yuboriladi. Fuqaro so'rasa «Anonim» belgisini qo'ying." },
      { title: 'Saqlash', text: "«Yuborish» (yoki Ctrl+S). Murojaat raqamini (masalan, 1097-2026-000123) fuqaroga ayting — u holatni shu raqam bilan IVR, Telegram bot yoki veb-chat orqali bila oladi." },
      { title: 'Omnikanal yozishmalari', text: "«Omnikanal» bo'limida Telegram, sayt chati va email xabarlari. Biriktirilmagan suhbatni «O'zimga olish», javob yozing (tez javoblardan foydalanish mumkin). Murojaat kerak bo'lsa — «Murojaat yaratish»: yozishma matni va kontakt formaga o'tadi, fuqaroga raqami avtomatik yuboriladi.", link: '/omnichannel' },
      { title: "Chiquvchi qo'ng'iroqlar", text: "«Chiquvchi qo'ng'iroqlar» bo'limida faol kampaniyani oching: navbatdagi raqamni ko'rib chiqib qo'ng'iroq qiling, natijani (bog'lanildi, javob bermadi, keyinroq va h.k.) saqlang. Javob bermaganlarga keyinroq qayta urinish rejalashtiriladi.", link: '/campaigns' },
    ],
  },
  {
    key: 'supervisor',
    title: 'Supervisor',
    audience: "Call-markaz rahbari va smena boshlig'i",
    permissions: [P.CampaignsManage],
    intro: "Supervisor navbat va operatorlarni real vaqtda kuzatadi, ogohlantirishlarga javob beradi, yo'naltirilmagan murojaatlarni taqsimlaydi va kampaniyalarni boshqaradi.",
    steps: [
      { title: 'Jonli holat', text: "Navbatdagi qo'ng'iroqlar, eng uzoq kutish, operatorlar holati va xizmat darajasi (masalan, 20 soniyada javob — 80%) har bir necha soniyada yangilanadi. Operator suhbatini «Tinglash» mumkin — bu amal audit jurnaliga yoziladi.", link: '/live' },
      { title: 'Ogohlantirishlar', text: "Limit buzilsa (uzoq kutish, bo'sh operator yo'q, trunk uzildi va h.k.) ogohlantirish ochiladi. «Qabul qildim» — muammo ustida ishlayotganingizni bildiradi; ko'rsatkich tiklansa, ogohlantirish o'zi yopiladi. Limitlarni shu sahifada o'zgartirasiz.", link: '/alerts' },
      { title: 'Murojaatlar', text: "«Murojaatlar» sahifasida holat tablari (Yangi, Yo'naltirildi, Ijroda, Muddati o'tgan…), filtrlar va eksport. Qaytarilgan murojaatni sababini o'qib qayta yo'naltiring.", link: '/tickets' },
      { title: 'Omnikanal nazorati', text: "Supervisor barcha yozishmalarni ko'radi va ularni operatorga biriktira oladi (suhbat sarlavhasidagi ro'yxat).", link: '/omnichannel' },
      { title: 'Kampaniyalar', text: "Yangi kampaniya: turi (qayta aloqa, so'rovnoma, eslatma, xabardor qilish), skript, urinishlar soni; kontaktlarni ro'yxatdan import qiling yoki murojaatlardan oling. Kampaniyani pauza qilish va yakunlash mumkin.", link: '/campaigns' },
      { title: "Navbatlar va IVR", text: "Navbatlar va IVR menyusini ko'rasiz, simulyatorda qo'ng'iroq qilib sinaysiz. O'zgartirish administrator tomonidan qilinadi.", link: '/ivr' },
      { title: 'Hisobotlar', text: "«Analitika va hisobotlar»: davr tanlang (bugun, 7 kun, 30 kun), ko'rsatkichlar, soatlik grafik, operatorlar samaradorligi. Hisobotni XLSX, CSV yoki PDF ko'rinishida yuklab oling.", link: '/analytics' },
    ],
  },
  {
    key: 'unit',
    title: "Bo'linma rahbari va ijrochi",
    audience: "DKP filiallari, hududiy boshqarmalar, markaziy apparat bo'limlari",
    permissions: [P.TicketsAssign, P.TicketsAnswer],
    intro: "Bo'linmaga yo'naltirilgan murojaat mavzu uchun belgilangan ijro muddatida (odatda 15 kun) ko'rib chiqiladi. Har bir harakat murojaat tarixida qoladi.",
    steps: [
      { title: 'Kiruvchi murojaatlar', text: "«Murojaatlar» → «Yo'naltirildi» tabida bo'linmangizga kelganlar. Menyudagi raqam amal kutayotgan murojaatlar soni.", link: '/tickets' },
      { title: 'Ijrochiga berish', text: "Murojaatni oching → «Ijrochiga berish», xodimni tanlang. Noto'g'ri yo'naltirilgan bo'lsa — «Qaytarish», sababini yozing: murojaat call-markaz supervisoriga qaytadi." },
      { title: 'Hamkor bo\'linmalar va vazifalar', text: "Murojaat ustida boshqa bo'linma ham ishlasa, uni ishtirokchi sifatida qo'shing. «Vazifalar» tabida ichki topshiriqlar (masalan, arxivdan nusxa olish) va ularning muddati." },
      { title: 'Javob yozish (ijrochi)', text: "«Javob» tabida fuqaroga javob matnini yozing va yuboring. Javob bo'linma rahbari tasdig'iga tushadi." },
      { title: 'Tasdiqlash', text: "Rahbar javobni ko'rib chiqadi: tasdiqlasa murojaat yopiladi, rad etsa izoh bilan ijrochiga qaytadi. «Eksport» → «Javob xati (DOCX)» rasmiy xat shablonini beradi." },
      { title: 'Muddatlar', text: "Muddati o'tgan murojaatlar ro'yxatda va kartada «Muddati o'tgan» belgisi bilan chiqadi. Shu tabni har kuni tekshiring." },
    ],
  },
  {
    key: 'leadership',
    title: 'Rahbariyat',
    audience: "Direktor va o'rinbosarlar",
    permissions: [P.MonitoringView, P.ReportsView],
    intro: "Rahbariyat butun tizim bo'yicha ko'rsatkichlarni kuzatadi, hisobotlarni oladi va zarur bo'lsa yozuvlarni tinglaydi.",
    steps: [
      { title: 'Bosh sahifa', text: "Kunlik ko'rsatkichlar: qo'ng'iroqlar, murojaatlar holati, muddati o'tganlar va hududlar kesimi.", link: '/dashboard' },
      { title: 'Analitika', text: "Davr bo'yicha xizmat darajasi, eng ko'p uchraydigan mavzular, joyida hal qilinganlar ulushi, operatorlar reytingi va qo'ng'iroqlar xarajati.", link: '/analytics' },
      { title: "Qo'ng'iroqlar jurnali", text: "Har bir qo'ng'iroq: kim, qachon, qancha kutdi, qancha gaplashdi, natija. Yozuvni pleyerda tinglash mumkin (audit jurnaliga yoziladi). Yozuvlar 3 oy saqlanadi.", link: '/calls' },
      { title: 'Maxfiy murojaatlar', text: "Korrupsiya xabarlarini faqat direktor va korrupsiyaga qarshi kurash bo'limi ko'radi." },
    ],
  },
  {
    key: 'admin',
    title: 'Administrator',
    audience: 'Tizim administratori',
    permissions: [P.UsersManage, P.SettingsManage],
    intro: "Administrator foydalanuvchilar, rollar, tuzilma va sozlamalarni yuritadi. Fuqarolar ma'lumotlariga kirish huquqi yo'q. Har bir o'zgarish audit jurnaliga yoziladi.",
    steps: [
      { title: 'Foydalanuvchilar', text: "Yangi xodim: login, F.I.Sh., bo'linma, rol(lar), operator uchun SIP ichki raqam va tillar (o'zbek/rus). Bloklangan hisobni «Blokdan chiqarish», ishdan ketgan xodimni «Bloklash».", link: '/users' },
      { title: 'Rollar va huquqlar', text: "Rol — huquqlar to'plami va ko'rish doirasi (o'zi, bo'linma, bo'linma va quyi bo'linmalar, butun tizim). Matritsada kimda qaysi huquq borligini solishtiring. Shaxsiy ma'lumotga kirish beradigan huquqlar alohida belgilangan.", link: '/roles' },
      { title: 'Tashkiliy tuzilma', text: "Agentlik daraxti: yangi filial yoki bo'lim qo'shish, nomini o'zgartirish. Murojaatlar shu daraxtdagi bo'linmalarga yo'naltiriladi.", link: '/org-units' },
      { title: "CRM sozlamalari", text: "Toifalar va mavzular (operator kartalari, ijro muddati, maxfiylik), yo'naltirish qoidalari (toifa + hudud → bo'linma) va eksport shablonlari.", link: '/crm/categories' },
      { title: 'IVR menyusi', text: "«Navbatlar va IVR» → «IVR menyusi»: menyu tanlang, tugmalarni tahrirlang (navbatga ulash, boshqa menyuga o'tish, murojaat holati, ovozli xabar, qayta qo'ng'iroq) va «Saqlash». O'ngdagi simulyatorda «1097 ga qo'ng'iroq» qilib tekshiring — ish vaqtidan tashqarini «Boshqa vaqt» bilan sinang.", link: '/ivr/menu' },
      { title: 'Navbatlar', text: "Navbatni oching: taqsimlash qoidasi, qayta qo'ng'iroq taklifi chegarasi, navbatdagi o'rnini aytish, kutish musiqasi. Pastda operatorlarni biriktiring: «Asosiy» operatorlarga birinchi, band bo'lsa «Zaxira»larga beriladi.", link: '/ivr/queues' },
      { title: 'Ovozli xabarlar', text: "Har bir xabar uchun diktor matni va audio fayl (WAV/MP3/GSM). Audiosi yo'q xabar simulyatorda ogohlantirish bilan ko'rinadi. Ish vaqtidan tashqari va bayram xabarini shu yerda tanlaysiz.", link: '/ivr/prompts' },
      { title: "PBX'ga yuklash", text: "IVR'da xato qolmagach, sahifa tepasidagi «PBX'ga yuklash» konfiguratsiyani UCM6510 ga yuboradi. Holat belgisi «PBX bilan bir xil» bo'lsa — tizim va ATS mos. Yangi o'zgarish qilinsa «Yuklanmagan o'zgarishlar bor» chiqadi." },
      { title: 'Omnikanal kanallari', text: "«Omnikanal» → «Kanallar»: sayt uchun vidjet kodi (bir qator), Telegram bot va email ulanish yo'riqnomasi, avtomatik javob matnlari.", link: '/omnichannel' },
      { title: 'Tizim sozlamalari', text: "Ish vaqti, bayram kunlari, xizmat darajasi maqsadlari, yozuvlarni saqlash muddati, SMS shablonlari va integratsiyalar holati.", link: '/settings' },
    ],
  },
  {
    key: 'auditor',
    title: 'Auditor',
    audience: 'Ichki nazorat',
    permissions: [P.AuditRead],
    intro: "Audit jurnali faqat yoziladi — hech kim, shu jumladan administrator ham, yozuvni o'zgartira yoki o'chira olmaydi.",
    steps: [
      { title: 'Jurnal', text: "Toifalar: kirish va xavfsizlik, murojaatlar, yozuvlar, sozlamalar va rollar, eksport. Xodim, sana va amal bo'yicha filtrlang; har bir yozuvda IP manzil, brauzer va o'zgarishlar jadvali.", link: '/audit' },
      { title: 'Eksport', text: "Filtrlangan jurnalni XLSX ko'rinishida yuklab oling — bu amalning o'zi ham jurnalga yoziladi." },
    ],
  },
];

/**
 * "Sizning rolingiz" bo'limini aniqlash tartibi: aniqroq rol oldin
 * (supervisorda ham operator huquqi bor, bo'linma rahbarida ham hisobot huquqi bor).
 */
export const OWN_ORDER = ['admin', 'auditor', 'supervisor', 'unit', 'leadership', 'operator'];

export const FAQ: { q: string; a: string }[] = [
  { q: "Fuqaro murojaat holatini qanday biladi?", a: "1097 ga qo'ng'iroq qilib IVR'da «1» ni bosib raqamni teradi, Telegram botga yoki sayt chatiga murojaat raqamini yuboradi — holat avtomatik javob qilinadi." },
  { q: "Murojaat noto'g'ri bo'linmaga ketdi. Nima qilish kerak?", a: "Bo'linma rahbari «Qaytarish» bilan sababini yozadi; supervisor murojaatni to'g'ri bo'linmaga qayta yo'naltiradi. Hammasi murojaat tarixida qoladi." },
  { q: "Omnikanalda xabar yonida soat belgisi turibdi.", a: "Xabar navbatda: kanal (Telegram bot yoki pochta serveri) hali ulanmagan yoki tarmoq uzilgan. Kanal tiklanishi bilan xabar avtomatik yuboriladi." },
  { q: "IVR'ni o'zgartirdim, lekin qo'ng'iroqda eski menyu.", a: "O'zgarish tizimda saqlangan, lekin ATS'ga yuklanmagan. «Navbatlar va IVR» sahifasida «PBX'ga yuklash» ni bosing." },
  { q: 'Parolni unutdim.', a: "Administratorga murojaat qiling — u parolni almashtiradi. Hisob bloklangan bo'lsa, «Blokdan chiqarish» bilan ochiladi." },
];
