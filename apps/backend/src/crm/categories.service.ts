import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Category, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { diffFields } from '../common/diff';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_SLA_DAYS } from '../tickets/ticket-workflow';
import { CreateCategoryDto, UpdateCategoryDto } from './crm.dto';

/** Lotin harflaridan barqaror kod: "Ko'chmas mulk" → "ko-chmas-mulk". */
export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'toifa'
  );
}

/**
 * Murojaat toifalari va mavzulari (CRM sozlamalari, F-ADM-02). Mavzu — toifaning quyi bandi:
 * operator panelida raqamli karta bo'lib chiqadi. Ijro muddati va maxfiylik toifa darajasida
 * belgilanadi va uning barcha mavzulariga tarqatiladi (murojaat mavzu muddati bilan yaratiladi).
 * O'chirish yo'q: mavzu nofaol qilinadi va eski murojaatlarda saqlanib qoladi.
 */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const [categories, counts] = await Promise.all([
      this.prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
      this.prisma.ticket.groupBy({ by: ['categoryId'], where: { categoryId: { not: null } }, _count: { _all: true } }),
    ]);
    const ticketCount = new Map(counts.map((row) => [row.categoryId, row._count._all]));
    return categories.map((category) => ({ ...category, ticketCount: ticketCount.get(category.id) ?? 0 }));
  }

  async create(dto: CreateCategoryDto, actor: AuthUser) {
    const parent = dto.parentId ? await this.prisma.category.findUnique({ where: { id: dto.parentId } }) : null;
    if (dto.parentId && !parent) throw new BadRequestException('Toifa topilmadi');
    if (parent?.parentId) throw new BadRequestException("Mavzu faqat toifaga qo'shiladi (ikki darajali ro'yxat)");

    const category = parent
      ? await this.createTopic(parent, dto)
      : await this.prisma.category.create({
          data: {
            code: await this.freeCode(`cat.${slugify(dto.nameUz)}`),
            nameUz: dto.nameUz.trim(),
            slaDays: dto.slaDays ?? DEFAULT_SLA_DAYS,
            isConfidential: dto.isConfidential ?? false,
            sortOrder: ((await this.prisma.category.aggregate({ where: { parentId: null }, _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1,
          },
        });

    await this.audit.log({
      actorId: actor.id,
      action: 'category.create',
      entityType: 'Category',
      entityId: category.id,
      details: { nameUz: category.nameUz, parent: parent?.nameUz ?? null, number: parent ? category.sortOrder : null },
    });
    return { ...category, ticketCount: 0 };
  }

  async update(id: number, dto: UpdateCategoryDto, actor: AuthUser) {
    const before = await this.prisma.category.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Toifa topilmadi');
    const isTopic = before.parentId !== null;
    if (isTopic && (dto.slaDays !== undefined || dto.isConfidential !== undefined)) {
      throw new BadRequestException("Ijro muddati va maxfiylik toifa darajasida o'zgartiriladi");
    }
    if (!isTopic && dto.ticketTypes !== undefined) {
      throw new BadRequestException('Murojaat turlari mavzu uchun belgilanadi');
    }

    const data: Prisma.CategoryUpdateInput = {
      nameUz: dto.nameUz?.trim(),
      slaDays: dto.slaDays,
      isConfidential: dto.isConfidential,
      isActive: dto.isActive,
      ticketTypes: dto.ticketTypes,
    };
    const category = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.category.update({ where: { id }, data });
      // Toifa muddati va maxfiyligi uning mavzulariga ham o'tadi (murojaat mavzu qiymatlari bilan yaratiladi)
      if (!isTopic && (dto.slaDays !== undefined || dto.isConfidential !== undefined)) {
        await tx.category.updateMany({ where: { parentId: id }, data: { slaDays: dto.slaDays, isConfidential: dto.isConfidential } });
      }
      return updated;
    });

    const changes = diffFields(before, { ...dto, nameUz: dto.nameUz?.trim() }, ['nameUz', 'slaDays', 'isConfidential', 'isActive', 'ticketTypes']);
    if (Object.keys(changes).length > 0) {
      await this.audit.log({
        actorId: actor.id,
        action: 'category.update',
        entityType: 'Category',
        entityId: id,
        details: { nameUz: before.nameUz, topic: isTopic, changes } as unknown as Prisma.InputJsonValue,
      });
    }
    return category;
  }

  /** Mavzu raqami (sortOrder) barcha mavzular bo'yicha davom etadi: operator kartasida shu raqam ko'rinadi. */
  private async createTopic(parent: Category, dto: CreateCategoryDto) {
    const last = await this.prisma.category.aggregate({ where: { parentId: { not: null } }, _max: { sortOrder: true } });
    const number = (last._max.sortOrder ?? 0) + 1;
    return this.prisma.category.create({
      data: {
        code: await this.freeCode(`topic.${String(number).padStart(2, '0')}`),
        parentId: parent.id,
        nameUz: dto.nameUz.trim(),
        slaDays: parent.slaDays,
        isConfidential: parent.isConfidential,
        ticketTypes: dto.ticketTypes ?? [],
        sortOrder: number,
      },
    });
  }

  private async freeCode(base: string): Promise<string> {
    const taken = new Set(
      (await this.prisma.category.findMany({ where: { code: { startsWith: base } }, select: { code: true } })).map((c) => c.code),
    );
    let code = base;
    for (let n = 2; taken.has(code); n++) code = `${base}-${n}`;
    return code;
  }
}
