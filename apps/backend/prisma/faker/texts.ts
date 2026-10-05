import { TicketType } from '@prisma/client';

/**
 * Murojaat mavzulari bo'yicha namuna matnlar. Mavzu kodlari seed.ts dagi TOPICS bilan bir xil.
 * Qavs ichidagi o'rinbosarlar faker'da to'ldiriladi: {ariza}, {kadastr}, {manzil}, {tuman}, {mfy}, {sana},
 * {kun}, {maydon}, {kvitansiya}.
 */
export interface TopicProfile {
  /** Qo'ng'iroqlar orasidagi taxminiy ulushi */
  weight: number;
  types: (readonly [TicketType, number])[];
  /** "Joyida hal qilindi" ehtimoli (faqat INFO va GRATITUDE turlarida) */
  instantClose: number;
  /** Qaysi IVR navbatlaridan ko'proq keladi (UCM6510 navbat raqami) */
  queues: string[];
  applicationNumber?: number;
  cadastreNumber?: number;
  anonymous?: number;
  texts: string[];
  /** Operator joyida bergan javob */
  instantAnswers?: string[];
  /** Fuqaroning chatdagi birinchi xabari */
  chat: string;
}

const { INFO, APPLICATION, COMPLAINT, CORRUPTION, GRATITUDE } = TicketType;

export const TOPIC_PROFILES: Record<string, TopicProfile> = {
  'topic.01': {
    weight: 20,
    types: [[INFO, 9], [APPLICATION, 1]],
    instantClose: 0.75,
    queues: ['6500', '6501', '6509'],
    applicationNumber: 0.85,
    texts: [
      "Fuqaro {sana} kuni my.gov.uz orqali {ariza} raqamli ariza topshirgan. Ariza holatini va qachon ko'rib chiqilishini so'radi.",
      "{ariza} raqamli ariza bo'yicha hali javob kelmagan. Fuqaro ariza qaysi bosqichda ekanini bilmoqchi.",
      "Ko'chmas mulk huquqini ro'yxatdan o'tkazish bo'yicha arizasi ({ariza}) holati so'raldi. Fuqaro hujjat qachon tayyor bo'lishini so'radi.",
    ],
    instantAnswers: [
      "Ariza holati tekshirildi: ariza ko'rib chiqilmoqda, natija SMS va my.gov.uz shaxsiy kabineti orqali yuboriladi.",
      'Ariza ijobiy hal qilingan, hujjat elektron shaklda tayyor. Fuqaroga uni yuklab olish tartibi tushuntirildi.',
      "Ariza qo'shimcha hujjat kutilayotgani sababli to'xtatilgan. Fuqaroga qaysi hujjat kerakligi aytildi.",
    ],
    chat: 'Assalomu alaykum. Arizam holatini bilsam bo\'ladimi? Raqami {ariza}',
  },
  'topic.02': {
    weight: 8,
    types: [[COMPLAINT, 8], [INFO, 2]],
    instantClose: 0.05,
    queues: ['6500', '6501'],
    applicationNumber: 0.9,
    texts: [
      "Fuqaro {sana} kuni {ariza} raqamli ariza bergan, belgilangan muddat o'tgan bo'lsa-da javob olinmagan. Muddat buzilishi sababini aniqlash va arizani tezlashtirishni so'radi.",
      "{tuman} bo'yicha DKP filialiga topshirilgan ariza {kun} kundan beri ko'rib chiqilmayapti. Fuqaro norozi, chora ko'rishni so'radi.",
    ],
    chat: "Arizam muddati o'tib ketdi, hali javob yo'q. Raqami {ariza}",
  },
  'topic.03': {
    weight: 7,
    types: [[INFO, 85], [APPLICATION, 15]],
    instantClose: 0.85,
    queues: ['6501', '6500', '6509'],
    texts: [
      "Fuqaro {manzil} manzilidagi uy-joyni ro'yxatdan o'tkazish uchun qanday hujjatlar kerakligini so'radi.",
      "Yangi qurilgan xonadonni davlat ro'yxatidan o'tkazish tartibi va muddati haqida ma'lumot so'raldi.",
    ],
    instantAnswers: [
      "Fuqaroga ro'yxatdan o'tkazish uchun kerakli hujjatlar ro'yxati va ariza my.gov.uz yoki davlat xizmatlari markazi orqali berilishi tushuntirildi.",
      "Ro'yxatdan o'tkazish muddati va davlat boji haqida ma'lumot berildi.",
    ],
    chat: "Uyni ro'yxatdan o'tkazish uchun qanday hujjatlar kerak?",
  },
  'topic.04': {
    weight: 5,
    types: [[INFO, 55], [APPLICATION, 45]],
    instantClose: 0.5,
    queues: ['6501', '6500'],
    cadastreNumber: 0.4,
    texts: [
      "Fuqaro otasidan meros qolgan {manzil} manzilidagi uyni o'z nomiga rasmiylashtirmoqchi. Notarial guvohnoma olingan, keyingi bosqichlar haqida so'radi.",
      "Meros bo'yicha mulk huquqini rasmiylashtirishda kadastr hujjatlaridagi ism-sharif xatosi tufayli ariza qabul qilinmagan. Yordam so'radi.",
    ],
    instantAnswers: ["Meros guvohnomasi asosida huquqni ro'yxatdan o'tkazish tartibi tushuntirildi."],
    chat: "Otamdan qolgan uyni o'z nomimga o'tkazmoqchiman, qanday qilaman?",
  },
  'topic.05': {
    weight: 5,
    types: [[INFO, 6], [APPLICATION, 4]],
    instantClose: 0.55,
    queues: ['6501', '6509'],
    cadastreNumber: 0.6,
    applicationNumber: 0.4,
    texts: [
      "Fuqaro {sana} kuni notarial oldi-sotdi shartnomasini tuzgan. Huquq ro'yxatga olinishi qancha vaqt olishini so'radi. Kadastr raqami: {kadastr}.",
      "Sotib olingan kvartiraning huquqi hali ro'yxatdan o'tmagan, ariza raqami {ariza}. Holatini aniqlashni so'radi.",
    ],
    instantAnswers: ["Shartnomadan keyin huquq avtomatik ro'yxatga olinishi va muddati tushuntirildi."],
    chat: "Kvartira sotib oldim, huquq qachon ro'yxatdan o'tadi?",
  },
  'topic.06': {
    weight: 4,
    types: [[COMPLAINT, 55], [INFO, 30], [APPLICATION, 15]],
    instantClose: 0.15,
    queues: ['6501', '6500'],
    applicationNumber: 0.85,
    texts: [
      "{ariza} raqamli ariza rad etilgan, ammo rad etish sababi tushunarsiz. Fuqaro asosli izoh va qayta topshirish tartibini so'radi.",
      "Ko'chmas mulkni ro'yxatdan o'tkazish rad etilgan. Fuqaro qarordan norozi, qayta ko'rib chiqishni so'radi.",
    ],
    instantAnswers: ['Rad etish sababi tizimdan o\'qib berildi va qayta topshirish tartibi tushuntirildi.'],
    chat: 'Arizam rad etilibdi, sababi yozilmagan. Nima qilay?',
  },
  'topic.07': {
    weight: 6,
    types: [[INFO, 9], [APPLICATION, 1]],
    instantClose: 0.85,
    queues: ['6501', '6502', '6509'],
    texts: [
      'Fuqaro {manzil} manzilidagi uy uchun kadastr pasportini qanday olishni so\'radi.',
      "Kadastr pasportini davlat xizmatlari markazi orqali olish muddati va kerakli hujjatlar so'raldi.",
    ],
    instantAnswers: [
      "Kadastr pasportini my.gov.uz orqali buyurtma qilish va tayyor bo'lish muddati tushuntirildi.",
      "Kerakli hujjatlar ro'yxati va to'lov tartibi aytib berildi.",
    ],
    chat: 'Kadastr pasportini qanday olsam bo\'ladi?',
  },
  'topic.08': {
    weight: 3,
    types: [[APPLICATION, 7], [INFO, 2], [COMPLAINT, 1]],
    instantClose: 0.15,
    queues: ['6501', '6502'],
    cadastreNumber: 0.9,
    texts: [
      "Kadastr pasportida uy maydoni noto'g'ri ko'rsatilgan (haqiqatda {maydon} m²). Kadastr raqami: {kadastr}. Tuzatishni so'radi.",
      "Kadastr pasportida egasining familiyasi xato yozilgan. Fuqaro tuzatish tartibini so'radi, kadastr raqami {kadastr}.",
    ],
    instantAnswers: ["Xatoni tuzatish uchun ariza berish tartibi tushuntirildi."],
    chat: "Kadastr pasportimda maydon xato ko'rsatilgan, tuzatib berasizlarmi?",
  },
  'topic.09': {
    weight: 4,
    types: [[INFO, 85], [COMPLAINT, 15]],
    instantClose: 0.8,
    queues: ['6502', '6500'],
    texts: [
      "Kadastr pasporti va ko'chirma uchun to'lov miqdori va to'lov rekvizitlari so'raldi.",
      "Fuqaro kadastr hujjati uchun to'lovni amalga oshirgan, lekin to'lov tizimda ko'rinmayapti. Kvitansiya raqami: {kvitansiya}.",
    ],
    instantAnswers: ["To'lov miqdori va to'lov usullari tushuntirildi."],
    chat: "Kadastr hujjati uchun qancha to'lanadi?",
  },
  'topic.10': {
    weight: 2,
    types: [[INFO, 7], [APPLICATION, 3]],
    instantClose: 0.7,
    queues: ['6502', '6501'],
    applicationNumber: 0.3,
    texts: [
      "Tadbirkor {manzil} manzilidagi noturar joyni ijaraga olgan. Ijara shartnomasini ro'yxatdan o'tkazish tartibini so'radi.",
      "Ijara shartnomasini ro'yxatdan o'tkazish uchun ariza ({ariza}) bergan, javob kutmoqda.",
    ],
    instantAnswers: ["Ijara shartnomasini ro'yxatdan o'tkazish tartibi va muddati tushuntirildi."],
    chat: "Ijara shartnomasini qayerda ro'yxatdan o'tkazaman?",
  },
  'topic.11': {
    weight: 1,
    types: [[INFO, 6], [APPLICATION, 4]],
    instantClose: 0.6,
    queues: ['6502'],
    cadastreNumber: 0.7,
    texts: [
      "Ijara shartnomasi muddatidan oldin bekor qilingan. Davlat reyestridan ijara yozuvini chiqarish tartibini so'radi. Kadastr raqami: {kadastr}.",
    ],
    instantAnswers: ['Ijara yozuvini bekor qilish uchun kerakli hujjatlar aytildi.'],
    chat: 'Ijara shartnomasi bekor qilindi, reyestrdan qanday chiqariladi?',
  },
  'topic.12': {
    weight: 2,
    types: [[APPLICATION, 6], [COMPLAINT, 3], [INFO, 1]],
    instantClose: 0.1,
    queues: ['6502', '6501'],
    cadastreNumber: 0.85,
    applicationNumber: 0.4,
    texts: [
      "Bank krediti to'liq yopilgan ({sana}), ammo kadastr ma'lumotlarida ipoteka taqiqi hali turibdi. Kadastr raqami: {kadastr}. Taqiqni olib tashlashni so'radi.",
      "Garov taqiqi olib tashlanmagani sababli uyni sotib bo'lmayapti. Bank xati topshirilgan, ariza raqami {ariza}.",
    ],
    instantAnswers: ['Taqiqni olib tashlash uchun bank xati bilan ariza berish tartibi tushuntirildi.'],
    chat: 'Kredit yopilgan, lekin uyda hali taqiq turibdi.',
  },
  'topic.13': {
    weight: 1,
    types: [[INFO, 8], [APPLICATION, 2]],
    instantClose: 0.75,
    queues: ['6502'],
    texts: ["Qo'shni yer uchastkasi orqali o'tish huquqi (servitut) belgilash tartibi haqida ma'lumot so'raldi."],
    instantAnswers: ['Servitut belgilash tartibi va kerakli hujjatlar tushuntirildi.'],
    chat: "Qo'shnining yeridan o'tish huquqini qanday rasmiylashtiraman?",
  },
  'topic.14': {
    weight: 3,
    types: [[APPLICATION, 55], [INFO, 45]],
    instantClose: 0.45,
    queues: ['6502', '6500'],
    texts: [
      "Yangi qurilgan uyga manzil berilmagan, shu sababli kadastr hujjatlari rasmiylashtirilmayapti. {tuman}, {mfy} MFY.",
      "Fuqaro yer uchastkasiga yangi manzil berish uchun qayerga murojaat qilishni so'radi.",
    ],
    instantAnswers: ['Manzil berish bo\'yicha ariza tartibi tushuntirildi.'],
    chat: "Uyimga manzil berilmagan, nima qilishim kerak?",
  },
  'topic.15': {
    weight: 2,
    types: [[APPLICATION, 6], [INFO, 4]],
    instantClose: 0.35,
    queues: ['6502'],
    texts: [
      "Ko'cha nomi o'zgargani sababli kadastr hujjatidagi manzilni yangilashni so'radi. Eski manzil: {manzil}.",
      "Kadastr pasporti va guvohnomadagi uy raqami mos kelmaydi. Aniqlashtirishni so'radi.",
    ],
    instantAnswers: ["Manzilni aniqlashtirish uchun murojaat tartibi tushuntirildi."],
    chat: "Ko'cha nomi o'zgardi, hujjatdagi manzilni yangilash kerakmi?",
  },
  'topic.16': {
    weight: 1,
    types: [[INFO, 7], [APPLICATION, 3]],
    instantClose: 0.6,
    queues: ['6503'],
    applicationNumber: 0.3,
    texts: [
      'Xususiy korxona geodeziya-kartografiya faoliyati uchun litsenziya olish tartibi va talablarini so\'radi.',
      "Litsenziya arizasi ({ariza}) bo'yicha qo'shimcha hujjat talab qilingan, qaysi hujjat ekanini aniqlashtirish so'raldi.",
    ],
    instantAnswers: ['Litsenziya talablari va ariza berish tartibi tushuntirildi.'],
    chat: 'Geodeziya litsenziyasini olish uchun nima kerak?',
  },
  'topic.17': {
    weight: 2,
    types: [[APPLICATION, 75], [COMPLAINT, 25]],
    instantClose: 0.05,
    queues: ['6503', '6500'],
    cadastreNumber: 0.75,
    texts: [
      "Qo'shni bilan yer uchastkasi chegarasi bo'yicha nizo bor. Fuqaro chegaralarni qayta o'lchash uchun mutaxassis chaqirishni so'radi. Kadastr raqami: {kadastr}.",
      "Yer uchastkasi maydoni hujjatdagidan kam chiqdi. Geodezik o'lchov o'tkazishni so'radi.",
    ],
    chat: "Qo'shnim bilan chegara bo'yicha kelisha olmayapmiz, o'lchab berasizlarmi?",
  },
  'topic.18': {
    weight: 2,
    types: [[COMPLAINT, 1]],
    instantClose: 0,
    queues: ['6500'],
    texts: [
      "Fuqaro {tuman} DKP filialida {sana} kuni qabulda xodim qo'pol muomala qilganidan shikoyat qildi.",
      "Hujjat topshirish paytida xodim fuqaroni tinglamagan va baland ovozda gapirgan. Chora ko'rishni so'radi.",
    ],
    chat: "Filialdagi xodim juda qo'pol gapirdi, shikoyat qilmoqchiman.",
  },
  'topic.19': {
    weight: 3,
    types: [[COMPLAINT, 9], [INFO, 1]],
    instantClose: 0.05,
    queues: ['6500', '6501'],
    texts: [
      "{tuman} filialida ariza qabul qilinmagan, qonunda talab qilinmaydigan qo'shimcha ma'lumotnoma so'ralgan.",
      "Fuqarodan ro'yxatdan o'tkazish uchun asossiz ravishda qo'shimcha hujjatlar talab qilingan. Aniqlik kiritishni so'radi.",
    ],
    chat: "Filialda hujjatimni qabul qilishmadi, ortiqcha ma'lumotnoma so'rashyapti.",
  },
  'topic.20': {
    weight: 0.7,
    types: [[CORRUPTION, 1]],
    instantClose: 0,
    queues: ['6505'],
    anonymous: 0.55,
    texts: [
      "Fuqaro xabariga ko'ra, {tuman} filiali xodimi hujjatni tezroq tayyorlash evaziga noqonuniy to'lov so'ragan.",
      "Kadastr hujjatini rasmiylashtirishda vositachi orqali pul talab qilingani haqida xabar. Fuqaro ismini oshkor qilmaslikni so'radi.",
    ],
    chat: "Hujjatni tez qilib berish uchun pul so'rashdi. Bu haqida xabar bermoqchiman.",
  },
  'topic.21': {
    weight: 6,
    types: [[INFO, 8], [COMPLAINT, 2]],
    instantClose: 0.7,
    queues: ['6500', '6502', '6509'],
    texts: [
      'my.gov.uz portalida ariza yuborishda xatolik chiqmoqda, to\'lov bosqichiga o\'tmayapti.',
      "Yagona interaktiv davlat xizmatlari portalida kadastr xizmati topilmayapti, qaysi bo'limdan foydalanishni so'radi.",
    ],
    instantAnswers: [
      "Portalda ariza berish bosqichlari tushuntirildi, fuqaro arizani qayta yubordi.",
      'Portaldagi texnik nosozlik haqida ma\'lumot berildi, keyinroq qayta urinish tavsiya qilindi.',
    ],
    chat: 'my.gov.uz da ariza yuborib bo\'lmayapti, xato chiqyapti.',
  },
  'topic.22': {
    weight: 6,
    types: [[INFO, 1]],
    instantClose: 0.97,
    queues: ['6500', '6502', '6509'],
    texts: [
      "Fuqaro {tuman} bo'yicha DKP filiali manzili va qabul kunlarini so'radi.",
      'Hududiy boshqarma rahbarining qabul jadvali so\'raldi.',
    ],
    instantAnswers: ["Filial manzili, ish vaqti va qabul kunlari aytib berildi.", 'Rahbar qabuli jadvali va oldindan yozilish tartibi tushuntirildi.'],
    chat: 'Filial qayerda joylashgan va soat nechigacha ishlaydi?',
  },
  'topic.23': {
    weight: 2,
    types: [[GRATITUDE, 1]],
    instantClose: 0.95,
    queues: ['6500'],
    texts: [
      "Fuqaro {tuman} filiali xodimlariga hujjatni tez va sifatli rasmiylashtirgani uchun minnatdorchilik bildirdi.",
      "Call-markaz operatori bergan aniq ma'lumot uchun rahmat aytdi.",
    ],
    instantAnswers: ['Minnatdorchilik qabul qilindi va bo\'linmaga yetkaziladi.'],
    chat: 'Filial xodimlariga katta rahmat, hujjatimni tez tayyorlashdi!',
  },
  'topic.24': {
    weight: 3,
    types: [[INFO, 6], [APPLICATION, 25], [COMPLAINT, 15]],
    instantClose: 0.55,
    queues: ['6500', '6502', '6509'],
    texts: [
      "Fuqaro ko'p qavatli uyning yerto'la qismini ro'yxatdan o'tkazish masalasi bo'yicha maslahat so'radi.",
      "Davlat kadastrlari bo'yicha statistik ma'lumot olish tartibini so'radi.",
      'Fuqaro yer uchastkasini ijaraga berish shartlari haqida so\'radi.',
    ],
    instantAnswers: ["Fuqaroga kerakli ma'lumot berildi, qo'shimcha savollar yo'q."],
    chat: "Assalomu alaykum, bir savolim bor edi.",
  },
};

/** Ijrochi javoblari: ota toifa kodi bo'yicha */
export const ANSWERS: Record<string, string[]> = {
  'application-status': [
    "Ariza ko'rib chiqildi va ijobiy hal qilindi. Tayyor hujjat my.gov.uz shaxsiy kabinetiga yuborildi.",
    "Arizani ko'rib chiqish muddati buzilgani tasdiqlandi. Mas'ul xodimga intizomiy chora ko'rildi, ariza 3 ish kunida yakunlandi.",
  ],
  'property-registration': [
    "Huquq davlat ro'yxatidan o'tkazildi. Reyestrdan ko'chirma fuqaroga elektron shaklda yuborildi.",
    "Arizaga ilova qilingan hujjatlarda kamchilik aniqlandi (notarial shartnoma nusxasi to'liq emas). Fuqaroga qayta topshirish tartibi yozma tushuntirildi.",
  ],
  'cadastre-passport': [
    "Kadastr pasportidagi xato tuzatildi, yangilangan pasport tayyor va fuqaroga yuborildi.",
    "Kadastr pasporti tayyorlandi. Fuqaro uni davlat xizmatlari markazidan olishi mumkin.",
  ],
  'lease-registration': [
    "Ijara shartnomasi davlat ro'yxatidan o'tkazildi, fuqaroga xabar berildi.",
    "Ijara yozuvi reyestrdan chiqarildi.",
  ],
  'mortgage-servitude': [
    "Bank xati asosida ipoteka taqiqi olib tashlandi, ma'lumotlar reyestrda yangilandi.",
    "Servitut belgilash uchun kerakli hujjatlar ro'yxati fuqaroga yuborildi.",
  ],
  address: [
    "Ko'chmas mulkka yangi manzil berildi va kadastr ma'lumotlariga kiritildi.",
    "Manzil tuman hokimligi qarori asosida aniqlashtirildi, hujjatlar yangilandi.",
  ],
  geodesy: [
    "Mutaxassis joyiga chiqib o'lchov o'tkazdi, chegaralar aniqlashtirildi. Dalolatnoma fuqaroga topshirildi.",
    "Litsenziya arizasi bo'yicha talab qilinadigan hujjatlar ro'yxati fuqaroga yuborildi.",
  ],
  'staff-complaint': [
    "Holat o'rganildi. Xodim bilan suhbat o'tkazildi va unga hayfsan berildi. Fuqarodan uzr so'raldi.",
    "Shikoyat o'rganildi, xodimning harakatlarida qoidabuzarlik aniqlanmadi. Fuqaroga tushuntirish berildi.",
    "Fuqaroning hujjatlari qabul qilindi, asossiz talab qo'ygan xodimga ogohlantirish berildi.",
  ],
  corruption: [
    "Xabar o'rganildi va materiallar huquqni muhofaza qiluvchi organlarga yuborildi. Fuqaro ma'lumotlari sir saqlanadi.",
    'Xizmat tekshiruvi o\'tkazildi, xabarda keltirilgan holat tasdiqlanmadi.',
  ],
  other: [
    "Fuqaroga savoli bo'yicha batafsil tushuntirish yozma ravishda berildi.",
    'Masala hal qilindi, fuqaro natijadan rozi.',
  ],
};

export const EXECUTOR_COMMENTS = [
  "Fuqaro bilan telefon orqali bog'lanildi, qo'shimcha hujjat so'raldi.",
  "Arxivdan ma'lumot so'rov xati yuborildi.",
  'Joyiga chiqish rejalashtirildi.',
  "Fuqaro hujjatlarni Telegram orqali yubordi, o'rganilmoqda.",
  "Masala yuridik bo'lim bilan kelishilmoqda.",
  "Tuman hokimligidan ma'lumot kutilmoqda.",
];

export const RETURN_REASONS = [
  "Murojaat bizning hududimizga tegishli emas: ko'chmas mulk boshqa viloyatda joylashgan.",
  "Masala bo'linma vakolatiga kirmaydi, Geodeziya va kartografiya boshqarmasiga yo'naltirish kerak.",
  "Murojaatda fuqaro manzili ko'rsatilmagan, aniqlashtirish kerak.",
];

export const REJECT_REASONS = [
  "Javob to'liq emas: fuqaroning ikkinchi savoliga javob berilmagan.",
  "Javobda hujjat raqami va sanasi ko'rsatilmagan.",
  "Fuqaro bilan bog'lanib, natijani tasdiqlash kerak.",
];

export const REOPEN_REASONS = [
  'Fuqaro qayta murojaat qildi: masala amalda hal qilinmagan.',
  "Nazorat qo'ng'irog'ida fuqaro javobdan norozi ekanini bildirdi.",
];

export const ESCALATION_COMMENT = "Ijro muddati o'tdi — bo'linma rahbari va supervisorga xabar berildi.";

export const TASK_TITLES = [
  "Fuqarodan hujjat nusxasini so'rash",
  "Hududiy filialdan arxiv ma'lumotini olish",
  "Joyiga chiqib o'lchov o'tkazish",
  "Davlat reyestridan ko'chirma olish",
  "Yuridik bo'lim xulosasini olish",
  'Javob xati loyihasini tayyorlash',
  'Fuqaro bilan uchrashuv belgilash',
  "Bankdan garov bo'yicha xat so'rash",
  "Hokimlikdan manzil to'g'risidagi qarorni so'rash",
];

export const ATTACHMENTS: { name: string; mime: string; minKb: number; maxKb: number; byExecutor?: boolean }[] = [
  { name: 'kadastr_pasporti_nusxa.pdf', mime: 'application/pdf', minKb: 300, maxKb: 2400 },
  { name: 'pasport_1-sahifa.jpg', mime: 'image/jpeg', minKb: 400, maxKb: 1800 },
  { name: 'ariza.pdf', mime: 'application/pdf', minKb: 80, maxKb: 600 },
  { name: 'notarial_shartnoma.pdf', mime: 'application/pdf', minKb: 500, maxKb: 3500 },
  { name: 'yer_uchastkasi_sxemasi.png', mime: 'image/png', minKb: 200, maxKb: 1500 },
  { name: 'bank_xati.pdf', mime: 'application/pdf', minKb: 100, maxKb: 900 },
  { name: 'foto_1.jpg', mime: 'image/jpeg', minKb: 600, maxKb: 3200 },
  { name: 'javob_xati.pdf', mime: 'application/pdf', minKb: 90, maxKb: 400, byExecutor: true },
  { name: 'dalolatnoma.pdf', mime: 'application/pdf', minKb: 150, maxKb: 900, byExecutor: true },
];

export const BREAK_REASONS = { lunch: 'Tushlik', short: 'Qisqa tanaffus', tech: 'Texnik tanaffus' } as const;

export const OPERATOR_REPLIES = [
  "Assalomu alaykum! Murojaatingiz uchun rahmat, hozir tekshirib ko'raman.",
  "Iltimos, ariza raqamingiz va telefon raqamingizni yuboring.",
  "Ushbu masala bo'yicha hududingizdagi DKP filialiga murojaat qilishingiz mumkin. Qabul: dushanba–juma, 9:00–18:00.",
  "Tushunarli. Masalangizni mas'ul bo'linmaga yuboraman, javob SMS orqali keladi.",
];

export const CITIZEN_FOLLOWUPS = ['Rahmat!', 'Tushundim, rahmat.', 'Qachon javob beriladi?', 'Hujjat nusxasini yubordim.', 'Yaxshi, kutaman.'];

export const QA_CHECKLIST = [
  { item: "Salomlashish va o'zini tanishtirish", max: 10 },
  { item: 'Fuqaroni diqqat bilan tinglash', max: 20 },
  { item: "To'g'ri va to'liq ma'lumot berish", max: 30 },
  { item: 'Xushmuomalalik va nutq madaniyati', max: 20 },
  { item: "Murojaatni to'g'ri rasmiylashtirish", max: 10 },
  { item: 'Suhbatni yakunlash', max: 10 },
];

export const QA_COMMENTS = [
  'Suhbat namunaviy darajada olib borildi.',
  "Ma'lumot to'g'ri berildi, lekin murojaat raqami fuqaroga aytilmadi.",
  "Fuqaroni bo'lib qo'ydi, sabr bilan tinglash kerak.",
  "Skriptga to'liq amal qilindi.",
  'Suhbat cho\'zilib ketdi, aniqroq savollar berish tavsiya etiladi.',
];

export const BLACKLIST_REASONS = [
  "Haqoratli so'zlar bilan qayta-qayta qo'ng'iroq qiladi",
  "Avtomatik (robot) qo'ng'iroqlar, spam",
  "Bezorilik: liniyani band qilib turadi",
  "Soxta xabarlar berish",
];

export const KNOWLEDGE_ARTICLES: { category: string; title: string; body: string }[] = [
  {
    category: 'application-status',
    title: 'Ariza holatini tekshirish',
    body:
      "1. Fuqarodan ariza raqamini so'rang (my.gov.uz yoki davlat xizmatlari markazi bergan raqam).\n" +
      "2. Holatni tizimdan tekshiring va fuqaroga aytib bering.\n" +
      "3. Muddat o'tgan bo'lsa, «Ariza ko'rib chiqish muddati o'tib ketgan» mavzusida murojaat yarating — u avtomatik ravishda hududiy DKP boshqarmasiga yo'naltiriladi.",
  },
  {
    category: 'property-registration',
    title: "Ko'chmas mulk huquqini ro'yxatdan o'tkazish: kerakli hujjatlar",
    body:
      "Asosiy hujjatlar: shaxsni tasdiqlovchi hujjat, huquq belgilovchi hujjat (shartnoma, meros guvohnomasi va h.k.), kadastr hujjati.\n" +
      "Ariza my.gov.uz yoki davlat xizmatlari markazi orqali beriladi.\n" +
      "Muddat va davlat boji: [amaldagi qonunchilik bo'yicha aniqlashtiriladi].",
  },
  {
    category: 'cadastre-passport',
    title: 'Kadastr pasportini olish',
    body:
      "Kadastr pasporti my.gov.uz orqali buyurtma qilinadi. Tayyor bo'lgach, fuqaroga SMS keladi.\n" +
      "To'lov miqdori: [amaldagi tarif]. Tayyorlash muddati: [amaldagi muddat].\n" +
      "Pasportdagi xatoni tuzatish uchun alohida ariza beriladi — mavzu №8.",
  },
  {
    category: 'mortgage-servitude',
    title: 'Ipoteka taqiqini olib tashlash',
    body:
      "Kredit yopilgach, bank garovni bekor qilish to'g'risida xat beradi. Fuqaro shu xat bilan ariza topshiradi.\n" +
      "Taqiq 3 ish kunidan oshsa ham olinmagan bo'lsa — murojaat yarating (mavzu №12).",
  },
  {
    category: 'address',
    title: "Manzil berish va o'zgartirish",
    body:
      "Yangi manzil tuman (shahar) hokimligi qarori asosida beriladi va kadastr ma'lumotlariga kiritiladi.\n" +
      "Ko'cha nomi o'zgargan bo'lsa, fuqaro hech narsa qilishi shart emas: ma'lumotlar markazlashgan holda yangilanadi.",
  },
  {
    category: 'geodesy',
    title: "Yer uchastkasi chegarasini o'lchash",
    body:
      "Chegara bo'yicha nizo bo'lsa, fuqaro ariza beradi va mutaxassis joyiga chiqadi.\n" +
      "Xizmat narxi va muddati: [Geodeziya va kartografiya boshqarmasi bilan aniqlashtiriladi].",
  },
  {
    category: 'staff-complaint',
    title: 'Xodim ustidan shikoyatni qabul qilish',
    body:
      "Shikoyat sanasi, filial va (iloji bo'lsa) xodim ismini yozib oling.\n" +
      "Fuqaroning gapini bo'lmang, his-tuyg'ularini tan oling. Murojaat raqamini albatta ayting.",
  },
  {
    category: 'corruption',
    title: 'Korrupsiya xabarlari: maxfiylik qoidalari',
    body:
      "Fuqaro ismini aytishni istamasa, «Anonim» belgisini qo'ying.\n" +
      "Murojaat avtomatik ravishda Korrupsiyaga qarshi kurash bo'limiga yo'naltiriladi va operator ro'yxatidan yashiriladi.\n" +
      "Suhbat mazmunini hech kimga aytmang.",
  },
  {
    category: 'other',
    title: 'my.gov.uz portalida xatolik',
    body:
      "Fuqarodan qaysi bosqichda xato chiqqanini so'rang, brauzerni yangilash yoki boshqa qurilmadan urinishni tavsiya qiling.\n" +
      "Xato takrorlansa, murojaat yarating (mavzu №21) va skrinshot so'rang.",
  },
  {
    category: 'other',
    title: "Suhbat skripti: salomlashish va yakunlash",
    body:
      "Boshlanish: «Assalomu alaykum, Kadastr agentligi 1097 ishonch telefoni, [ismingiz] tinglaydi.»\n" +
      "Yakun: «Murojaatingiz [raqam] raqami bilan ro'yxatga olindi. Yana savollaringiz bormi? Rahmat, xayr.»",
  },
];
