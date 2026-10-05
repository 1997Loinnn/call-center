import { TicketStatus as S, TicketType } from '@prisma/client';
import { canCloseImmediately, canTransition, computeDueAt, formatTicketNumber } from './ticket-workflow';

describe('canTransition', () => {
  it.each([
    [S.NEW, S.ROUTED],
    [S.ROUTED, S.IN_PROGRESS],
    [S.ROUTED, S.RETURNED],
    [S.RETURNED, S.ROUTED],
    [S.IN_PROGRESS, S.ANSWERED],
    [S.ANSWERED, S.CLOSED],
    [S.ANSWERED, S.IN_PROGRESS],
    [S.CLOSED, S.IN_PROGRESS],
  ])('%s -> %s ruxsat etilgan', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    [S.NEW, S.ANSWERED],
    [S.ROUTED, S.CLOSED],
    [S.IN_PROGRESS, S.CLOSED],
    [S.RETURNED, S.IN_PROGRESS],
    [S.CLOSED, S.ROUTED],
  ])('%s -> %s taqiqlangan', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});

describe('canCloseImmediately', () => {
  it("faqat ma'lumot so'rash va minnatdorchilik darhol yopiladi", () => {
    expect(canCloseImmediately(TicketType.INFO)).toBe(true);
    expect(canCloseImmediately(TicketType.GRATITUDE)).toBe(true);
    expect(canCloseImmediately(TicketType.COMPLAINT)).toBe(false);
    expect(canCloseImmediately(TicketType.CORRUPTION)).toBe(false);
  });
});

describe('computeDueAt', () => {
  it("kalendar kunlarini qo'shadi", () => {
    const due = computeDueAt(new Date('2026-10-03T10:00:00'), 15);
    expect(due.getDate()).toBe(18);
    expect(due.getMonth()).toBe(9);
  });
});

describe('formatTicketNumber', () => {
  it('1097-YYYY-NNNNNN formatida', () => {
    expect(formatTicketNumber('1097', 2026, 123)).toBe('1097-2026-000123');
  });
});

describe('computeDueAt — ish kalendari bilan', () => {
  const calendar = { workDays: [1, 2, 3, 4, 5], holidays: new Set(['2026-10-19']) };

  it("ish kuniga tushsa o'zgarmaydi", () => {
    // 2026-10-01 (payshanba) + 15 = 2026-10-16 (juma)
    expect(computeDueAt(new Date(2026, 9, 1, 10), 15, calendar).getDate()).toBe(16);
  });

  it("shanbaga tushsa dushanbaga, dushanba bayram bo'lsa seshanbaga suriladi", () => {
    // 2026-10-03 (shanba) + 15 = 2026-10-18 (yakshanba) → 19 (bayram) → 20 (seshanba)
    const due = computeDueAt(new Date(2026, 9, 3, 10), 15, calendar);
    expect([due.getMonth(), due.getDate(), due.getHours()]).toEqual([9, 20, 10]);
  });
});
