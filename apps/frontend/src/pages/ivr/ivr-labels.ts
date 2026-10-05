import type { IvrAction } from '../../api/types';

export const ACTION_LABELS: Record<IvrAction, string> = {
  SUBMENU: "Boshqa menyuga o'tish",
  QUEUE: 'Navbatga ulash',
  TICKET_STATUS: 'Murojaat holatini aytish',
  CALLBACK: "Qayta qo'ng'iroq buyurtmasi",
  VOICEMAIL: 'Ovozli xabar qoldirish',
  PLAYBACK: 'Xabar eshittirish',
  REPEAT: 'Menyuni qayta eshittirish',
  HANGUP: 'Xayrlashib uzish',
};

/** Backend ACTION_TARGET bilan bir xil: amal qaysi maydonni talab qiladi. */
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

export const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
/** Menyu jadvalidagi tartib (backend IVR_DIGITS) */
export const DIGIT_ORDER = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '*', '#'];

export const STRATEGY_LABELS: Record<string, string> = {
  longest_idle: "Eng uzoq bo'sh turgan operatorga",
  ring_all: 'Hammasiga birdan',
  round_robin: 'Navbat bilan (aylanma)',
  fewest_calls: "Eng kam qo'ng'iroq olganga",
  random: 'Tasodifiy',
};

export const LANGUAGE_LABELS: Record<string, string> = { uz: "O'zbek", ru: 'Rus' };

export const PENALTY_LABELS = ['Asosiy', 'Zaxira 1', 'Zaxira 2', 'Zaxira 3'];

export const OUTCOME_LABELS: Record<string, string> = {
  queue: 'Navbatga ulandi',
  ticket_status: 'Murojaat holati',
  callback: "Qayta qo'ng'iroq",
  voicemail: 'Ovozli xabar',
  hangup: 'Qo\'ng\'iroq yakunlandi',
  closed: 'Ish vaqtidan tashqari',
};

export const SCHEDULE_LABELS: Record<string, string> = {
  open: 'Ish vaqti',
  after_hours: 'Ish vaqtidan tashqari',
  holiday: 'Bayram kuni',
};
