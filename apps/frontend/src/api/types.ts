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
  citizen: { id: number; phone: string; fullName: string | null; address: string | null } | null;
  attachments: { id: number; fileName: string; mimeType: string; sizeBytes: number; createdAt: string }[];
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
}

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
  recording: { id: number; durationSeconds: number; deletedAt: string | null } | null;
  /** Billing: chiquvchi qo'ng'iroq narxi, so'm (Decimal satr ko'rinishida) */
  charge: { amount: string } | null;
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
}

export interface Summary {
  tickets: {
    byStatus: Partial<Record<TicketStatus, number>>;
    overdue: number;
    createdToday: number;
    byRegion: { regionId: number | null; region: string; count: number }[];
  };
  callsToday: { total: number; answered: number; abandoned: number; avgWaitSeconds: number };
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

export interface AuditRow {
  id: number;
  action: string;
  entityType: string | null;
  entityId: string | null;
  ip: string | null;
  createdAt: string;
  actor: { id: number; username: string; fullName: string } | null;
}

export interface TelephonyInfo {
  driver: string;
  sipExtension: string | null;
}
