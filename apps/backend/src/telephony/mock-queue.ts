import { QueueSnapshot } from './pbx-adapter';

// Soat bo'yicha kiruvchi oqim (daqiqasiga qo'ng'iroq). Faker'dagi kunlik profil bilan mos: 10–12 va 14–16 eng band
const ARRIVALS_PER_MINUTE: Record<number, number> = {
  8: 0.6, 9: 3.2, 10: 5.2, 11: 5.6, 12: 4.8, 13: 3.2, 14: 4.4, 15: 5, 16: 4.2, 17: 2.6, 18: 0.8, 19: 0.3,
};
// IVR'da tanlangan navbat ulushi
const QUEUE_WEIGHTS: [string, number][] = [['6500', 45], ['6501', 27], ['6502', 14], ['6509', 12], ['6503', 2]];
const MOBILE_CODES = ['90', '91', '93', '94', '95', '97', '98', '99', '33', '88'];

interface Waiting {
  queue: string;
  callerNumber: string;
  joinedAt: number;
  /** Shu vaqtda operator javob beradi yoki fuqaro uzib qo'yadi */
  leavesAt: number;
  /** Qayta qo'ng'iroq taklif qilingan (bir marta) */
  offered?: boolean;
}

export interface CallbackPolicy {
  /** Navbat uchun taklif chegarasi, soniya; null — callback o'chirilgan */
  after(queue: string): number | null;
  onRequest(queue: string, callerNumber: string): void;
}

/** Taklif qilinganlarning qancha qismi qayta qo'ng'iroqni tanlaydi */
const CALLBACK_ACCEPT = 0.35;

/**
 * PBX_DRIVER=mock uchun navbat taqlidi: kunning soatiga qarab qo'ng'iroqlar navbatga tushadi va
 * tasodifiy kutishdan keyin chiqib ketadi. Jonli holat va ogohlantirishlarni UCM6510'siz sinash uchun.
 */
export class MockQueueSimulator {
  private waiting: Waiting[] = [];
  private lastTick: number;

  constructor(
    private readonly random: () => number = Math.random,
    now = Date.now(),
    private readonly callback?: CallbackPolicy,
  ) {
    this.lastTick = now;
  }

  /** Oxirgi tickdan beri kelgan va ketganlarni hisoblaydi. */
  tick(now = Date.now()): void {
    const elapsedMinutes = Math.min(5, Math.max(0, (now - this.lastTick) / 60_000));
    this.lastTick = now;
    this.waiting = this.waiting.filter((w) => w.leavesAt > now);
    if (this.callback) {
      for (const w of this.waiting) {
        const after = w.offered ? null : this.callback.after(w.queue);
        if (after === null || now - w.joinedAt < after * 1000) continue;
        w.offered = true;
        if (this.random() < CALLBACK_ACCEPT) {
          w.leavesAt = now;
          this.callback.onRequest(w.queue, w.callerNumber);
        }
      }
      this.waiting = this.waiting.filter((w) => w.leavesAt > now);
    }
    const rate = ARRIVALS_PER_MINUTE[new Date(now).getHours()] ?? 0;
    // Puasson oqimi: kichik qadamda kelishlar soni ≈ rate × vaqt
    let expected = rate * elapsedMinutes;
    while (expected > 0) {
      if (this.random() < Math.min(1, expected)) this.join(now);
      expected -= 1;
    }
  }

  snapshot(now = Date.now()): QueueSnapshot[] {
    this.tick(now);
    const byQueue = new Map<string, QueueSnapshot>();
    for (const w of [...this.waiting].sort((a, b) => a.joinedAt - b.joinedAt)) {
      const entry = byQueue.get(w.queue) ?? { queue: w.queue, callers: [] };
      entry.callers.push({ callerNumber: w.callerNumber, waitSeconds: Math.round((now - w.joinedAt) / 1000) });
      byQueue.set(w.queue, entry);
    }
    return [...byQueue.values()];
  }

  private join(now: number): void {
    const r = this.random();
    // Ko'pchilik 5–40 s da javob oladi, ba'zilari uzoq kutadi (band soatlar dumi)
    const wait = r < 0.8 ? 5 + this.random() * 35 : r < 0.96 ? 40 + this.random() * 80 : 120 + this.random() * 120;
    this.waiting.push({ queue: this.pickQueue(), callerNumber: this.number(), joinedAt: now, leavesAt: now + wait * 1000 });
  }

  private pickQueue(): string {
    const total = QUEUE_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
    let x = this.random() * total;
    for (const [queue, weight] of QUEUE_WEIGHTS) {
      x -= weight;
      if (x <= 0) return queue;
    }
    return QUEUE_WEIGHTS[0][0];
  }

  private number(): string {
    const code = MOBILE_CODES[Math.floor(this.random() * MOBILE_CODES.length)];
    return `+998${code}${String(Math.floor(this.random() * 10_000_000)).padStart(7, '0')}`;
  }
}
