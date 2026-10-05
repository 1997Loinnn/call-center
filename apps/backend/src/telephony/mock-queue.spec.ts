import { MockQueueSimulator } from './mock-queue';

/** Takrorlanadigan tasodifiy sonlar (mulberry32) */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('MockQueueSimulator', () => {
  it("band soatda navbatga qo'ng'iroqlar tushadi va kutish vaqti o'sadi", () => {
    const start = new Date(2026, 9, 5, 11, 0, 0).getTime();
    const sim = new MockQueueSimulator(seeded(7), start);
    let seen = 0;
    let maxWait = 0;
    for (let t = start; t < start + 20 * 60_000; t += 5_000) {
      const snapshot = sim.snapshot(t);
      const callers = snapshot.flatMap((q) => q.callers);
      seen = Math.max(seen, callers.length);
      maxWait = Math.max(maxWait, ...callers.map((c) => c.waitSeconds));
      for (const c of callers) expect(c.callerNumber).toMatch(/^\+998\d{9}$/);
    }
    expect(seen).toBeGreaterThan(0);
    expect(maxWait).toBeGreaterThan(20);
  });

  it("tunda navbat bo'sh, kutayotganlar vaqti kelib chiqib ketadi", () => {
    const night = new Date(2026, 9, 5, 23, 0, 0).getTime();
    const sim = new MockQueueSimulator(seeded(1), night);
    expect(sim.snapshot(night + 60_000)).toEqual([]);
    const day = new Date(2026, 9, 5, 11, 0, 0).getTime();
    const busy = new MockQueueSimulator(seeded(3), day);
    busy.snapshot(day + 5 * 60_000);
    // 5 daqiqa yangi kelishlarsiz (soat 23 da): hamma 4 daqiqadan uzoq kutmaydi
    expect(busy.snapshot(new Date(2026, 9, 5, 23, 30).getTime())).toEqual([]);
  });

  it("chegaradan ko'p kutganlarning bir qismi qayta qo'ng'iroqni tanlaydi, o'chirilgan navbatda — yo'q", () => {
    const start = new Date(2026, 9, 5, 11, 0, 0).getTime();
    const requests: string[] = [];
    const sim = new MockQueueSimulator(seeded(11), start, {
      after: (queue) => (queue === '6501' ? null : 30),
      onRequest: (queue) => requests.push(queue),
    });
    for (let t = start; t < start + 60 * 60_000; t += 5_000) {
      const snapshot = sim.snapshot(t);
      // Taklif qilinib, callback tanlaganlar navbatdan chiqadi
      for (const q of snapshot) if (q.queue !== '6501') for (const c of q.callers) expect(typeof c.waitSeconds).toBe('number');
    }
    expect(requests.length).toBeGreaterThan(0);
    expect(requests).not.toContain('6501');
  });
});
