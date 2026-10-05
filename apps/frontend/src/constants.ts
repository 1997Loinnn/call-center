import type {
  AgentStatus,
  CallDirection,
  CallResult,
  CampaignStatus,
  CampaignType,
  ContactStatus,
  DataScope,
  ExportFormat,
  TicketChannel,
  TicketStatus,
  TicketType,
} from './api/types';
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
  CampaignsManage: 'campaigns.manage',
  BlacklistManage: 'blacklist.manage',
  KnowledgeManage: 'knowledge.manage',
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
  [P.CampaignsManage]: 'Kampaniyalarni boshqarish',
  [P.BlacklistManage]: "Qora ro'yxat",
  [P.KnowledgeManage]: 'Bilimlar bazasini tahrirlash',
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
  { label: "Fuqarolar va qo'ng'iroqlar", codes: [P.CitizensRead, P.CallsRead, P.RecordingsPlay, P.TelephonyUse, P.CampaignsManage, P.BlacklistManage] },
  { label: 'Boshqaruv markazi', codes: [P.MonitoringView, P.ReportsView, P.AuditRead] },
  { label: 'Tuzilma va sozlamalar', codes: [P.OrgRead, P.OrgManage, P.UsersManage, P.SettingsManage, P.KnowledgeManage] },
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

/** Mavzu jadvali va kartalardagi qisqa nomlar */
export const TYPE_SHORT: Record<TicketType, string> = {
  INFO: "Ma'lumot",
  APPLICATION: 'Ariza/taklif',
  COMPLAINT: 'Shikoyat',
  CORRUPTION: 'Korrupsiya',
  GRATITUDE: 'Minnatdorchilik',
};

export const TYPE_ORDER: TicketType[] = ['INFO', 'APPLICATION', 'COMPLAINT', 'CORRUPTION', 'GRATITUDE'];

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
  READY: { label: "Bo'sh", tone: 'green' },
  ON_CALL: { label: 'Suhbatda', tone: 'blue' },
  WRAP_UP: { label: 'Yakunlash', tone: 'teal' },
  BREAK: { label: 'Tanaffus', tone: 'amber' },
  OFFLINE: { label: 'Oflayn', tone: 'grey' },
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

/** Fayl formati nishoni (fmt-badge) rangi */
export const FORMAT_CLASS: Record<ExportFormat, string> = { XLSX: 'fmt-xlsx', PDF: 'fmt-pdf', DOCX: 'fmt-docx', CSV: 'fmt-csv' };

export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  CALLBACK: 'Qayta aloqa',
  SURVEY: "So'rovnoma",
  REMINDER: 'Eslatma',
  INFORM: 'Xabardor qilish',
};

export const CAMPAIGN_STATUS_META: Record<CampaignStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Qoralama', tone: 'grey' },
  SCHEDULED: { label: 'Rejalashtirilgan', tone: 'blue' },
  ACTIVE: { label: 'Faol', tone: 'green' },
  PAUSED: { label: 'Pauza', tone: 'amber' },
  COMPLETED: { label: 'Yakunlangan', tone: 'teal' },
  CANCELLED: { label: 'Bekor qilingan', tone: 'red' },
};

export const CONTACT_STATUS_META: Record<ContactStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Navbatda', tone: 'grey' },
  REACHED: { label: "Bog'lanildi", tone: 'green' },
  NO_ANSWER: { label: 'Javob bermadi', tone: 'grey' },
  BUSY: { label: 'Band', tone: 'grey' },
  CALL_LATER: { label: 'Keyinroq', tone: 'amber' },
  WRONG_NUMBER: { label: "Noto'g'ri raqam", tone: 'red' },
  FAILED: { label: 'Urinishlar tugadi', tone: 'red' },
};

/** Murojaat matnidagi kalit so'z belgilari (F-AI-04) */
export const AI_FLAG_LABELS: Record<string, string> = {
  corruption: 'Korrupsiya belgisi',
  threat: 'Tahdid',
  escalation: 'Yuqoriga shikoyat',
};
