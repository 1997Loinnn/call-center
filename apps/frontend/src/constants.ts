import type { AgentStatus, CallDirection, CallResult, DataScope, TicketChannel, TicketStatus, TicketType } from './api/types';

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

export const STATUS_META: Record<TicketStatus, { label: string; color: string }> = {
  NEW: { label: 'Yangi', color: 'blue' },
  ROUTED: { label: "Yo'naltirildi", color: 'geekblue' },
  IN_PROGRESS: { label: 'Ijroda', color: 'gold' },
  ANSWERED: { label: 'Javob tayyorlandi', color: 'cyan' },
  CLOSED: { label: 'Yopildi', color: 'green' },
  RETURNED: { label: 'Qaytarildi', color: 'volcano' },
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

export const CALL_RESULT_META: Record<CallResult, { label: string; color: string }> = {
  ANSWERED: { label: 'Javob berildi', color: 'green' },
  ABANDONED: { label: "Kutib uzildi", color: 'red' },
  NO_ANSWER: { label: 'Javobsiz', color: 'orange' },
  BUSY: { label: 'Band', color: 'orange' },
  FAILED: { label: 'Xato', color: 'red' },
  IVR_ONLY: { label: 'IVR da yakunlandi', color: 'default' },
  VOICEMAIL: { label: 'Ovozli xabar', color: 'purple' },
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

export const AGENT_STATUS_META: Record<AgentStatus, { label: string; color: string }> = {
  READY: { label: 'Tayyor', color: 'green' },
  ON_CALL: { label: 'Suhbatda', color: 'blue' },
  WRAP_UP: { label: "Qo'ng'iroqdan keyingi ish", color: 'gold' },
  BREAK: { label: 'Tanaffus', color: 'orange' },
  OFFLINE: { label: 'Offline', color: 'default' },
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
