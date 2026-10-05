/**
 * Demo ma'lumotlar generatori (faker). Call-markazning so'nggi N kunlik ishini simulyatsiya qiladi va barcha
 * jarayonlarni bir-biriga mos holda to'ldiradi: xodimlar, fuqarolar, qo'ng'iroqlar (CDR) va yozuvlar, murojaatlar
 * va ularning butun hayot yo'li (yo'naltirish, qaytarish, ijro, rad etish, tasdiqlash, qayta ochish, eskalatsiya),
 * vazifalar, ilovalar, SMS, bildirishnomalar, qayta qo'ng'iroqlar, chiquvchi kampaniyalar, so'rovnomalar, sifat
 * nazorati, transkriptlar, omnikanal yozishmalar, operator holatlari, ogohlantirishlar, billing va audit jurnali.
 *
 * Ishga tushirish (migratsiya va seed'dan keyin), backend papkasida:
 *   npm run db:fake                 standart: 100 kun, ish kunida ~300 kiruvchi qo'ng'iroq
 *   npm run db:fake -- --days=30 --scale=0.5 --seed=7
 *   --work-today   bugun dam olish kuni bo'lsa ham call-markaz ishlagan deb hisoblanadi (demo uchun)
 *   --dry-run      hammasini hisoblab, tranzaksiyani bekor qiladi (bazaga yozmaydi)
 * Parametrlar FAKER_DAYS, FAKER_SCALE, FAKER_SEED, FAKER_WORK_TODAY=1 muhit o'zgaruvchilari orqali ham beriladi.
 *
 * Faqat ishlab chiqish va test bazasi uchun: NODE_ENV=production da ishlamaydi. Bir marta ishlaydi
 * (settings.demo_data belgisi); qaytadan to'ldirish uchun bazani tozalang: npx prisma migrate reset.
 * Yangi xodimlarning paroli demo foydalanuvchilarniki bilan bir xil (.env dagi SEED_DEFAULT_PASSWORD).
 */
import {
  AgentStatus,
  AlertSeverity,
  AlertStatus,
  CallbackStatus,
  CallDirection,
  CallResult,
  CampaignContactStatus,
  CampaignStatus,
  CampaignType,
  Category,
  ConversationStatus,
  District,
  MessageDirection,
  OrgUnit,
  OrgUnitType,
  Prisma,
  PrismaClient,
  Region,
  Sentiment,
  SmsStatus,
  TariffDirection,
  TicketChannel,
  TicketEventType,
  TicketStatus,
  TicketType,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { pickBestRule } from '../../src/tickets/routing';
import { computeDueAt, formatTicketNumber } from '../../src/tickets/ticket-workflow';
import { addDays, atHour, DAY, dateKey, HOUR, later, MINUTE, SECOND, startOfDay, WorkCalendar } from './calendar';
import {
  citizenFullName,
  Gender,
  randomAddress,
  randomApplicationNumber,
  randomCadastreNumber,
  randomLandline,
  randomMahalla,
  randomMobile,
  randomName,
  staffFullName,
  usernameOf,
} from './people';
import { clamp, Random } from './random';
import { AgentDay, Arrival, planShift, QueueHour, SimCall, simulateInbound } from './simulation';
import {
  ANSWERS,
  ATTACHMENTS,
  BLACKLIST_REASONS,
  BREAK_REASONS,
  CITIZEN_FOLLOWUPS,
  ESCALATION_COMMENT,
  EXECUTOR_COMMENTS,
  KNOWLEDGE_ARTICLES,
  OPERATOR_REPLIES,
  QA_CHECKLIST,
  QA_COMMENTS,
  REJECT_REASONS,
  REOPEN_REASONS,
  RETURN_REASONS,
  TASK_TITLES,
  TOPIC_PROFILES,
  TopicProfile,
} from './texts';

const prisma = new PrismaClient();

// ───────────── Sozlamalar ─────────────

// Hududlar ulushi (aholi soniga taxminan mutanosib), SOATO kodi bo'yicha
const REGION_WEIGHTS: Record<string, number> = {
  '1726': 15, '1718': 11, '1730': 10, '1710': 9, '1703': 9, '1727': 9, '1714': 8,
  '1722': 8, '1706': 6, '1733': 5, '1735': 5, '1708': 4, '1712': 3, '1724': 2.5,
};
// IVR menyusida o'zbek tilida tanlangan navbat (rus tili — 6509)
const QUEUE_WEIGHTS: (readonly [string, number])[] = [['6500', 45], ['6501', 27], ['6502', 14], ['6503', 6], ['6505', 1.5]];
const MENU_DIGIT: Record<string, string> = { '6500': '0', '6501': '1', '6502': '2', '6503': '3', '6505': '5', '6509': '0' };
const OUTBOUND_QUEUE = '6510';
// Ish soatlari bo'yicha kiruvchi qo'ng'iroqlar ulushi (settings.working_hours: 09:00–18:00)
const HOUR_PROFILE: (readonly [number, number])[] = [
  [9, 0.085], [10, 0.135], [11, 0.145], [12, 0.125], [13, 0.085], [14, 0.115], [15, 0.13], [16, 0.11], [17, 0.07],
];
const WEEKDAY_FACTOR = [0.5, 1.08, 1.04, 1.0, 0.97, 0.9, 0.5];
const BASE_CALLS_PER_DAY = 300;
// Smenani rejalashtirishda bir operatorga mo'ljallangan kunlik qo'ng'iroqlar
const CALLS_PER_OPERATOR = 50;
const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
];
// Billing uchun NAMUNA tariflar (so'm/daqiqa). Haqiqiy narxlar aloqa operatori shartnomasidan olinadi.
const TARIFFS: { direction: TariffDirection; prefixes: string[]; price: number }[] = [
  {
    direction: TariffDirection.MOBILE,
    prefixes: ['99820', '99833', '99850', '99877', '99888', '99890', '99891', '99893', '99894', '99895', '99897', '99898', '99899'],
    price: 130,
  },
  { direction: TariffDirection.LOCAL, prefixes: ['99871'], price: 40 },
  { direction: TariffDirection.LONG_DISTANCE, prefixes: ['998'], price: 75 },
  { direction: TariffDirection.INTERNATIONAL, prefixes: ['7'], price: 2600 },
];
const PARENT_KEYWORDS: Record<string, string[]> = {
  'application-status': ['ariza', 'holat', 'muddat'],
  'property-registration': ["ro'yxatdan o'tkazish", 'huquq', 'uy-joy'],
  'cadastre-passport': ['kadastr pasporti', 'hujjat'],
  'lease-registration': ['ijara', 'shartnoma'],
  'mortgage-servitude': ['ipoteka', 'taqiq', 'bank'],
  address: ['manzil', 'hokimlik'],
  geodesy: ["o'lchov", 'chegara', 'geodeziya'],
  'staff-complaint': ['shikoyat', 'xodim', 'filial'],
  corruption: ['korrupsiya', "noqonuniy to'lov"],
  other: ["ma'lumot"],
};
const GENERIC_INSTANT = ["Fuqaroga kerakli ma'lumot berildi, qo'shimcha savollar yo'q."];
const SMS_FALLBACK: Record<string, string> = {
  ticket_created: 'Kadastr agentligi 1097: murojaatingiz qabul qilindi. Raqami: {raqam}.',
  ticket_closed: "Kadastr agentligi 1097: {raqam} raqamli murojaatingiz ko'rib chiqildi.",
};
const OPEN_CONTACT: CampaignContactStatus[] = [
  CampaignContactStatus.PENDING,
  CampaignContactStatus.NO_ANSWER,
  CampaignContactStatus.BUSY,
  CampaignContactStatus.CALL_LATER,
];

// ───────────── Turlar ─────────────

interface Options {
  days: number;
  scale: number;
  seed: number;
  workToday: boolean;
}

interface Staff {
  id: number;
  username: string;
  fullName: string;
  orgUnitId: number;
  role: string;
  ext: string | null;
  languages: string[];
  activeFrom: number;
  activeTo: number;
  /** Mavjud demo operatorlar (operator1, operator2): deyarli har kuni smenada, shaxsiy sahifalari bo'sh qolmasin */
  preferred: boolean;
  lastLoginAt: number | null;
  createdAt: Date;
  isNew: boolean;
}

interface Person {
  phone: string;
  fullName: string | null;
  regionId: number | null;
  districtId: number | null;
  districtName: string | null;
  address: string | null;
  language: 'uz' | 'ru';
  extraPhones: string[];
  citizen: FakeCitizen | null;
  lastAnsweredAt: number;
  tickets: FakeTicket[];
  telegramChat: string | null;
}

interface FakeCitizen {
  id: number;
  person: Person;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeEvent {
  at: Date;
  actor: Staff | null;
  type: TicketEventType;
  from?: TicketStatus;
  to?: TicketStatus;
  orgUnitId?: number;
  comment?: string;
  assignee?: Staff;
  answer?: string;
}

interface FakeTicket {
  id: number;
  number: string;
  createdAt: Date;
  channel: TicketChannel;
  type: TicketType;
  topic: Category;
  parent: Category;
  profile: TopicProfile;
  person: Person | null;
  citizen: FakeCitizen | null;
  isAnonymous: boolean;
  isConfidential: boolean;
  regionId: number | null;
  districtId: number | null;
  subject: string;
  description: string;
  cadastreNumber: string | null;
  applicationNumber: string | null;
  createdBy: Staff | null;
  dueAt: Date | null;
  /** Hozirgacha sodir bo'lgan hodisalar (rejaning qolgan qismi kesilgan) */
  events: FakeEvent[];
  /** Reja bo'yicha yopilish vaqti (kelajakda bo'lishi mumkin) */
  plannedCloseAt: number;
  status: TicketStatus;
  assignedOrgUnitId: number | null;
  assignee: Staff | null;
  answer: string | null;
  answeredAt: Date | null;
  closedAt: Date | null;
  escalatedAt: Date | null;
  updatedAt: Date;
}

interface FakeCall {
  id: number;
  pbxCallId: string;
  direction: CallDirection;
  callerNumber: string;
  calledNumber: string;
  queueId: number | null;
  agent: Staff | null;
  person: Person | null;
  ticket: FakeTicket | null;
  ivrPath: string | null;
  startedAt: Date;
  answeredAt: Date | null;
  endedAt: Date;
  waitSeconds: number;
  talkSeconds: number;
  result: CallResult;
  hangupBy: string;
}

interface FakeCallback {
  person: Person;
  queueId: number | null;
  status: CallbackStatus;
  requestedAt: Date;
  attempts: number;
  handledBy: Staff | null;
  handledAt: Date | null;
  call: FakeCall | null;
  voicemail: boolean;
  nextTry: number;
}

interface FakeContact {
  person: Person;
  ticket: FakeTicket | null;
  status: CampaignContactStatus;
  attempts: number;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date | null;
  agent: Staff | null;
  call: FakeCall | null;
  resolved: string | null;
  rating: number | null;
  note: string | null;
  createdAt: Date;
}

interface FakeCampaign {
  id: number;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  description: string;
  script: string;
  startsAt: Date | null;
  endsAt: Date | null;
  pausedAt: Date | null;
  perDay: number;
  target: number;
  source: 'closed_routed' | 'closed_any' | 'documents' | 'citizens' | null;
  contacts: FakeContact[];
  createdAt: Date;
  started: boolean;
}

interface FakeMessage {
  direction: MessageDirection;
  author: Staff | null;
  body: () => string;
  sentAt: Date;
  attachments?: Prisma.InputJsonValue;
}

interface FakeConversation {
  id: number;
  channel: TicketChannel;
  externalId: string;
  person: Person;
  ticket: FakeTicket | null;
  assignee: Staff | null;
  createdAt: Date;
  messages: FakeMessage[];
}

interface AuditDraft {
  at: number;
  actor: Staff | null;
  action: string;
  entityType?: string;
  entityId?: () => string;
  details?: Prisma.InputJsonValue;
}

interface OutboundPlan {
  ring: number;
  talk: number;
  result: CallResult;
}

// ───────────── Yordamchilar ─────────────

function option(name: string, env: string, fallback: number): number {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  const raw = arg ? arg.slice(name.length + 3) : process.env[env];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`--${name} noto'g'ri qiymat: ${raw}`);
  return value;
}

const formatDate = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;

const mmss = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

async function loadReference() {
  const [regions, districts, units, roles, categories, queues, rules, users, settings, holidays, counters, alertRules] =
    await Promise.all([
      prisma.region.findMany(),
      prisma.district.findMany(),
      prisma.orgUnit.findMany(),
      prisma.role.findMany(),
      prisma.category.findMany(),
      prisma.queue.findMany(),
      prisma.routingRule.findMany({ where: { isActive: true } }),
      prisma.user.findMany({ include: { roles: { include: { role: true } } } }),
      prisma.setting.findMany(),
      prisma.holiday.findMany(),
      prisma.ticketCounter.findMany(),
      prisma.alertRule.findMany(),
    ]);
  const seeded =
    categories.some((c) => c.code === 'topic.01') &&
    rules.length > 0 &&
    districts.length > 0 &&
    queues.some((q) => q.pbxNumber === OUTBOUND_QUEUE) &&
    alertRules.length > 0;
  if (!seeded) throw new Error("Avval migratsiya va seed: npx prisma migrate deploy && npm run db:seed");
  // Bazada oldindan bor raqamlar (noyob ustunlar) bilan to'qnashmaslik uchun
  const [citizenPhones, blacklisted, chats] = await Promise.all([
    prisma.citizen.findMany({ select: { phone: true } }),
    prisma.blacklistedNumber.findMany({ select: { phone: true } }),
    prisma.conversation.findMany({ where: { channel: TicketChannel.TELEGRAM }, select: { externalId: true } }),
  ]);
  const takenPhones = [...citizenPhones, ...blacklisted].map((c) => c.phone);
  const takenChats = chats.map((c) => c.externalId);
  return { regions, districts, units, roles, categories, queues, rules, users, settings, holidays, counters, alertRules, takenPhones, takenChats };
}

type Reference = Awaited<ReturnType<typeof loadReference>>;

// ───────────── Generator ─────────────

class Faker {
  private readonly rnd: Random;
  private readonly now = Date.now();
  private readonly today: Date;
  private readonly start: Date;
  private readonly cal: WorkCalendar;
  private readonly retentionDays: number;
  private readonly smsTemplates: Record<string, string>;
  private readonly ticketPrefix = process.env.TICKET_NUMBER_PREFIX ?? '1097';

  private readonly unitByCode: Map<string, OrgUnit>;
  private readonly unitById: Map<number, OrgUnit>;
  private readonly roleIds: Map<string, number>;
  private readonly categoryByCode: Map<string, Category>;
  private readonly categoryById: Map<number, Category>;
  private readonly queueIds: Map<string, number>;
  private readonly queueByNumber: Map<string, string>;
  private readonly regionById: Map<number, Region>;
  private readonly regionWeights: (readonly [Region, number])[];
  private readonly districtsByRegion = new Map<number, District[]>();
  private readonly dkpByRegion = new Map<number, OrgUnit>();

  private readonly staffById = new Map<number, Staff>();
  private readonly operators: Staff[] = [];
  private readonly supervisors: Staff[] = [];
  private readonly leaders: Staff[] = [];
  private readonly unitStaff = new Map<number, { heads: Staff[]; executors: Staff[] }>();
  private admin: Staff | null = null;

  private readonly persons: Person[] = [];
  private readonly phones = new Set<string>();
  private readonly telegramIds = new Set<string>();
  private readonly citizens: FakeCitizen[] = [];
  private readonly tickets: FakeTicket[] = [];
  private readonly recentTickets: FakeTicket[] = [];
  private readonly calls: FakeCall[] = [];
  private readonly callbacks: FakeCallback[] = [];
  private readonly campaigns: FakeCampaign[] = [];
  private readonly conversations: FakeConversation[] = [];
  private readonly campaignSurveys: { call: FakeCall; ticket: FakeTicket | null; score: number }[] = [];
  private readonly statusLogs: Prisma.AgentStatusLogCreateManyInput[] = [];
  private readonly alerts: Prisma.AlertCreateManyInput[] = [];
  private readonly auditDrafts: AuditDraft[] = [];
  private readonly lastShiftEnd = new Map<number, number>();
  private readonly counts: Record<string, number> = {};
  private pbxSeq = 0;

  constructor(
    private readonly tx: Prisma.TransactionClient,
    private readonly ref: Reference,
    private readonly opts: Options,
    private readonly passwordHash: string,
  ) {
    this.rnd = new Random(opts.seed);
    this.today = startOfDay(new Date(this.now));
    this.start = addDays(this.today, -(opts.days - 1));

    const setting = (key: string) => ref.settings.find((s) => s.key === key)?.value;
    const hours = (setting('working_hours') ?? {}) as { days?: number[]; start?: string; end?: string };
    const hourOf = (value: string | undefined, fallback: number) => {
      if (!value) return fallback;
      const [h, m] = value.split(':').map(Number);
      return h + (m || 0) / 60;
    };
    this.cal = new WorkCalendar(
      hours.days ?? [1, 2, 3, 4, 5],
      hourOf(hours.start, 9),
      hourOf(hours.end, 18),
      new Set(ref.holidays.map((h) => h.date.toISOString().slice(0, 10))),
    );
    this.retentionDays = Number(setting('recording_retention_days') ?? 90);
    this.smsTemplates = { ...SMS_FALLBACK, ...((setting('sms_templates') ?? {}) as Record<string, string>) };

    this.unitByCode = new Map(ref.units.map((u) => [u.code, u]));
    this.unitById = new Map(ref.units.map((u) => [u.id, u]));
    this.roleIds = new Map(ref.roles.map((r) => [r.code, r.id]));
    this.categoryByCode = new Map(ref.categories.map((c) => [c.code, c]));
    this.categoryById = new Map(ref.categories.map((c) => [c.id, c]));
    this.queueIds = new Map(ref.queues.map((q) => [q.pbxNumber, q.id]));
    this.queueByNumber = new Map(ref.queues.map((q) => [q.pbxNumber, q.name]));
    ref.takenPhones.forEach((phone) => this.phones.add(phone));
    ref.takenChats.forEach((id) => this.telegramIds.add(id));
    this.regionById = new Map(ref.regions.map((r) => [r.id, r]));
    this.regionWeights = ref.regions.map((r) => [r, REGION_WEIGHTS[r.soato] ?? 3] as const);
    for (const district of ref.districts) {
      const list = this.districtsByRegion.get(district.regionId) ?? [];
      list.push(district);
      this.districtsByRegion.set(district.regionId, list);
    }
    for (const unit of ref.units) {
      if (unit.type === OrgUnitType.CHAMBER_REGIONAL && unit.regionId) this.dkpByRegion.set(unit.regionId, unit);
    }
  }

  async run(): Promise<void> {
    console.log(
      `Davr: ${dateKey(this.start)} — ${dateKey(this.today)} (${this.opts.days} kun), hajm ×${this.opts.scale}, seed ${this.opts.seed}`,
    );
    await this.createStaff();
    const tariffs = await this.createTariffs();
    this.planCampaigns();
    for (let day = this.start; day.getTime() <= this.today.getTime(); day = addDays(day, 1)) {
      this.simulateDay(day);
    }
    this.finishShifts();
    this.finishCampaigns();
    this.numberTickets();
    await this.assignIds();
    await this.save(tariffs);
    this.printSummary();
  }

  // ───────────── Xodimlar ─────────────

  private async createStaff(): Promise<void> {
    const usernames = new Set(this.ref.users.map((u) => u.username));
    const extensions = new Set(this.ref.users.map((u) => u.sipExtension).filter((e): e is string => !!e));
    let nextExt = 1003;
    const takeExt = () => {
      while (extensions.has(String(nextExt))) nextExt++;
      extensions.add(String(nextExt));
      return String(nextExt);
    };
    const startMs = this.start.getTime();
    const register = (staff: Staff) => {
      this.staffById.set(staff.id, staff);
      return staff;
    };
    const existing = (role: string, unitId?: number) =>
      this.ref.users
        .filter((u) => u.isActive && u.roles.some((r) => r.role.code === role) && (unitId === undefined || u.orgUnitId === unitId))
        .map((u) =>
          register({
            id: u.id,
            username: u.username,
            fullName: u.fullName,
            orgUnitId: u.orgUnitId,
            role,
            ext: u.sipExtension,
            languages: u.languages,
            activeFrom: -Infinity,
            activeTo: Infinity,
            preferred: true,
            lastLoginAt: u.lastLoginAt?.getTime() ?? null,
            createdAt: u.createdAt,
            isNew: false,
          }),
        );
    const create = async (
      role: string,
      unit: OrgUnit,
      o: { ext?: string; languages?: string[]; gender?: Gender; activeFrom?: number; activeTo?: number; createdAt?: Date } = {},
    ) => {
      const name = randomName(this.rnd, { gender: o.gender });
      const base = usernameOf(name);
      let username = base;
      for (let n = 2; usernames.has(username); n++) username = `${base}${n}`;
      usernames.add(username);
      const createdAt = o.createdAt ?? new Date(startMs - this.rnd.int(30, 500) * DAY);
      const activeTo = o.activeTo ?? Infinity;
      const languages = o.languages ?? ['uz'];
      const user = await this.tx.user.create({
        data: {
          username,
          passwordHash: this.passwordHash,
          fullName: staffFullName(name),
          phone: randomMobile(this.rnd),
          email: `${username}@kadastr.test`,
          orgUnitId: unit.id,
          sipExtension: o.ext,
          languages,
          isActive: activeTo > this.now,
          createdAt,
          roles: { create: [{ roleId: this.roleIds.get(role)! }] },
        },
        select: { id: true },
      });
      return register({
        id: user.id,
        username,
        fullName: staffFullName(name),
        orgUnitId: unit.id,
        role,
        ext: o.ext ?? null,
        languages,
        activeFrom: o.activeFrom ?? -Infinity,
        activeTo,
        preferred: false,
        lastLoginAt: null,
        createdAt,
        isNew: true,
      });
    };
    const unit = (code: string) => {
      const found = this.unitByCode.get(code);
      if (!found) throw new Error(`Bo'linma topilmadi: ${code} — seed'ni ishga tushiring`);
      return found;
    };

    const callCenter = unit('call-center');
    // Operatorlar: mavjud demo operatorlar + yangilari. Ikkitasi davr o'rtasida ishdan ketgan, ikkitasi keyin kelgan.
    this.operators.push(...existing('OPERATOR', callCenter.id));
    const existingOperators = this.operators.length;
    const total = Math.max(existingOperators + 8, Math.round(24 * Math.min(2, this.opts.scale)));
    for (let i = existingOperators; i < total; i++) {
      const k = i - existingOperators;
      const leaves = k < 2 && this.opts.days >= 30;
      const joins = k >= 2 && k < 4 && this.opts.days >= 30;
      const activeTo = leaves ? startMs + Math.round(this.opts.days * this.rnd.float(0.3, 0.45)) * DAY : Infinity;
      const activeFrom = joins ? startMs + Math.round(this.opts.days * this.rnd.float(0.55, 0.7)) * DAY : -Infinity;
      const speaksRu = (k >= 4 && k < 7) || this.rnd.chance(0.25);
      this.operators.push(
        await create('OPERATOR', callCenter, {
          ext: takeExt(),
          languages: speaksRu ? ['uz', 'ru'] : ['uz'],
          gender: this.rnd.chance(0.65) ? 'F' : 'M',
          activeFrom,
          activeTo,
          createdAt: joins ? new Date(activeFrom - 3 * DAY) : undefined,
        }),
      );
    }

    this.supervisors.push(...existing('SUPERVISOR', callCenter.id));
    while (this.supervisors.length < 2) this.supervisors.push(await create('SUPERVISOR', callCenter, { ext: takeExt() }));
    this.leaders.push(...existing('DIRECTOR'), ...existing('LEADERSHIP'));
    this.admin = existing('ADMIN')[0] ?? null;
    existing('AUDITOR');

    for (const board of this.dkpByRegion.values()) {
      const heads = existing('UNIT_HEAD', board.id);
      if (heads.length === 0) heads.push(await create('UNIT_HEAD', board));
      const executors = existing('EXECUTOR', board.id);
      while (executors.length < 3) executors.push(await create('EXECUTOR', board));
      this.unitStaff.set(board.id, { heads, executors });
    }
    const geodesy = unit('central.geodesy');
    const geoHeads = existing('UNIT_HEAD', geodesy.id);
    if (geoHeads.length === 0) geoHeads.push(await create('UNIT_HEAD', geodesy));
    const geoExecutors = existing('EXECUTOR', geodesy.id);
    while (geoExecutors.length < 2) geoExecutors.push(await create('EXECUTOR', geodesy));
    this.unitStaff.set(geodesy.id, { heads: geoHeads, executors: geoExecutors });

    const antiCorruption = unit('central.anti-corruption');
    const ac = existing('ANTI_CORRUPTION', antiCorruption.id);
    while (ac.length < 2) ac.push(await create('ANTI_CORRUPTION', antiCorruption));
    this.unitStaff.set(antiCorruption.id, { heads: ac, executors: ac });

    // Yangi xodimlar administrator tomonidan qo'shilgan (davr ichida bo'lsa audit jurnalida ko'rinadi)
    for (const staff of this.staffById.values()) {
      if (staff.isNew && staff.createdAt.getTime() >= startMs) {
        this.audit(staff.createdAt.getTime(), this.admin, 'user.create', 'User', () => String(staff.id), { username: staff.username });
      }
    }
    this.counts['users (yangi)'] = [...this.staffById.values()].filter((s) => s.isNew).length;
  }

  private staffOf(unitId: number): { heads: Staff[]; executors: Staff[] } {
    return this.unitStaff.get(unitId) ?? { heads: this.supervisors, executors: this.supervisors };
  }

  private async createTariffs(): Promise<{ id: number; prefix: string; price: number }[]> {
    const validFrom = new Date(`${this.start.getFullYear()}-01-01T00:00:00Z`);
    const out: { id: number; prefix: string; price: number }[] = [];
    for (const tariff of TARIFFS) {
      for (const prefix of tariff.prefixes) {
        const row = await this.tx.tariff.create({
          data: { direction: tariff.direction, prefix, pricePerMinute: tariff.price, billingStepSec: 60, validFrom },
          select: { id: true },
        });
        out.push({ id: row.id, prefix, price: tariff.price });
      }
    }
    this.counts.tariffs = out.length;
    return out.sort((a, b) => b.prefix.length - a.prefix.length);
  }

  // ───────────── Fuqarolar ─────────────

  private newPerson(): Person {
    const region = this.rnd.chance(0.05) ? null : this.rnd.weighted(this.regionWeights);
    const districts = region ? this.districtsByRegion.get(region.id) ?? [] : [];
    const district = districts.length > 0 && this.rnd.chance(0.88) ? this.rnd.pick(districts) : null;
    const language = this.rnd.chance(0.12) ? 'ru' : 'uz';
    const name = randomName(this.rnd, { russian: language === 'ru' && this.rnd.chance(0.55) });
    let phone: string;
    do {
      phone = region?.soato === '1726' && this.rnd.chance(0.08) ? randomLandline(this.rnd) : randomMobile(this.rnd);
    } while (this.phones.has(phone));
    this.phones.add(phone);
    const person: Person = {
      phone,
      fullName: this.rnd.chance(0.92) ? citizenFullName(name, this.rnd.chance(0.55)) : null,
      regionId: region?.id ?? null,
      districtId: district?.id ?? null,
      districtName: district?.nameUz ?? null,
      address: this.rnd.chance(0.7) ? randomAddress(this.rnd, district?.nameUz ?? null) : null,
      language,
      extraPhones: this.rnd.chance(0.1) ? [randomMobile(this.rnd)] : [],
      citizen: null,
      lastAnsweredAt: 0,
      tickets: [],
      telegramChat: null,
    };
    this.persons.push(person);
    return person;
  }

  /** Qo'ng'iroq qiluvchi: ko'pchiligi yangi, bir qismi ochiq murojaati holatini so'rab qayta qo'ng'iroq qiladi. */
  private pickCaller(at: number): Person {
    if (this.recentTickets.length > 20 && this.rnd.chance(0.16)) {
      const ticket = this.rnd.pick(this.recentTickets);
      if (ticket.person && ticket.createdAt.getTime() < at - HOUR && ticket.plannedCloseAt > at) return ticket.person;
    }
    if (this.persons.length > 300 && this.rnd.chance(0.05)) return this.rnd.pick(this.persons);
    return this.newPerson();
  }

  private ensureCitizen(person: Person, at: Date): FakeCitizen {
    if (!person.citizen) {
      person.citizen = { id: 0, person, createdAt: at, updatedAt: at };
      this.citizens.push(person.citizen);
    } else if (at > person.citizen.updatedAt) {
      person.citizen.updatedAt = at;
    }
    return person.citizen;
  }

  // ───────────── Kun simulyatsiyasi ─────────────

  /** Call-markaz shu kuni ishlaydimi: ish kalendari bo'yicha yoki --work-today (dam olish kuni demo uchun) */
  private callCenterWorks(day: Date): boolean {
    return this.cal.isWorkday(day) || (this.opts.workToday && startOfDay(day).getTime() === this.today.getTime());
  }

  private isWorkingTime(t: number): boolean {
    const d = new Date(t);
    const hour = d.getHours() + d.getMinutes() / 60;
    return this.callCenterWorks(d) && hour >= this.cal.startHour && hour < this.cal.endHour;
  }

  private simulateDay(day: Date): void {
    const isWork = this.callCenterWorks(day);
    const expected = isWork ? this.expectedVolume(day) : 0;
    this.startCampaigns(day);
    const agents = isWork ? this.planAgents(day, expected) : [];
    const { calls, hours } = simulateInbound(this.arrivals(day, isWork, expected), agents, this.rnd, this.now);
    for (const call of calls) this.recordInbound(call);
    this.queueAlerts(hours);
    if (isWork) {
      this.processCallbacks(day, agents);
      this.processCampaigns(day, agents);
    }
    this.conversationsOf(day, agents);
    for (const agent of agents) this.recordShift(agent);
    this.dayAudit(day, isWork);
  }

  private expectedVolume(day: Date): number {
    const afterBreak = this.cal.isWorkday(addDays(day, -1)) ? 1 : 1.12;
    const age = (this.today.getTime() - day.getTime()) / DAY;
    const trend = 1 - (0.08 * age) / Math.max(30, this.opts.days);
    return BASE_CALLS_PER_DAY * this.opts.scale * WEEKDAY_FACTOR[day.getDay()] * afterBreak * trend;
  }

  private arrivals(day: Date, isWork: boolean, expected: number): Arrival<Person>[] {
    const times: [number, boolean][] = [];
    const at = (hour: number) => atHour(day, hour).getTime();
    if (isWork) {
      // 3% kunlarda keskin o'sish (masalan, my.gov.uz ishlamay qolgan kun) — smena unga tayyor emas
      const spike = this.rnd.chance(0.03) ? 1.5 : 1;
      const total = expected * spike * clamp(this.rnd.normal(1, 0.07), 0.8, 1.2);
      for (const [hour, share] of HOUR_PROFILE) {
        const n = Math.round(total * share * this.rnd.float(0.9, 1.1));
        for (let i = 0; i < n; i++) times.push([at(hour) + this.rnd.int(0, 3599) * SECOND, true]);
      }
      const offHours = Math.round(total * 0.05);
      for (let i = 0; i < offHours; i++) {
        times.push([this.rnd.chance(0.35) ? at(this.rnd.float(7, 9)) : at(this.rnd.float(18, 22.5)), false]);
      }
    } else {
      const n = Math.round(22 * this.opts.scale * this.rnd.float(0.7, 1.3));
      for (let i = 0; i < n; i++) times.push([at(this.rnd.float(8, 21)), false]);
    }
    return times
      .filter(([t]) => t < this.now)
      .sort((a, b) => a[0] - b[0])
      .map(([t, working]) => this.arrival(t, working));
  }

  private arrival(at: number, working: boolean): Arrival<Person> {
    const caller = this.pickCaller(at);
    const language = caller.language;
    const base = { at, caller, callerNumber: caller.phone, language };
    if (!working) {
      const voicemail = this.rnd.chance(0.3);
      return {
        ...base,
        queue: null,
        ivrPath: `lang:${language}>closed${voicemail ? '>voicemail' : ''}`,
        ivrSeconds: this.rnd.int(8, 20),
        kind: voicemail ? 'voicemail' : 'ivr',
      };
    }
    // IVR da ariza holatini avtomatik bilib, operatorsiz yakunlanadi
    if (this.rnd.chance(0.07)) {
      return { ...base, queue: null, ivrPath: `lang:${language}>menu:4>status`, ivrSeconds: this.rnd.int(15, 40), kind: 'ivr' };
    }
    const queue = language === 'ru' ? '6509' : this.rnd.weighted(QUEUE_WEIGHTS);
    return { ...base, queue, ivrPath: `lang:${language}>menu:${MENU_DIGIT[queue]}`, ivrSeconds: this.rnd.int(12, 35), kind: 'queue' };
  }

  private planAgents(day: Date, expected: number): AgentDay[] {
    const t = day.getTime();
    const available = this.operators.filter((o) => o.activeFrom <= t && o.activeTo > t && !this.rnd.chance(0.06));
    const needed = clamp(Math.round(expected / CALLS_PER_OPERATOR), Math.min(5, available.length), available.length);
    const chosen = [...available.filter((o) => o.preferred), ...this.rnd.shuffle(available.filter((o) => !o.preferred))].slice(0, needed);
    // Rus tilidagi navbat uchun smenada kamida ikki operator bo'lsin
    const speaksRu = (o: Staff) => o.languages.includes('ru');
    for (const candidate of available) {
      if (chosen.filter(speaksRu).length >= 2) break;
      if (!speaksRu(candidate) || chosen.includes(candidate)) continue;
      for (let i = chosen.length - 1; i >= 0; i--) {
        if (!chosen[i].preferred && !speaksRu(chosen[i])) {
          chosen[i] = candidate;
          break;
        }
      }
    }
    return chosen.map((o, i) =>
      planShift({ userId: o.id, ext: o.ext ?? '', fullName: o.fullName, languages: o.languages }, day, i, this.rnd, BREAK_REASONS),
    );
  }

  private recordInbound(sim: SimCall<Person>): void {
    const person = sim.caller;
    const agent = sim.agent ? this.staffById.get(sim.agent.agent.userId)! : null;
    const call = this.addCall({
      direction: CallDirection.INBOUND,
      callerNumber: sim.callerNumber,
      calledNumber: '1097',
      queue: sim.queue,
      agent,
      person,
      ivrPath: sim.ivrPath,
      startedAt: sim.startedAt,
      answeredAt: sim.answeredAt,
      endedAt: sim.endedAt,
      result: sim.result,
      hangupBy: sim.hangupBy,
    });
    if (sim.result === CallResult.ANSWERED && sim.answeredAt !== null && agent) {
      person.lastAnsweredAt = sim.endedAt;
      // Qo'ng'iroq kelganda operator panelida fuqaro kartasi ochiladi
      const citizen = person.citizen;
      const answeredAt = sim.answeredAt;
      this.audit(answeredAt + 2 * SECOND, agent, 'citizen.view', 'Citizen', () => (citizen ? String(citizen.id) : person.phone));
      if (this.rnd.chance(0.68)) {
        const at = new Date(answeredAt + sim.talkSeconds * SECOND * this.rnd.float(0.55, 0.95));
        call.ticket = this.createTicket({ at, channel: TicketChannel.PHONE, creator: agent, person, queue: sim.queue });
      }
    } else if (sim.result === CallResult.ABANDONED && this.rnd.chance(0.35)) {
      this.requestCallback(person, sim.queue, sim.endedAt, false);
    } else if (sim.result === CallResult.VOICEMAIL) {
      this.requestCallback(person, null, sim.endedAt, true);
    }
  }

  private addCall(c: {
    direction: CallDirection;
    callerNumber: string;
    calledNumber: string;
    queue: string | null;
    agent: Staff | null;
    person: Person | null;
    ivrPath: string | null;
    startedAt: number;
    answeredAt: number | null;
    endedAt: number;
    result: CallResult;
    hangupBy: string;
  }): FakeCall {
    const call: FakeCall = {
      id: 0,
      pbxCallId: `demo-${Math.floor(c.startedAt / 1000)}.${++this.pbxSeq}`,
      direction: c.direction,
      callerNumber: c.callerNumber,
      calledNumber: c.calledNumber,
      queueId: c.queue ? this.queueIds.get(c.queue) ?? null : null,
      agent: c.agent,
      person: c.person,
      ticket: null,
      ivrPath: c.ivrPath,
      startedAt: new Date(c.startedAt),
      answeredAt: c.answeredAt === null ? null : new Date(c.answeredAt),
      endedAt: new Date(c.endedAt),
      // telephony.service.ts dagi kabi: javobgacha (yoki uzilgunicha) o'tgan vaqt
      waitSeconds: Math.round(((c.answeredAt ?? c.endedAt) - c.startedAt) / SECOND),
      talkSeconds: c.answeredAt === null ? 0 : Math.round((c.endedAt - c.answeredAt) / SECOND),
      result: c.result,
      hangupBy: c.hangupBy,
    };
    this.calls.push(call);
    return call;
  }

  /** Bo'sh operatorga chiquvchi qo'ng'iroq joylaydi. Bo'sh oraliq bo'lmasa yoki "hozir"dan keyin bo'lsa — null. */
  private placeOutbound(agents: AgentDay[], notBefore: number, person: Person, plan: OutboundPlan): { call: FakeCall; agent: Staff } | null {
    const wrap = this.rnd.int(15, 50);
    const need = (plan.ring + plan.talk + wrap) * SECOND;
    let best: AgentDay | null = null;
    let bestAt = Infinity;
    for (const agent of agents) {
      const gap = agent.findGap(notBefore, need);
      if (gap !== null && gap < bestAt) {
        best = agent;
        bestAt = gap;
      }
    }
    if (!best) return null;
    const endedAt = bestAt + (plan.ring + plan.talk) * SECOND;
    if (endedAt > this.now) return null;
    best.occupy(bestAt, endedAt, wrap);
    const agent = this.staffById.get(best.agent.userId)!;
    const answered = plan.result === CallResult.ANSWERED;
    const call = this.addCall({
      direction: CallDirection.OUTBOUND,
      callerNumber: best.agent.ext,
      calledNumber: person.phone,
      queue: OUTBOUND_QUEUE,
      agent,
      person,
      ivrPath: null,
      startedAt: bestAt,
      answeredAt: answered ? bestAt + plan.ring * SECOND : null,
      endedAt,
      result: plan.result,
      hangupBy: answered ? (this.rnd.chance(0.5) ? 'agent' : 'caller') : 'system',
    });
    return { call, agent };
  }

  private recordShift(day: AgentDay): void {
    const staff = this.staffById.get(day.agent.userId)!;
    const rows = day.timeline(this.now);
    if (rows.length === 0) return; // smena hali boshlanmagan
    const previousEnd = this.lastShiftEnd.get(staff.id);
    if (previousEnd !== undefined) {
      this.statusLogs.push({ userId: staff.id, status: AgentStatus.OFFLINE, startedAt: new Date(previousEnd), endedAt: new Date(rows[0].from) });
    }
    for (const row of rows) {
      this.statusLogs.push({
        userId: staff.id,
        status: row.status,
        reason: row.reason,
        startedAt: new Date(row.from),
        endedAt: row.to === null ? null : new Date(row.to),
      });
    }
    const last = rows[rows.length - 1];
    if (last.to === null) this.lastShiftEnd.delete(staff.id);
    else this.lastShiftEnd.set(staff.id, last.to);
    this.login(staff, rows[0].from - this.rnd.int(1, 5) * MINUTE);

    // Qisqa tanaffus limitdan cho'zilsa — ogohlantirish
    const rule = this.alertRule('agent.break_long');
    for (const row of rows) {
      if (!rule || row.status !== AgentStatus.BREAK || row.reason !== BREAK_REASONS.short) continue;
      const end = row.to ?? this.now;
      const seconds = Math.round((end - row.from) / SECOND);
      if (seconds <= rule.threshold) continue;
      const supervisor = this.rnd.pick(this.supervisors);
      const closedBySupervisor = row.to !== null && this.rnd.chance(0.5);
      this.alerts.push({
        ruleId: rule.id,
        severity: rule.severity,
        status: row.to === null ? AlertStatus.ACTIVE : AlertStatus.RESOLVED,
        message: `Operator ${staff.fullName} ${Math.round(seconds / 60)} daqiqa tanaffusda.`,
        source: `Agent holati · SIP ${staff.ext}`,
        value: seconds,
        startedAt: new Date(row.from + rule.threshold * SECOND),
        resolvedAt: row.to === null ? null : new Date(row.to),
        resolvedById: closedBySupervisor ? supervisor.id : null,
      });
    }
  }

  private finishShifts(): void {
    for (const [userId, from] of this.lastShiftEnd) {
      this.statusLogs.push({ userId, status: AgentStatus.OFFLINE, startedAt: new Date(from), endedAt: null });
    }
  }

  // ───────────── Murojaatlar ─────────────

  private pickTopic(queue: string | null, open: FakeTicket | undefined, at: Date): string {
    if (open && this.rnd.chance(0.7)) return open.dueAt && open.dueAt < at ? 'topic.02' : 'topic.01';
    if (queue === '6505' && this.rnd.chance(0.85)) return 'topic.20';
    const entries = Object.entries(TOPIC_PROFILES)
      .filter(([code]) => this.categoryByCode.has(code))
      .map(([code, p]) => [code, p.weight * (queue === null || p.queues.includes(queue) ? 1 : 0.15)] as const);
    return this.rnd.weighted(entries);
  }

  private createTicket(ctx: {
    at: Date;
    channel: TicketChannel;
    creator: Staff | null;
    person: Person;
    queue: string | null;
    topic?: string;
  }): FakeTicket {
    const { person, at } = ctx;
    const open = person.tickets.find((t) => t.createdAt < at && t.plannedCloseAt > at.getTime() && t.events.length > 2);
    const code = ctx.topic ?? this.pickTopic(ctx.queue, open, at);
    const topic = this.categoryByCode.get(code)!;
    const parent = this.categoryById.get(topic.parentId!)!;
    const profile = TOPIC_PROFILES[code];
    const type = this.rnd.weighted(profile.types);
    const isAnonymous = this.rnd.chance(profile.anonymous ?? 0.01);
    const ticket: FakeTicket = {
      id: 0,
      number: '',
      createdAt: at,
      channel: ctx.channel,
      type,
      topic,
      parent,
      profile,
      // Anonim xabarlarning yarmida operator telefon raqamini ham yozmaydi
      person: isAnonymous && this.rnd.chance(0.5) ? null : person,
      citizen: null,
      isAnonymous,
      isConfidential: type === TicketType.CORRUPTION || topic.isConfidential,
      regionId: person.regionId,
      districtId: person.districtId,
      subject: topic.nameUz,
      description: '',
      cadastreNumber: null,
      applicationNumber: open && (code === 'topic.01' || code === 'topic.02') ? open.applicationNumber : null,
      createdBy: ctx.creator,
      dueAt: null,
      events: [],
      plannedCloseAt: Infinity,
      status: TicketStatus.NEW,
      assignedOrgUnitId: null,
      assignee: null,
      answer: null,
      answeredAt: null,
      closedAt: null,
      escalatedAt: null,
      updatedAt: at,
    };
    ticket.description = this.fillText(this.rnd.pick(profile.texts), ticket, person);
    if (!ticket.applicationNumber && this.rnd.chance(profile.applicationNumber ?? 0)) {
      ticket.applicationNumber = randomApplicationNumber(this.rnd);
    }
    if (!ticket.cadastreNumber && this.rnd.chance(profile.cadastreNumber ?? 0)) {
      ticket.cadastreNumber = randomCadastreNumber(this.rnd, this.regionById.get(person.regionId ?? -1)?.soato ?? '1726');
    }
    if (ticket.person) ticket.citizen = this.ensureCitizen(ticket.person, at);

    const closeNow =
      ctx.creator !== null && (type === TicketType.INFO || type === TicketType.GRATITUDE) && this.rnd.chance(profile.instantClose);
    this.planLifecycle(ticket, closeNow);
    this.tickets.push(ticket);
    person.tickets.push(ticket);
    if (!closeNow && ticket.person) {
      this.recentTickets.push(ticket);
      if (this.recentTickets.length > 600) this.recentTickets.shift();
    }
    return ticket;
  }

  private fillText(template: string, ticket: FakeTicket, person: Person): string {
    const regionName = this.regionById.get(person.regionId ?? -1)?.nameUz;
    return template.replace(/\{(\w+)\}/g, (_, key: string) => {
      switch (key) {
        case 'ariza':
          return (ticket.applicationNumber ??= randomApplicationNumber(this.rnd));
        case 'kadastr':
          return (ticket.cadastreNumber ??= randomCadastreNumber(this.rnd, this.regionById.get(person.regionId ?? -1)?.soato ?? '1726'));
        case 'manzil':
          return person.address ?? randomAddress(this.rnd, person.districtName);
        case 'tuman':
          return person.districtName ?? regionName ?? 'Yashash hududidagi';
        case 'mfy':
          return randomMahalla(this.rnd);
        case 'sana':
          return formatDate(new Date(ticket.createdAt.getTime() - this.rnd.int(5, 45) * DAY));
        case 'kun':
          return String(this.rnd.int(20, 60));
        case 'maydon':
          return String(this.rnd.int(38, 190));
        case 'kvitansiya':
          return this.rnd.digits(10);
        default:
          return key;
      }
    });
  }

  private routeFor(ticket: FakeTicket): number | null {
    const rule = pickBestRule(this.ref.rules, { categoryId: ticket.parent.id, regionId: ticket.regionId, districtId: ticket.districtId });
    // Qoida call-markazning o'ziga ko'rsatsa (hudud noma'lum) — supervisor qo'lda yo'naltiradi
    return !rule || rule.targetOrgUnitId === this.unitByCode.get('call-center')?.id ? null : rule.targetOrgUnitId;
  }

  private randomBoard(): number {
    return this.dkpByRegion.get(this.rnd.weighted(this.regionWeights).id)!.id;
  }

  /**
   * Murojaatning butun hayot yo'li ticket-workflow.ts dagi holatlar mashinasi bo'yicha rejalashtiriladi.
   * "Hozir"dan keyingi hodisalar kesiladi: eski murojaatlar yopilgan, yangilari jarayonda bo'lib chiqadi.
   */
  private planLifecycle(ticket: FakeTicket, closeNow: boolean): void {
    const rnd = this.rnd;
    const { NEW, ROUTED, RETURNED, IN_PROGRESS, ANSWERED, CLOSED } = TicketStatus;
    const E = TicketEventType;
    const t0 = ticket.createdAt;
    const plan: FakeEvent[] = [{ at: t0, actor: ticket.createdBy, type: E.CREATED, to: NEW }];
    const step = (from: Date, minHours: number, maxHours: number) => this.cal.addWorkingHours(from, rnd.float(minHours, maxHours), rnd);

    if (closeNow) {
      plan.push({
        at: later(t0, SECOND),
        actor: ticket.createdBy,
        type: E.CLOSED,
        from: NEW,
        to: CLOSED,
        comment: "Ma'lumot berildi",
        answer: rnd.pick(ticket.profile.instantAnswers ?? GENERIC_INSTANT),
      });
      ticket.plannedCloseAt = t0.getTime();
      this.applyEvents(ticket, plan);
      return;
    }

    ticket.dueAt = computeDueAt(t0, ticket.topic.slaDays);
    let unitId = this.routeFor(ticket);
    let t = later(t0, 2 * SECOND);
    if (unitId !== null) {
      plan.push({ at: t, actor: ticket.createdBy, type: E.ROUTED, from: NEW, to: ROUTED, orgUnitId: unitId });
    } else {
      t = step(t0, 0.5, 10);
      unitId = this.randomBoard();
      plan.push({ at: t, actor: rnd.pick(this.supervisors), type: E.ROUTED, from: NEW, to: ROUTED, orgUnitId: unitId });
    }
    if (this.unitById.get(unitId)?.type === OrgUnitType.CHAMBER_REGIONAL && rnd.chance(0.06)) {
      t = step(t, 1, 14);
      plan.push({ at: t, actor: rnd.pick(this.staffOf(unitId).heads), type: E.RETURNED, from: ROUTED, to: RETURNED, comment: rnd.pick(RETURN_REASONS) });
      t = step(t, 0.3, 4);
      unitId = rnd.chance(0.3) ? this.unitByCode.get('central.geodesy')!.id : this.randomBoard();
      plan.push({ at: t, actor: rnd.pick(this.supervisors), type: E.ROUTED, from: RETURNED, to: ROUTED, orgUnitId: unitId });
    }

    const staff = this.staffOf(unitId);
    const head = rnd.pick(staff.heads);
    const executor = rnd.pick(staff.executors);
    t = step(t, 0.3, 12);
    plan.push({ at: t, actor: head, type: E.ASSIGNED, from: ROUTED, to: IN_PROGRESS, assignee: executor });
    const assignedAt = t;
    // 7% murojaatlar "qotib qoladi" va muddati o'tadi
    const slow = rnd.chance(0.07) ? rnd.float(3, 6) : 1;
    const answerAt = this.cal.addWorkingHours(t, clamp(rnd.logNormal(22, 0.75) * slow, 1, 450), rnd);
    if (rnd.chance(0.3)) {
      const at = new Date(assignedAt.getTime() + (answerAt.getTime() - assignedAt.getTime()) * rnd.float(0.2, 0.7));
      plan.push({ at, actor: executor, type: E.COMMENT, comment: rnd.pick(EXECUTOR_COMMENTS) });
    }
    const answers = ANSWERS[ticket.parent.code] ?? ANSWERS.other;
    plan.push({ at: answerAt, actor: executor, type: E.ANSWERED, from: IN_PROGRESS, to: ANSWERED, answer: rnd.pick(answers) });
    t = answerAt;
    if (rnd.chance(0.08)) {
      t = step(t, 1, 10);
      plan.push({ at: t, actor: head, type: E.REJECTED, from: ANSWERED, to: IN_PROGRESS, comment: rnd.pick(REJECT_REASONS) });
      t = step(t, 3, 20);
      plan.push({ at: t, actor: executor, type: E.ANSWERED, from: IN_PROGRESS, to: ANSWERED, answer: rnd.pick(answers) });
    }
    t = step(t, 0.5, 14);
    plan.push({ at: t, actor: head, type: E.APPROVED, from: ANSWERED, to: CLOSED });
    ticket.plannedCloseAt = t.getTime();
    if (rnd.chance(0.015)) {
      t = step(t, 6, 50);
      plan.push({
        at: t,
        actor: rnd.pick([...this.supervisors, ...this.leaders]),
        type: E.REOPENED,
        from: CLOSED,
        to: IN_PROGRESS,
        comment: rnd.pick(REOPEN_REASONS),
      });
      t = step(t, 5, 30);
      plan.push({ at: t, actor: executor, type: E.ANSWERED, from: IN_PROGRESS, to: ANSWERED, answer: rnd.pick(answers) });
      t = step(t, 1, 10);
      plan.push({ at: t, actor: head, type: E.APPROVED, from: ANSWERED, to: CLOSED });
    }
    if (ticket.plannedCloseAt > ticket.dueAt.getTime()) {
      plan.push({ at: new Date(ticket.dueAt.getTime() + rnd.int(30, 180) * MINUTE), actor: null, type: E.ESCALATED, comment: ESCALATION_COMMENT });
    }
    this.applyEvents(ticket, plan);
  }

  private applyEvents(ticket: FakeTicket, plan: FakeEvent[]): void {
    const E = TicketEventType;
    plan.sort((a, b) => a.at.getTime() - b.at.getTime());
    ticket.events = plan.filter((e) => e.at.getTime() <= this.now);
    for (const e of ticket.events) {
      switch (e.type) {
        case E.ROUTED:
          ticket.status = TicketStatus.ROUTED;
          ticket.assignedOrgUnitId = e.orgUnitId ?? null;
          ticket.assignee = null;
          break;
        case E.RETURNED:
          ticket.status = TicketStatus.RETURNED;
          ticket.assignedOrgUnitId = null;
          ticket.assignee = null;
          break;
        case E.ASSIGNED:
          ticket.status = TicketStatus.IN_PROGRESS;
          ticket.assignee = e.assignee ?? null;
          break;
        case E.ANSWERED:
          ticket.status = TicketStatus.ANSWERED;
          ticket.answer = e.answer ?? null;
          ticket.answeredAt = e.at;
          break;
        case E.REJECTED:
          ticket.status = TicketStatus.IN_PROGRESS;
          break;
        case E.REOPENED:
          ticket.status = TicketStatus.IN_PROGRESS;
          ticket.closedAt = null;
          break;
        case E.APPROVED:
          ticket.status = TicketStatus.CLOSED;
          ticket.closedAt = e.at;
          break;
        case E.CLOSED:
          ticket.status = TicketStatus.CLOSED;
          ticket.closedAt = e.at;
          ticket.answer = e.answer ?? null;
          ticket.answeredAt = e.at;
          break;
        case E.ESCALATED:
          ticket.escalatedAt = e.at;
          break;
      }
      ticket.updatedAt = e.at;
    }
  }

  // ───────────── Qayta qo'ng'iroqlar ─────────────

  private requestCallback(person: Person, queue: string | null, at: number, voicemail: boolean): void {
    this.callbacks.push({
      person,
      queueId: queue ? this.queueIds.get(queue) ?? null : null,
      status: CallbackStatus.PENDING,
      requestedAt: new Date(at),
      attempts: 0,
      handledBy: null,
      handledAt: null,
      call: null,
      voicemail,
      nextTry: at + this.rnd.int(5, 40) * MINUTE,
    });
  }

  private processCallbacks(day: Date, agents: AgentDay[]): void {
    const dayEnd = addDays(day, 1).getTime();
    const due = this.callbacks
      .filter((c) => c.status === CallbackStatus.PENDING && c.nextTry < dayEnd)
      .sort((a, b) => a.nextTry - b.nextTry);
    for (const cb of due) {
      if (cb.person.lastAnsweredAt > cb.requestedAt.getTime()) {
        // Fuqaro o'zi qayta qo'ng'iroq qilib, operatorga ulangan
        cb.status = CallbackStatus.CANCELLED;
        cb.handledAt = new Date(cb.person.lastAnsweredAt);
        continue;
      }
      const reached = this.rnd.chance(0.78);
      const plan: OutboundPlan = reached
        ? { ring: this.rnd.int(5, 18), talk: Math.round(clamp(this.rnd.logNormal(150, 0.5), 30, 900)), result: CallResult.ANSWERED }
        : { ring: this.rnd.int(30, 45), talk: 0, result: CallResult.NO_ANSWER };
      const placed = this.placeOutbound(agents, cb.nextTry, cb.person, plan);
      if (!placed) break;
      const { call, agent } = placed;
      cb.attempts++;
      cb.call = call;
      cb.handledBy = agent;
      if (reached) {
        cb.status = CallbackStatus.DONE;
        cb.handledAt = call.endedAt;
        if (this.rnd.chance(cb.voicemail ? 0.7 : 0.6)) {
          call.ticket = this.createTicket({
            at: new Date(call.answeredAt!.getTime() + call.talkSeconds * SECOND * this.rnd.float(0.5, 0.9)),
            channel: cb.voicemail ? TicketChannel.VOICEMAIL : TicketChannel.PHONE,
            creator: agent,
            person: cb.person,
            queue: null,
          });
        }
      } else if (cb.attempts >= 3) {
        cb.status = CallbackStatus.FAILED;
        cb.handledAt = call.endedAt;
      } else {
        cb.nextTry = call.endedAt.getTime() + this.rnd.int(60, 150) * MINUTE;
      }
    }
  }

  // ───────────── Kampaniyalar ─────────────

  private planCampaigns(): void {
    const dayAt = (offset: number, hour = 9) => atHour(addDays(this.today, offset), hour);
    const minStart = this.start.getTime() + 10 * DAY;
    const month = MONTHS[addDays(this.today, -58).getMonth()];
    const defs: Omit<FakeCampaign, 'id' | 'contacts' | 'started'>[] = [
      {
        name: "Murojaatlar bo'yicha qayta aloqa",
        type: CampaignType.CALLBACK,
        status: CampaignStatus.ACTIVE,
        description: "Yopilgan murojaatlar bo'yicha fuqarodan masala hal bo'lganini so'rash",
        script:
          "Assalomu alaykum, Kadastr agentligi 1097 ishonch telefonidan bezovta qilyapmiz. {raqam} raqamli murojaatingiz bo'yicha qo'ng'iroq qildik — masala hal bo'ldimi? Qo'shimcha yordam kerakmi?",
        startsAt: dayAt(-12),
        endsAt: dayAt(18, 18),
        pausedAt: null,
        perDay: 18,
        target: 200,
        source: 'closed_routed',
        createdAt: dayAt(-14, 15),
      },
      {
        name: "Xizmat sifati so'rovnomasi",
        type: CampaignType.SURVEY,
        status: CampaignStatus.ACTIVE,
        description: "Murojaati yopilgan fuqarolardan xizmat sifatini 1–5 ball bilan baholashni so'rash",
        script:
          "Assalomu alaykum! Kadastr agentligi 1097 dan. Yaqinda bizga murojaat qilgan edingiz. Xizmatimizni 1 dan 5 gacha ball bilan baholab bera olasizmi?",
        startsAt: dayAt(-16),
        endsAt: dayAt(14, 18),
        pausedAt: null,
        perDay: 32,
        target: 500,
        source: 'closed_any',
        createdAt: dayAt(-17, 11),
      },
      {
        name: 'Tayyor hujjatni olib ketish eslatmasi',
        type: CampaignType.REMINDER,
        status: CampaignStatus.PAUSED,
        description: "Kadastr hujjati tayyor bo'lgan, lekin olib ketilmagan fuqarolarga eslatma",
        script:
          "Assalomu alaykum! Kadastr agentligi 1097 dan. Siz buyurtma qilgan hujjat tayyor — uni [bo'linma manzili]dan [qabul vaqti]da olishingiz mumkin.",
        startsAt: dayAt(-9),
        endsAt: dayAt(21, 18),
        pausedAt: dayAt(-3, 12),
        perDay: 22,
        target: 300,
        source: 'documents',
        createdAt: dayAt(-10, 16),
      },
      {
        name: "Ijara shartnomalari bo'yicha xabardor qilish",
        type: CampaignType.INFORM,
        status: CampaignStatus.SCHEDULED,
        description: "Ijara shartnomalarini davlat ro'yxatidan o'tkazish talabi haqida xabardor qilish",
        script:
          "Assalomu alaykum! Kadastr agentligi 1097 dan. Ijara shartnomalarini davlat ro'yxatidan o'tkazish tartibi haqida qisqacha ma'lumot bermoqchimiz.",
        startsAt: dayAt(4),
        endsAt: dayAt(34, 18),
        pausedAt: null,
        perDay: 0,
        target: 400,
        source: 'citizens',
        createdAt: dayAt(-2, 11),
      },
      {
        name: `${month} oyi sifat so'rovnomasi`,
        type: CampaignType.SURVEY,
        status: CampaignStatus.COMPLETED,
        description: "Oylik sifat so'rovnomasi: tasodifiy tanlangan fuqarolar",
        script: "Assalomu alaykum! Kadastr agentligi 1097 dan. Xizmatimizni 1 dan 5 gacha ball bilan baholab bera olasizmi?",
        startsAt: dayAt(-58),
        endsAt: dayAt(-44, 18),
        pausedAt: null,
        perDay: 25,
        target: 250,
        source: 'closed_any',
        createdAt: dayAt(-60, 10),
      },
      {
        name: 'Yangi manzil berish tartibi haqida xabardor qilish',
        type: CampaignType.INFORM,
        status: CampaignStatus.DRAFT,
        description: "Loyiha: kontaktlar ro'yxati hali yuklanmagan",
        script: '',
        startsAt: null,
        endsAt: null,
        pausedAt: null,
        perDay: 0,
        target: 0,
        source: null,
        createdAt: dayAt(-1, 16),
      },
    ];
    for (const def of defs) {
      const runsInPast = def.status !== CampaignStatus.SCHEDULED && def.status !== CampaignStatus.DRAFT;
      if (runsInPast && def.startsAt!.getTime() < minStart) continue; // davr qisqa: oldin murojaatlar yo'q
      this.campaigns.push({ ...def, id: 0, contacts: [], started: false });
    }
  }

  private startCampaigns(day: Date): void {
    const dayEnd = addDays(day, 1).getTime();
    for (const c of this.campaigns) {
      if (c.started || !c.startsAt || c.source === 'citizens' || c.source === null) continue;
      if (c.startsAt.getTime() >= dayEnd || c.startsAt.getTime() > this.now) continue;
      c.started = true;
      const startMs = c.startsAt.getTime();
      const approved = (t: FakeTicket) => t.events.some((e) => e.type === TicketEventType.APPROVED);
      const candidates = this.tickets.filter(
        (t) =>
          t.person &&
          !t.isAnonymous &&
          !t.isConfidential &&
          t.plannedCloseAt < startMs &&
          t.plannedCloseAt > startMs - 30 * DAY &&
          (c.source === 'closed_any' ||
            (c.source === 'closed_routed' && approved(t)) ||
            (c.source === 'documents' && approved(t) && ['cadastre-passport', 'property-registration'].includes(t.parent.code))),
      );
      const phones = new Set<string>();
      for (const ticket of this.rnd.shuffle(candidates)) {
        if (c.contacts.length >= c.target) break;
        if (phones.has(ticket.person!.phone)) continue;
        phones.add(ticket.person!.phone);
        c.contacts.push(this.contact(ticket.person!, ticket, c.startsAt, new Date(startMs - HOUR)));
      }
    }
  }

  private contact(person: Person, ticket: FakeTicket | null, nextAttemptAt: Date, createdAt: Date): FakeContact {
    return {
      person,
      ticket,
      status: CampaignContactStatus.PENDING,
      attempts: 0,
      lastAttemptAt: null,
      nextAttemptAt,
      agent: null,
      call: null,
      resolved: null,
      rating: null,
      note: null,
      createdAt,
    };
  }

  private processCampaigns(day: Date, agents: AgentDay[]): void {
    const dayEnd = addDays(day, 1).getTime();
    for (const c of this.campaigns) {
      if (!c.started || !c.startsAt || c.perDay === 0) continue;
      const stopAt = Math.min(c.endsAt?.getTime() ?? Infinity, c.pausedAt?.getTime() ?? Infinity);
      if (c.startsAt.getTime() >= dayEnd || day.getTime() >= stopAt) continue;
      let quota = Math.round(c.perDay * this.rnd.float(0.8, 1.15));
      const due = c.contacts
        .filter((k) => OPEN_CONTACT.includes(k.status) && k.nextAttemptAt !== null && k.nextAttemptAt.getTime() < dayEnd)
        .sort((a, b) => a.nextAttemptAt!.getTime() - b.nextAttemptAt!.getTime());
      for (const k of due) {
        if (quota-- <= 0) break;
        const notBefore = Math.max(k.nextAttemptAt!.getTime(), c.startsAt.getTime());
        if (notBefore >= stopAt) break;
        const outcome = this.rnd.weighted<CampaignContactStatus>([
          [CampaignContactStatus.REACHED, 60],
          [CampaignContactStatus.NO_ANSWER, 21],
          [CampaignContactStatus.BUSY, 7],
          [CampaignContactStatus.CALL_LATER, 9],
          [CampaignContactStatus.WRONG_NUMBER, 3],
        ]);
        const placed = this.placeOutbound(agents, notBefore, k.person, this.contactPlan(c.type, outcome));
        if (!placed) break;
        k.attempts++;
        k.lastAttemptAt = placed.call.startedAt;
        k.agent = placed.agent;
        k.call = placed.call;
        if (outcome === CampaignContactStatus.REACHED) {
          k.status = outcome;
          k.nextAttemptAt = null;
          this.contactResult(c, k);
        } else if (outcome === CampaignContactStatus.WRONG_NUMBER) {
          k.status = outcome;
          k.nextAttemptAt = null;
          k.note = 'Raqam boshqa shaxsga tegishli';
        } else if (k.attempts >= 3) {
          k.status = CampaignContactStatus.FAILED;
          k.nextAttemptAt = null;
        } else {
          k.status = outcome;
          k.nextAttemptAt =
            outcome === CampaignContactStatus.CALL_LATER
              ? new Date(placed.call.endedAt.getTime() + this.rnd.int(2, 26) * HOUR)
              : atHour(addDays(day, 1), this.rnd.float(9.5, 16));
          if (outcome === CampaignContactStatus.CALL_LATER) k.note = "Keyinroq qo'ng'iroq qilishni so'radi";
        }
      }
    }
  }

  private contactPlan(type: CampaignType, outcome: CampaignContactStatus): OutboundPlan {
    const r = this.rnd;
    switch (outcome) {
      case CampaignContactStatus.REACHED: {
        const [median, min, max] =
          type === CampaignType.SURVEY ? [100, 40, 420] : type === CampaignType.CALLBACK ? [140, 45, 700] : type === CampaignType.REMINDER ? [55, 25, 240] : [90, 30, 400];
        return { ring: r.int(6, 20), talk: Math.round(clamp(r.logNormal(median, 0.45), min, max)), result: CallResult.ANSWERED };
      }
      case CampaignContactStatus.CALL_LATER:
        return { ring: r.int(6, 15), talk: r.int(15, 40), result: CallResult.ANSWERED };
      case CampaignContactStatus.WRONG_NUMBER:
        return { ring: r.int(6, 15), talk: r.int(10, 25), result: CallResult.ANSWERED };
      case CampaignContactStatus.BUSY:
        return { ring: r.int(2, 5), talk: 0, result: CallResult.BUSY };
      default:
        return { ring: r.int(30, 45), talk: 0, result: CallResult.NO_ANSWER };
    }
  }

  private contactResult(c: FakeCampaign, k: FakeContact): void {
    const r = this.rnd;
    if (c.type === CampaignType.REMINDER) {
      k.note = r.pick(['Ertaga olib ketishini aytdi', 'Hujjatni allaqachon olgan', "Qabul vaqtini so'radi, aytib berildi"]);
      return;
    }
    if (c.type === CampaignType.INFORM) return;
    k.resolved = r.weighted([['yes', 70], ['partly', 18], ['no', 12]] as const);
    if (c.type === CampaignType.SURVEY || r.chance(0.5)) {
      const byResolved: Record<string, (readonly [number, number])[]> = {
        yes: [[5, 60], [4, 30], [3, 10]],
        partly: [[4, 30], [3, 45], [2, 25]],
        no: [[1, 55], [2, 30], [3, 15]],
      };
      k.rating = r.weighted(byResolved[k.resolved]);
      if (k.call) this.campaignSurveys.push({ call: k.call, ticket: k.ticket, score: k.rating });
    }
    if (k.resolved === 'no') k.note = "Masala hal bo'lmagan — supervisorga xabar berildi";
  }

  private finishCampaigns(): void {
    for (const c of this.campaigns) {
      if (c.status === CampaignStatus.COMPLETED) {
        for (const k of c.contacts) {
          if (!OPEN_CONTACT.includes(k.status)) continue;
          k.status = CampaignContactStatus.FAILED;
          k.nextAttemptAt = null;
          k.note = 'Kampaniya yakunlandi';
        }
      }
      if (c.source === 'citizens' && c.startsAt) {
        const people = this.rnd.sample(
          this.citizens.map((citizen) => citizen.person),
          c.target,
        );
        c.contacts = people.map((p) => this.contact(p, null, c.startsAt!, later(c.createdAt, HOUR)));
      }
    }
  }

  // ───────────── Omnikanal ─────────────

  private conversationsOf(day: Date, agents: AgentDay[]): void {
    const isWork = this.callCenterWorks(day);
    const n = Math.round((isWork ? 14 : 5) * this.opts.scale * this.rnd.float(0.7, 1.3));
    const t = day.getTime();
    const pool =
      agents.length > 0
        ? agents.map((a) => this.staffById.get(a.agent.userId)!)
        : this.operators.filter((o) => o.activeFrom <= t && o.activeTo > t);
    if (pool.length === 0) return;
    for (let i = 0; i < n; i++) {
      const first = atHour(day, this.rnd.float(7.5, 23)).getTime();
      if (first >= this.now) continue;
      const channel = this.rnd.weighted([
        [TicketChannel.TELEGRAM, 70],
        [TicketChannel.WEBCHAT, 20],
        [TicketChannel.EMAIL, 10],
      ] as const);
      const person = this.persons.length > 100 && this.rnd.chance(0.15) ? this.rnd.pick(this.persons) : this.newPerson();
      if (channel === TicketChannel.TELEGRAM && person.telegramChat) continue; // bir chat — bitta suhbat
      const assignee = this.rnd.pick(pool);
      const topic = this.pickTopic(null, undefined, new Date(first));
      const profile = TOPIC_PROFILES[topic];
      const applicationNumber = randomApplicationNumber(this.rnd);
      const conversation: FakeConversation = {
        id: 0,
        channel,
        externalId: this.externalId(channel, person),
        person,
        ticket: null,
        assignee,
        createdAt: new Date(first),
        messages: [],
      };
      const firstText = profile.chat.replace('{ariza}', applicationNumber);
      conversation.messages.push({ direction: MessageDirection.IN, author: null, body: () => firstText, sentAt: new Date(first) });
      const replyAt = (from: number) =>
        this.isWorkingTime(from)
          ? from + this.rnd.int(1, channel === TicketChannel.EMAIL ? 180 : 9) * MINUTE
          : this.cal.snap(new Date(from), this.rnd).getTime();
      let at = first;
      const exchanges = this.rnd.int(1, 3);
      for (let k = 0; k < exchanges; k++) {
        at = replyAt(at);
        if (at > this.now) break;
        const reply = this.rnd.pick(OPERATOR_REPLIES);
        conversation.messages.push({ direction: MessageDirection.OUT, author: assignee, body: () => reply, sentAt: new Date(at) });
        at += this.rnd.int(1, 40) * MINUTE;
        if (at > this.now) break;
        const photo = this.rnd.chance(0.2);
        const text = photo ? '[rasm]' : this.rnd.pick(CITIZEN_FOLLOWUPS);
        conversation.messages.push({
          direction: MessageDirection.IN,
          author: null,
          body: () => text,
          sentAt: new Date(at),
          attachments: photo ? [{ type: 'photo', fileName: 'hujjat.jpg', sizeBytes: this.rnd.int(200, 2400) * 1024 }] : undefined,
        });
      }
      if (this.rnd.chance(0.35)) {
        const ticketAt = replyAt(at);
        if (ticketAt <= this.now) {
          // Telegram bot murojaatni o'zi yaratadi; veb-chat va emaildan operator rasmiylashtiradi
          const bot = channel === TicketChannel.TELEGRAM;
          const ticket = this.createTicket({ at: new Date(ticketAt), channel, creator: bot ? null : assignee, person, queue: null, topic });
          conversation.ticket = ticket;
          conversation.messages.push({
            direction: MessageDirection.OUT,
            author: bot ? null : assignee,
            body: () => `Murojaatingiz qabul qilindi. Raqami: ${ticket.number}. Holati haqida SMS orqali xabar beramiz.`,
            sentAt: new Date(ticketAt + SECOND),
          });
        }
      }
      this.conversations.push(conversation);
    }
  }

  private externalId(channel: TicketChannel, person: Person): string {
    if (channel === TicketChannel.TELEGRAM) {
      let id: string;
      do id = String(this.rnd.int(100_000_000, 2_147_483_647));
      while (this.telegramIds.has(id));
      this.telegramIds.add(id);
      person.telegramChat = id;
      return id;
    }
    return channel === TicketChannel.WEBCHAT ? `web-${this.rnd.hex(16)}` : `<${this.rnd.hex(24)}@mail.test>`;
  }

  // ───────────── Ogohlantirishlar ─────────────

  private alertRule(code: string) {
    const rule = this.ref.alertRules.find((r) => r.code === code);
    return rule && rule.isActive ? rule : null;
  }

  /** Navbat soatlari bo'yicha limit buzilishlari: ketma-ket soatlar bitta ogohlantirishga birlashadi. */
  private queueAlerts(hours: QueueHour[]): void {
    const byQueue = new Map<string, QueueHour[]>();
    for (const hour of hours) byQueue.set(hour.queue, [...(byQueue.get(hour.queue) ?? []), hour]);
    const warn = this.alertRule('queue.wait.warning');
    const critical = this.alertRule('queue.wait.critical');
    const abandon = this.alertRule('calls.abandoned_rate');
    for (const [queue, list] of byQueue) {
      list.sort((a, b) => a.hourStart - b.hourStart);
      const name = this.queueByNumber.get(queue) ?? queue;
      const source = `UCM6510 · queue ${queue}`;
      if (warn) {
        for (const episode of this.episodes(list, (h) => h.maxQueueWait > warn.threshold)) {
          const value = Math.max(...episode.map((h) => h.maxQueueWait));
          this.queueAlert(warn, episode, value, source, `«${name}» navbatida kutish ${mmss(value)} bo'ldi — ${mmss(warn.threshold)} limitidan oshdi.`);
        }
      }
      if (critical) {
        for (const episode of this.episodes(list, (h) => h.maxQueueWait > critical.threshold)) {
          const value = Math.max(...episode.map((h) => h.maxQueueWait));
          this.queueAlert(critical, episode, value, source, `«${name}» navbatida kutish ${mmss(value)} — ${mmss(critical.threshold)} kritik chegarasidan oshdi.`);
        }
      }
      if (abandon) {
        const rate = (h: QueueHour) => Math.round((h.abandoned / h.calls) * 100);
        for (const episode of this.episodes(list, (h) => h.calls >= 8 && rate(h) > abandon.threshold)) {
          const value = Math.max(...episode.map(rate));
          this.queueAlert(abandon, episode, value, source, `«${name}» navbatida 1 soatda javobsiz qo'ng'iroqlar ulushi ${value}% ga yetdi (limit ${abandon.threshold}%).`);
        }
      }
    }
  }

  private episodes(hours: QueueHour[], breach: (h: QueueHour) => boolean): QueueHour[][] {
    const out: QueueHour[][] = [];
    let current: QueueHour[] = [];
    for (const hour of hours) {
      const contiguous = current.length > 0 && hour.hourStart - current[current.length - 1].hourStart === HOUR;
      if (breach(hour)) {
        if (current.length > 0 && !contiguous) {
          out.push(current);
          current = [];
        }
        current.push(hour);
      } else if (current.length > 0) {
        out.push(current);
        current = [];
      }
    }
    if (current.length > 0) out.push(current);
    return out;
  }

  private queueAlert(
    rule: { id: number; severity: AlertSeverity },
    episode: QueueHour[],
    value: number,
    source: string,
    message: string,
  ): void {
    const startedAt = episode[0].firstBreachAt ?? episode[0].hourStart + this.rnd.int(5, 40) * MINUTE;
    const end = episode[episode.length - 1].hourStart + this.rnd.int(25, 58) * MINUTE;
    const active = end > this.now;
    const supervisor = this.rnd.pick(this.supervisors);
    const ackAt = startedAt + this.rnd.int(1, 6) * MINUTE;
    const acked = this.rnd.chance(0.5) && ackAt <= this.now;
    this.alerts.push({
      ruleId: rule.id,
      severity: rule.severity,
      status: active ? (acked ? AlertStatus.ACKNOWLEDGED : AlertStatus.ACTIVE) : AlertStatus.RESOLVED,
      message,
      source,
      value,
      details: { hours: episode.length, calls: episode.reduce((s, h) => s + h.calls, 0), abandoned: episode.reduce((s, h) => s + h.abandoned, 0) },
      startedAt: new Date(startedAt),
      acknowledgedAt: acked ? new Date(ackAt) : null,
      acknowledgedById: acked ? supervisor.id : null,
      resolvedAt: active ? null : new Date(Math.max(end, startedAt + MINUTE)),
      resolvedById: !active && this.rnd.chance(0.25) ? supervisor.id : null,
    });
  }

  /** PBX va infratuzilma hodisalari: trunk uzilishi, AMI qayta ulanishi, arxiv diski. */
  private systemAlerts(): void {
    const randomWorkTime = () => {
      let day = addDays(this.start, this.rnd.int(0, this.opts.days - 1));
      while (!this.cal.isWorkday(day)) day = addDays(day, 1);
      return Math.min(atHour(day, this.rnd.float(8, 18)).getTime(), this.now - HOUR);
    };
    const trunk = this.alertRule('trunk.down');
    for (let i = 0; i < 3 && trunk; i++) {
      const at = randomWorkTime();
      const seconds = this.rnd.int(60, 240);
      this.alerts.push({
        ruleId: trunk.id,
        severity: trunk.severity,
        status: AlertStatus.RESOLVED,
        message: `SIP trunk «Uztelecom-1» ${Math.round(seconds / 60)} daqiqa ulanmagan.`,
        source: 'UCM6510 · trunk 1',
        value: seconds,
        startedAt: new Date(at),
        resolvedAt: new Date(at + seconds * SECOND),
      });
    }
    for (let i = 0; i < 4; i++) {
      const at = randomWorkTime();
      this.alerts.push({
        severity: AlertSeverity.INFO,
        status: AlertStatus.RESOLVED,
        message: 'AMI ulanishi uzildi va qayta tiklandi.',
        source: 'UCM6510 · AMI',
        startedAt: new Date(at),
        resolvedAt: new Date(at + this.rnd.int(20, 90) * SECOND),
      });
    }
    const storage = this.alertRule('storage.recordings');
    if (storage) {
      this.alerts.push({
        ruleId: storage.id,
        severity: storage.severity,
        status: AlertStatus.ACTIVE,
        message: "Yozuvlar arxivi diski 86% to'ldi (3 oylik saqlash muddati).",
        source: 'NAS · /recordings',
        value: 86,
        startedAt: new Date(Math.min(atHour(this.today, 9).getTime(), this.now - 30 * MINUTE)),
      });
    }
  }

  // ───────────── Audit ─────────────

  private audit(at: number, actor: Staff | null, action: string, entityType?: string, entityId?: () => string, details?: Prisma.InputJsonValue): void {
    if (at > this.now) return;
    this.auditDrafts.push({ at, actor, action, entityType, entityId, details });
  }

  private login(staff: Staff, at: number): void {
    if (at > this.now) return;
    if (this.rnd.chance(0.015)) this.audit(at - this.rnd.int(20, 90) * SECOND, staff, 'auth.login_failed', undefined, undefined, { locked: false });
    this.audit(at, staff, 'auth.login');
    staff.lastLoginAt = Math.max(staff.lastLoginAt ?? 0, at);
  }

  private dayAudit(day: Date, isWork: boolean): void {
    if (!isWork) return;
    const t = day.getTime();
    const chance: Record<string, number> = {
      SUPERVISOR: 0.97, UNIT_HEAD: 0.85, EXECUTOR: 0.85, ANTI_CORRUPTION: 0.85, DIRECTOR: 0.6, LEADERSHIP: 0.6, ADMIN: 0.3, AUDITOR: 0.25,
    };
    // --work-today bilan dam olish kuni: bo'linmalar ishlamaydi, call-markazda faqat supervisorlar navbatchi
    const calendarWorkday = this.cal.isWorkday(day);
    for (const staff of this.staffById.values()) {
      if (staff.role === 'OPERATOR' || staff.activeFrom > t || staff.activeTo <= t) continue;
      if (!calendarWorkday && staff.role !== 'SUPERVISOR') continue;
      if (this.rnd.chance(chance[staff.role] ?? 0.5)) this.login(staff, atHour(day, this.rnd.float(8.7, 9.9)).getTime());
    }
    for (const staff of [...this.supervisors, ...this.leaders]) {
      if (!this.rnd.chance(0.2)) continue;
      const status = this.rnd.pick([undefined, 'IN_PROGRESS', 'CLOSED', 'ROUTED']);
      this.audit(atHour(day, this.rnd.float(10, 17.5)).getTime(), staff, 'ticket.export', 'Ticket', () => 'list', {
        rows: this.rnd.int(40, 2500),
        filters: status ? { status } : {},
      });
    }
  }

  // ───────────── Raqamlar va id ─────────────

  private numberTickets(): void {
    this.tickets.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const counters = new Map(this.ref.counters.map((c) => [c.year, c.value]));
    for (const ticket of this.tickets) {
      const year = ticket.createdAt.getFullYear();
      const value = (counters.get(year) ?? 0) + 1;
      counters.set(year, value);
      ticket.number = formatTicketNumber(this.ticketPrefix, year, value);
    }
    this.ticketCounters = counters;
  }

  private ticketCounters = new Map<number, number>();

  /** Id'lar oldindan sequence'dan olinadi: bog'liq jadvallar createMany bilan yoziladi. */
  private async assignIds(): Promise<void> {
    const reserve = async <T extends { id: number }>(table: string, items: T[], order: (item: T) => number) => {
      if (items.length === 0) return;
      const rows = await this.tx.$queryRawUnsafe<{ id: number }[]>(
        `SELECT nextval(pg_get_serial_sequence('${table}', 'id'))::int AS id FROM generate_series(1, ${items.length})`,
      );
      const ids = rows.map((r) => r.id).sort((a, b) => a - b);
      items.sort((a, b) => order(a) - order(b)).forEach((item, i) => (item.id = ids[i]));
    };
    await reserve('citizens', this.citizens, (c) => c.createdAt.getTime());
    await reserve('tickets', this.tickets, (t) => t.createdAt.getTime());
    await reserve('calls', this.calls, (c) => c.startedAt.getTime());
    await reserve('conversations', this.conversations, (c) => c.createdAt.getTime());
    await reserve('campaigns', this.campaigns, (c) => c.createdAt.getTime());
  }

  // ───────────── Bazaga yozish ─────────────

  private async save(tariffs: { id: number; prefix: string; price: number }[]): Promise<void> {
    const tx = this.tx;
    const many = async <T>(label: string, rows: T[], insert: (chunk: T[]) => Promise<unknown>, size = 1000) => {
      for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
      this.counts[label] = (this.counts[label] ?? 0) + rows.length;
    };
    const r = this.rnd;
    const ticketRows = this.ticketSideEffects();
    const callRows = this.callSideEffects(tariffs);

    await many('citizens', this.citizens, (chunk) =>
      tx.citizen.createMany({
        data: chunk.map((c) => ({
          id: c.id,
          phone: c.person.phone,
          extraPhones: c.person.extraPhones,
          fullName: c.person.fullName,
          regionId: c.person.regionId,
          districtId: c.person.districtId,
          address: c.person.address,
          language: c.person.language,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
      }),
    );
    await many('tickets', this.tickets, (chunk) =>
      tx.ticket.createMany({
        data: chunk.map((t) => ({
          id: t.id,
          number: t.number,
          channel: t.channel,
          type: t.type,
          status: t.status,
          categoryId: t.topic.id,
          citizenId: t.citizen?.id ?? null,
          isAnonymous: t.isAnonymous,
          isConfidential: t.isConfidential,
          regionId: t.regionId,
          districtId: t.districtId,
          subject: t.subject,
          description: t.description,
          cadastreNumber: t.cadastreNumber,
          applicationNumber: t.applicationNumber,
          createdById: t.createdBy?.id ?? null,
          assignedOrgUnitId: t.assignedOrgUnitId,
          assigneeId: t.assignee?.id ?? null,
          dueAt: t.dueAt,
          escalatedAt: t.escalatedAt,
          answer: t.answer,
          answeredAt: t.answeredAt,
          closedAt: t.closedAt,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        })),
      }),
    );
    const events = this.tickets.flatMap((t) =>
      t.events.map(
        (e): Prisma.TicketEventCreateManyInput => ({
          ticketId: t.id,
          actorId: e.actor?.id ?? null,
          type: e.type,
          fromStatus: e.from ?? null,
          toStatus: e.to ?? null,
          orgUnitId: e.orgUnitId ?? null,
          comment: e.comment ?? null,
          createdAt: e.at,
        }),
      ),
    );
    await many('ticket_events', events, (data) => tx.ticketEvent.createMany({ data }));

    await many('calls', this.calls, (chunk) =>
      tx.call.createMany({
        data: chunk.map((c) => {
          const citizen = c.person?.citizen;
          return {
            id: c.id,
            pbxCallId: c.pbxCallId,
            direction: c.direction,
            callerNumber: c.callerNumber,
            calledNumber: c.calledNumber,
            queueId: c.queueId,
            agentId: c.agent?.id ?? null,
            // CDR yozilganda fuqaro kartasi bo'lsa bog'lanadi
            citizenId: citizen && citizen.createdAt <= c.endedAt ? citizen.id : null,
            ticketId: c.ticket?.id ?? null,
            ivrPath: c.ivrPath,
            startedAt: c.startedAt,
            answeredAt: c.answeredAt,
            endedAt: c.endedAt,
            waitSeconds: c.waitSeconds,
            talkSeconds: c.talkSeconds,
            result: c.result,
            hangupBy: c.hangupBy,
            createdAt: later(c.endedAt, 2 * SECOND),
          };
        }),
      }),
    );
    await many('recordings', callRows.recordings, (data) => tx.recording.createMany({ data }));
    await many('call_charges', callRows.charges, (data) => tx.callCharge.createMany({ data }));
    await many('surveys', callRows.surveys, (data) => tx.survey.createMany({ data }));
    await many('qa_evaluations', callRows.qa, (data) => tx.qaEvaluation.createMany({ data }));
    await many('transcripts', callRows.transcripts, (data) => tx.transcript.createMany({ data }), 500);

    await many(
      'callback_requests',
      this.callbacks.filter((c) => c.requestedAt.getTime() <= this.now),
      (chunk) =>
        tx.callbackRequest.createMany({
          data: chunk.map((c) => ({
            phone: c.person.phone,
            queueId: c.queueId,
            status: c.status,
            requestedAt: c.requestedAt,
            attempts: c.attempts,
            handledById: c.handledBy?.id ?? null,
            handledAt: c.handledAt,
            callId: c.call?.id ?? null,
          })),
        }),
    );

    const supervisor = this.supervisors[0] ?? null;
    await many('campaigns', this.campaigns, (chunk) =>
      tx.campaign.createMany({
        data: chunk.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          status: c.status,
          description: c.description,
          script: c.script || null,
          queueId: this.queueIds.get(OUTBOUND_QUEUE) ?? null,
          maxAttempts: 3,
          startsAt: c.startsAt,
          endsAt: c.endsAt,
          createdById: supervisor?.id ?? null,
          createdAt: c.createdAt,
          updatedAt: c.pausedAt ?? (c.status === CampaignStatus.COMPLETED ? c.endsAt! : c.createdAt),
        })),
      }),
    );
    const contacts = this.campaigns.flatMap((c) =>
      c.contacts.map(
        (k): Prisma.CampaignContactCreateManyInput => ({
          campaignId: c.id,
          phone: k.person.phone,
          fullName: k.person.fullName,
          citizenId: k.person.citizen?.id ?? null,
          ticketId: k.ticket?.id ?? null,
          status: k.status,
          attempts: k.attempts,
          lastAttemptAt: k.lastAttemptAt,
          nextAttemptAt: k.nextAttemptAt,
          agentId: k.agent?.id ?? null,
          callId: k.call?.id ?? null,
          resolved: k.resolved,
          rating: k.rating,
          note: k.note,
          createdAt: k.createdAt,
        }),
      ),
    );
    await many('campaign_contacts', contacts, (data) => tx.campaignContact.createMany({ data }));

    await many('conversations', this.conversations, (chunk) =>
      tx.conversation.createMany({
        data: chunk.map((c) => {
          const last = c.messages[c.messages.length - 1].sentAt;
          const status =
            this.now - last.getTime() > DAY
              ? ConversationStatus.CLOSED
              : c.messages[c.messages.length - 1].direction === MessageDirection.IN
                ? ConversationStatus.OPEN
                : ConversationStatus.PENDING;
          const citizen = c.person.citizen;
          // O'qilmagan: ochiq suhbat oxiridagi javobsiz kiruvchi xabarlar
          let unread = 0;
          for (let k = c.messages.length - 1; k >= 0 && c.messages[k].direction === MessageDirection.IN; k--) unread++;
          // Telegram'da raqam "Telefon raqamni yuborish" tugmasi bilan, veb-chatda formada kiritiladi
          const sharesPhone = c.channel !== TicketChannel.EMAIL && (c.ticket !== null || r.chance(0.5));
          return {
            id: c.id,
            channel: c.channel,
            externalId: c.externalId,
            citizenId: citizen && citizen.createdAt <= last ? citizen.id : null,
            ticketId: c.ticket?.id ?? null,
            assigneeId: c.assignee?.id ?? null,
            status,
            contactName: c.person.fullName,
            contactHandle: c.channel === TicketChannel.EMAIL ? `fuqaro${r.int(100, 99_999)}@mail.test` : null,
            contactPhone: sharesPhone ? c.person.phone : null,
            subject: c.channel === TicketChannel.EMAIL ? c.messages[0].body().slice(0, 60) : null,
            unreadCount: status === ConversationStatus.OPEN ? unread : 0,
            lastMessageAt: last,
            closedAt: status === ConversationStatus.CLOSED ? new Date(last.getTime() + HOUR) : null,
            createdAt: c.createdAt,
          };
        }),
      }),
    );
    const messages = this.conversations.flatMap((c) =>
      c.messages.map(
        (m): Prisma.MessageCreateManyInput => ({
          conversationId: c.id,
          direction: m.direction,
          authorId: m.author?.id ?? null,
          body: m.body(),
          attachments: m.attachments,
          externalId: c.channel === TicketChannel.TELEGRAM ? String(r.int(1000, 999999)) : null,
          status: m.direction === MessageDirection.OUT ? 'sent' : null,
          isAuto: m.direction === MessageDirection.OUT && m.author === null,
          sentAt: m.sentAt,
        }),
      ),
    );
    await many('messages', messages, (data) => tx.message.createMany({ data }));

    await many('ticket_tasks', ticketRows.tasks, (data) => tx.ticketTask.createMany({ data }));
    await many('attachments', ticketRows.attachments, (data) => tx.attachment.createMany({ data }));
    await many('notifications', ticketRows.notifications, (data) => tx.notification.createMany({ data }));
    await many('sms_messages', ticketRows.sms, (data) => tx.smsMessage.createMany({ data }));

    // Oldingi sinovlardan qolgan ochiq holatlar yopiladi: har operatorda bitta joriy holat bo'lsin
    const operatorIds = this.operators.map((o) => o.id);
    if (operatorIds.length > 0) {
      await tx.$executeRaw`UPDATE agent_status_logs SET "endedAt" = "startedAt" WHERE "endedAt" IS NULL AND "userId" IN (${Prisma.join(operatorIds)})`;
    }
    await many('agent_status_logs', this.statusLogs, (data) => tx.agentStatusLog.createMany({ data }), 2000);

    this.systemAlerts();
    await many('alerts', this.alerts, (data) => tx.alert.createMany({ data }));

    const blacklist = Array.from({ length: 6 }, (_, i): Prisma.BlacklistedNumberCreateManyInput => {
      const createdAt = new Date(this.start.getTime() + r.int(0, Math.max(0, this.opts.days - 2)) * DAY + r.int(10, 17) * HOUR);
      let phone: string;
      do phone = randomMobile(r);
      while (this.phones.has(phone));
      this.phones.add(phone);
      return {
        phone,
        reason: BLACKLIST_REASONS[i % BLACKLIST_REASONS.length],
        createdById: r.pick(this.supervisors).id,
        expiresAt: r.chance(0.5) ? null : new Date(createdAt.getTime() + r.pick([30, 90]) * DAY),
        createdAt,
      };
    });
    await many('blacklisted_numbers', blacklist, (data) => tx.blacklistedNumber.createMany({ data }));

    const articles = KNOWLEDGE_ARTICLES.map(
      (a, i): Prisma.KnowledgeArticleCreateManyInput => ({
        categoryId: this.categoryByCode.get(a.category)?.id ?? null,
        title: a.title,
        body: a.body,
        isPublished: i < KNOWLEDGE_ARTICLES.length - 1,
        updatedById: supervisor?.id ?? null,
        createdAt: new Date(this.start.getTime() - (20 - i) * DAY),
        updatedAt: new Date(this.start.getTime() + r.int(0, Math.max(0, this.opts.days - 1)) * DAY),
      }),
    );
    await many('knowledge_articles', articles, (data) => tx.knowledgeArticle.createMany({ data }));

    const ipOf = (staff: Staff | null) => (staff ? `10.10.${(staff.id % 30) + 1}.${((staff.id * 7) % 250) + 2}` : null);
    const audit = this.auditDrafts
      .sort((a, b) => a.at - b.at)
      .map(
        (a): Prisma.AuditLogCreateManyInput => ({
          actorId: a.actor?.id ?? null,
          action: a.action,
          entityType: a.entityType,
          entityId: a.entityId?.(),
          ip: ipOf(a.actor),
          userAgent: a.actor ? USER_AGENTS[a.actor.id % USER_AGENTS.length] : null,
          details: a.details,
          createdAt: new Date(a.at),
        }),
      );
    await many('audit_logs', audit, (data) => tx.auditLog.createMany({ data }), 2000);

    for (const staff of this.staffById.values()) {
      if (staff.lastLoginAt !== null) {
        await tx.user.update({ where: { id: staff.id }, data: { lastLoginAt: new Date(staff.lastLoginAt) } });
      }
    }
    for (const [year, value] of this.ticketCounters) {
      await tx.ticketCounter.upsert({ where: { year }, update: { value }, create: { year, value } });
    }
    await tx.setting.create({
      data: {
        key: 'demo_data',
        value: {
          generatedAt: new Date(this.now).toISOString(),
          from: dateKey(this.start),
          to: dateKey(this.today),
          days: this.opts.days,
          scale: this.opts.scale,
          seed: this.opts.seed,
          counts: this.counts,
        },
      },
    });
  }

  /** Murojaatdan kelib chiqadigan yozuvlar: SMS, bildirishnomalar, vazifalar, ilovalar va audit. */
  private ticketSideEffects() {
    const r = this.rnd;
    const tasks: Prisma.TicketTaskCreateManyInput[] = [];
    const attachments: Prisma.AttachmentCreateManyInput[] = [];
    const notifications: Prisma.NotificationCreateManyInput[] = [];
    const sms: Prisma.SmsMessageCreateManyInput[] = [];
    const E = TicketEventType;

    const notify = (user: Staff | null | undefined, at: Date, type: string, title: string, body: string | null, ticket: FakeTicket) => {
      if (!user || at.getTime() > this.now) return;
      const old = this.now - at.getTime() > 2 * DAY;
      const readAt = r.chance(old ? 0.9 : 0.5) ? Math.min(this.now, at.getTime() + r.int(5, 1440) * MINUTE) : null;
      notifications.push({ userId: user.id, type, title, body, link: `/tickets/${ticket.id}`, readAt: readAt ? new Date(readAt) : null, createdAt: at });
    };
    const sendSms = (ticket: FakeTicket, template: string, at: number) => {
      const person = ticket.person;
      if (!person || ticket.isAnonymous || at > this.now) return;
      const text = (this.smsTemplates[template] ?? SMS_FALLBACK[template]).replace('{raqam}', ticket.number);
      const fresh = this.now - at < 30 * SECOND;
      const status = fresh ? SmsStatus.QUEUED : r.weighted([[SmsStatus.DELIVERED, 95], [SmsStatus.SENT, 2], [SmsStatus.FAILED, 3]] as const);
      const sentAt = status === SmsStatus.QUEUED ? null : at + r.int(1, 3) * SECOND;
      const deliveredAt = status === SmsStatus.DELIVERED && sentAt ? Math.min(this.now, sentAt + r.int(3, 40) * SECOND) : null;
      sms.push({
        phone: person.phone,
        text,
        template,
        status,
        citizenId: ticket.citizen?.id ?? null,
        ticketId: ticket.id,
        providerId: sentAt ? r.hex(16) : null,
        error: status === SmsStatus.FAILED ? r.pick(['Abonent mavjud emas', 'Operator shlyuzi javob bermadi', 'Abonent tarmoqdan tashqarida']) : null,
        createdAt: new Date(at),
        sentAt: sentAt ? new Date(sentAt) : null,
        deliveredAt: deliveredAt ? new Date(deliveredAt) : null,
      });
    };

    for (const ticket of this.tickets) {
      const t0 = ticket.createdAt.getTime();
      const initial = ticket.events.filter((e) => e.at.getTime() <= t0 + 2 * SECOND).pop();
      if (ticket.createdBy) {
        this.audit(t0 + SECOND, ticket.createdBy, 'ticket.create', 'Ticket', () => String(ticket.id), {
          number: ticket.number,
          status: initial?.to ?? TicketStatus.NEW,
        });
      }
      sendSms(ticket, 'ticket_created', t0 + 5 * SECOND);

      let unitId: number | null = null;
      let assignee: Staff | null = null;
      let closedOnce = false;
      for (const e of ticket.events) {
        const at = e.at;
        switch (e.type) {
          case E.ROUTED:
            unitId = e.orgUnitId ?? null;
            break;
          case E.RETURNED:
            for (const s of this.supervisors) notify(s, at, 'ticket.returned', `Murojaat qaytarildi: ${ticket.number}`, e.comment ?? null, ticket);
            unitId = null;
            break;
          case E.ASSIGNED:
            assignee = e.assignee ?? null;
            notify(assignee, at, 'ticket.assigned', `Yangi murojaat: ${ticket.number}`, ticket.subject, ticket);
            this.audit(at.getTime() - r.int(1, 10) * MINUTE, e.actor, 'ticket.view', 'Ticket', () => String(ticket.id));
            this.audit(at.getTime() + r.int(5, 180) * MINUTE, assignee, 'ticket.view', 'Ticket', () => String(ticket.id));
            break;
          case E.REJECTED:
            notify(assignee, at, 'ticket.rejected', `Javob qaytarildi: ${ticket.number}`, e.comment ?? null, ticket);
            break;
          case E.ESCALATED:
            for (const head of unitId ? this.staffOf(unitId).heads : this.supervisors) {
              notify(head, at, 'ticket.overdue', `Muddati o'tdi: ${ticket.number}`, ticket.subject, ticket);
            }
            break;
          case E.APPROVED:
            this.audit(at.getTime() - r.int(5, 60) * MINUTE, e.actor, 'ticket.view', 'Ticket', () => String(ticket.id));
            if (!closedOnce) sendSms(ticket, 'ticket_closed', at.getTime() + 10 * SECOND);
            closedOnce = true;
            break;
        }
      }

      // Muddatga 1 kun qolganda javob hali yo'q bo'lsa — ijrochiga eslatma
      if (ticket.dueAt) {
        const remindAt = new Date(ticket.dueAt.getTime() - DAY);
        const assigned = ticket.events.find((e) => e.type === E.ASSIGNED && e.at < remindAt);
        const answered = ticket.events.find((e) => e.type === E.ANSWERED);
        if (assigned && (!answered || answered.at > remindAt)) {
          notify(assigned.assignee, remindAt, 'ticket.due_soon', `Muddat yaqinlashmoqda: ${ticket.number}`, `Ijro muddati: ${formatDate(ticket.dueAt)}`, ticket);
        }
      }

      const assigned = ticket.events.find((e) => e.type === E.ASSIGNED);
      if (assigned && r.chance(0.2)) {
        const answeredAt = ticket.events.find((e) => e.type === E.ANSWERED)?.at.getTime() ?? null;
        const routed = [...ticket.events].reverse().find((e) => e.type === E.ROUTED && e.at <= assigned.at);
        const colleagues = routed?.orgUnitId ? this.staffOf(routed.orgUnitId).executors : [];
        for (const title of r.sample(TASK_TITLES, r.int(1, 3))) {
          const createdAt = this.cal.addWorkingHours(assigned.at, r.float(0.2, 9), r).getTime();
          if (createdAt > this.now) continue;
          const who = r.chance(0.2) && ticket.createdBy ? ticket.createdBy : r.chance(0.7) || colleagues.length === 0 ? assigned.assignee! : r.pick(colleagues);
          const dueAt = createdAt + r.int(2, 7) * DAY;
          const doneLimit = answeredAt ?? this.now;
          const completed = doneLimit > createdAt && r.chance(answeredAt ? 0.85 : 0.3);
          const completedAt = completed ? createdAt + (doneLimit - createdAt) * r.float(0.2, 0.95) : null;
          tasks.push({
            ticketId: ticket.id,
            title,
            assigneeId: who.id,
            dueAt: new Date(dueAt),
            completedAt: completedAt ? new Date(completedAt) : null,
            createdById: (r.chance(0.6) ? assigned.actor : assigned.assignee)?.id ?? null,
            createdAt: new Date(createdAt),
            updatedAt: new Date(completedAt ?? createdAt),
          });
        }
      }

      if (ticket.status !== TicketStatus.CLOSED || ticket.events.length > 2) {
        let n = 0;
        if (r.chance(0.15)) {
          for (const file of r.sample(ATTACHMENTS.filter((a) => !a.byExecutor), r.int(1, 3))) {
            const at = t0 + r.int(1, 30) * MINUTE;
            if (at > this.now) continue;
            attachments.push({
              ticketId: ticket.id,
              storageKey: `demo/attachments/${ticket.id}/${++n}-${file.name}`,
              fileName: file.name,
              mimeType: file.mime,
              sizeBytes: r.int(file.minKb, file.maxKb) * 1024,
              uploadedById: ticket.channel === TicketChannel.TELEGRAM ? null : ticket.createdBy?.id ?? null,
              createdAt: new Date(at),
            });
          }
        }
        const answer = ticket.events.find((e) => e.type === E.ANSWERED);
        if (answer && r.chance(0.25)) {
          const file = r.pick(ATTACHMENTS.filter((a) => a.byExecutor));
          attachments.push({
            ticketId: ticket.id,
            storageKey: `demo/attachments/${ticket.id}/${++n}-${file.name}`,
            fileName: file.name,
            mimeType: file.mime,
            sizeBytes: r.int(file.minKb, file.maxKb) * 1024,
            uploadedById: answer.actor?.id ?? null,
            createdAt: answer.at,
          });
        }
      }
    }
    return { tasks, attachments, notifications, sms };
  }

  /** Qo'ng'iroqdan kelib chiqadigan yozuvlar: audio, narx, baho, sifat nazorati, transkript. */
  private callSideEffects(tariffs: { id: number; prefix: string; price: number }[]) {
    const r = this.rnd;
    const recordings: Prisma.RecordingCreateManyInput[] = [];
    const charges: Prisma.CallChargeCreateManyInput[] = [];
    const surveys: Prisma.SurveyCreateManyInput[] = [];
    const qa: Prisma.QaEvaluationCreateManyInput[] = [];
    const transcripts: Prisma.TranscriptCreateManyInput[] = [];
    const callCenter = this.unitByCode.get('call-center')!.id;
    const transcriptFrom = this.now - 10 * DAY;
    const listeners = [...this.supervisors, ...this.leaders];

    for (const call of this.calls) {
      if (call.result !== CallResult.ANSWERED || call.talkSeconds === 0 || !call.answeredAt) continue;
      const ended = call.endedAt.getTime();
      const confidential = call.ticket?.isConfidential ?? false;
      const retainUntil = ended + this.retentionDays * DAY;
      const deleted = !confidential && retainUntil < this.now;
      // Fayl birinchi tinglashda yaratiladi (RecordingsService, "demo/" kaliti)
      recordings.push({
        callId: call.id,
        storageKey: `demo/${call.startedAt.getFullYear()}/${String(call.startedAt.getMonth() + 1).padStart(2, '0')}/${call.pbxCallId}.wav`,
        format: 'wav',
        sizeBytes: 44 + Math.round(call.talkSeconds * 8000) * 2,
        durationSeconds: call.talkSeconds,
        retainUntil: new Date(retainUntil),
        legalHold: confidential,
        deletedAt: deleted ? new Date(retainUntil + r.int(1, 6) * HOUR) : null,
        createdAt: later(call.endedAt, r.int(10, 60) * SECOND),
      });

      if (call.direction === CallDirection.OUTBOUND) {
        const digits = call.calledNumber.replace(/\D/g, '');
        const tariff = tariffs.find((t) => digits.startsWith(t.prefix));
        const billable = Math.ceil(call.talkSeconds / 60) * 60;
        charges.push({
          callId: call.id,
          tariffId: tariff?.id ?? null,
          billableSec: billable,
          amount: tariff ? ((billable / 60) * tariff.price).toFixed(2) : '0',
          orgUnitId: callCenter,
          userId: call.agent?.id ?? null,
          calculatedAt: later(call.endedAt, MINUTE),
        });
        continue;
      }

      // IVR so'rovnomasi: suhbatdan keyin fuqaro 1–5 ball qo'yadi
      if (r.chance(0.3)) {
        const instant = call.ticket?.events.some((e) => e.type === TicketEventType.CLOSED) ?? false;
        const score = r.weighted<number>(
          instant
            ? [[5, 62], [4, 24], [3, 8], [2, 2], [1, 4]]
            : [[5, 48], [4, 24], [3, 13], [2, 6], [1, 9]],
        );
        surveys.push({ callId: call.id, ticketId: call.ticket?.id ?? null, score, createdAt: later(call.endedAt, 15 * SECOND) });
      }

      if (r.chance(0.02) && this.supervisors.length > 0) {
        const evaluator = r.pick(this.supervisors);
        const at = this.cal.addWorkingHours(call.endedAt, r.float(2, 30), r);
        if (at.getTime() <= this.now && !deleted) {
          const checklist = QA_CHECKLIST.map((c) => ({ ...c, score: Math.round(c.max * r.weighted<number>([[1, 60], [0.8, 25], [0.6, 10], [0.3, 5]])) }));
          qa.push({
            callId: call.id,
            evaluatorId: evaluator.id,
            agentId: call.agent!.id,
            score: checklist.reduce((s, c) => s + c.score, 0),
            checklist,
            comment: r.pick(QA_COMMENTS),
            createdAt: at,
          });
          this.audit(at.getTime() - r.int(5, 15) * MINUTE, evaluator, 'recording.play', 'Call', () => String(call.id), { pbxCallId: call.pbxCallId });
        }
      } else if (r.chance(0.003) && listeners.length > 0) {
        const at = this.cal.addWorkingHours(call.endedAt, r.float(0.5, 20), r).getTime();
        const listener = r.pick(listeners);
        this.audit(at, listener, r.chance(0.15) ? 'recording.download' : 'recording.play', 'Call', () => String(call.id), { pbxCallId: call.pbxCallId });
      }

      if (ended >= transcriptFrom && call.person?.language === 'uz' && r.chance(0.35)) {
        transcripts.push(this.transcript(call));
      }
    }
    for (const s of this.campaignSurveys) {
      surveys.push({ callId: s.call.id, ticketId: s.ticket?.id ?? null, score: s.score, createdAt: later(s.call.endedAt, 5 * SECOND) });
    }
    return { recordings, charges, surveys, qa, transcripts };
  }

  private transcript(call: FakeCall): Prisma.TranscriptCreateManyInput {
    const r = this.rnd;
    const ticket = call.ticket;
    const person = call.person!;
    const profile = ticket?.profile ?? TOPIC_PROFILES['topic.24'];
    const question = profile.chat.replace('{ariza}', ticket?.applicationNumber ?? randomApplicationNumber(r));
    const routed = ticket?.events.find((e) => e.type === TicketEventType.ROUTED);
    const unitName = routed?.orgUnitId ? this.unitById.get(routed.orgUnitId)?.name ?? "mas'ul bo'linma" : "mas'ul bo'linma";
    let reply: string;
    let outcome: string;
    if (!ticket) {
      reply = "Kerakli ma'lumotni berdim, boshqa savolingiz bo'lsa qo'ng'iroq qiling.";
      outcome = "Operator ma'lumot berdi, murojaat yaratilmadi.";
    } else if (ticket.events.some((e) => e.type === TicketEventType.CLOSED)) {
      reply = ticket.answer ?? "Kerakli ma'lumotni berdim.";
      outcome = "Operator joyida ma'lumot berdi, murojaat yopildi.";
    } else {
      reply = `Murojaatingizni ${unitName}ga yuboraman, javob ${ticket.topic.slaDays} kun ichida beriladi.`;
      outcome = `Murojaat ${unitName}ga yo'naltirildi.`;
    }
    const introduce = ticket?.isAnonymous
      ? 'Fuqaro: Ismimni aytmoqchi emasman.'
      : `Fuqaro: ${person.fullName ?? 'Ismim kerak emas'}${person.districtName ? `, ${person.districtName}` : ''}.`;
    const lines = [
      `Operator: Assalomu alaykum, Kadastr agentligi 1097 ishonch telefoni, ${call.agent?.fullName ?? 'operator'} tinglaydi.`,
      `Fuqaro: Assalomu alaykum. ${question}`,
      'Operator: Tushunarli. Ism-familiyangiz va yashash hududingizni ayta olasizmi?',
      introduce,
      `Operator: ${reply}`,
      'Fuqaro: Rahmat, tushundim.',
      ticket ? `Operator: Murojaatingiz ${ticket.number} raqami bilan ro'yxatga olindi. Yana savollaringiz bormi?` : 'Operator: Yana savollaringiz bormi?',
      "Fuqaro: Yo'q, rahmat.",
      'Operator: Sizga yordam berganimdan xursandman. Xayr.',
    ];
    const negative = ticket?.type === TicketType.COMPLAINT || ticket?.type === TicketType.CORRUPTION;
    const sentiment =
      ticket?.type === TicketType.GRATITUDE
        ? Sentiment.POSITIVE
        : negative
          ? r.chance(0.7)
            ? Sentiment.NEGATIVE
            : Sentiment.NEUTRAL
          : r.chance(0.35)
            ? Sentiment.POSITIVE
            : Sentiment.NEUTRAL;
    return {
      callId: call.id,
      language: 'uz',
      text: lines.join('\n'),
      summary: `Fuqaro «${ticket?.topic.nameUz ?? 'umumiy savol'}» masalasi bo'yicha qo'ng'iroq qildi. ${outcome}`,
      sentiment,
      keywords: [...(PARENT_KEYWORDS[ticket?.parent.code ?? 'other'] ?? []), '1097'],
      model: 'demo-faker',
      createdAt: new Date(Math.min(this.now, call.endedAt.getTime() + r.int(1, 5) * MINUTE)),
    };
  }

  private printSummary(): void {
    const inbound = this.calls.filter((c) => c.direction === CallDirection.INBOUND && c.queueId !== null);
    const answered = inbound.filter((c) => c.result === CallResult.ANSWERED);
    const abandoned = inbound.filter((c) => c.result === CallResult.ABANDONED).length;
    const avgWait = answered.reduce((s, c) => s + c.waitSeconds, 0) / Math.max(1, answered.length);
    const byStatus: Record<string, number> = {};
    for (const t of this.tickets) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    const overdue = this.tickets.filter((t) => t.dueAt && t.dueAt.getTime() < this.now && t.status !== TicketStatus.CLOSED).length;
    console.log('Yozildi:');
    for (const [table, count] of Object.entries(this.counts)) console.log(`  ${table.padEnd(22)} ${count}`);
    console.log(
      `Navbatdagi qo'ng'iroqlar: ${inbound.length}, javob ${answered.length}, uzilgan ${abandoned} (${((abandoned / Math.max(1, inbound.length)) * 100).toFixed(1)}%), o'rtacha kutish (IVR bilan) ${avgWait.toFixed(0)} s`,
    );
    console.log(`Murojaatlar holati: ${JSON.stringify(byStatus)}, muddati o'tgan: ${overdue}`);
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error("Faker ishlab chiqarish bazasida ishga tushirilmaydi (NODE_ENV=production)");
  }
  const opts: Options = {
    days: Math.round(option('days', 'FAKER_DAYS', 100)),
    scale: option('scale', 'FAKER_SCALE', 1),
    seed: Math.round(option('seed', 'FAKER_SEED', 1097)),
    workToday: process.argv.includes('--work-today') || process.env.FAKER_WORK_TODAY === '1',
  };
  const marker = await prisma.setting.findUnique({ where: { key: 'demo_data' } });
  if (marker) {
    console.log(
      `Demo ma'lumotlar allaqachon yaratilgan: ${JSON.stringify((marker.value as { generatedAt?: string }).generatedAt)}.\n` +
        "Qaytadan to'ldirish: npx prisma migrate reset (bazani tozalaydi va seed'ni ishga tushiradi), keyin npm run db:fake",
    );
    return;
  }
  const password = process.env.SEED_DEFAULT_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error("SEED_DEFAULT_PASSWORD (kamida 12 belgi) .env faylida berilishi kerak: yangi xodimlar shu parol bilan kiradi");
  }
  const ref = await loadReference();
  const passwordHash = await bcrypt.hash(password, 10);
  const startedAt = Date.now();
  // --dry-run: hammasi yoziladi va hisoblanadi, oxirida tranzaksiya bekor qilinadi
  const dryRun = process.argv.includes('--dry-run');
  try {
    await prisma.$transaction(
      async (tx) => {
        await new Faker(tx, ref, opts, passwordHash).run();
        if (dryRun) throw new DryRun();
      },
      { timeout: 30 * 60_000, maxWait: 30_000 },
    );
  } catch (err) {
    if (!(err instanceof DryRun)) throw err;
    console.log('Sinov rejimi (--dry-run): tranzaksiya bekor qilindi, bazaga hech narsa yozilmadi');
  }
  console.log(`Tayyor: ${Math.round((Date.now() - startedAt) / 1000)} s`);
}

class DryRun extends Error {}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
