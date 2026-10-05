import { Prisma, TicketStatus, TicketType } from '@prisma/client';
import { TYPE_LABELS } from '../tickets/ticket-export';
import { STATUS_LABELS } from '../tickets/ticket-workflow';

/** Audit jurnali toifalari (prototip: Hammasi, Kirish va xavfsizlik, Murojaatlar, Yozuvlar, Sozlamalar va rollar, Eksport). */
export const AUDIT_CATEGORIES = {
  security: { label: 'Kirish va xavfsizlik', actions: ['auth.', 'user.unlock', 'user.reset_password', 'user.reset_2fa'] },
  tickets: { label: 'Murojaatlar', actions: ['ticket.view', 'ticket.create', 'ticket.transition', 'ticket.task.', 'ticket.participant.', 'ticket.attachment.', 'citizen.', 'ai.flag'] },
  recordings: { label: 'Yozuvlar', actions: ['recording.', 'call.listen', 'qa.'] },
  settings: {
    label: 'Sozlamalar va rollar',
    actions: ['role.', 'user.create', 'user.update', 'org.', 'category.', 'routing.', 'export_template.', 'alert_rule.', 'settings.', 'campaign.', 'alert.', 'ivr.', 'blacklist.', 'knowledge.', 'tariff.', 'billing.'],
  },
  export: { label: 'Eksport', actions: ['ticket.export', 'report.export', 'report.scheduled', 'audit.export', 'calls.export'] },
} as const;

export type AuditCategory = keyof typeof AUDIT_CATEGORIES;

export const AUDIT_CATEGORY_KEYS = Object.keys(AUDIT_CATEGORIES) as AuditCategory[];

/** Toifa sharti: amal nomi ro'yxatdagi prefikslardan biri bilan boshlanadi ("." bilan tugamasa — aniq nom). */
export function categoryWhere(category: AuditCategory): Prisma.AuditLogWhereInput {
  return {
    OR: AUDIT_CATEGORIES[category].actions.map((a) => (a.endsWith('.') ? { action: { startsWith: a } } : { action: a })),
  };
}

export function categoryOf(action: string): AuditCategory | null {
  // Eksport toifasi birinchi: "ticket.export" murojaatlar emas, eksport hisoblanadi
  const order: AuditCategory[] = ['export', 'security', 'tickets', 'recordings', 'settings'];
  return order.find((key) => AUDIT_CATEGORIES[key].actions.some((a) => (a.endsWith('.') ? action.startsWith(a) : action === a))) ?? null;
}

export const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Kirish',
  'auth.login_failed': 'Kirish xatosi',
  'auth.login_locked': 'Bloklash',
  'auth.code_sent': 'SMS kod',
  'auth.code_failed': 'SMS kod',
  'auth.2fa_failed': '2FA xatosi',
  'auth.2fa_enabled': '2FA yoqildi',
  'auth.2fa_disabled': "2FA o'chirildi",
  'user.reset_2fa': '2FA bekor qilindi',
  'ticket.view': "Ko'rish",
  'ticket.create': 'Yaratish',
  'ticket.transition': "Holat o'zgarishi",
  'ticket.export': 'Eksport',
  'ticket.task.create': 'Vazifa',
  'ticket.task.update': 'Vazifa',
  'ticket.participant.add': 'Ishtirokchi',
  'ticket.participant.remove': 'Ishtirokchi',
  'ticket.attachment.add': 'Fayl',
  'ticket.attachment.download': 'Fayl',
  'ticket.attachment.delete': "Fayl o'chirildi",
  'citizen.view': 'Fuqaro kartasi',
  'recording.play': 'Yozuvni tinglash',
  'recording.download': 'Yozuvni yuklash',
  'recording.hold': "Saqlab qo'yish",
  'recording.purge': "Muddati tugagan yozuvlar",
  'call.listen': 'Suhbatni tinglash',
  'qa.evaluate': 'Baholash',
  'role.create': 'Rol yaratish',
  'role.update': "Rol o'zgarishi",
  'role.delete': "Rol o'chirish",
  'user.create': 'Foydalanuvchi',
  'user.update': 'Tahrirlash',
  'user.reset_password': 'Parol almashtirish',
  'user.unlock': 'Blokdan chiqarish',
  'org.create': "Bo'linma",
  'org.update': "Bo'linma",
  'category.create': 'Sozlama',
  'category.update': 'Sozlama',
  'routing.create': "Yo'naltirish",
  'routing.update': "Yo'naltirish",
  'routing.delete': "Yo'naltirish",
  'export_template.create': 'Sozlama',
  'export_template.update': 'Sozlama',
  'export_template.delete': 'Sozlama',
  'alert_rule.update': 'Sozlama',
  'settings.update': 'Sozlama',
  'campaign.create': 'Kampaniya',
  'campaign.update': 'Kampaniya',
  'campaign.contacts': 'Kampaniya',
  'blacklist.add': "Qora ro'yxat",
  'knowledge.create': 'Bilimlar bazasi',
  'knowledge.update': 'Bilimlar bazasi',
  'knowledge.delete': 'Bilimlar bazasi',
  'blacklist.remove': "Qora ro'yxat",
  'tariff.create': 'Tarif',
  'tariff.update': 'Tarif',
  'tariff.close': 'Tarif',
  'tariff.delete': 'Tarif',
  'billing.recalculate': 'Xarajatlar',
  'billing.limit_create': 'Xarajat limiti',
  'billing.limit_update': 'Xarajat limiti',
  'billing.limit_delete': 'Xarajat limiti',
  'billing.limit_warning': 'Xarajat limiti',
  'billing.limit_exceeded': 'Xarajat limiti',
  'alert.acknowledge': 'Ogohlantirish',
  'alert.resolve': 'Ogohlantirish',
  'report.export': 'Eksport',
  'report.scheduled': 'Hisobot emailga',
  'ai.flag': "Kalit so'z belgisi",
  'audit.export': 'Eksport',
  'calls.export': 'Eksport',
  'ivr.settings': 'IVR',
  'ivr.publish': 'PBX sinxronlash',
  'ivr.menu.create': 'IVR menyu',
  'ivr.menu.update': 'IVR menyu',
  'ivr.menu.delete': 'IVR menyu',
  'ivr.prompt.create': 'Ovozli xabar',
  'ivr.prompt.update': 'Ovozli xabar',
  'ivr.prompt.delete': 'Ovozli xabar',
  'ivr.queue.create': 'Navbat',
  'ivr.queue.update': 'Navbat',
};

/** Xavfsizlik nuqtai nazaridan e'tibor talab qiladigan amallar (qizil belgi). */
const ALERTING = new Set(['ai.flag', 'billing.limit_exceeded', 'auth.login_failed', 'auth.login_locked', 'auth.2fa_failed', 'auth.2fa_disabled', 'user.reset_2fa', 'call.listen', 'role.delete']);

const FIELD_LABELS: Record<string, string> = {
  status: 'holat',
  orgUnit: "bo'linma",
  assignee: 'ijrochi',
  name: 'nomi',
  nameUz: 'nomi',
  slaDays: 'ijro muddati',
  isConfidential: 'maxfiy',
  isActive: 'faol',
  ticketTypes: 'murojaat turlari',
  priority: 'ustuvorlik',
  categoryId: 'toifa',
  regionId: 'hudud',
  districtId: 'tuman',
  targetOrgUnitId: "mas'ul bo'linma",
  format: 'format',
  source: 'manba',
  columns: 'ustunlar',
  schedule: 'jadval',
  recipientRoles: 'qabul qiluvchilar',
  threshold: 'limit',
  maxAttempts: 'urinishlar',
  scope: "ko'rish doirasi",
  bell: 'bildirishnoma',
  sms: 'SMS',
  telegram: 'Telegram',
  fullName: 'F.I.Sh.',
  orgUnitId: "bo'linma",
  roleCodes: 'rollar',
  sipExtension: 'SIP',
  direction: "yo'nalish",
  prefix: 'prefiks',
  pricePerMinute: 'daqiqa narxi',
  billingStepSec: 'tariflash qadami',
  validFrom: 'amal qilish boshi',
  validTo: 'amal qilish oxiri',
  monthlyAmount: 'oylik limit',
  warnPercent: 'ogohlantirish %',
  userId: 'operator',
  phone: 'telefon',
  email: 'email',
  title: 'vazifa',
  completed: 'bajarildi',
  participant: 'ishtirokchi',
  legalHold: "saqlab qo'yilgan",
  code: 'kod',
  language: 'til',
  text: 'matn',
  audio: 'audio fayl',
  promptId: 'ovozli xabar',
  timeoutSeconds: 'kutish, s',
  maxRetries: 'urinishlar',
  fallbackQueueId: 'zaxira navbat',
  entryMenuId: "boshlang'ich menyu",
  afterHoursPromptId: 'ish vaqtidan tashqari xabar',
  holidayPromptId: 'bayram xabari',
  voicemailAfterHours: 'ovozli xabar qoldirish',
  pbxNumber: 'navbat raqami',
  description: 'tavsif',
  strategy: 'taqsimlash',
  maxWaitSeconds: 'callback chegarasi, s',
  callbackEnabled: "qayta qo'ng'iroq",
  announcePosition: "o'rnini aytish",
  announceEverySeconds: "o'rnini aytish oralig'i, s",
  musicOnHold: 'kutish musiqasi',
  wrapUpSeconds: "qo'ng'iroqdan keyingi ish, s",
  isRestricted: 'cheklangan',
  members: 'operatorlar',
  penalty: 'ustuvorlik',
  greeting: 'salomlashish',
  afterHours: 'ish vaqtidan tashqari javob',
  ticketCreated: "murojaat ro'yxatga olindi",
  autoReply: 'avtomatik javob',
};

export interface AuditChange {
  field: string;
  from: string | null;
  to: string | null;
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Enum qiymatlari o'zbekcha: murojaat holati va turi. */
function label(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return STATUS_LABELS[value as TicketStatus] ?? TYPE_LABELS[value as TicketType] ?? value;
}

function show(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? 'ha' : "yo'q";
  if (Array.isArray(value)) return value.length ? value.map(label).join(', ') : null;
  if (typeof value === 'string') return String(label(value));
  if (isObject(value)) return JSON.stringify(value);
  return String(value);
}

/** details dan "O'zgarish" jadvali: { changes: { maydon: {from, to} } }, rol formati (added/removed) yoki eski {maydon: {from,to}}. */
export function changesOf(action: string, details: unknown): AuditChange[] {
  if (!isObject(details)) return [];
  const result: AuditChange[] = [];
  const pairs = isObject(details.changes) ? details.changes : details;
  for (const [key, value] of Object.entries(pairs)) {
    if (isObject(value) && ('from' in value || 'to' in value)) {
      result.push({ field: FIELD_LABELS[key] ?? key, from: show(value.from), to: show(value.to) });
    }
  }
  if (action.startsWith('role.')) {
    if (Array.isArray(details.added) && details.added.length) result.push({ field: "qo'shilgan huquqlar", from: null, to: details.added.join(', ') });
    if (Array.isArray(details.removed) && details.removed.length) result.push({ field: 'olingan huquqlar', from: details.removed.join(', '), to: null });
  }
  if (action === 'user.update' && result.length === 0) {
    for (const [key, value] of Object.entries(details)) {
      if (key !== 'password') result.push({ field: FIELD_LABELS[key] ?? key, from: null, to: show(value) });
    }
  }
  return result;
}

/** Qisqa tavsif (jadvaldagi "Tafsilot" ustuni). */
export function summaryOf(action: string, details: unknown, changes: AuditChange[]): string {
  const d = isObject(details) ? details : {};
  switch (action) {
    case 'auth.login':
      return `${d.method === 'sms' ? 'SMS kod' : 'Login + parol'}${d.twoFactor ? ' + 2FA' : ''} · muvaffaqiyatli`;
    case 'auth.code_sent':
      return 'Kirish kodi SMS orqali yuborildi';
    case 'auth.2fa_failed':
      return "Ikki bosqichli himoya kodi noto'g'ri";
    case 'auth.login_failed':
      return d.locked ? "Noto'g'ri parol — hisob vaqtincha bloklandi" : `Noto'g'ri parol${d.username ? ` · login «${String(d.username)}»` : ''}`;
    case 'auth.login_locked':
      return 'Bloklangan hisobga kirishga urinish';
    case 'ticket.view':
      return "Murojaat kartasi ochildi";
    case 'citizen.view':
      return 'Fuqaro kartasi ochildi';
    case 'ticket.attachment.add':
      return `${String(d.number ?? '')} · fayl qo'shildi: ${String(d.fileName ?? '')}`;
    case 'ticket.attachment.download':
      return `${String(d.number ?? '')} · fayl ochildi: ${String(d.fileName ?? '')}`;
    case 'ticket.attachment.delete':
      return `${String(d.number ?? '')} · fayl o'chirildi: ${String(d.fileName ?? '')}`;
    case 'recording.play':
      return 'Yozuv tinglandi';
    case 'recording.download':
      return 'Yozuv yuklab olindi';
    case 'qa.evaluate':
      return `${String(d.agent ?? '')} · ${String(d.score ?? '')} ball`;
    case 'recording.purge':
      return `Saqlash muddati tugagan ${String(d.count ?? 0)} ta yozuv o'chirildi`;
    case 'call.listen':
      return `Jonli suhbat tinglandi: ${String(d.agent ?? '')}${d.sip ? ` (SIP ${String(d.sip)})` : ''}`;
    case 'ticket.export': {
      if (d.document) return `${String(d.document)} (${String(d.format ?? '')})`;
      const filters = isObject(d.filters)
        ? Object.entries(d.filters).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${FIELD_LABELS[k] ?? k}: ${String(label(v))}`)
        : [];
      return `${filters.length ? `Filtr: ${filters.join(', ')} · ` : ''}${String(d.rows ?? 0)} ta yozuv`;
    }
    case 'ai.flag':
      return `${String(d.number ?? '')} · ${Array.isArray(d.flags) ? d.flags.join(', ') : ''}`;
    case 'report.scheduled':
      return [d.name, d.period, d.note, d.manual ? "qo'lda" : "jadval bo'yicha"].filter(Boolean).join(' · ');
    case 'report.export':
      return [d.name, d.format, d.period, d.rows !== undefined ? `${String(d.rows)} qator` : null].filter(Boolean).join(' · ');
    case 'audit.export':
    case 'calls.export':
      return `${String(d.rows ?? 0)} ta yozuv`;
    case 'ticket.create':
      return [d.type, d.topic].filter(Boolean).map(label).join(' · ') || `Holat: ${String(label(d.status) ?? '')}`;
    case 'user.reset_password':
      return 'Parol almashtirildi';
    case 'user.unlock':
      return 'Blok olib tashlandi';
    case 'user.create':
      return `Login ${String(d.username ?? '')}${Array.isArray(d.roleCodes) ? ` · rollar: ${d.roleCodes.join(', ')}` : ''}`;
    case 'alert.acknowledge':
    case 'alert.resolve':
      return String(d.message ?? '');
    case 'blacklist.add':
      return `${String(d.phone ?? '')} qo'shildi · ${String(d.reason ?? '')}`;
    case 'tariff.close':
      return `${String(d.name ?? '')} · hisob-kitobda ishlatilgani uchun muddati yopildi`;
    case 'billing.recalculate':
      return `${String(d.calls ?? 0)} ta chiquvchi qo'ng'iroq qayta narxlandi · jami ${String(d.total ?? 0)} so'm`;
    case 'billing.limit_warning':
    case 'billing.limit_exceeded':
      return `${String(d.name ?? '')} · ${String(d.spent ?? 0)} / ${String(d.limit ?? 0)} so'm`;
    case 'blacklist.remove':
      return `${String(d.phone ?? '')} olib tashlandi`;
    case 'ivr.publish':
      return `${String(d.name ?? '')} · ${d.applied ? 'PBX qabul qildi' : 'PBX ga yuklanmadi'}${d.note ? ` · ${String(d.note)}` : ''}`;
    default: {
      const text = changes.map((c) => `${c.field}: ${c.from ?? '—'} → ${c.to ?? '—'}`).join('; ');
      const head = d.name ?? d.nameUz ?? d.code;
      return [head ? String(head) : null, text || null, d.comment ? `izoh: ${String(d.comment)}` : null].filter(Boolean).join(' · ');
    }
  }
}

export function toneOf(action: string): 'red' | 'grey' {
  return ALERTING.has(action) ? 'red' : 'grey';
}

/** "Chrome 129 · Windows 10" */
export function browserOf(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const browser =
    /Edg\/(\d+)/.exec(userAgent)?.[1] !== undefined
      ? `Edge ${/Edg\/(\d+)/.exec(userAgent)![1]}`
      : /Firefox\/(\d+)/.test(userAgent)
        ? `Firefox ${/Firefox\/(\d+)/.exec(userAgent)![1]}`
        : /Chrome\/(\d+)/.test(userAgent)
          ? `Chrome ${/Chrome\/(\d+)/.exec(userAgent)![1]}`
          : /Version\/(\d+).*Safari/.test(userAgent)
            ? `Safari ${/Version\/(\d+)/.exec(userAgent)![1]}`
            : 'Boshqa brauzer';
  const os = /Windows NT 10/.test(userAgent)
    ? 'Windows 10'
    : /Windows/.test(userAgent)
      ? 'Windows'
      : /Android/.test(userAgent)
        ? 'Android'
        : /iPhone|iPad/.test(userAgent)
          ? 'iOS'
          : /Mac OS X/.test(userAgent)
            ? 'macOS'
            : /Linux/.test(userAgent)
              ? 'Linux'
              : null;
  return os ? `${browser} · ${os}` : browser;
}
