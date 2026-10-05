import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { diffFields } from '../common/diff';
import { PrismaService } from '../prisma/prisma.service';
import { pickBestRule } from '../tickets/routing';
import { RoutingMatchQueryDto, RoutingRuleDto } from './crm.dto';

const RULE_INCLUDE = {
  category: { select: { id: true, nameUz: true } },
  region: { select: { id: true, nameUz: true } },
  district: { select: { id: true, nameUz: true } },
  targetOrgUnit: { select: { id: true, name: true, isActive: true } },
} satisfies Prisma.RoutingRuleInclude;

const AUDIT_FIELDS = ['categoryId', 'regionId', 'districtId', 'targetOrgUnitId', 'priority', 'isActive'] as const;

/**
 * Yo'naltirish jadvali (F-CRM-03): toifa va hudud bo'yicha mas'ul bo'linma. Murojaat yaratilganda
 * va operator formasidagi taklifda TicketsService shu jadvaldan pickBestRule bilan tanlaydi.
 */
@Injectable()
export class RoutingRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.routingRule.findMany({ include: RULE_INCLUDE, orderBy: [{ priority: 'asc' }, { id: 'asc' }] });
  }

  async create(dto: RoutingRuleDto, actor: AuthUser) {
    const data = await this.validated(dto);
    const rule = await this.prisma.routingRule.create({ data, include: RULE_INCLUDE });
    await this.audit.log({ actorId: actor.id, action: 'routing.create', entityType: 'RoutingRule', entityId: rule.id, details: this.describe(rule) });
    return rule;
  }

  async replace(id: number, dto: RoutingRuleDto, actor: AuthUser) {
    const before = await this.prisma.routingRule.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Qoida topilmadi');
    const data = await this.validated(dto);
    const rule = await this.prisma.routingRule.update({ where: { id }, data, include: RULE_INCLUDE });
    await this.audit.log({
      actorId: actor.id,
      action: 'routing.update',
      entityType: 'RoutingRule',
      entityId: id,
      details: { ...this.describe(rule), changes: diffFields(before, data, AUDIT_FIELDS) } as unknown as Prisma.InputJsonValue,
    });
    return rule;
  }

  async remove(id: number, actor: AuthUser): Promise<void> {
    const rule = await this.prisma.routingRule.findUnique({ where: { id }, include: RULE_INCLUDE });
    if (!rule) throw new NotFoundException('Qoida topilmadi');
    await this.prisma.routingRule.delete({ where: { id } });
    await this.audit.log({ actorId: actor.id, action: 'routing.delete', entityType: 'RoutingRule', entityId: id, details: this.describe(rule) });
  }

  /** Jadvalni tekshirish: berilgan toifa va hudud uchun qaysi qoida ishlaydi (mavzu — ota toifasi bo'yicha). */
  async match(query: RoutingMatchQueryDto) {
    const [rules, category] = await Promise.all([
      this.prisma.routingRule.findMany({ where: { isActive: true, targetOrgUnit: { isActive: true } }, include: RULE_INCLUDE }),
      query.categoryId ? this.prisma.category.findUnique({ where: { id: query.categoryId }, select: { parentId: true } }) : null,
    ]);
    const categoryId = category?.parentId ?? query.categoryId;
    return pickBestRule(rules, { ...query, categoryId }) ?? null;
  }

  private async validated(dto: RoutingRuleDto): Promise<Prisma.RoutingRuleUncheckedCreateInput> {
    const [category, district, target] = await Promise.all([
      dto.categoryId ? this.prisma.category.findUnique({ where: { id: dto.categoryId }, select: { parentId: true } }) : null,
      dto.districtId ? this.prisma.district.findUnique({ where: { id: dto.districtId }, select: { regionId: true } }) : null,
      this.prisma.orgUnit.findUnique({ where: { id: dto.targetOrgUnitId }, select: { isActive: true } }),
    ]);
    if (dto.categoryId && !category) throw new BadRequestException('Toifa topilmadi');
    // Murojaat yo'naltirilganda mavzu ota toifasiga almashtiriladi, shuning uchun qoida toifa darajasida bo'ladi
    if (category?.parentId) throw new BadRequestException("Qoida mavzu uchun emas, toifa uchun yoziladi");
    if (dto.districtId && !district) throw new BadRequestException('Tuman topilmadi');
    if (district && dto.regionId && district.regionId !== dto.regionId) throw new BadRequestException('Tuman tanlangan hududga tegishli emas');
    if (!target?.isActive) throw new BadRequestException("Mas'ul bo'linma topilmadi yoki faol emas");
    return {
      categoryId: dto.categoryId ?? null,
      regionId: district?.regionId ?? dto.regionId ?? null,
      districtId: dto.districtId ?? null,
      targetOrgUnitId: dto.targetOrgUnitId,
      priority: dto.priority,
      isActive: dto.isActive ?? true,
    };
  }

  private describe(rule: Prisma.RoutingRuleGetPayload<{ include: typeof RULE_INCLUDE }>) {
    return {
      category: rule.category?.nameUz ?? 'Istalgan',
      region: rule.district?.nameUz ?? rule.region?.nameUz ?? 'Istalgan',
      target: rule.targetOrgUnit.name,
      priority: rule.priority,
    };
  }
}
