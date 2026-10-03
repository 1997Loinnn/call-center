import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { buildOrgTree, childPath, OrgTreeNode } from './org-tree';
import { CreateOrgUnitDto, UpdateOrgUnitDto } from './org-units.dto';

@Injectable()
export class OrgUnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async tree(includeInactive = false): Promise<OrgTreeNode[]> {
    const units = await this.prisma.orgUnit.findMany({
      where: includeInactive ? undefined : { isActive: true },
      select: { id: true, parentId: true, type: true, code: true, name: true, path: true, isActive: true, regionId: true },
      orderBy: { path: 'asc' },
    });
    return buildOrgTree(units);
  }

  async get(id: number) {
    const unit = await this.prisma.orgUnit.findUnique({
      where: { id },
      include: { parent: { select: { id: true, name: true } }, region: true, district: true },
    });
    if (!unit) throw new NotFoundException("Bo'linma topilmadi");
    return unit;
  }

  async create(dto: CreateOrgUnitDto, actor: AuthUser) {
    const parent = await this.prisma.orgUnit.findUnique({ where: { id: dto.parentId } });
    if (!parent) throw new BadRequestException("Ota-bo'linma topilmadi");
    if (await this.prisma.orgUnit.findUnique({ where: { code: dto.code } })) {
      throw new ConflictException(`"${dto.code}" kodi band`);
    }

    const unit = await this.prisma.$transaction(async (tx) => {
      // path yangi id'ga bog'liq, shuning uchun avval yaratib, keyin to'ldiriladi
      const created = await tx.orgUnit.create({
        data: { ...dto, path: '', depth: parent.depth + 1 },
      });
      return tx.orgUnit.update({ where: { id: created.id }, data: { path: childPath(parent.path, created.id) } });
    });

    await this.audit.log({ actorId: actor.id, action: 'org.create', entityType: 'OrgUnit', entityId: unit.id, details: { code: unit.code } });
    return unit;
  }

  async update(id: number, dto: UpdateOrgUnitDto, actor: AuthUser) {
    await this.get(id);
    // Ota-bo'linmani almashtirish (ko'chirish) quyi bo'linmalarning path'ini qayta hisoblashni talab qiladi — alohida amal sifatida qo'shiladi
    const unit = await this.prisma.orgUnit.update({ where: { id }, data: dto });
    await this.audit.log({ actorId: actor.id, action: 'org.update', entityType: 'OrgUnit', entityId: id, details: { ...dto } });
    return unit;
  }
}
