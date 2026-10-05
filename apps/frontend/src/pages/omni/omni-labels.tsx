import { GlobalOutlined, MailOutlined, SendOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import type { ConversationStatus, OmniChannel } from '../../api/types';
import type { Tone } from '../../theme';

export const CHANNEL_META: Record<OmniChannel, { label: string; icon: ReactNode; className: string }> = {
  TELEGRAM: { label: 'Telegram', icon: <SendOutlined />, className: 'is-telegram' },
  WEBCHAT: { label: 'Veb-chat', icon: <GlobalOutlined />, className: 'is-webchat' },
  EMAIL: { label: 'Email', icon: <MailOutlined />, className: 'is-email' },
};

export const CONVERSATION_STATUS: Record<ConversationStatus, { label: string; tone: Tone }> = {
  OPEN: { label: 'Javob kutmoqda', tone: 'amber' },
  PENDING: { label: 'Fuqaro javobi kutilmoqda', tone: 'blue' },
  CLOSED: { label: 'Yopilgan', tone: 'grey' },
};

/** Tez javoblar: operator bir bosishda qo'yadi va kerak bo'lsa tahrirlaydi. */
export const QUICK_REPLIES = [
  'Assalomu alaykum! Savolingizni batafsil yozing, iltimos.',
  'Ariza raqamingizni (my.gov.uz yoki DXM) yuboring, holatini tekshirib beraman.',
  'Bog\'lanish uchun telefon raqamingizni yozib qoldiring.',
  "Hujjat nusxasini (rasm yoki PDF) shu yerga yuborishingiz mumkin.",
  "Savolingiz bo'yicha murojaat ro'yxatga olinadi va mas'ul bo'linmaga yuboriladi. Javob qonunda belgilangan 15 kun ichida beriladi.",
  'Murojaatingiz uchun rahmat! Boshqa savollaringiz bo\'lsa, yozing.',
];

export const contactTitle = (c: { contactName: string | null; contactHandle: string | null; contactPhone: string | null; citizen?: { fullName: string | null } | null }) =>
  c.citizen?.fullName || c.contactName || c.contactHandle || c.contactPhone || "Noma'lum fuqaro";
