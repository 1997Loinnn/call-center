import { canChangeCampaign, contactOutcome, RETRY_MINUTES } from './campaign-rules';

const now = new Date('2026-10-05T10:00:00Z');

describe('campaign rules', () => {
  it("kampaniya holatlari: yakunlangandan qaytib bo'lmaydi", () => {
    expect(canChangeCampaign('ACTIVE', 'PAUSED')).toBe(true);
    expect(canChangeCampaign('PAUSED', 'ACTIVE')).toBe(true);
    expect(canChangeCampaign('DRAFT', 'PAUSED')).toBe(false);
    expect(canChangeCampaign('COMPLETED', 'ACTIVE')).toBe(false);
  });

  it('javob bermasa qayta urinish rejalashtiriladi, urinishlar tugasa FAILED', () => {
    expect(contactOutcome('NO_ANSWER', 1, 3, now)).toEqual({ status: 'NO_ANSWER', nextAttemptAt: new Date(now.getTime() + RETRY_MINUTES * 60_000) });
    expect(contactOutcome('BUSY', 3, 3, now)).toEqual({ status: 'FAILED', nextAttemptAt: null });
  });

  it("keyinroq: fuqaro aytgan vaqt, o'tgan vaqt berilsa — ertaga", () => {
    const later = new Date('2026-10-05T15:30:00Z');
    expect(contactOutcome('CALL_LATER', 1, 3, now, later).nextAttemptAt).toEqual(later);
    expect(contactOutcome('CALL_LATER', 1, 3, now, new Date('2026-10-04T10:00:00Z')).nextAttemptAt).toEqual(new Date('2026-10-06T10:00:00Z'));
  });

  it("bog'lanildi va noto'g'ri raqam yakuniy", () => {
    expect(contactOutcome('REACHED', 1, 3, now)).toEqual({ status: 'REACHED', nextAttemptAt: null });
    expect(contactOutcome('WRONG_NUMBER', 1, 3, now)).toEqual({ status: 'WRONG_NUMBER', nextAttemptAt: null });
  });
});
