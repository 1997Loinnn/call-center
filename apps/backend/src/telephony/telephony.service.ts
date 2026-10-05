import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AgentStatus, CallDirection } from '@prisma/client';
import { BillingService } from '../billing/billing.module';
import { AuthUser } from '../common/auth-user';
import { normalizePhone } from '../common/phone';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RecordingsService } from '../recordings/recordings.service';
import { BlacklistService } from './blacklist';
import { MockPbxAdapter } from './mock-pbx.adapter';
import { PBX_ADAPTER, PbxAdapter, PbxCdr, PbxEvent } from './pbx-adapter';

const seconds = (from: Date, to: Date) => Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));

@Injectable()
export class TelephonyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelephonyService.name);

  constructor(
    @Inject(PBX_ADAPTER) private readonly pbx: PbxAdapter,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly recordings: RecordingsService,
    private readonly blacklist: BlacklistService,
    private readonly billing: BillingService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.pbx.onEvent((event) => {
      this.handle(event).catch((err) => this.logger.error(`PBX hodisasi qayta ishlanmadi: ${event.type}`, err));
    });
    try {
      await this.pbx.start();
    } catch (err) {
      // PBX ishlamasa ham murojaatlar bilan ishlash to'xtamasligi kerak (TZ 7-bo'lim)
      this.logger.error(`PBX'ga ulanib bo'lmadi (${this.pbx.name})`, err instanceof Error ? err.stack : String(err));
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pbx.stop();
  }

  get driver(): string {
    return this.pbx.name;
  }

  async setAgentStatus(user: AuthUser, status: AgentStatus, reason?: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.agentStatusLog.updateMany({ where: { userId: user.id, endedAt: null }, data: { endedAt: new Date() } }),
      this.prisma.agentStatusLog.create({ data: { userId: user.id, status, reason } }),
    ]);
    this.realtime.emitToRoom('monitoring', 'agent.status', { userId: user.id, fullName: user.fullName, status, reason });
    // TODO(F-OP-03): BREAK/OFFLINE holatida operatorni UCM navbatida pauzaga qo'yish
  }

  async originate(user: AuthUser, number: string): Promise<void> {
    if (!user.sipExtension) throw new BadRequestException('Sizga SIP ichki raqam biriktirilmagan');
    await this.pbx.originate(user.sipExtension, normalizePhone(number));
  }

  /** Faqat PBX_DRIVER=mock rejimida: kiruvchi qo'ng'iroqni taqlid qilish. */
  async simulateIncomingCall(user: AuthUser, callerNumber: string): Promise<{ pbxCallId: string }> {
    if (!(this.pbx instanceof MockPbxAdapter)) {
      throw new BadRequestException('Test qo\'ng\'irog\'i faqat PBX_DRIVER=mock rejimida ishlaydi');
    }
    if (!user.sipExtension) throw new BadRequestException('Sizga SIP ichki raqam biriktirilmagan');
    // UCM6510 qora ro'yxatdagi raqamni o'zi rad etadi; taqlidda ham shunday
    if (await this.blacklist.isBlocked(callerNumber)) throw new BadRequestException("Raqam qora ro'yxatda: qo'ng'iroq qabul qilinmaydi");
    return { pbxCallId: this.pbx.simulateIncomingCall(user.sipExtension, normalizePhone(callerNumber)) };
  }

  private async handle(event: PbxEvent): Promise<void> {
    switch (event.type) {
      case 'call.ringing': {
        const agentId = await this.agentIdByExtension(event.extension);
        if (agentId) {
          this.realtime.emitToUser(agentId, 'call.ringing', {
            pbxCallId: event.pbxCallId,
            callerNumber: normalizePhone(event.callerNumber),
            queue: event.queue,
          });
        }
        break;
      }
      case 'call.answered': {
        const agentId = await this.agentIdByExtension(event.extension);
        if (agentId) this.realtime.emitToUser(agentId, 'call.answered', { pbxCallId: event.pbxCallId });
        break;
      }
      case 'call.ended': {
        const agentId = await this.saveCdr(event.cdr);
        if (agentId) this.realtime.emitToUser(agentId, 'call.ended', { pbxCallId: event.pbxCallId });
        break;
      }
    }
  }

  /** CDR'ni qo'ng'iroqlar jurnaliga yozadi (F-REC-06). Operator id'sini qaytaradi. */
  private async saveCdr(cdr: PbxCdr): Promise<number | null> {
    const callerNumber = normalizePhone(cdr.callerNumber);
    // Chiquvchi qo'ng'iroqda fuqaro — chaqirilgan raqam; UCM uni "998…" yoki "9…" ko'rinishida beradi
    const outbound = cdr.direction === CallDirection.OUTBOUND;
    const calledNumber = outbound ? normalizePhone(cdr.calledNumber) : cdr.calledNumber;
    const [agentId, queue, citizen] = await Promise.all([
      cdr.extension ? this.agentIdByExtension(cdr.extension) : Promise.resolve(null),
      cdr.queue ? this.prisma.queue.findUnique({ where: { pbxNumber: cdr.queue }, select: { id: true } }) : null,
      this.prisma.citizen.findUnique({ where: { phone: outbound ? calledNumber : callerNumber }, select: { id: true } }),
    ]);

    const data = {
      direction: cdr.direction,
      callerNumber,
      calledNumber,
      queueId: queue?.id,
      agentId,
      citizenId: citizen?.id,
      startedAt: cdr.startedAt,
      answeredAt: cdr.answeredAt,
      endedAt: cdr.endedAt,
      waitSeconds: seconds(cdr.startedAt, cdr.answeredAt ?? cdr.endedAt),
      talkSeconds: cdr.answeredAt ? seconds(cdr.answeredAt, cdr.endedAt) : 0,
      result: cdr.result,
    };
    const call = await this.prisma.call.upsert({
      where: { pbxCallId: cdr.pbxCallId },
      create: { pbxCallId: cdr.pbxCallId, ...data },
      update: data,
      select: { id: true },
    });
    // Yozuvni olib bo'lmasa ham CDR saqlanib qolishi kerak
    await this.recordings
      .attach(call.id, cdr.pbxCallId, cdr.recordingFile, data.talkSeconds)
      .catch((err) => this.logger.error(`Yozuv saqlanmadi: ${cdr.pbxCallId}`, err instanceof Error ? err.stack : String(err)));
    // Chiquvchi qo'ng'iroq tarif bo'yicha narxlanadi (F-BIL-03); xato CDR'ni to'xtatmaydi
    if (outbound) {
      await this.billing
        .chargeCall(call.id)
        .catch((err) => this.logger.error(`Qo'ng'iroq narxlanmadi: ${cdr.pbxCallId}`, err instanceof Error ? err.stack : String(err)));
    }
    return agentId;
  }

  private async agentIdByExtension(extension: string): Promise<number | null> {
    const agent = await this.prisma.user.findUnique({ where: { sipExtension: extension }, select: { id: true } });
    return agent?.id ?? null;
  }
}
