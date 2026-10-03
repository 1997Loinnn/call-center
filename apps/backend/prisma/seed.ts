/**
 * Boshlang'ich ma'lumotlar: hududlar, agentlik tuzilmasi, rollar, toifalar, yo'naltirish jadvali,
 * navbatlar, sozlamalar va (ixtiyoriy) demo foydalanuvchilar. Qayta ishga tushirish xavfsiz (upsert).
 *
 * Tuzilma manbasi: kadastr.uz (2026-yil oktabr holati). Bo'lim va tashkilotlarning rasmiy nomlari,
 * SOATO kodlari va tuman filiallari ro'yxati buyurtmachi bilan tasdiqlanadi (TZ 16-bo'lim).
 */
import { OrgUnit, OrgUnitType, Prisma, PrismaClient } from '@prisma/client';
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
// Raqam = tartib (sortOrder). Namuna ro'yxat — buyurtmachi bilan tasdiqlanadi.
const TOPICS = [
  { code: 'topic.01', parent: 'application-status', nameUz: "Ariza holatini bilish (ariza raqami bo'yicha)" },
  { code: 'topic.02', parent: 'application-status', nameUz: "Ariza ko'rib chiqish muddati o'tib ketgan" },
  { code: 'topic.03', parent: 'property-registration', nameUz: "Uy-joyni ro'yxatdan o'tkazish tartibi va hujjatlar" },
  { code: 'topic.04', parent: 'property-registration', nameUz: "Meros bo'yicha mulk huquqini rasmiylashtirish" },
  { code: 'topic.05', parent: 'property-registration', nameUz: "Oldi-sotdidan keyin huquqni ro'yxatga olish" },
  { code: 'topic.06', parent: 'property-registration', nameUz: "Ro'yxatdan o'tkazish rad etilgan — sababini bilish" },
  { code: 'topic.07', parent: 'cadastre-passport', nameUz: 'Kadastr pasportini olish tartibi' },
  { code: 'topic.08', parent: 'cadastre-passport', nameUz: 'Kadastr pasportidagi xatoni tuzatish' },
  { code: 'topic.09', parent: 'cadastre-passport', nameUz: "Kadastr hujjati uchun to'lov miqdori" },
  { code: 'topic.10', parent: 'lease-registration', nameUz: "Ijara shartnomasini ro'yxatdan o'tkazish" },
  { code: 'topic.11', parent: 'lease-registration', nameUz: 'Ijara shartnomasini bekor qilish' },
  { code: 'topic.12', parent: 'mortgage-servitude', nameUz: 'Ipoteka (garov) taqiqini olib tashlash' },
  { code: 'topic.13', parent: 'mortgage-servitude', nameUz: 'Servitut belgilash tartibi' },
  { code: 'topic.14', parent: 'address', nameUz: "Ko'chmas mulkka yangi manzil berish" },
  { code: 'topic.15', parent: 'address', nameUz: "Manzilni o'zgartirish yoki aniqlashtirish" },
  { code: 'topic.16', parent: 'geodesy', nameUz: 'Geodeziya-kartografiya litsenziyasi' },
  { code: 'topic.17', parent: 'geodesy', nameUz: "Yer uchastkasi chegaralarini o'lchash" },
  { code: 'topic.18', parent: 'staff-complaint', nameUz: "Xodim qabulda qo'pol muomala qildi" },
  { code: 'topic.19', parent: 'staff-complaint', nameUz: "Hujjat qabul qilinmadi yoki asossiz talab qo'yildi" },
  { code: 'topic.20', parent: 'corruption', nameUz: "Pora yoki noqonuniy to'lov so'ralgani haqida" },
  { code: 'topic.21', parent: 'other', nameUz: 'my.gov.uz orqali ariza berishda muammo' },
  { code: 'topic.22', parent: 'other', nameUz: "Hududiy bo'linma manzili va qabul vaqti" },
  { code: 'topic.23', parent: 'other', nameUz: 'Xizmatdan minnatdorchilik' },
  { code: 'topic.24', parent: 'other', nameUz: 'Boshqa masala (tavsifda yozing)' },
];

// UCM6510 dagi haqiqiy navbat raqamlari bilan almashtiriladi
const QUEUES = [
  { pbxNumber: '6500', name: 'Umumiy navbat', language: 'uz' },
  { pbxNumber: '6501', name: "Ro'yxatga olish", language: 'uz' },
  { pbxNumber: '6502', name: 'Boshqa xizmatlar', language: 'uz' },
  { pbxNumber: '6503', name: 'Geodeziya', language: 'uz' },
  { pbxNumber: '6505', name: 'Korrupsiya xabarlari', language: 'uz' },
  { pbxNumber: '6509', name: 'Rus tilidagi navbat', language: 'ru' },
];

const SETTINGS: Record<string, Prisma.InputJsonValue> = {
  working_hours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00', lunch: { start: '13:00', end: '14:00' } },
  recording_retention_days: 90,
  ticket_sla_reminder_days: 3,
};

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

  // Toifalar
  const categoryIds = new Map<string, number>();
  for (const [index, category] of CATEGORIES.entries()) {
    const row = await prisma.category.upsert({
      where: { code: category.code },
      update: { nameUz: category.nameUz, isConfidential: category.isConfidential ?? false, sortOrder: index },
      create: { ...category, sortOrder: index },
    });
    categoryIds.set(category.code, row.id);
  }

  // Mavzular: maxfiylik va ijro muddati ota toifadan olinadi
  for (const [index, topic] of TOPICS.entries()) {
    const parent = CATEGORIES.find((c) => c.code === topic.parent)!;
    const data = {
      nameUz: topic.nameUz,
      parentId: categoryIds.get(topic.parent)!,
      isConfidential: parent.isConfidential ?? false,
      sortOrder: index + 1,
    };
    await prisma.category.upsert({ where: { code: topic.code }, update: data, create: { code: topic.code, ...data } });
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

  if (process.env.SEED_DEMO_USERS !== 'false') {
    await seedDemoUsers(roleIds, {
      agency,
      callCenter,
      dkpTashkent: chamberBoards.get('toshkent-sh')!,
      antiCorruption: departments.get('central.anti-corruption')!,
    });
  }

  const units = await prisma.orgUnit.count();
  console.log(`Seed tayyor: ${REGIONS.length} hudud, ${units} bo'linma, ${SYSTEM_ROLES.length} rol, ${CATEGORIES.length} toifa`);
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
