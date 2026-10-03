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
