import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  PayloadTooLargeException,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConversationStatus } from '@prisma/client';
import type { Request } from 'express';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Public, RequireAnyPermission, RequirePermissions } from '../common/decorators';
import { requestMeta } from '../common/http';
import { Permission } from '../common/permissions';
import { RealtimeModule } from '../realtime/realtime.module';
import { TicketsModule } from '../tickets/tickets.module';
import { EmailChannel, sameSecret, TelegramBot } from '../integrations/channels';
import { parseEmail } from './mime';
import {
  AssignDto,
  ConversationsQueryDto,
  ConversationTicketDto,
  InboundEmailDto,
  LinkCitizenDto,
  LinkTicketDto,
  OmniSettingsDto,
  ReplyDto,
  SimulateInboundDto,
  WebchatMessageDto,
  WebchatPollDto,
} from './omni.dto';
import { OmniService } from './omni.service';
import type { TgUpdate } from './telegram';

const MAX_EMAIL_BYTES = 15 * 1024 * 1024;

/** Xabar almashish → Omnikanal: operator oynasi. */
@ApiTags('omni')
@Controller('omni')
export class OmniController {
  constructor(private readonly omni: OmniService) {}

  @Get('conversations')
  @RequirePermissions(Permission.TicketsCreate)
  list(@CurrentUser() user: AuthUser, @Query() query: ConversationsQueryDto) {
    return this.omni.list(user, query);
  }

  @Get('counts')
  @RequirePermissions(Permission.TicketsCreate)
  counts(@CurrentUser() user: AuthUser) {
    return this.omni.counts(user);
  }

  @Get('operators')
  @RequirePermissions(Permission.TicketsCreate)
  operators() {
    return this.omni.operators();
  }

  @Get('conversations/:id')
  @RequirePermissions(Permission.TicketsCreate)
  get(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.omni.get(user, id);
  }

  @Post('conversations/:id/messages')
  @RequirePermissions(Permission.TicketsCreate)
  reply(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ReplyDto) {
    return this.omni.reply(user, id, dto.body);
  }

  @Post('messages/:id/retry')
  @HttpCode(200)
  @RequirePermissions(Permission.TicketsCreate)
  retry(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.omni.retry(user, id);
  }

  @Post('conversations/:id/assign')
  @HttpCode(200)
  @RequirePermissions(Permission.TicketsCreate)
  assign(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: AssignDto) {
    return this.omni.assign(user, id, dto.userId);
  }

  @Post('conversations/:id/close')
  @HttpCode(200)
  @RequirePermissions(Permission.TicketsCreate)
  close(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.omni.setStatus(user, id, ConversationStatus.CLOSED);
  }

  @Post('conversations/:id/reopen')
  @HttpCode(200)
  @RequirePermissions(Permission.TicketsCreate)
  reopen(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.omni.setStatus(user, id, ConversationStatus.OPEN);
  }

  @Post('conversations/:id/citizen')
  @HttpCode(200)
  @RequirePermissions(Permission.TicketsCreate, Permission.CitizensRead)
  linkCitizen(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: LinkCitizenDto) {
    return this.omni.linkCitizen(user, id, dto.phone);
  }

  @Post('conversations/:id/ticket')
  @RequirePermissions(Permission.TicketsCreate)
  createTicket(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ConversationTicketDto, @Req() req: Request) {
    return this.omni.createTicket(user, id, dto, requestMeta(req));
  }

  @Post('conversations/:id/link-ticket')
  @HttpCode(200)
  @RequirePermissions(Permission.TicketsCreate)
  linkTicket(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: LinkTicketDto) {
    return this.omni.linkTicket(user, id, dto.number);
  }

  @Get('channels')
  @RequireAnyPermission(Permission.TicketsCreate, Permission.SettingsManage)
  channels() {
    return this.omni.channels();
  }

  @Get('settings')
  @RequireAnyPermission(Permission.TicketsCreate, Permission.SettingsManage)
  settings() {
    return this.omni.getSettings();
  }

  @Put('settings')
  @RequirePermissions(Permission.SettingsManage)
  saveSettings(@CurrentUser() user: AuthUser, @Body() dto: OmniSettingsDto) {
    return this.omni.saveSettings(user, dto);
  }

  /** Ishlab chiqish: Telegram/email ulanmasdan kiruvchi xabarni taqlid qilish (NODE_ENV=production da o'chiq). */
  @Post('dev/simulate')
  @RequireAnyPermission(Permission.TicketsCreate, Permission.SettingsManage)
  simulate(@Body() dto: SimulateInboundDto) {
    if (!this.omni.devSimulation) throw new ForbiddenException("Taqlid faqat ishlab chiqish muhitida ishlaydi");
    return this.omni.simulate(dto);
  }
}

/**
 * Ochiq endpointlar: veb-chat vidjeti (fuqaro), Telegram webhook va pochta serveri.
 * So'rovlar soni IP bo'yicha cheklangan; Telegram va pochta — maxfiy kalit bilan.
 */
@ApiTags('public')
@Public()
@Controller('public')
export class OmniPublicController {
  constructor(
    private readonly omni: OmniService,
    private readonly telegram: TelegramBot,
    private readonly email: EmailChannel,
  ) {}

  @Post('webchat/messages')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async webchatPost(@Body() dto: WebchatMessageDto) {
    const { token } = await this.omni.webchatPost(dto);
    return { token };
  }

  @Get('webchat/messages')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  webchatPoll(@Query() query: WebchatPollDto) {
    return this.omni.webchatPoll(query.token, query.after);
  }

  @Post('telegram/webhook')
  @HttpCode(200)
  async telegramWebhook(@Headers('x-telegram-bot-api-secret-token') secret: string | undefined, @Body() update: TgUpdate) {
    if (!(await this.telegram.handleWebhook(secret, update))) throw new NotFoundException();
    return { ok: true };
  }

  /** Xom xat (message/rfc822): masalan Postfix "pipe" → curl --data-binary @- -H "X-Inbound-Secret: ..." */
  @Post('email/inbound')
  @HttpCode(202)
  async emailInbound(@Headers('x-inbound-secret') secret: string | undefined, @Req() req: Request) {
    if (!sameSecret(secret, this.email.inboundSecret)) throw new NotFoundException();
    const raw = await readRaw(req);
    if (!raw.trim()) throw new BadRequestException("Xat bo'sh");
    return (await this.omni.receiveEmail(parseEmail(raw))) ?? { duplicate: true };
  }

  /** Pochta shlyuzi xatni JSON ko'rinishida yuborsa. */
  @Post('email/inbound-json')
  @HttpCode(202)
  async emailInboundJson(@Headers('x-inbound-secret') secret: string | undefined, @Body() dto: InboundEmailDto) {
    if (!sameSecret(secret, this.email.inboundSecret)) throw new NotFoundException();
    const from = (/<([^>]+)>/.exec(dto.from)?.[1] ?? dto.from).trim().toLowerCase();
    const result = await this.omni.receiveEmail({
      from,
      fromName: dto.fromName ?? null,
      subject: dto.subject ?? '',
      text: dto.text,
      messageId: dto.messageId ?? null,
      inReplyTo: dto.inReplyTo ?? null,
      references: [],
      attachments: [],
    });
    return result ?? { duplicate: true };
  }
}

/** So'rov tanasini o'qiydi (JSON parser bu turdagi tanaga tegmaydi); baytlar "binary" qatorga. */
async function readRaw(req: Request): Promise<string> {
  if (typeof req.body === 'string') return req.body;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_EMAIL_BYTES) throw new PayloadTooLargeException('Xat 15 MB dan katta');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('binary');
}

@Module({
  imports: [RealtimeModule, TicketsModule],
  controllers: [OmniController, OmniPublicController],
  providers: [OmniService],
  exports: [OmniService],
})
export class OmniModule {}
