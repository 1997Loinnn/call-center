import { CampaignContactStatus, CampaignStatus } from '@prisma/client';

/** Kampaniya holatlari: qaysi holatdan qaysiga o'tish mumkin. */
export const CAMPAIGN_TRANSITIONS: Readonly<Record<CampaignStatus, readonly CampaignStatus[]>> = {
  DRAFT: [CampaignStatus.SCHEDULED, CampaignStatus.ACTIVE, CampaignStatus.CANCELLED],
  SCHEDULED: [CampaignStatus.DRAFT, CampaignStatus.ACTIVE, CampaignStatus.CANCELLED],
  ACTIVE: [CampaignStatus.PAUSED, CampaignStatus.COMPLETED, CampaignStatus.CANCELLED],
  PAUSED: [CampaignStatus.ACTIVE, CampaignStatus.COMPLETED, CampaignStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: 'Qoralama',
  SCHEDULED: 'Rejalashtirilgan',
  ACTIVE: 'Faol',
  PAUSED: 'Pauza',
  COMPLETED: 'Yakunlangan',
  CANCELLED: 'Bekor qilingan',
};

/** Hali qo'ng'iroq qilinadigan kontaktlar holati. */
export const OPEN_CONTACT_STATUSES: CampaignContactStatus[] = [
  CampaignContactStatus.PENDING,
  CampaignContactStatus.NO_ANSWER,
  CampaignContactStatus.BUSY,
  CampaignContactStatus.CALL_LATER,
];

/** Javob bermagan yoki band raqamga qayta qo'ng'iroq oralig'i. */
export const RETRY_MINUTES = 120;
/** Operator olgan kontakt shu muddat boshqalarga berilmaydi. */
export const CLAIM_MINUTES = 10;
/** "O'tkazib yuborish" — kontakt navbat oxiriga suriladi. */
export const SKIP_MINUTES = 30;

export function canChangeCampaign(from: CampaignStatus, to: CampaignStatus): boolean {
  return from === to || CAMPAIGN_TRANSITIONS[from].includes(to);
}

export interface ContactOutcome {
  status: CampaignContactStatus;
  nextAttemptAt: Date | null;
}

/**
 * Qo'ng'iroq natijasidan keyingi holat: javob bermadi/band — RETRY_MINUTES dan keyin qayta,
 * urinishlar tugasa FAILED; "keyinroq" — fuqaro aytgan vaqtda (berilmasa ertaga shu vaqtda).
 */
export function contactOutcome(
  result: CampaignContactStatus,
  attempts: number,
  maxAttempts: number,
  now: Date,
  callLaterAt?: Date,
): ContactOutcome {
  switch (result) {
    case CampaignContactStatus.NO_ANSWER:
    case CampaignContactStatus.BUSY:
      return attempts >= maxAttempts
        ? { status: CampaignContactStatus.FAILED, nextAttemptAt: null }
        : { status: result, nextAttemptAt: new Date(now.getTime() + RETRY_MINUTES * 60_000) };
    case CampaignContactStatus.CALL_LATER:
      return {
        status: result,
        nextAttemptAt: callLaterAt && callLaterAt > now ? callLaterAt : new Date(now.getTime() + 24 * 3_600_000),
      };
    default:
      return { status: result, nextAttemptAt: null };
  }
}
