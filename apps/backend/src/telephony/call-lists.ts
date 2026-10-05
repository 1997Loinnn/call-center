import { Body, ConflictException, Controller, Get, HttpCode, Inject, Injectable, NotFoundException, OnModuleInit, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CallbackStatus, Prisma } from '@prisma/client';
import { IsIn, IsOptional } from 'class-validator';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators';
import { Permission } from '../common/permissions';
import { normalizePhone } from '../common/phone';
import { SmsService } from '../integrations/sms';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { BlacklistService } from './blacklist';
import { PBX_ADAPTER, PbxAdapter } from './pbx-adapter';
import { TelephonyService } from './telephony.service';

export class CallbacksQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'DONE', 'FAILED', 'CANCELLED', 'all'])
  status?: CallbackStatus | 'all';
}

export class CallbackResultDto {
  @IsIn(['DONE', 'FAILED', 'CANCELLED'])
  status: 'DONE' | 'FAILED' | 'CANCELLED';
}

/**
 * Qayta qo'ng'iroq so'rovlari (F-TEL-05): fuqaro navbatda chegaradan ko'p kutib "qayta qo'ng'iroq" ni tanlaydi
 * yoki IVR'da buyurtma qiladi. Operator ro'yxatdan terib, natijasini belgilaydi.
 */
@Injectable()
export class CallbacksService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly telephony: TelephonyService,
    private readonly sms: SmsService,
    private readonly blacklist: BlacklistService,
    @Inject(PBX_ADAPTER) private readonly pbx: PbxAdapter,
  ) {}

  onModuleInit(): void {
    this.pbx.onEvent((event) => {
      if (event.type === 'callback.requested') void this.request(event.callerNumber, event.queue).catch(() => undefined);
    });
  }

  list(status: CallbackStatus | 'all' = CallbackStatus.PENDING) {
    return this.prisma.callbackRequest.findMany({
      where: status === 'all' ? {} : { status },
      include: { queue: { select: { id: true, pbxNumber: true, name: true } }, handledBy: { select: { id: true, fullName: true } } },
      orderBy: status === CallbackStatus.PENDING ? { requestedAt: 'asc' } : { requestedAt: 'desc' },
      take: 200,
    });
  }

  async counts() {
    return { pending: await this.prisma.callbackRequest.count({ where: { status: CallbackStatus.PENDING } }) };
  }

  /** PBX hodisasidan: bir raqamdan ochiq so'rov bo'lsa takrorlanmaydi; fuqaroga SMS (shablon "Qayta qo'ng'iroq"). */
  async request(callerNumber: string, queueNumber?: string): Promise<void> {
    const phone = normalizePhone(callerNumber);
    if (await this.blacklist.isBlocked(phone)) return;
    const pending = await this.prisma.callbackRequest.findFirst({ where: { phone, status: CallbackStatus.PENDING } });
    if (pending) return;
    const queue = queueNumber ? await this.prisma.queue.findUnique({ where: { pbxNumber: queueNumber }, select: { id: true } }) : null;
    await this.prisma.callbackRequest.create({ data: { phone, queueId: queue?.id ?? null } });
    this.changed();
    await this.sms.send({ phone, text: await this.sms.template('callback', {}), template: 'callback' }).catch(() => undefined);
  }

  /** Operator qo'ng'iroq qiladi (softfon/ichki raqam orqali); urinish soni oshadi. */
  async call(user: AuthUser, id: number) {
    const row = await this.pending(id);
    await this.telephony.originate(user, row.phone);
    const updated = await this.prisma.callbackRequest.update({ where: { id }, data: { attempts: { increment: 1 }, handledById: user.id } });
    this.changed();
    return updated;
  }

  async finish(user: AuthUser, id: number, status: 'DONE' | 'FAILED' | 'CANCELLED') {
    const row = await this.pending(id);
    // Shu raqamga operatorning oxirgi chiquvchi qo'ng'irog'i natijaga bog'lanadi
    const call = await this.prisma.call.findFirst({
      where: { calledNumber: { in: [row.phone, row.phone.replace(/^\+/, '')] }, direction: 'OUTBOUND', agentId: user.id },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });
    const updated = await this.prisma.callbackRequest.update({
      where: { id },
      data: { status, handledById: user.id, handledAt: new Date(), callId: call?.id ?? null } satisfies Prisma.CallbackRequestUncheckedUpdateInput,
    });
    this.changed();
    return updated;
  }

  private async pending(id: number) {
    const row = await this.prisma.callbackRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("So'rov topilmadi");
    if (row.status !== CallbackStatus.PENDING) throw new ConflictException("So'rov allaqachon yopilgan");
    return row;
  }

  private changed(): void {
    this.realtime.emitToRoom('telephony', 'callbacks.changed', { at: new Date() });
  }
}

@ApiTags('telephony')
@Controller('callbacks')
export class CallbacksController {
  constructor(private readonly callbacks: CallbacksService) {}

  @Get()
  @RequireAnyPermission(Permission.TelephonyUse, Permission.MonitoringView)
  list(@Query() query: CallbacksQueryDto) {
    return this.callbacks.list(query.status);
  }

  @Get('counts')
  @RequireAnyPermission(Permission.TelephonyUse, Permission.MonitoringView)
  counts() {
    return this.callbacks.counts();
  }

  @Post(':id/call')
  @HttpCode(200)
  @RequirePermissions(Permission.TelephonyUse)
  call(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.callbacks.call(user, id);
  }

  @Post(':id/finish')
  @HttpCode(200)
  @RequirePermissions(Permission.TelephonyUse)
  finish(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: CallbackResultDto) {
    return this.callbacks.finish(user, id, dto.status);
  }
}
