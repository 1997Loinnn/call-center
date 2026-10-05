import { TicketChannel } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min, ValidateIf } from 'class-validator';
import { PageQueryDto } from '../common/http';
import { CreateTicketDto } from '../tickets/tickets.dto';

/** Omnikanal kanallari (telefon va ovozli xabar — telefoniya modulida). */
export const OMNI_CHANNELS = [TicketChannel.TELEGRAM, TicketChannel.WEBCHAT, TicketChannel.EMAIL] as const;

export class ConversationsQueryDto extends PageQueryDto {
  /** open — javob kutilmoqda, pending — fuqaro javobi kutilmoqda */
  @IsOptional()
  @IsIn(['open', 'pending', 'closed', 'active', 'all'])
  status?: 'open' | 'pending' | 'closed' | 'active' | 'all';

  @IsOptional()
  @IsIn(['mine', 'unassigned', 'all'])
  scope?: 'mine' | 'unassigned' | 'all';

  @IsOptional()
  @IsIn(OMNI_CHANNELS)
  channel?: TicketChannel;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class ReplyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body: string;
}

export class AssignDto {
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  userId: number | null;
}

export class LinkCitizenDto {
  @IsString()
  @Matches(/^[+\d\s()-]{9,20}$/, { message: 'Telefon raqami noto\'g\'ri' })
  phone: string;
}

export class LinkTicketDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  number: string;
}

/** Suhbatdan murojaat: kanal suhbatdan olinadi. */
export class ConversationTicketDto extends CreateTicketDto {}

export class OmniSettingsDto {
  @IsBoolean()
  autoReply: boolean;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  greeting: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  afterHours: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  ticketCreated: string;
}

// ───────────── Ochiq (autentifikatsiyasiz) endpointlar ─────────────

export class WebchatMessageDto {
  /** Sessiya tokeni: birinchi xabarda yo'q, javobda qaytariladi va brauzerda saqlanadi */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{32}$/)
  token?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[+\d\s()-]{0,20}$/)
  phone?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body: string;
}

export class WebchatPollDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{32}$/)
  token: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  after?: number;
}

/** JSON ko'rinishidagi kiruvchi xat (xom MIME o'rniga pochta shlyuzi yuborsa). */
export class InboundEmailDto {
  @IsString()
  @MaxLength(320)
  from: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fromName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  subject?: string;

  @IsString()
  @MaxLength(20000)
  text: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  messageId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  inReplyTo?: string;
}

/** Ishlab chiqish: Telegram/email ulanmasdan kiruvchi xabarni taqlid qilish. */
export class SimulateInboundDto {
  @IsIn(OMNI_CHANNELS)
  channel: TicketChannel;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text: string;
}
