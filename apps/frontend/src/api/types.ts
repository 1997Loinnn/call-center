// Backend javoblari tiplari (apps/backend/src dagi DTO va Prisma select'lar bilan mos)

export type DataScope = 'OWN' | 'UNIT' | 'UNIT_TREE' | 'ALL';
export type TicketStatus = 'NEW' | 'ROUTED' | 'IN_PROGRESS' | 'ANSWERED' | 'CLOSED' | 'RETURNED';
export type TicketType = 'INFO' | 'APPLICATION' | 'COMPLAINT' | 'CORRUPTION' | 'GRATITUDE';
export type TicketChannel = 'PHONE' | 'VOICEMAIL' | 'TELEGRAM' | 'WEBCHAT' | 'EMAIL';
export type CallResult = 'ANSWERED' | 'ABANDONED' | 'NO_ANSWER' | 'BUSY' | 'FAILED' | 'IVR_ONLY' | 'VOICEMAIL';
export type CallDirection = 'INBOUND' | 'OUTBOUND' | 'INTERNAL';
export type AgentStatus = 'READY' | 'ON_CALL' | 'WRAP_UP' | 'BREAK' | 'OFFLINE';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  orgUnitId: number;
  orgUnitPath: string;
  orgUnitName: string;
  sipExtension: string | null;
  roles: string[];
  permissions: string[];
  scope: DataScope;
  /** Ikki bosqichli himoya yoqilganmi */
  twoFactor: boolean;
}

interface Named {
  id: number;
  name: string;
}

interface Person {
  id: number;
  fullName: string;
}

export interface TicketListItem {
  id: number;
  number: string;
  channel: TicketChannel;
  type: TicketType;
  status: TicketStatus;
  subject: string;
  isAnonymous: boolean;
  isConfidential: boolean;
  /** Kalit so'z belgilari (F-AI-04): corruption | threat | escalation */
  aiFlags: string[];
  createdAt: string;
  dueAt: string | null;
  closedAt: string | null;
  category: { id: number; nameUz: string } | null;
  region: { id: number; nameUz: string } | null;
  assignedOrgUnit: Named | null;
  assignee: Person | null;
  citizen: { id: number; phone: string; fullName: string | null } | null;
}

export interface TicketEvent {
  id: number;
  type: string;
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus | null;
  comment: string | null;
  createdAt: string;
  actor: Person | null;
  orgUnit: Named | null;
}

export interface TicketDetail extends Omit<TicketListItem, 'assignedOrgUnit' | 'category' | 'citizen'> {
  description: string;
  updatedAt: string;
  category: { id: number; nameUz: string; slaDays: number; sortOrder: number; parent: { id: number; nameUz: string } | null } | null;
  citizen: { id: number; phone: string; fullName: string | null; address: string | null; extraPhones: string[] } | null;
  /** Qo'shimcha mavzular (asosiysi — category) */
  extraTopics: { category: { id: number; nameUz: string; sortOrder: number; parent: { id: number; nameUz: string } | null } }[];
  /** Ishtirokchi (hamkor) bo'linmalar */
  participants: { createdAt: string; orgUnit: Named; addedBy: Person | null }[];
  attachments: { id: number; fileName: string; mimeType: string; sizeBytes: number; createdAt: string; uploadedBy: Person | null }[];
  cadastreNumber: string | null;
  applicationNumber: string | null;
  answer: string | null;
  answeredAt: string | null;
  assigneeId: number | null;
  district: { id: number; nameUz: string } | null;
  createdBy: Person | null;
  assignedOrgUnit: (Named & { path: string }) | null;
  events: TicketEvent[];
  calls: { id: number; startedAt: string; talkSeconds: number; result: CallResult | null }[];
  /** Takroriy murojaat: asl murojaat va shu mavzudagi takrorlar (F-CRM-08) */
  duplicateOf: { id: number; number: string; status: TicketStatus; createdAt: string } | null;
  duplicates: { id: number; number: string; status: TicketStatus; createdAt: string }[];
  /** Fuqaroga yuborilgan SMS (F-NOT-01) */
  smsMessages: { id: number; phone: string; text: string; status: SmsStatus; error: string | null; createdAt: string; deliveredAt: string | null }[];
}

export type SmsStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED';

export interface TicketCounts {
  total: number;
  byStatus: Partial<Record<TicketStatus, number>>;
  overdue: number;
}

export interface Category {
  id: number;
  parentId: number | null;
  code: string;
  nameUz: string;
  slaDays: number;
  isConfidential: boolean;
  /** Mavzular uchun operator kartasidagi raqam */
  sortOrder: number;
  /** Mavzu qaysi murojaat turlarida chiqadi; bo'sh = barchasida */
  ticketTypes: TicketType[];
}

/** CRM sozlamalari: nofaollari bilan va murojaatlar soni */
export interface CategoryAdmin extends Category {
  isActive: boolean;
  ticketCount: number;
}

export interface RoutingRuleRow {
  id: number;
  categoryId: number | null;
  regionId: number | null;
  districtId: number | null;
  targetOrgUnitId: number;
  priority: number;
  isActive: boolean;
  category: { id: number; nameUz: string } | null;
  region: { id: number; nameUz: string } | null;
  district: { id: number; nameUz: string } | null;
  targetOrgUnit: { id: number; name: string; isActive: boolean };
}

export interface AutomationSetting {
  dueSoonReminder: boolean;
  overdueEscalation: boolean;
  smsOnCreate: boolean;
  returnToSupervisor: boolean;
  duplicateDetection: { enabled: boolean; windowHours: number; minTickets: number };
}

export type ExportFormat = 'XLSX' | 'PDF' | 'DOCX' | 'CSV';

export interface ExportTemplateRow {
  id: number;
  code: string;
  name: string;
  format: ExportFormat;
  source: string;
  columns: string[];
  schedule: string | null;
  recipientRoles: string[];
  isActive: boolean;
  /** Jadval bo'yicha oxirgi yuborish (emailga) */
  lastRunAt: string | null;
  lastRunStatus: 'ok' | 'partial' | 'error' | null;
  lastRunNote: string | null;
}

export interface ReportSourceInfo {
  label: string;
  columns: string[];
  formats: ExportFormat[];
  periodic: boolean;
}

export interface ExportTemplatesResponse {
  templates: ExportTemplateRow[];
  sources: Record<string, ReportSourceInfo>;
  roles: { code: string; name: string }[];
}

export interface Region {
  id: number;
  soato: string;
  nameUz: string;
  districts: { id: number; soato: string; nameUz: string }[];
}

export interface OrgTreeNode {
  id: number;
  parentId: number | null;
  type: string;
  code: string;
  name: string;
  path: string;
  isActive: boolean;
  regionId: number | null;
  children: OrgTreeNode[];
}

export interface OrgUnitDetail {
  id: number;
  type: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  isActive: boolean;
  parent: Named | null;
  region: { id: number; nameUz: string } | null;
}

export interface CallRow {
  id: number;
  pbxCallId: string;
  direction: CallDirection;
  callerNumber: string;
  calledNumber: string;
  startedAt: string;
  waitSeconds: number;
  talkSeconds: number;
  result: CallResult | null;
  agent: Person | null;
  queue: Named | null;
  ticket: { id: number; number: string } | null;
  recording: { id: number; durationSeconds: number; deletedAt: string | null; legalHold: boolean; retainUntil: string } | null;
  /** Billing: chiquvchi qo'ng'iroq narxi, so'm (Decimal satr ko'rinishida) */
  charge: { amount: string } | null;
  /** Oxirgi sifat bahosi (0–100) */
  qaEvaluations: { score: number }[];
}

export interface CallsSummary {
  inbound: { total: number; byResult: Partial<Record<CallResult, number>> };
  outbound: { total: number; cost: string };
  avgWaitSeconds: number;
  avgTalkSeconds: number;
}

export interface Queue {
  id: number;
  pbxNumber: string;
  name: string;
  language: string | null;
}

export interface CitizenCard {
  phone: string;
  citizen: {
    id: number;
    phone: string;
    extraPhones?: string[];
    fullName: string | null;
    region: { id: number; nameUz: string } | null;
    district: { id: number; nameUz: string } | null;
  } | null;
  tickets: {
    id: number;
    number: string;
    status: TicketStatus;
    subject: string;
    createdAt: string;
    category: { nameUz: string } | null;
    assignedOrgUnit: Named | null;
  }[];
  calls: { id: number; startedAt: string; talkSeconds: number; result: CallResult | null; agent: Person | null }[];
  /** Omnikanal yozishmalari (F-OMNI-04) */
  conversations?: {
    id: number;
    channel: TicketChannel;
    status: 'OPEN' | 'PENDING' | 'CLOSED';
    subject: string | null;
    lastMessageAt: string;
    ticket: { id: number; number: string } | null;
  }[];
}

export interface Summary {
  tickets: {
    byStatus: Partial<Record<TicketStatus, number>>;
    overdue: number;
    createdToday: number;
    byRegion: { regionId: number | null; region: string; count: number }[];
  };
  callsToday: { total: number; answered: number; abandoned: number; avgWaitSeconds: number; avgTalkSeconds: number; waiting: number | null };
}

export type PeriodKey = 'today' | '7d' | '30d';

export interface AnalyticsData {
  period: { from: string; to: string; bucket: 'hour' | 'day' };
  serviceLevel: { answerWithinSeconds: number; targetPercent: number; avgWaitTargetSeconds: number };
  calls: {
    inbound: number;
    offered: number;
    answered: number;
    lost: number;
    answeredPercent: number | null;
    slaPercent: number | null;
    avgWaitSeconds: number;
    avgTalkSeconds: number;
  };
  tickets: { created: number; resolvedOnSpot: number; resolvedOnSpotPercent: number | null };
  inboundSeries: { key: string; label: string; total: number; answered: number; lost: number }[];
  topTopics: { categoryId: number; number: number | null; name: string; parent: string | null; count: number }[];
  operators: {
    id: number;
    fullName: string;
    sipExtension: string | null;
    calls: number;
    avgTalkSeconds: number;
    tickets: number;
    resolvedOnSpotPercent: number | null;
    rating: number | null;
  }[];
  billing: {
    rows: { direction: string; label: string; calls: number; minutes: number; amount: number }[];
    inbound: { calls: number; minutes: number };
    total: number;
  };
}

export interface UserRow {
  id: number;
  username: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  sipExtension: string | null;
  isActive: boolean;
  /** 5 marta noto'g'ri paroldan keyin vaqtincha blok */
  lockedUntil: string | null;
  lastLoginAt: string | null;
  /** Ikki bosqichli himoya ulangan vaqt; null — ulanmagan */
  twoFactorEnabledAt: string | null;
  orgUnit: Named;
  roles: { code: string; name: string }[];
}

export interface RoleRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  scope: DataScope;
  permissions: string[];
  isSystem: boolean;
  /** /roles qaytaradi (/reference/roles da yo'q) */
  userCount?: number;
}

export type AuditCategory = 'security' | 'tickets' | 'recordings' | 'settings' | 'export';

export interface AuditRow {
  id: number;
  createdAt: string;
  action: string;
  label: string;
  category: AuditCategory | null;
  tone: 'red' | 'grey';
  actorId: number | null;
  actorName: string;
  actorSub: string;
  object: string;
  summary: string;
  changes: { field: string; from: string | null; to: string | null }[];
  ip: string | null;
  browser: string | null;
  details: unknown;
}

export interface AuditPage extends Page<AuditRow> {
  todayTotal: number;
}

export interface TelephonyInfo {
  driver: string;
  sipExtension: string | null;
}

export interface LiveAgent {
  id: number;
  fullName: string;
  sipExtension: string;
  status: AgentStatus;
  since: string | null;
  reason: string | null;
  callsToday: number;
  avgTalkSeconds: number;
}

export interface LiveData {
  updatedAt: string;
  driver: string;
  queueSupported: boolean;
  serviceLevel: { answerWithinSeconds: number; targetPercent: number; avgWaitTargetSeconds: number };
  kpi: AnalyticsData['calls'] & {
    waiting: number;
    longestWaitSeconds: number;
    agentsTotal: number;
    agentsOnline: number;
    byStatus: Record<AgentStatus, number>;
  };
  agents: LiveAgent[];
  waiting: { number: string; waitSeconds: number; queue: string; queueName: string }[];
  queues: { queue: string; name: string; language: string | null }[];
  hourly: AnalyticsData['inboundSeries'];
}

export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
export type AlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface AlertRow {
  id: number;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  source: string;
  value: number | null;
  startedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  rule: { id: number; code: string; name: string; unit: string; threshold: number } | null;
  acknowledgedBy: Person | null;
  resolvedBy: Person | null;
}

export interface AlertCounts {
  critical: number;
  warning: number;
  active: number;
  resolved: number;
}

export interface AlertRuleRow {
  id: number;
  code: string;
  name: string;
  metric: string;
  threshold: number;
  unit: string;
  severity: AlertSeverity;
  isActive: boolean;
}

export interface AlertNotify {
  bell: boolean;
  sms: boolean;
  telegram: boolean;
}

export type CampaignType = 'CALLBACK' | 'SURVEY' | 'REMINDER' | 'INFORM';
export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
export type ContactStatus = 'PENDING' | 'REACHED' | 'NO_ANSWER' | 'BUSY' | 'CALL_LATER' | 'WRONG_NUMBER' | 'FAILED';

export interface CampaignStats {
  total: number;
  processed: number;
  reached: number;
  callable: number;
  byStatus: Partial<Record<ContactStatus, number>>;
  reachPercent: number | null;
}

export interface CampaignRow {
  id: number;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  description: string | null;
  script: string | null;
  maxAttempts: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  queue: { id: number; pbxNumber: string; name: string } | null;
  createdBy: Person | null;
  stats: CampaignStats;
}

export interface CampaignContact {
  id: number;
  phone: string;
  fullName: string | null;
  status: ContactStatus;
  attempts: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  resolved: 'yes' | 'partly' | 'no' | null;
  rating: number | null;
  note: string | null;
  agentId: number | null;
  citizen: { id: number; fullName: string | null } | null;
  ticket: { id: number; number: string; subject: string; closedAt: string | null } | null;
  call: { id: number; talkSeconds: number; startedAt: string } | null;
}

export interface CampaignDetail extends CampaignRow {
  upcoming: { id: number; phone: string; fullName: string | null; attempts: number; status: ContactStatus }[];
  recent: CampaignContact[];
  current: CampaignContact | null;
}

// ───────────── Navbatlar va IVR ─────────────

export type IvrAction = 'SUBMENU' | 'QUEUE' | 'TICKET_STATUS' | 'CALLBACK' | 'VOICEMAIL' | 'PLAYBACK' | 'REPEAT' | 'HANGUP';

export interface IvrOption {
  id?: number;
  digit: string;
  label: string;
  action: IvrAction;
  queueId: number | null;
  targetMenuId: number | null;
  promptId: number | null;
}

export interface IvrMenu {
  id: number;
  code: string;
  name: string;
  language: string | null;
  promptId: number | null;
  timeoutSeconds: number;
  maxRetries: number;
  fallbackQueueId: number | null;
  options: IvrOption[];
}

export interface VoicePrompt {
  id: number;
  name: string;
  language: string;
  text: string;
  fileName: string | null;
  sizeBytes: number | null;
  hasAudio: boolean;
  updatedAt: string;
  usedIn: string[];
}

export interface IvrQueueBrief {
  id: number;
  number: string;
  name: string;
  isActive: boolean;
  members: number;
  maxWaitSeconds: number;
  callbackEnabled: boolean;
  announcePosition: boolean;
}

export interface IvrIssue {
  level: 'error' | 'warning';
  menuId?: number;
  message: string;
}

export interface IvrSettings {
  entryMenuId: number | null;
  afterHoursPromptId: number | null;
  holidayPromptId: number | null;
  voicemailAfterHours: boolean;
}

export interface IvrPublishState {
  version: number;
  publishedAt: string | null;
  publishedBy: string | null;
  applied: boolean;
  note: string | null;
  dirty: boolean;
}

export interface IvrOverview {
  driver: string;
  settings: IvrSettings;
  schedule: { days: number[]; start: string; end: string; holidays: string[] };
  menus: IvrMenu[];
  prompts: VoicePrompt[];
  queues: IvrQueueBrief[];
  issues: IvrIssue[];
  publish: IvrPublishState;
}

export interface SimStep {
  kind: 'say' | 'input' | 'info' | 'warning';
  text: string;
  menuId?: number;
}

export interface SimResult {
  schedule: 'open' | 'after_hours' | 'holiday';
  steps: SimStep[];
  state:
    | { type: 'awaiting'; menuId: number }
    | { type: 'end'; outcome: 'queue' | 'ticket_status' | 'callback' | 'voicemail' | 'hangup' | 'closed'; queueId?: number; text: string };
}

export interface QueueMember {
  userId: number;
  penalty: number;
  fullName: string;
  sipExtension: string | null;
  isActive: boolean;
  languages: string[];
}

export interface QueueDetail {
  id: number;
  pbxNumber: string;
  name: string;
  description: string | null;
  language: string | null;
  isActive: boolean;
  strategy: string;
  maxWaitSeconds: number;
  callbackEnabled: boolean;
  announcePosition: boolean;
  announceEverySeconds: number;
  musicOnHold: string;
  wrapUpSeconds: number;
  isRestricted: boolean;
  members: QueueMember[];
  ivr: string[];
  live: { waiting: number; longestWait: number } | null;
}

export interface QueueAgent {
  id: number;
  fullName: string;
  sipExtension: string | null;
  languages: string[];
  orgUnit: { name: string };
}

// ───────────── Omnikanal ─────────────

export type OmniChannel = 'TELEGRAM' | 'WEBCHAT' | 'EMAIL';
export type ConversationStatus = 'OPEN' | 'PENDING' | 'CLOSED';

export interface ConversationItem {
  id: number;
  channel: OmniChannel;
  status: ConversationStatus;
  contactName: string | null;
  contactHandle: string | null;
  contactPhone: string | null;
  subject: string | null;
  unreadCount: number;
  lastMessageAt: string;
  createdAt: string;
  assignee: Person | null;
  citizen: { id: number; fullName: string | null; phone: string } | null;
  ticket: { id: number; number: string; status: TicketStatus } | null;
  lastMessage: { body: string; direction: 'IN' | 'OUT'; sentAt: string; isAuto: boolean } | null;
}

export interface OmniMessage {
  id: number;
  direction: 'IN' | 'OUT';
  body: string;
  attachments: { type?: string; fileName?: string; sizeBytes?: number; mimeType?: string }[] | null;
  status: 'sent' | 'queued' | 'failed' | null;
  error: string | null;
  isAuto: boolean;
  sentAt: string;
  author: Person | null;
}

export interface ConversationDetail extends Omit<ConversationItem, 'lastMessage'> {
  messages: OmniMessage[];
  history: {
    tickets: { id: number; number: string; status: TicketStatus; channel: TicketChannel; subject: string; createdAt: string }[];
    conversations: { id: number; channel: OmniChannel; status: ConversationStatus; lastMessageAt: string; subject: string | null }[];
    calls: number;
  };
}

export interface OmniCounts {
  open: number;
  unassigned: number;
  mine: number;
  attention: number;
}

export type ChannelState = 'connected' | 'error' | 'off';

export interface OmniChannels {
  webchat: { state: ChannelState; widgetPath: string; pagePath: string };
  telegram: { state: ChannelState; username: string | null; mode: 'off' | 'polling' | 'webhook'; error: string | null };
  email: { inbound: ChannelState; outbound: ChannelState; address: string | null; error: string | null };
  devSimulation: boolean;
}

export interface OmniSettings {
  autoReply: boolean;
  greeting: string;
  afterHours: string;
  ticketCreated: string;
}

// ───────────── Qora ro'yxat va qayta qo'ng'iroqlar ─────────────

export interface BlacklistRow {
  id: number;
  phone: string;
  reason: string;
  expiresAt: string | null;
  createdAt: string;
  createdBy: Person;
}

export type CallbackStatus = 'PENDING' | 'DONE' | 'FAILED' | 'CANCELLED';

export interface CallbackRow {
  id: number;
  phone: string;
  status: CallbackStatus;
  requestedAt: string;
  attempts: number;
  handledAt: string | null;
  queue: { id: number; pbxNumber: string; name: string } | null;
  handledBy: Person | null;
}

export interface KnowledgeArticle {
  id: number;
  title: string;
  body: string;
  isPublished: boolean;
  updatedAt: string;
  category: { id: number; nameUz: string; parentId: number | null } | null;
  updatedBy: Person | null;
}

// ───────────── Tariflar va xarajatlar (F-BIL) ─────────────

export type TariffDirection = 'MOBILE' | 'LOCAL' | 'LONG_DISTANCE' | 'INTERNATIONAL' | 'INBOUND';

export interface TariffRow {
  id: number;
  direction: TariffDirection;
  prefix: string;
  pricePerMinute: number;
  billingStepSec: number;
  validFrom: string;
  validTo: string | null;
  /** Shu tarif bilan narxlangan qo'ng'iroqlar soni */
  charges: number;
}

export interface CostLimitRow {
  id: number;
  orgUnit: { id: number; name: string } | null;
  user: { id: number; fullName: string; sipExtension: string | null } | null;
  monthlyAmount: number;
  warnPercent: number;
  isActive: boolean;
  spent: number;
  percent: number | null;
  /** 0 — me'yorda, 1 — ogohlantirish chegarasidan o'tdi, 2 — limit tugadi */
  level: 0 | 1 | 2;
}

export interface BillingSpendRow {
  calls: number;
  minutes: number;
  amount: number;
}

export interface BillingSummary {
  month: string;
  total: number;
  calls: number;
  /** Javob berilgan tashqi chiquvchi qo'ng'iroq, lekin mos tarif yo'q */
  uncharged: number;
  directions: (BillingSpendRow & { direction: TariffDirection; label: string })[];
  units: (BillingSpendRow & { orgUnitId: number | null; name: string })[];
  operators: (BillingSpendRow & { userId: number | null; fullName: string; sipExtension: string | null })[];
}

export interface LimitTargets {
  units: { id: number; name: string; depth: number }[];
  operators: { id: number; fullName: string; sipExtension: string | null }[];
}

// ───────────── Mahalliy AI (F-AI-02/04/06) ─────────────

export interface AiFlag {
  key: string;
  label: string;
  words: string[];
}

export interface AiSuggestion {
  topics: { id: number; name: string; parent: { id: number; nameUz: string } | null; probability: number }[];
  region: { id: number; name: string } | null;
  district: { id: number; name: string } | null;
  flags: AiFlag[];
}

export interface ForecastHour {
  hour: number;
  expected: number;
  actual: number | null;
  ahtSeconds: number;
  traffic: number;
  agents: number;
  scheduled: number;
  serviceLevel: number;
}

export interface Forecast {
  date: string;
  weeksUsed: number;
  target: { answerWithinSeconds: number; targetPercent: number };
  shrinkage: number;
  totalExpected: number;
  totalActual: number | null;
  peak: ForecastHour;
  hours: ForecastHour[];
}

export interface KeywordGroup {
  key: string;
  label: string;
  words: string[];
  notify: 'confidential' | 'supervisors' | 'none';
}

export interface AiSettings {
  suggestions: boolean;
  keywordGroups: KeywordGroup[];
  shrinkage: number;
}
