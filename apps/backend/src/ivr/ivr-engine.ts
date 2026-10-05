import { IvrAction } from '@prisma/client';

/**
 * IVR oqimi (F-TEL-02, F-TEL-06): tekshirish va simulyatsiya. Sof funksiyalar — bazaga murojaat qilmaydi,
 * shuning uchun administrator o'zgarishni PBX'ga yuklashdan oldin brauzerda "qo'ng'iroq qilib" ko'radi.
 */

export interface FlowPrompt {
  id: number;
  name: string;
  text: string;
  hasAudio: boolean;
}

export interface FlowQueue {
  id: number;
  number: string;
  name: string;
  isActive: boolean;
  /** Navbatga biriktirilgan faol operatorlar soni */
  members: number;
  maxWaitSeconds: number;
  callbackEnabled: boolean;
  announcePosition: boolean;
}

export interface FlowOption {
  digit: string;
  label: string;
  action: IvrAction;
  queueId: number | null;
  targetMenuId: number | null;
  promptId: number | null;
}

export interface FlowMenu {
  id: number;
  code: string;
  name: string;
  promptId: number | null;
  timeoutSeconds: number;
  maxRetries: number;
  fallbackQueueId: number | null;
  options: FlowOption[];
}

export interface FlowSchedule {
  /** 1 = dushanba … 7 = yakshanba */
  days: number[];
  start: string;
  end: string;
  /** YYYY-MM-DD */
  holidays: string[];
}

export interface IvrFlow {
  entryMenuId: number | null;
  menus: FlowMenu[];
  queues: FlowQueue[];
  prompts: FlowPrompt[];
  schedule: FlowSchedule;
  afterHours: { promptId: number | null; voicemail: boolean };
  holidayPromptId: number | null;
}

export interface IvrIssue {
  level: 'error' | 'warning';
  menuId?: number;
  message: string;
}

export const IVR_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '*', '#'] as const;

/** Qaysi amal qaysi maydonni talab qiladi. */
export const ACTION_TARGET: Record<IvrAction, 'queue' | 'menu' | 'prompt' | null> = {
  SUBMENU: 'menu',
  QUEUE: 'queue',
  TICKET_STATUS: null,
  CALLBACK: null,
  VOICEMAIL: null,
  PLAYBACK: 'prompt',
  REPEAT: null,
  HANGUP: null,
};

/** Menyu tuzilmasidagi xatolar (PBX'ga yuklashni to'xtatadi) va ogohlantirishlar. */
export function validateFlow(flow: IvrFlow): IvrIssue[] {
  const issues: IvrIssue[] = [];
  const menus = new Map(flow.menus.map((m) => [m.id, m]));
  const queues = new Map(flow.queues.map((q) => [q.id, q]));
  const prompts = new Map(flow.prompts.map((p) => [p.id, p]));

  if (flow.menus.length === 0) {
    issues.push({ level: 'error', message: "IVR menyusi yo'q: kamida bitta menyu yarating" });
    return issues;
  }
  if (flow.entryMenuId === null || !menus.has(flow.entryMenuId)) {
    issues.push({ level: 'error', message: "Boshlang'ich menyu tanlanmagan: qo'ng'iroq qaysi menyudan boshlanishini belgilang" });
  }
  if (flow.afterHours.promptId === null) {
    issues.push({ level: 'warning', message: 'Ish vaqtidan tashqari avtojavob xabari tanlanmagan' });
  }

  for (const menu of flow.menus) {
    const at = (message: string, level: IvrIssue['level'] = 'error') => issues.push({ level, menuId: menu.id, message: `${menu.name}: ${message}` });
    if (menu.promptId === null) at('ovozli xabar tanlanmagan', 'warning');
    else if (prompts.get(menu.promptId)?.hasAudio === false) at("xabar audiosi yuklanmagan (diktor yozib olishi kerak)", 'warning');
    if (menu.options.length === 0) at("tugmalar yo'q: fuqaro hech qayerga o'ta olmaydi");
    if (menu.fallbackQueueId !== null && !queues.get(menu.fallbackQueueId)?.isActive) at('zaxira navbat faol emas');

    for (const option of menu.options) {
      const name = `«${option.digit}» (${option.label})`;
      switch (ACTION_TARGET[option.action]) {
        case 'queue': {
          const queue = option.queueId === null ? undefined : queues.get(option.queueId);
          if (!queue) at(`${name} — navbat tanlanmagan`);
          else if (!queue.isActive) at(`${name} — ${queue.number} navbati faol emas`);
          break;
        }
        case 'menu':
          if (option.targetMenuId === null || !menus.has(option.targetMenuId)) at(`${name} — o'tiladigan menyu tanlanmagan`);
          else if (option.targetMenuId === menu.id) at(`${name} — menyu o'ziga o'tadi (takrorlash uchun «Qayta eshittirish» amalini tanlang)`);
          break;
        case 'prompt':
          if (option.promptId === null || !prompts.has(option.promptId)) at(`${name} — eshittiriladigan xabar tanlanmagan`);
          break;
      }
    }
  }

  // Boshlang'ich menyudan yetib bo'lmaydigan menyular
  if (flow.entryMenuId !== null && menus.has(flow.entryMenuId)) {
    const reached = new Set<number>([flow.entryMenuId]);
    const stack = [flow.entryMenuId];
    while (stack.length) {
      const menu = menus.get(stack.pop()!);
      for (const option of menu?.options ?? []) {
        if (option.action === IvrAction.SUBMENU && option.targetMenuId !== null && !reached.has(option.targetMenuId)) {
          reached.add(option.targetMenuId);
          stack.push(option.targetMenuId);
        }
      }
    }
    for (const menu of flow.menus) {
      if (!reached.has(menu.id)) issues.push({ level: 'warning', menuId: menu.id, message: `${menu.name}: boshlang'ich menyudan bu menyuga o'tish yo'q` });
    }
  }

  // Ishlatilayotgan navbatlarda operator bo'lmasa qo'ng'iroq javobsiz qoladi
  const used = new Set<number>();
  for (const menu of flow.menus) {
    if (menu.fallbackQueueId !== null) used.add(menu.fallbackQueueId);
    for (const option of menu.options) if (option.action === IvrAction.QUEUE && option.queueId !== null) used.add(option.queueId);
  }
  for (const id of used) {
    const queue = queues.get(id);
    if (queue?.isActive && queue.members === 0) {
      issues.push({ level: 'warning', message: `${queue.number} «${queue.name}» navbatiga operator biriktirilmagan` });
    }
  }
  return issues;
}

export type ScheduleState = 'open' | 'after_hours' | 'holiday';

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Qo'ng'iroq vaqtida call-markaz ishlayaptimi (server vaqt mintaqasi — Asia/Tashkent). */
export function scheduleState(schedule: FlowSchedule, at: Date): ScheduleState {
  if (schedule.holidays.includes(dateKey(at))) return 'holiday';
  const weekday = at.getDay() === 0 ? 7 : at.getDay();
  if (!schedule.days.includes(weekday)) return 'after_hours';
  const hhmm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  return hhmm >= schedule.start && hhmm < schedule.end ? 'open' : 'after_hours';
}

export type SimStepKind = 'say' | 'input' | 'info' | 'warning';

export interface SimStep {
  kind: SimStepKind;
  text: string;
  menuId?: number;
}

export type SimOutcome = 'queue' | 'ticket_status' | 'callback' | 'voicemail' | 'hangup' | 'closed';

export type SimState =
  | { type: 'awaiting'; menuId: number }
  | { type: 'end'; outcome: SimOutcome; queueId?: number; text: string };

export interface SimResult {
  schedule: ScheduleState;
  steps: SimStep[];
  state: SimState;
}

/** "Tugma bosilmadi" belgisi (kutish vaqti tugadi). */
export const NO_INPUT = 'timeout';

/**
 * Qo'ng'iroqni bosqichma-bosqich o'tkazadi: input — fuqaro bosgan tugmalar ketma-ketligi ("timeout" — javobsizlik).
 * Natija: eshittirilgan xabarlar va oxirgi holat (menyuda tugma kutilmoqda yoki qo'ng'iroq qayerga tushdi).
 */
export function simulate(flow: IvrFlow, input: string[], at: Date): SimResult {
  const steps: SimStep[] = [];
  const menus = new Map(flow.menus.map((m) => [m.id, m]));
  const queues = new Map(flow.queues.map((q) => [q.id, q]));
  const prompts = new Map(flow.prompts.map((p) => [p.id, p]));
  const say = (promptId: number | null, fallback: string, menuId?: number) => {
    const prompt = promptId === null ? undefined : prompts.get(promptId);
    steps.push({ kind: 'say', text: prompt?.text ?? fallback, menuId });
    if (prompt && !prompt.hasAudio) steps.push({ kind: 'warning', text: `«${prompt.name}» audiosi yuklanmagan — PBX bu joyda jim turadi`, menuId });
  };
  const now = scheduleState(flow.schedule, at);
  const end = (outcome: SimOutcome, text: string, queueId?: number): SimResult => ({ schedule: now, steps, state: { type: 'end', outcome, text, queueId } });

  if (now !== 'open') {
    const promptId = now === 'holiday' ? (flow.holidayPromptId ?? flow.afterHours.promptId) : flow.afterHours.promptId;
    say(promptId, now === 'holiday' ? 'Bugun bayram kuni, call-markaz ishlamaydi.' : 'Call-markaz ish vaqtidan tashqari.');
    if (flow.afterHours.voicemail) {
      return end('voicemail', "Signaldan keyin fuqaro ovozli xabar qoldiradi — xabar «Ovozli xabar» kanali bilan murojaat sifatida ro'yxatga olinadi");
    }
    return end('closed', "Avtojavobdan keyin qo'ng'iroq yakunlanadi");
  }

  let menu = flow.entryMenuId === null ? undefined : menus.get(flow.entryMenuId);
  if (!menu) {
    steps.push({ kind: 'warning', text: "Boshlang'ich menyu tanlanmagan" });
    return end('hangup', "IVR sozlanmagan: qo'ng'iroq uziladi");
  }

  const toQueue = (queueId: number | null): SimResult => {
    const queue = queueId === null ? undefined : queues.get(queueId);
    if (!queue) {
      steps.push({ kind: 'warning', text: 'Navbat tanlanmagan' });
      return end('hangup', "Navbat topilmadi: qo'ng'iroq uziladi");
    }
    if (!queue.isActive) steps.push({ kind: 'warning', text: `${queue.number} navbati faol emas` });
    if (queue.members === 0) steps.push({ kind: 'warning', text: "Navbatga operator biriktirilmagan: qo'ng'iroqqa hech kim javob bermaydi" });
    if (queue.announcePosition) steps.push({ kind: 'info', text: "Kutish paytida musiqa va navbatdagi o'rni eshittiriladi" });
    if (queue.callbackEnabled) steps.push({ kind: 'info', text: `${queue.maxWaitSeconds} soniyadan ortiq kutsa, qayta qo'ng'iroq buyurtma qilish taklif etiladi` });
    return end('queue', `${queue.number} «${queue.name}» navbatiga ulanadi`, queue.id);
  };

  let retries = 0;
  say(menu.promptId, `${menu.name} (ovozli xabar tanlanmagan)`, menu.id);

  for (const token of input) {
    const current: FlowMenu = menu!;
    const option = token === NO_INPUT ? undefined : current.options.find((o) => o.digit === token);
    if (!option) {
      steps.push({ kind: 'input', text: token === NO_INPUT ? `${current.timeoutSeconds} soniya tugma bosilmadi` : `«${token}» bosildi — bunday tanlov yo'q`, menuId: current.id });
      retries++;
      if (retries >= current.maxRetries) {
        if (current.fallbackQueueId !== null) {
          steps.push({ kind: 'info', text: `${current.maxRetries} urinish tugadi — zaxira navbatga o'tkaziladi` });
          return toQueue(current.fallbackQueueId);
        }
        return end('hangup', `${current.maxRetries} urinish tugadi: xayrlashib qo'ng'iroq uziladi`);
      }
      steps.push({ kind: 'info', text: token === NO_INPUT ? 'Menyu qayta eshittiriladi' : "«Noto'g'ri tanlov» xabari va menyu qayta eshittiriladi" });
      say(current.promptId, current.name, current.id);
      continue;
    }

    steps.push({ kind: 'input', text: `«${option.digit}» bosildi — ${option.label}`, menuId: current.id });
    switch (option.action) {
      case IvrAction.SUBMENU: {
        const next = option.targetMenuId === null ? undefined : menus.get(option.targetMenuId);
        if (!next) {
          steps.push({ kind: 'warning', text: "O'tiladigan menyu tanlanmagan" });
          return end('hangup', "Menyu topilmadi: qo'ng'iroq uziladi");
        }
        menu = next;
        retries = 0;
        say(next.promptId, `${next.name} (ovozli xabar tanlanmagan)`, next.id);
        break;
      }
      case IvrAction.QUEUE:
        return toQueue(option.queueId);
      case IvrAction.TICKET_STATUS:
        return end('ticket_status', "Fuqaro murojaat raqamini teradi va # ni bosadi — holat ovozli o'qiladi; topilmasa operatorga ulanadi", current.fallbackQueueId ?? undefined);
      case IvrAction.CALLBACK:
        return end('callback', "Qayta qo'ng'iroq buyurtmasi yoziladi: operator bo'shashi bilan fuqaroga qo'ng'iroq qiladi");
      case IvrAction.VOICEMAIL:
        return end('voicemail', "Fuqaro ovozli xabar qoldiradi — murojaat sifatida ro'yxatga olinadi");
      case IvrAction.PLAYBACK:
        say(option.promptId, option.label);
        retries = 0;
        say(current.promptId, current.name, current.id);
        break;
      case IvrAction.REPEAT:
        say(current.promptId, current.name, current.id);
        break;
      case IvrAction.HANGUP:
        return end('hangup', "Xayrlashuv xabaridan keyin qo'ng'iroq yakunlanadi");
    }
  }
  return { schedule: now, steps, state: { type: 'awaiting', menuId: menu!.id } };
}
