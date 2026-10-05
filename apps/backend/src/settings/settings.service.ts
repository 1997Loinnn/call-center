import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DEFAULT_KEYWORD_GROUPS, KeywordGroup } from '../ai/keywords';
import { PrismaService } from '../prisma/prisma.service';

/** Xizmat darajasi maqsadlari: jonli holat, ogohlantirishlar va hisobotlarda. */
export interface ServiceLevelSetting {
  answerWithinSeconds: number;
  targetPercent: number;
  avgWaitTargetSeconds: number;
}

/** Ogohlantirish ochilganda kimga xabar beriladi. */
export interface AlertNotifySetting {
  bell: boolean;
  sms: boolean;
  telegram: boolean;
}

/** Murojaatlar bo'yicha avtomatik amallar (CRM sozlamalari → Yo'naltirish qoidalari). */
export interface AutomationSetting {
  dueSoonReminder: boolean;
  overdueEscalation: boolean;
  smsOnCreate: boolean;
  returnToSupervisor: boolean;
  duplicateDetection: { enabled: boolean; windowHours: number; minTickets: number };
}

/** Call-markaz ish vaqti (1 = dushanba … 7 = yakshanba). */
export interface WorkingHoursSetting {
  days: number[];
  start: string;
  end: string;
  lunch: { start: string; end: string };
}

/** Fuqaroga yuboriladigan SMS matnlari; {raqam}, {manzil}, {qabul_vaqti} o'rniga qiymat qo'yiladi. */
export interface SmsTemplatesSetting {
  ticket_created: string;
  ticket_closed: string;
  callback: string;
  document_ready: string;
}

/** IVR umumiy sozlamalari (Navbatlar va IVR sahifasi). null — tanlanmagan. */
export interface IvrSetting {
  entryMenuId: number | null;
  afterHoursPromptId: number | null;
  holidayPromptId: number | null;
  /** Ish vaqtidan tashqari va bayramda ovozli xabar qoldirish (F-TEL-06) */
  voicemailAfterHours: boolean;
}

/** Oxirgi "PBX bilan sinxronlash" natijasi. checksum — yuklangan konfiguratsiya izi (o'zgarish bormi?). */
export interface IvrPublishedSetting {
  version: number;
  publishedAt: string | null;
  publishedById: number | null;
  publishedBy: string | null;
  checksum: string | null;
  applied: boolean;
  note: string | null;
}

/** Omnikanal avtomatik javoblari; {raqam} o'rniga murojaat raqami qo'yiladi. */
export interface OmniSetting {
  autoReply: boolean;
  greeting: string;
  afterHours: string;
  ticketCreated: string;
}

/** Kirish xavfsizligi (TZ 4-bo'lim): qaysi rollar uchun ikki bosqichli himoya majburiy. */
export interface SecuritySetting {
  enforceTwoFactor: boolean;
  twoFactorRoles: string[];
}

/** Baholash varaqasi bandi (F-QA-02): nomi va eng yuqori ball. */
export interface QaChecklistItem {
  item: string;
  max: number;
}

/** Xodimlarga bildirishnomalarning qo'shimcha kanallari (tizim ichidagisi doim yoqilgan). */
export interface StaffNotifySetting {
  email: boolean;
}

/** Mahalliy AI (F-AI-02/04/06): mavzu tavsiyasi, kalit so'z guruhlari va prognozdagi shrinkage. */
export interface AiSetting {
  suggestions: boolean;
  keywordGroups: KeywordGroup[];
  /** Operator vaqtining qo'ng'iroqdan tashqari ulushi (tanaffus, o'qish), 0..0.9 */
  shrinkage: number;
}

export interface SettingsMap {
  service_level: ServiceLevelSetting;
  alert_notify: AlertNotifySetting;
  automation: AutomationSetting;
  working_hours: WorkingHoursSetting;
  recording_retention_days: number;
  ticket_sla_reminder_days: number;
  sms_templates: SmsTemplatesSetting;
  ivr: IvrSetting;
  ivr_published: IvrPublishedSetting;
  omni: OmniSetting;
  staff_notify: StaffNotifySetting;
  security: SecuritySetting;
  qa_checklist: QaChecklistItem[];
  ai: AiSetting;
}

// Seed bilan bir xil standart qiymatlar: bazada yozuv bo'lmasa yoki maydon yetishmasa ishlatiladi
export const SETTING_DEFAULTS: SettingsMap = {
  service_level: { answerWithinSeconds: 20, targetPercent: 80, avgWaitTargetSeconds: 30 },
  alert_notify: { bell: true, sms: true, telegram: false },
  automation: {
    dueSoonReminder: true,
    overdueEscalation: true,
    smsOnCreate: true,
    returnToSupervisor: true,
    duplicateDetection: { enabled: true, windowHours: 720, minTickets: 3 },
  },
  working_hours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00', lunch: { start: '13:00', end: '14:00' } },
  recording_retention_days: 90,
  ticket_sla_reminder_days: 3,
  sms_templates: {
    ticket_created: 'Kadastr agentligi 1097: murojaatingiz qabul qilindi. Raqami: {raqam}. Holatini 1097 orqali bilishingiz mumkin.',
    ticket_closed: "Kadastr agentligi 1097: {raqam} raqamli murojaatingiz ko'rib chiqildi va yopildi. Javob bilan 1097 orqali tanishishingiz mumkin.",
    callback: "Kadastr agentligi 1097: qo'ng'iroqingiz qayd etildi, operator tez orada siz bilan bog'lanadi.",
    document_ready: 'Kadastr agentligi: hujjatingiz tayyor. Manzil: {manzil}. Qabul vaqti: {qabul_vaqti}.',
  },
  staff_notify: { email: true },
  ai: { suggestions: true, keywordGroups: DEFAULT_KEYWORD_GROUPS, shrinkage: 0.3 },
  // Baholash varaqasi: jami 100 ball (supervisor yozuvni tinglab baholaydi)
  qa_checklist: [
    { item: "Salomlashish va o'zini tanishtirish", max: 10 },
    { item: 'Fuqaroni diqqat bilan tinglash', max: 20 },
    { item: "To'g'ri va to'liq ma'lumot berish", max: 30 },
    { item: 'Xushmuomalalik va nutq madaniyati', max: 20 },
    { item: "Murojaatni to'g'ri rasmiylashtirish", max: 10 },
    { item: 'Suhbatni yakunlash', max: 10 },
  ],
  // TZ: rahbariyat, supervisor va administratorlar uchun majburiy. Yoqilganda bu rollar keyingi kirishda ilovani ulaydi.
  security: { enforceTwoFactor: false, twoFactorRoles: ['ADMIN', 'DIRECTOR', 'LEADERSHIP', 'SUPERVISOR'] },
  ivr: { entryMenuId: null, afterHoursPromptId: null, holidayPromptId: null, voicemailAfterHours: true },
  ivr_published: { version: 0, publishedAt: null, publishedById: null, publishedBy: null, checksum: null, applied: false, note: null },
  omni: {
    autoReply: true,
    greeting:
      "Assalomu alaykum! Kadastr agentligining 1097 ishonch xizmatiga yozganingiz uchun rahmat. Savolingizni batafsil yozing — operator tez orada javob beradi. Murojaat holatini bilish uchun uning raqamini yuboring (masalan, 1097-2026-000123).",
    afterHours:
      "Hozir ish vaqtidan tashqari (operatorlar dushanba–juma 09:00–18:00 da ishlaydi). Xabaringiz saqlandi — ish vaqti boshlanishi bilan javob beramiz.",
    ticketCreated: "Murojaatingiz ro'yxatga olindi. Raqami: {raqam}. Holatini shu yerda raqamni yuborib bilishingiz mumkin.",
  },
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Saqlangan qiymatni standart qiymat ustiga qo'yadi: faqat ma'lum maydonlar va to'g'ri turdagi qiymatlar olinadi. */
export function mergeSetting<T>(defaults: T, stored: unknown): T {
  // Oddiy qiymat (son, matn): saqlangani shu turda bo'lsa — o'zi
  if (!isObject(defaults)) return (stored !== undefined && stored !== null && typeof stored === typeof defaults ? stored : defaults) as T;
  if (!isObject(stored)) return defaults;
  const result: Record<string, unknown> = { ...defaults };
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = stored[key];
    if (isObject(fallback)) result[key] = mergeSetting(fallback, value);
    // Standarti null bo'lgan maydon (masalan, tanlanmagan menyu id'si): oddiy qiymat yoki null, obyekt emas
    // (typeof null === 'object' bo'lgani uchun bu tekshiruv umumiy tur solishtirishidan oldin)
    else if (fallback === null) {
      if (value === null || (value !== undefined && typeof value !== 'object')) result[key] = value;
    } else if (value !== undefined && typeof value === typeof fallback) result[key] = value;
  }
  return result as T;
}

/** settings jadvalidagi JSON sozlamalarga tipli kirish. */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get<K extends keyof SettingsMap>(key: K): Promise<SettingsMap[K]> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    return mergeSetting(SETTING_DEFAULTS[key], row?.value);
  }

  async set<K extends keyof SettingsMap>(key: K, value: SettingsMap[K], actorId?: number): Promise<SettingsMap[K]> {
    const merged = mergeSetting(SETTING_DEFAULTS[key], value);
    const json = merged as unknown as Prisma.InputJsonValue;
    await this.prisma.setting.upsert({
      where: { key },
      update: { value: json, updatedById: actorId },
      create: { key, value: json, updatedById: actorId },
    });
    return merged;
  }
}

@Global()
@Module({
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
