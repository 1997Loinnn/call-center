import type { AgentStatus, CallDirection, CallResult, DataScope, TicketChannel, TicketStatus, TicketType } from './api/types';
import type { Tone } from './theme';

// Backend ruxsatlari bilan bir xil (apps/backend/src/common/permissions.ts)
export const P = {
  TicketsRead: 'tickets.read',
  TicketsCreate: 'tickets.create',
  TicketsRoute: 'tickets.route',
  TicketsAssign: 'tickets.assign',
  TicketsAnswer: 'tickets.answer',
  TicketsApprove: 'tickets.approve',
  TicketsReopen: 'tickets.reopen',
  TicketsConfidential: 'tickets.confidential',
  CitizensRead: 'citizens.read',
  CallsRead: 'calls.read',
  RecordingsPlay: 'recordings.play',
  TelephonyUse: 'telephony.use',
  MonitoringView: 'monitoring.view',
  ReportsView: 'reports.view',
  OrgRead: 'org.read',
  OrgManage: 'org.manage',
  UsersManage: 'users.manage',
  SettingsManage: 'settings.manage',
  AuditRead: 'audit.read',
} as const;

export const PERMISSION_LABELS: Record<string, string> = {
  [P.TicketsRead]: "Murojaatlarni ko'rish",
  [P.TicketsCreate]: 'Murojaat yaratish',
  [P.TicketsRoute]: "Yo'naltirish",
  [P.TicketsAssign]: 'Ijrochiga taqsimlash',
  [P.TicketsAnswer]: 'Javob yozish',
  [P.TicketsApprove]: 'Javobni tasdiqlash',
  [P.TicketsReopen]: 'Qayta ochish',
  [P.TicketsConfidential]: 'Maxfiy murojaatlar',
  [P.CitizensRead]: 'Fuqaro kartasi',
  [P.CallsRead]: "Qo'ng'iroqlar jurnali",
  [P.RecordingsPlay]: 'Yozuvlarni tinglash',
  [P.TelephonyUse]: 'Softfon',
  [P.MonitoringView]: 'Monitoring',
  [P.ReportsView]: 'Hisobotlar',
  [P.OrgRead]: "Tuzilmani ko'rish",
  [P.OrgManage]: 'Tuzilmani boshqarish',
  [P.UsersManage]: 'Foydalanuvchilar',
  [P.SettingsManage]: 'Sozlamalar',
  [P.AuditRead]: 'Audit jurnali',
};

/** Rol tahrirlagichi va huquqlar matritsasi uchun ruxsatlar guruhlari. */
export const PERMISSION_GROUPS: { label: string; codes: string[] }[] = [
  {
    label: 'Murojaatlar',
    codes: [P.TicketsRead, P.TicketsCreate, P.TicketsRoute, P.TicketsAssign, P.TicketsAnswer, P.TicketsApprove, P.TicketsReopen, P.TicketsConfidential],
  },
  { label: "Fuqarolar va qo'ng'iroqlar", codes: [P.CitizensRead, P.CallsRead, P.RecordingsPlay, P.TelephonyUse] },
  { label: 'Boshqaruv markazi', codes: [P.MonitoringView, P.ReportsView, P.AuditRead] },
  { label: 'Tuzilma va sozlamalar', codes: [P.OrgRead, P.OrgManage, P.UsersManage, P.SettingsManage] },
];

/** Shaxsiy yoki maxfiy ma'lumotga kirish beradigan ruxsatlar: berishda ehtiyot bo'lish kerak. */
export const SENSITIVE_PERMISSIONS: string[] = [P.TicketsConfidential, P.CitizensRead, P.RecordingsPlay, P.AuditRead, P.UsersManage];

export const STATUS_META: Record<TicketStatus, { label: string; tone: Tone }> = {
  NEW: { label: 'Yangi', tone: 'blue' },
  ROUTED: { label: "Yo'naltirildi", tone: 'teal' },
  IN_PROGRESS: { label: 'Ijroda', tone: 'amber' },
  ANSWERED: { label: 'Javob tayyorlandi', tone: 'violet' },
  CLOSED: { label: 'Yopildi', tone: 'green' },
  RETURNED: { label: 'Qaytarildi', tone: 'pink' },
};

export const TYPE_LABELS: Record<TicketType, string> = {
  INFO: "Ma'lumot so'rash",
  APPLICATION: 'Ariza yoki taklif',
  COMPLAINT: 'Shikoyat',
  CORRUPTION: 'Korrupsiya xabari',
  GRATITUDE: 'Minnatdorchilik',
};

export const CHANNEL_LABELS: Record<TicketChannel, string> = {
  PHONE: 'Telefon',
  VOICEMAIL: 'Ovozli xabar',
  TELEGRAM: 'Telegram',
  WEBCHAT: 'Veb-chat',
  EMAIL: 'Email',
};

export const CALL_RESULT_META: Record<CallResult, { label: string; tone: Tone }> = {
  ANSWERED: { label: 'Javob berildi', tone: 'green' },
  ABANDONED: { label: 'Kutib uzildi', tone: 'red' },
  NO_ANSWER: { label: 'Javobsiz', tone: 'red' },
  BUSY: { label: 'Band', tone: 'grey' },
  FAILED: { label: 'Xato', tone: 'red' },
  IVR_ONLY: { label: 'IVR da yakunlandi', tone: 'teal' },
  VOICEMAIL: { label: 'Ovozli xabar', tone: 'violet' },
};

export const DIRECTION_LABELS: Record<CallDirection, string> = {
  INBOUND: 'Kiruvchi',
  OUTBOUND: 'Chiquvchi',
  INTERNAL: 'Ichki',
};

export const SCOPE_LABELS: Record<DataScope, string> = {
  OWN: "Faqat o'zi",
  UNIT: "O'z bo'linmasi",
  UNIT_TREE: "Bo'linma va quyi bo'linmalar",
  ALL: 'Butun tizim',
};

export const AGENT_STATUS_META: Record<AgentStatus, { label: string; tone: Tone }> = {
  READY: { label: 'Tayyor', tone: 'green' },
  ON_CALL: { label: 'Suhbatda', tone: 'blue' },
  WRAP_UP: { label: "Qo'ng'iroqdan keyingi ish", tone: 'teal' },
  BREAK: { label: 'Tanaffus', tone: 'amber' },
  OFFLINE: { label: 'Offline', tone: 'grey' },
};

export const EVENT_LABELS: Record<string, string> = {
  CREATED: 'Yaratildi',
  ROUTED: "Yo'naltirildi",
  ASSIGNED: 'Ijrochiga berildi',
  RETURNED: 'Qaytarildi',
  ANSWERED: 'Javob yozildi',
  APPROVED: 'Tasdiqlandi va yopildi',
  REJECTED: 'Javob rad etildi',
  REOPENED: 'Qayta ochildi',
  CLOSED: 'Yopildi',
  ESCALATED: 'Eskalatsiya',
  COMMENT: 'Izoh',
};

export const ORG_TYPE_LABELS: Record<string, string> = {
  AGENCY: 'Agentlik',
  CALL_CENTER: 'Call-markaz',
  CENTRAL_OFFICE: 'Markaziy apparat',
  DEPARTMENT: "Bo'lim",
  REGIONAL_OFFICE: 'Hududiy boshqarma',
  CHAMBER: 'DKP',
  CHAMBER_REGIONAL: 'DKP boshqarmasi',
  CHAMBER_BRANCH: 'DKP filiali',
  SUBORDINATE_ORG: 'Tasarrufidagi tashkilot',
};
