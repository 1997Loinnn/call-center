import { AgentStatus, CallResult } from '@prisma/client';
import { MINUTE, SECOND } from './calendar';
import { clamp, Random } from './random';

/**
 * Bir ish kunining call-markaz simulyatsiyasi: operatorlar smenasi va tanaffuslari, navbatda kutish,
 * kutib turolmay uzilgan qo'ng'iroqlar va chiquvchi qo'ng'iroqlar uchun bo'sh oraliqlar.
 * Natijada qo'ng'iroqlar, kutish vaqtlari va operator holatlari bir-biriga mos chiqadi.
 */

export interface Agent {
  userId: number;
  ext: string;
  fullName: string;
  languages: string[];
}

export interface Interval {
  from: number;
  to: number;
  status: AgentStatus;
  reason?: string;
}

interface PlannedBreak {
  start: number;
  minutes: number;
  reason: string;
}

export class AgentDay {
  readonly busy: Interval[] = [];
  freeAt: number;
  calls = 0;

  constructor(
    readonly agent: Agent,
    readonly shiftStart: number,
    readonly shiftEnd: number,
    private readonly breaks: PlannedBreak[],
  ) {
    this.freeAt = shiftStart;
    this.breaks.sort((a, b) => a.start - b.start);
  }

  /** t dan keyin operator qachon bo'sh bo'ladi. Vaqti kelgan tanaffuslar shu yerda "olinadi" (suhbatdan keyin). */
  availableAt(t: number): number {
    let at = Math.max(t, this.freeAt);
    while (this.breaks.length > 0 && this.breaks[0].start <= at && this.breaks[0].start < this.shiftEnd) {
      const plan = this.breaks.shift()!;
      const start = Math.max(plan.start, this.freeAt);
      const end = start + plan.minutes * MINUTE;
      this.busy.push({ from: start, to: end, status: AgentStatus.BREAK, reason: plan.reason });
      this.freeAt = end;
      at = Math.max(t, this.freeAt);
    }
    return at;
  }

  takeCall(answeredAt: number, endedAt: number, wrapSeconds: number): void {
    this.busy.push({ from: answeredAt, to: endedAt, status: AgentStatus.ON_CALL });
    this.busy.push({ from: endedAt, to: endedAt + wrapSeconds * SECOND, status: AgentStatus.WRAP_UP });
    this.freeAt = endedAt + wrapSeconds * SECOND;
    this.calls++;
  }

  /** Kiruvchi qo'ng'iroqlardan keyin: qolgan tanaffuslarni joylaydi. */
  closeInbound(): void {
    this.availableAt(this.shiftEnd - 1);
    this.busy.sort((a, b) => a.from - b.from);
  }

  /** Chiquvchi qo'ng'iroq uchun notBefore dan keyingi eng erta bo'sh oraliq (kamida `ms` uzunlikda). */
  findGap(notBefore: number, ms: number): number | null {
    let cursor = Math.max(this.shiftStart, notBefore);
    for (const interval of this.busy) {
      if (interval.to <= cursor) continue;
      if (interval.from - cursor >= ms) return cursor;
      cursor = Math.max(cursor, interval.to);
    }
    return this.shiftEnd - cursor >= ms ? cursor : null;
  }

  occupy(from: number, endedAt: number, wrapSeconds: number): void {
    this.busy.push({ from, to: endedAt, status: AgentStatus.ON_CALL });
    this.busy.push({ from: endedAt, to: endedAt + wrapSeconds * SECOND, status: AgentStatus.WRAP_UP });
    this.busy.sort((a, b) => a.from - b.from);
    this.calls++;
  }

  /** Smena davomidagi holatlar ketma-ketligi; cutoff (hozir) dan keyingi qism kesiladi, oxirgisi ochiq qoladi. */
  timeline(cutoff: number): { from: number; to: number | null; status: AgentStatus; reason?: string }[] {
    const out: { from: number; to: number | null; status: AgentStatus; reason?: string }[] = [];
    const push = (from: number, to: number, status: AgentStatus, reason?: string) => {
      if (to <= from || from >= cutoff) return;
      const last = out[out.length - 1];
      if (last && last.status === status && last.to === from && !reason && !last.reason) {
        last.to = to;
      } else {
        out.push({ from, to, status, reason });
      }
    };
    let cursor = this.shiftStart;
    for (const interval of [...this.busy].sort((a, b) => a.from - b.from)) {
      if (interval.from > cursor) push(cursor, interval.from, AgentStatus.READY);
      push(Math.max(interval.from, cursor), interval.to, interval.status, interval.reason);
      cursor = Math.max(cursor, interval.to);
    }
    if (cursor < this.shiftEnd) push(cursor, this.shiftEnd, AgentStatus.READY);
    const last = out[out.length - 1];
    if (last && last.to !== null && last.to > cutoff) last.to = null;
    return out;
  }
}

/** Kunlik smena: 09:00 atrofida kirish, pog'onali tushlik va ikki qisqa tanaffus. */
export function planShift(agent: Agent, day: Date, index: number, rnd: Random, reasons: { lunch: string; short: string }): AgentDay {
  const at = (hour: number) => new Date(day).setHours(0, 0, 0, 0) + hour * 60 * MINUTE;
  const shiftStart = at(9) + rnd.int(-8, 12) * MINUTE;
  const shiftEnd = at(18) + rnd.int(0, 15) * MINUTE;
  const lunchSlot = [12, 12.67, 13.33, 14][index % 4];
  const breaks: PlannedBreak[] = [
    { start: at(lunchSlot) + rnd.int(0, 10) * MINUTE, minutes: rnd.int(40, 55), reason: reasons.lunch },
    { start: at(rnd.float(10.25, 11.5)), minutes: shortBreak(rnd), reason: reasons.short },
    { start: at(rnd.float(15.25, 16.75)), minutes: shortBreak(rnd), reason: reasons.short },
  ];
  return new AgentDay(agent, shiftStart, shiftEnd, breaks);
}

// 3% hollarda qisqa tanaffus cho'zilib ketadi: "Operator tanaffusi" ogohlantirishi shundan chiqadi
const shortBreak = (rnd: Random) => (rnd.chance(0.03) ? rnd.int(21, 35) : rnd.int(8, 15));

export interface Arrival<T> {
  at: number;
  caller: T;
  callerNumber: string;
  language: string;
  queue: string | null;
  ivrPath: string;
  ivrSeconds: number;
  /** queue: operatorga ulanadi; ivr: IVR da yakunlanadi; voicemail: ovozli xabar qoldiradi */
  kind: 'queue' | 'ivr' | 'voicemail';
}

export interface SimCall<T> {
  caller: T;
  callerNumber: string;
  queue: string | null;
  agent: AgentDay | null;
  ivrPath: string;
  startedAt: number;
  answeredAt: number | null;
  endedAt: number;
  queueWaitSeconds: number;
  talkSeconds: number;
  result: CallResult;
  hangupBy: 'caller' | 'agent' | 'system';
}

export interface QueueHour {
  queue: string;
  hourStart: number;
  calls: number;
  abandoned: number;
  maxQueueWait: number;
  firstBreachAt: number | null;
}

/**
 * Kiruvchi qo'ng'iroqlarni navbat bo'yicha operatorlarga taqsimlaydi.
 * cutoff dan keyin tugaydigan qo'ng'iroqlar qaytarilmaydi (ular hali davom etmoqda), lekin operator band bo'ladi.
 */
export function simulateInbound<T>(
  arrivals: Arrival<T>[],
  agents: AgentDay[],
  rnd: Random,
  cutoff: number,
): { calls: SimCall<T>[]; hours: QueueHour[] } {
  const calls: SimCall<T>[] = [];
  const hours = new Map<string, QueueHour>();
  const sorted = [...arrivals].sort((a, b) => a.at + a.ivrSeconds * SECOND - (b.at + b.ivrSeconds * SECOND));

  for (const arrival of sorted) {
    const queueEntry = arrival.at + arrival.ivrSeconds * SECOND;
    if (arrival.at >= cutoff) continue;

    if (arrival.kind !== 'queue') {
      const extra = arrival.kind === 'voicemail' ? rnd.int(15, 70) : rnd.int(10, 60);
      const endedAt = queueEntry + extra * SECOND;
      if (endedAt <= cutoff) {
        calls.push({
          caller: arrival.caller,
          callerNumber: arrival.callerNumber,
          queue: arrival.queue,
          agent: null,
          ivrPath: arrival.ivrPath,
          startedAt: arrival.at,
          answeredAt: null,
          endedAt,
          queueWaitSeconds: 0,
          talkSeconds: 0,
          result: arrival.kind === 'voicemail' ? CallResult.VOICEMAIL : CallResult.IVR_ONLY,
          hangupBy: arrival.kind === 'voicemail' ? 'caller' : 'system',
        });
      }
      continue;
    }

    // Rus tilidagi navbatga rus tilini biladigan operator; bunday operator bo'lmasa — istalgani
    const speakers = agents.filter((a) => a.agent.languages.includes(arrival.language));
    const pool = speakers.length > 0 ? speakers : agents;
    let best: AgentDay | null = null;
    let bestAt = Infinity;
    for (const agent of pool) {
      if (queueEntry < agent.shiftStart - 30 * MINUTE || queueEntry > agent.shiftEnd) continue;
      const at = agent.availableAt(queueEntry);
      if (at >= agent.shiftEnd) continue;
      if (at < bestAt || (at === bestAt && best !== null && agent.calls < best.calls)) {
        best = agent;
        bestAt = at;
      }
    }

    const ring = rnd.int(3, 8);
    const patience = 10 + rnd.exponential(70);
    const queueWait = best ? (bestAt - queueEntry) / SECOND + ring : Infinity;
    const hourKey = `${arrival.queue}:${new Date(queueEntry).getHours()}`;
    const hour =
      hours.get(hourKey) ??
      hours.set(hourKey, {
        queue: arrival.queue ?? '',
        hourStart: new Date(queueEntry).setMinutes(0, 0, 0),
        calls: 0,
        abandoned: 0,
        maxQueueWait: 0,
        firstBreachAt: null,
      }).get(hourKey)!;
    hour.calls++;

    if (!best || queueWait > patience) {
      const waited = Math.min(patience, 600);
      const endedAt = queueEntry + waited * SECOND;
      hour.abandoned++;
      hour.maxQueueWait = Math.max(hour.maxQueueWait, Math.round(waited));
      if (waited > 20 && hour.firstBreachAt === null) hour.firstBreachAt = queueEntry + 20 * SECOND;
      if (endedAt <= cutoff) {
        calls.push({
          caller: arrival.caller,
          callerNumber: arrival.callerNumber,
          queue: arrival.queue,
          agent: null,
          ivrPath: arrival.ivrPath,
          startedAt: arrival.at,
          answeredAt: null,
          endedAt,
          queueWaitSeconds: Math.round(waited),
          talkSeconds: 0,
          result: CallResult.ABANDONED,
          hangupBy: 'caller',
        });
      }
      continue;
    }

    const answeredAt = queueEntry + Math.round(queueWait * SECOND);
    const median = arrival.language === 'ru' ? 210 : 190;
    const talk = Math.round(clamp(rnd.logNormal(median, 0.5), 25, 1500));
    const endedAt = answeredAt + talk * SECOND;
    best.takeCall(answeredAt, endedAt, rnd.int(20, 70));
    hour.maxQueueWait = Math.max(hour.maxQueueWait, Math.round(queueWait));
    if (queueWait > 20 && hour.firstBreachAt === null) hour.firstBreachAt = queueEntry + 20 * SECOND;

    if (endedAt <= cutoff) {
      calls.push({
        caller: arrival.caller,
        callerNumber: arrival.callerNumber,
        queue: arrival.queue,
        agent: best,
        ivrPath: arrival.ivrPath,
        startedAt: arrival.at,
        answeredAt,
        endedAt,
        queueWaitSeconds: Math.round(queueWait),
        talkSeconds: talk,
        result: CallResult.ANSWERED,
        hangupBy: rnd.chance(0.7) ? 'caller' : 'agent',
      });
    }
  }

  for (const agent of agents) agent.closeInbound();
  return { calls, hours: [...hours.values()] };
}
