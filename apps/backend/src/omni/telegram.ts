import { normalizePhone } from '../common/phone';

/** Telegram Bot API (https://core.telegram.org/bots/api) — faqat kerakli qismi, tashqi kutubxonasiz. */

export interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TgMessage {
  message_id: number;
  date: number;
  chat: { id: number; type: string };
  from?: TgUser;
  text?: string;
  caption?: string;
  contact?: { phone_number: string; first_name: string; user_id?: number };
  photo?: { file_id: string; file_size?: number }[];
  document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  voice?: { file_id: string; duration: number; file_size?: number };
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}

/** Bot klaviaturasi tugmalari */
export const TG_BUTTON_STATUS = 'Murojaat holatini bilish';
export const TG_BUTTON_PHONE = 'Telefon raqamni yuborish';

export const TG_KEYBOARD = {
  keyboard: [[{ text: TG_BUTTON_STATUS }], [{ text: TG_BUTTON_PHONE, request_contact: true }]],
  resize_keyboard: true,
};

export type TgIntent =
  | { kind: 'start' }
  | { kind: 'status_help' }
  | { kind: 'message'; text: string; attachments: { type: string; fileName?: string; sizeBytes?: number }[] }
  | { kind: 'contact'; phone: string; verified: boolean };

export interface ParsedTgUpdate {
  chatId: string;
  messageId: string;
  contactName: string | null;
  username: string | null;
  intent: TgIntent;
}

/** Faqat shaxsiy chatlar; guruh xabarlari va botlar e'tiborsiz qoldiriladi. */
export function parseTelegramUpdate(update: TgUpdate): ParsedTgUpdate | null {
  const msg = update.message;
  if (!msg || msg.chat.type !== 'private' || msg.from?.is_bot) return null;
  const from = msg.from;
  const base = {
    chatId: String(msg.chat.id),
    messageId: String(msg.message_id),
    contactName: from ? [from.first_name, from.last_name].filter(Boolean).join(' ') || null : null,
    username: from?.username ? `@${from.username}` : null,
  };

  if (msg.contact) {
    // Raqam fuqaroning o'ziniki bo'lsa (o'z kontaktini yuborgan) — Telegram tasdiqlagan hisoblanadi
    const phone = normalizePhone(msg.contact.phone_number);
    return { ...base, intent: { kind: 'contact', phone, verified: msg.contact.user_id === from?.id } };
  }

  const text = (msg.text ?? msg.caption ?? '').trim();
  if (/^\/start\b/.test(text)) return { ...base, intent: { kind: 'start' } };
  if (text === TG_BUTTON_STATUS || /^\/(holat|status)$/.test(text)) return { ...base, intent: { kind: 'status_help' } };

  const attachments: { type: string; fileName?: string; sizeBytes?: number }[] = [];
  if (msg.photo?.length) attachments.push({ type: 'photo', fileName: 'rasm.jpg', sizeBytes: msg.photo[msg.photo.length - 1].file_size });
  if (msg.document) attachments.push({ type: 'document', fileName: msg.document.file_name, sizeBytes: msg.document.file_size });
  if (msg.voice) attachments.push({ type: 'voice', fileName: `ovozli-xabar-${msg.voice.duration}s.ogg`, sizeBytes: msg.voice.file_size });
  const body = text.replace(/^\/(holat|status)\s+/, '') || (attachments.length ? `[${attachments.map((a) => (a.type === 'photo' ? 'rasm' : a.type === 'voice' ? 'ovozli xabar' : 'fayl')).join(', ')}]` : '');
  if (!body) return null;
  return { ...base, intent: { kind: 'message', text: body, attachments } };
}

export class TelegramApiError extends Error {}

export class TelegramClient {
  constructor(
    private readonly token: string,
    private readonly baseUrl = 'https://api.telegram.org',
  ) {}

  async call<T>(method: string, params: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${this.baseUrl}/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal,
    });
    const json = (await res.json().catch(() => null)) as { ok: boolean; result?: T; description?: string } | null;
    // Tokenni xato xabariga qo'shmaymiz
    if (!json?.ok) throw new TelegramApiError(`Telegram ${method}: ${json?.description ?? `HTTP ${res.status}`}`);
    return json.result as T;
  }

  getMe() {
    return this.call<TgUser>('getMe');
  }

  getUpdates(offset: number, signal?: AbortSignal) {
    return this.call<TgUpdate[]>('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] }, signal);
  }

  setWebhook(url: string, secret: string) {
    return this.call<boolean>('setWebhook', { url, secret_token: secret, allowed_updates: ['message'] });
  }

  deleteWebhook() {
    return this.call<boolean>('deleteWebhook');
  }

  sendMessage(chatId: string, text: string, withKeyboard = false) {
    return this.call<TgMessage>('sendMessage', { chat_id: chatId, text, ...(withKeyboard ? { reply_markup: TG_KEYBOARD } : {}) });
  }
}
