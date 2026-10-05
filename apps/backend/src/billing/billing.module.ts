import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CallDirection, CallResult, Prisma, TariffDirection } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, Matches, Max, Min, ValidateIf } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { callScopeWhere, hasPermission, managesOrgUnit } from '../common/data-scope';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators';
import { diffFields } from '../common/diff';
import { Permission } from '../common/permissions';
import { NotificationsService } from '../integrations/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { chargeFor, isExternalNumber, limitLevel, matchTariff, monthKey, monthRange, TariffLike } from './tariff-math';

export class TariffDto {
  @IsEnum(TariffDirection)
  direction: TariffDirection;

  @Matches(/^\d{1,16}$/, { message: "Prefiks faqat raqamlardan iborat bo'lishi kerak (masalan, 99890)" })
  prefix: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  pricePerMinute: number;

  @IsInt()
  @Min(1)
  @Max(3600)
  billingStepSec: number;

  @IsDateString()
  validFrom: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  validTo?: string | null;
}

export class CostLimitDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  orgUnitId?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  userId?: number | null;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  monthlyAmount: number;

  @IsInt()
  @Min(1)
  @Max(100)
  warnPercent: number;

  @IsBoolean()
  isActive: boolean;
}

export class MonthQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Oy YYYY-MM ko\'rinishida bo\'lishi kerak' })
  month?: string;
}

export class RecalculateDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Oy YYYY-MM ko\'rinishida bo\'lishi kerak' })
  month: string;
}

export const DIRECTION_LABELS: Record<TariffDirection, string> = {
  MOBILE: 'Mobil',
  LOCAL: 'Shahar',
  LONG_DISTANCE: 'Shaharlararo',
  INTERNATIONAL: 'Xalqaro',
  INBOUND: 'Kiruvchi 1097',
};

const LIMIT_SELECT = {
  id: true,
  monthlyAmount: true,
  warnPercent: true,
  isActive: true,
  notifiedMonth: true,
  notifiedLevel: true,
  orgUnit: { select: { id: true, name: true, path: true } },
  user: { select: { id: true, fullName: true, sipExtension: true, orgUnit: { select: { path: true } } } },
} satisfies Prisma.CostLimitSelect;

type LimitRow = Prisma.CostLimitGetPayload<{ select: typeof LIMIT_SELECT }>;

const toTariff = (t: { id: number; prefix: string; pricePerMinute: Prisma.Decimal; billingStepSec: number; validFrom: Date; validTo: Date | null }): TariffLike => ({
  ...t,
  pricePerMinute: Number(t.pricePerMinute),
});

const formatSum = (value: number) => `${Math.round(value).toLocaleString('ru-RU').replace(/ /g, ' ')} so'm`;

/**
 * Qo'ng'iroqlar xarajati (F-BIL-01..05): tariflar jadvali, chiquvchi qo'ng'iroqni yakunlanganda narxlash,
 * bo'linma/operator uchun oylik limitlar va ularga yaqinlashganda ogohlantirish.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private tariffCache: { at: number; rows: TariffLike[] } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───────────── Tariflar ─────────────

  async tariffs() {
    const rows = await this.prisma.tariff.findMany({
      orderBy: [{ direction: 'asc' }, { prefix: 'asc' }, { validFrom: 'desc' }],
      include: { _count: { select: { charges: true } } },
    });
    return rows.map(({ _count, ...t }) => ({ ...t, pricePerMinute: Number(t.pricePerMinute), charges: _count.charges }));
  }

  async createTariff(user: AuthUser, dto: TariffDto) {
    const data = this.tariffData(dto);
    const row = await this.prisma.tariff.create({ data });
    this.tariffCache = null;
    await this.audit.log({ actorId: user.id, action: 'tariff.create', entityType: 'Tariff', entityId: row.id, details: { name: `${row.prefix} · ${DIRECTION_LABELS[row.direction]}`, price: dto.pricePerMinute } });
    return row;
  }

  async updateTariff(user: AuthUser, id: number, dto: TariffDto) {
    const before = await this.prisma.tariff.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Tarif topilmadi');
    const data = this.tariffData(dto);
    const row = await this.prisma.tariff.update({ where: { id }, data });
    this.tariffCache = null;
    const changes = diffFields(
      { direction: before.direction, prefix: before.prefix, pricePerMinute: Number(before.pricePerMinute), billingStepSec: before.billingStepSec, validFrom: before.validFrom.toISOString(), validTo: before.validTo?.toISOString() ?? null },
      { direction: row.direction, prefix: row.prefix, pricePerMinute: Number(row.pricePerMinute), billingStepSec: row.billingStepSec, validFrom: row.validFrom.toISOString(), validTo: row.validTo?.toISOString() ?? null },
      ['direction', 'prefix', 'pricePerMinute', 'billingStepSec', 'validFrom', 'validTo'],
    );
    if (Object.keys(changes).length) {
      await this.audit.log({ actorId: user.id, action: 'tariff.update', entityType: 'Tariff', entityId: id, details: { name: `${row.prefix} · ${DIRECTION_LABELS[row.direction]}`, changes } as unknown as Prisma.InputJsonValue });
    }
    return row;
  }

  /** Hisob-kitobda ishlatilgan tarif o'chirilmaydi — tarix buzilmasligi uchun muddati yopiladi. */
  async removeTariff(user: AuthUser, id: number): Promise<{ closed: boolean }> {
    const row = await this.prisma.tariff.findUnique({ where: { id }, include: { _count: { select: { charges: true } } } });
    if (!row) throw new NotFoundException('Tarif topilmadi');
    const name = `${row.prefix} · ${DIRECTION_LABELS[row.direction]}`;
    this.tariffCache = null;
    if (row._count.charges > 0) {
      await this.prisma.tariff.update({ where: { id }, data: { validTo: row.validTo && row.validTo < new Date() ? row.validTo : new Date() } });
      await this.audit.log({ actorId: user.id, action: 'tariff.close', entityType: 'Tariff', entityId: id, details: { name } });
      return { closed: true };
    }
    await this.prisma.tariff.delete({ where: { id } });
    await this.audit.log({ actorId: user.id, action: 'tariff.delete', entityType: 'Tariff', entityId: id, details: { name } });
    return { closed: false };
  }

  private tariffData(dto: TariffDto) {
    const validFrom = new Date(dto.validFrom);
    const validTo = dto.validTo ? new Date(dto.validTo) : null;
    if (validTo && validTo <= validFrom) throw new BadRequestException('Amal qilish oxiri boshlanishidan keyin bo\'lishi kerak');
    return { direction: dto.direction, prefix: dto.prefix, pricePerMinute: dto.pricePerMinute, billingStepSec: dto.billingStepSec, validFrom, validTo };
  }

  private async outboundTariffs(): Promise<TariffLike[]> {
    if (this.tariffCache && Date.now() - this.tariffCache.at < 60_000) return this.tariffCache.rows;
    const rows = await this.prisma.tariff.findMany({ where: { direction: { not: TariffDirection.INBOUND } } });
    this.tariffCache = { at: Date.now(), rows: rows.map(toTariff) };
    return this.tariffCache.rows;
  }

  // ───────────── Qo'ng'iroqni narxlash ─────────────

  /**
   * Yakunlangan chiquvchi qo'ng'iroqni narxlaydi (CDR saqlanganda chaqiriladi). Javob berilmagan, ichki yoki
   * tarifi topilmagan qo'ng'iroq uchun yozuv yaratilmaydi; mavjud bo'lsa o'chiriladi (qayta hisoblashda).
   */
  async chargeCall(callId: number, options: { checkLimits?: boolean } = {}): Promise<number | null> {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      select: { id: true, direction: true, result: true, calledNumber: true, startedAt: true, talkSeconds: true, agentId: true, agent: { select: { orgUnitId: true } } },
    });
    if (!call) return null;
    const tariff =
      call.direction === CallDirection.OUTBOUND && call.result === CallResult.ANSWERED && call.talkSeconds > 0 && isExternalNumber(call.calledNumber)
        ? matchTariff(await this.outboundTariffs(), call.calledNumber, call.startedAt)
        : null;
    if (!tariff) {
      await this.prisma.callCharge.deleteMany({ where: { callId } });
      return null;
    }
    const charge = chargeFor(tariff, call.talkSeconds);
    const data = { tariffId: charge.tariffId, billableSec: charge.billableSec, amount: charge.amount, orgUnitId: call.agent?.orgUnitId ?? null, userId: call.agentId, calculatedAt: call.startedAt };
    await this.prisma.callCharge.upsert({ where: { callId }, create: { callId, ...data }, update: data });
    if (options.checkLimits !== false) {
      await this.checkLimits(call.startedAt).catch((err) => this.logger.warn(`Limit tekshirilmadi: ${err instanceof Error ? err.message : String(err)}`));
    }
    return charge.amount;
  }

  /** Oy bo'yicha chiquvchi qo'ng'iroqlarni joriy tariflar bilan qayta narxlaydi (tarif o'zgartirilgandan keyin). */
  async recalculate(user: AuthUser, month: string) {
    const { from, to } = monthRange(month);
    this.tariffCache = null;
    const calls = await this.prisma.call.findMany({ where: { direction: CallDirection.OUTBOUND, startedAt: { gte: from, lt: to } }, select: { id: true } });
    let charged = 0;
    for (const c of calls) {
      if ((await this.chargeCall(c.id, { checkLimits: false })) !== null) charged++;
    }
    await this.checkLimits(from);
    const total = await this.prisma.callCharge.aggregate({ where: { call: { startedAt: { gte: from, lt: to } } }, _sum: { amount: true } });
    await this.audit.log({ actorId: user.id, action: 'billing.recalculate', entityType: 'CallCharge', entityId: month, details: { calls: calls.length, charged, total: Number(total._sum.amount ?? 0) } });
    return { calls: calls.length, charged, total: Number(total._sum.amount ?? 0) };
  }

  // ───────────── Limitlar ─────────────

  async limits(user: AuthUser, month = monthKey(new Date())) {
    const all = await this.prisma.costLimit.findMany({ select: LIMIT_SELECT, orderBy: [{ orgUnitId: 'asc' }, { userId: 'asc' }] });
    // Limitlarni yurituvchi hammasini, bo'linma rahbari faqat o'z bo'linmasi (va quyi bo'linmalari) limitlarini ko'radi
    const rows = hasPermission(user, Permission.SettingsManage) ? all : all.filter((r) => managesOrgUnit(user, r.orgUnit?.path ?? r.user?.orgUnit.path));
    const spent = await Promise.all(rows.map((r) => this.spentFor(r, month)));
    return rows.map((r, i) => {
      const amount = Number(r.monthlyAmount);
      return {
        id: r.id,
        orgUnit: r.orgUnit ? { id: r.orgUnit.id, name: r.orgUnit.name } : null,
        user: r.user ? { id: r.user.id, fullName: r.user.fullName, sipExtension: r.user.sipExtension } : null,
        monthlyAmount: amount,
        warnPercent: r.warnPercent,
        isActive: r.isActive,
        spent: spent[i],
        percent: amount > 0 ? Math.round((spent[i] / amount) * 1000) / 10 : null,
        level: r.isActive ? limitLevel(spent[i], amount, r.warnPercent) : 0,
      };
    });
  }

  async createLimit(user: AuthUser, dto: CostLimitDto) {
    const target = await this.limitTarget(dto);
    const row = await this.prisma.costLimit.create({
      data: { orgUnitId: dto.orgUnitId ?? null, userId: dto.userId ?? null, monthlyAmount: dto.monthlyAmount, warnPercent: dto.warnPercent, isActive: dto.isActive },
    });
    await this.audit.log({ actorId: user.id, action: 'billing.limit_create', entityType: 'CostLimit', entityId: row.id, details: { name: target, amount: dto.monthlyAmount } });
    await this.checkLimits(new Date());
    return row;
  }

  async updateLimit(user: AuthUser, id: number, dto: CostLimitDto) {
    const before = await this.prisma.costLimit.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Limit topilmadi');
    const target = await this.limitTarget(dto, id);
    const amountChanged = Number(before.monthlyAmount) !== dto.monthlyAmount || before.warnPercent !== dto.warnPercent;
    const row = await this.prisma.costLimit.update({
      where: { id },
      data: {
        orgUnitId: dto.orgUnitId ?? null,
        userId: dto.userId ?? null,
        monthlyAmount: dto.monthlyAmount,
        warnPercent: dto.warnPercent,
        isActive: dto.isActive,
        // Chegara o'zgarsa ogohlantirish qaytadan baholanadi
        ...(amountChanged ? { notifiedLevel: 0, notifiedMonth: null } : {}),
      },
    });
    const changes = diffFields(
      { monthlyAmount: Number(before.monthlyAmount), warnPercent: before.warnPercent, isActive: before.isActive, orgUnitId: before.orgUnitId, userId: before.userId },
      { monthlyAmount: dto.monthlyAmount, warnPercent: dto.warnPercent, isActive: dto.isActive, orgUnitId: dto.orgUnitId ?? null, userId: dto.userId ?? null },
      ['monthlyAmount', 'warnPercent', 'isActive', 'orgUnitId', 'userId'],
    );
    if (Object.keys(changes).length) {
      await this.audit.log({ actorId: user.id, action: 'billing.limit_update', entityType: 'CostLimit', entityId: id, details: { name: target, changes } as unknown as Prisma.InputJsonValue });
    }
    await this.checkLimits(new Date());
    return row;
  }

  async removeLimit(user: AuthUser, id: number): Promise<void> {
    const row = await this.prisma.costLimit.findUnique({ where: { id }, select: LIMIT_SELECT });
    if (!row) throw new NotFoundException('Limit topilmadi');
    await this.prisma.costLimit.delete({ where: { id } });
    await this.audit.log({ actorId: user.id, action: 'billing.limit_delete', entityType: 'CostLimit', entityId: id, details: { name: this.limitName(row) } });
  }

  private async limitTarget(dto: CostLimitDto, exceptId?: number): Promise<string> {
    const orgUnitId = dto.orgUnitId ?? null;
    const userId = dto.userId ?? null;
    if ((orgUnitId === null) === (userId === null)) throw new BadRequestException("Limit bo'linma yoki operator uchun belgilanadi (faqat bittasi)");
    const duplicate = await this.prisma.costLimit.findFirst({ where: { orgUnitId, userId, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
    if (duplicate) throw new BadRequestException('Bu bo\'linma yoki operator uchun limit allaqachon belgilangan');
    if (orgUnitId !== null) {
      const unit = await this.prisma.orgUnit.findUnique({ where: { id: orgUnitId }, select: { name: true } });
      if (!unit) throw new BadRequestException("Bo'linma topilmadi");
      return unit.name;
    }
    const target = await this.prisma.user.findUnique({ where: { id: userId! }, select: { fullName: true } });
    if (!target) throw new BadRequestException('Foydalanuvchi topilmadi');
    return target.fullName;
  }

  private limitName(row: LimitRow): string {
    return row.orgUnit?.name ?? row.user?.fullName ?? `#${row.id}`;
  }

  /** Limit doirasidagi oy xarajati: bo'linma uchun — u va uning quyi bo'linmalari operatorlari. */
  private async spentFor(row: LimitRow, month: string): Promise<number> {
    const { from, to } = monthRange(month);
    const where: Prisma.CallChargeWhereInput = {
      calculatedAt: { gte: from, lt: to },
      ...(row.orgUnit ? { orgUnit: { path: { startsWith: row.orgUnit.path } } } : { userId: row.user?.id ?? -1 }),
    };
    const sum = await this.prisma.callCharge.aggregate({ where, _sum: { amount: true } });
    return Number(sum._sum.amount ?? 0);
  }

  /**
   * Faol limitlarni tekshiradi: ogohlantirish foiziga yetganda va limit tugaganda bir martadan xabar beradi
   * (oy almashganda hisob boshidan). Faqat joriy oy uchun — o'tgan oylarni qayta hisoblash xabar yubormaydi.
   */
  async checkLimits(at: Date): Promise<void> {
    const month = monthKey(at);
    if (month !== monthKey(new Date())) return;
    const rows = await this.prisma.costLimit.findMany({ where: { isActive: true }, select: LIMIT_SELECT });
    for (const row of rows) {
      const already = row.notifiedMonth === month ? row.notifiedLevel : 0;
      const limit = Number(row.monthlyAmount);
      const spent = await this.spentFor(row, month);
      const level = limitLevel(spent, limit, row.warnPercent);
      if (level === 0 || level <= already) continue;
      // Parallel CDR'lar bir xabarni ikki marta yubormasligi uchun shartli yangilash
      const claimed = await this.prisma.costLimit.updateMany({
        where: { id: row.id, OR: [{ notifiedMonth: { not: month } }, { notifiedMonth: null }, { notifiedLevel: { lt: level } }] },
        data: { notifiedMonth: month, notifiedLevel: level },
      });
      if (claimed.count === 0) continue;
      await this.notifyLimit(row, level, spent, limit);
    }
  }

  private async notifyLimit(row: LimitRow, level: 1 | 2, spent: number, limit: number): Promise<void> {
    const name = this.limitName(row);
    const percent = limit > 0 ? Math.round((spent / limit) * 100) : 100;
    const title = level === 2 ? `Xarajat limiti tugadi: ${name}` : `Xarajat limitining ${percent}% sarflandi: ${name}`;
    const body = `Shu oy chiquvchi qo'ng'iroqlar: ${formatSum(spent)} / ${formatSum(limit)}`;
    const admins = await this.prisma.user.findMany({
      where: { isActive: true, roles: { some: { role: { permissions: { has: Permission.SettingsManage } } } } },
      select: { id: true },
    });
    const userUnit = row.user ? (await this.prisma.user.findUnique({ where: { id: row.user.id }, select: { orgUnitId: true } }))?.orgUnitId : null;
    const recipients = [...admins.map((a) => a.id), ...(await this.notifications.supervisors()), ...(await this.notifications.unitHeads([row.orgUnit?.id, userUnit]))];
    await this.notifications.notifyUsers(recipients, { type: 'billing.limit', title, body, link: '/billing' });
    if (level === 2) await this.notifications.telegramGroup(`💸 ${title}\n${body}`);
    await this.audit.log({ action: level === 2 ? 'billing.limit_exceeded' : 'billing.limit_warning', entityType: 'CostLimit', entityId: row.id, details: { name, spent, limit } });
  }

  /** Limit qo'yish mumkin bo'lgan bo'linmalar va ichki raqamli xodimlar (forma tanlovlari uchun). */
  async targets() {
    const [units, operators] = await Promise.all([
      this.prisma.orgUnit.findMany({ where: { isActive: true }, select: { id: true, name: true, depth: true, path: true }, orderBy: { path: 'asc' } }),
      this.prisma.user.findMany({ where: { isActive: true, sipExtension: { not: null } }, select: { id: true, fullName: true, sipExtension: true }, orderBy: { fullName: 'asc' } }),
    ]);
    return { units: units.map(({ path: _path, ...u }) => u), operators };
  }

  // ───────────── Oylik hisobot ─────────────

  async summary(user: AuthUser, month = monthKey(new Date())) {
    const { from, to } = monthRange(month);
    const scope = hasPermission(user, Permission.SettingsManage) ? {} : callScopeWhere(user);
    const where: Prisma.CallChargeWhereInput = { calculatedAt: { gte: from, lt: to }, call: scope };
    const [byTariff, byUnit, byUser, uncharged] = await Promise.all([
      this.prisma.callCharge.groupBy({ by: ['tariffId'], where, _count: { _all: true }, _sum: { amount: true, billableSec: true } }),
      this.prisma.callCharge.groupBy({ by: ['orgUnitId'], where, _count: { _all: true }, _sum: { amount: true, billableSec: true } }),
      this.prisma.callCharge.groupBy({ by: ['userId'], where, _count: { _all: true }, _sum: { amount: true, billableSec: true }, orderBy: { _sum: { amount: 'desc' } }, take: 20 }),
      // Javob berilgan tashqi chiquvchi qo'ng'iroq, lekin tarifi topilmagan — tariflar jadvalini to'ldirish kerak
      this.prisma.call.count({
        where: { AND: [scope, { direction: CallDirection.OUTBOUND, result: CallResult.ANSWERED, talkSeconds: { gt: 0 }, startedAt: { gte: from, lt: to }, charge: null, calledNumber: { startsWith: '+' } }] },
      }),
    ]);
    const [tariffs, units, users] = await Promise.all([
      this.prisma.tariff.findMany({ where: { id: { in: byTariff.map((r) => r.tariffId).filter((id): id is number => id !== null) } }, select: { id: true, direction: true } }),
      this.prisma.orgUnit.findMany({ where: { id: { in: byUnit.map((r) => r.orgUnitId).filter((id): id is number => id !== null) } }, select: { id: true, name: true } }),
      this.prisma.user.findMany({ where: { id: { in: byUser.map((r) => r.userId).filter((id): id is number => id !== null) } }, select: { id: true, fullName: true, sipExtension: true } }),
    ]);
    const directionOf = new Map(tariffs.map((t) => [t.id, t.direction]));
    const unitName = new Map(units.map((u) => [u.id, u.name]));
    const userOf = new Map(users.map((u) => [u.id, u]));
    const minutes = (sec: number | null) => Math.round((sec ?? 0) / 60);

    const directions = (Object.keys(DIRECTION_LABELS) as TariffDirection[])
      .filter((d) => d !== TariffDirection.INBOUND)
      .map((direction) => {
        const items = byTariff.filter((r) => r.tariffId !== null && directionOf.get(r.tariffId) === direction);
        return {
          direction,
          label: DIRECTION_LABELS[direction],
          calls: items.reduce((s, r) => s + r._count._all, 0),
          minutes: minutes(items.reduce((s, r) => s + (r._sum.billableSec ?? 0), 0)),
          amount: items.reduce((s, r) => s + Number(r._sum.amount ?? 0), 0),
        };
      });
    return {
      month,
      total: directions.reduce((s, d) => s + d.amount, 0),
      calls: directions.reduce((s, d) => s + d.calls, 0),
      uncharged,
      directions,
      units: byUnit
        .map((r) => ({ orgUnitId: r.orgUnitId, name: r.orgUnitId ? unitName.get(r.orgUnitId) ?? '—' : 'Biriktirilmagan', calls: r._count._all, minutes: minutes(r._sum.billableSec), amount: Number(r._sum.amount ?? 0) }))
        .sort((a, b) => b.amount - a.amount),
      operators: byUser.map((r) => ({
        userId: r.userId,
        fullName: r.userId ? userOf.get(r.userId)?.fullName ?? '—' : '—',
        sipExtension: r.userId ? userOf.get(r.userId)?.sipExtension ?? null : null,
        calls: r._count._all,
        minutes: minutes(r._sum.billableSec),
        amount: Number(r._sum.amount ?? 0),
      })),
    };
  }
}

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('summary')
  @RequireAnyPermission(Permission.ReportsView, Permission.SettingsManage)
  summary(@CurrentUser() user: AuthUser, @Query() query: MonthQueryDto) {
    return this.billing.summary(user, query.month);
  }

  @Post('recalculate')
  @RequirePermissions(Permission.SettingsManage)
  recalculate(@CurrentUser() user: AuthUser, @Body() dto: RecalculateDto) {
    return this.billing.recalculate(user, dto.month);
  }

  @Get('tariffs')
  @RequireAnyPermission(Permission.ReportsView, Permission.SettingsManage)
  tariffs() {
    return this.billing.tariffs();
  }

  @Post('tariffs')
  @RequirePermissions(Permission.SettingsManage)
  createTariff(@CurrentUser() user: AuthUser, @Body() dto: TariffDto) {
    return this.billing.createTariff(user, dto);
  }

  @Put('tariffs/:id')
  @RequirePermissions(Permission.SettingsManage)
  updateTariff(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: TariffDto) {
    return this.billing.updateTariff(user, id, dto);
  }

  @Delete('tariffs/:id')
  @RequirePermissions(Permission.SettingsManage)
  removeTariff(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.billing.removeTariff(user, id);
  }

  @Get('limits')
  @RequireAnyPermission(Permission.ReportsView, Permission.SettingsManage)
  limits(@CurrentUser() user: AuthUser, @Query() query: MonthQueryDto) {
    return this.billing.limits(user, query.month);
  }

  @Get('limits/targets')
  @RequirePermissions(Permission.SettingsManage)
  targets() {
    return this.billing.targets();
  }

  @Post('limits')
  @RequirePermissions(Permission.SettingsManage)
  createLimit(@CurrentUser() user: AuthUser, @Body() dto: CostLimitDto) {
    return this.billing.createLimit(user, dto);
  }

  @Put('limits/:id')
  @RequirePermissions(Permission.SettingsManage)
  updateLimit(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: CostLimitDto) {
    return this.billing.updateLimit(user, id, dto);
  }

  @Delete('limits/:id')
  @HttpCode(204)
  @RequirePermissions(Permission.SettingsManage)
  removeLimit(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.billing.removeLimit(user, id);
  }
}

@Module({
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
