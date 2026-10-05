import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ExportFormat, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { diffFields } from '../common/diff';
import { PrismaService } from '../prisma/prisma.service';
import { isReportSource, REPORT_SOURCES } from '../reports/report-sources';
import { slugify } from './categories.service';
import { ExportTemplateDto } from './crm.dto';

const AUDIT_FIELDS = ['name', 'format', 'source', 'columns', 'schedule', 'recipientRoles', 'isActive'] as const;

/** Eksport shablonlari (F-REP-05): qaysi manbadan, qaysi ustunlar, qaysi formatda va kimga. */
@Injectable()
export class ExportTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Shablonlar, manbalar katalogi va rollar nomi (qabul qiluvchilar ustuni va tahrirlash formasi uchun). */
  async list() {
    const [templates, roles] = await Promise.all([
      this.prisma.exportTemplate.findMany({ orderBy: [{ isActive: 'desc' }, { id: 'asc' }] }),
      this.prisma.role.findMany({ select: { code: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    return { templates, sources: REPORT_SOURCES, roles };
  }

  async create(dto: ExportTemplateDto, actor: AuthUser) {
    const data = await this.validated(dto);
    const base = `tpl.${slugify(dto.name)}`;
    const taken = new Set((await this.prisma.exportTemplate.findMany({ where: { code: { startsWith: base } }, select: { code: true } })).map((t) => t.code));
    let code = base;
    for (let n = 2; taken.has(code); n++) code = `${base}-${n}`;

    const template = await this.prisma.exportTemplate.create({ data: { ...data, code, createdById: actor.id } });
    await this.audit.log({
      actorId: actor.id,
      action: 'export_template.create',
      entityType: 'ExportTemplate',
      entityId: template.id,
      details: { name: template.name, format: template.format, source: template.source },
    });
    return template;
  }

  async replace(id: number, dto: ExportTemplateDto, actor: AuthUser) {
    const before = await this.prisma.exportTemplate.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Shablon topilmadi');
    const data = await this.validated(dto);
    const template = await this.prisma.exportTemplate.update({ where: { id }, data });
    await this.audit.log({
      actorId: actor.id,
      action: 'export_template.update',
      entityType: 'ExportTemplate',
      entityId: id,
      details: { name: before.name, changes: diffFields(before, data, AUDIT_FIELDS) } as unknown as Prisma.InputJsonValue,
    });
    return template;
  }

  async remove(id: number, actor: AuthUser): Promise<void> {
    const template = await this.prisma.exportTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Shablon topilmadi');
    await this.prisma.exportTemplate.delete({ where: { id } });
    await this.audit.log({ actorId: actor.id, action: 'export_template.delete', entityType: 'ExportTemplate', entityId: id, details: { name: template.name } });
  }

  private async validated(dto: ExportTemplateDto) {
    if (!isReportSource(dto.source)) throw new BadRequestException("Noma'lum manba");
    const source = REPORT_SOURCES[dto.source];
    if (!(source.formats as ExportFormat[]).includes(dto.format)) {
      throw new BadRequestException(`"${source.label}" manbasi ${dto.format} formatida chiqmaydi: ${source.formats.join(', ')}`);
    }
    const unknown = dto.columns.filter((column) => !(source.columns as string[]).includes(column));
    if (unknown.length > 0) throw new BadRequestException(`Manbada bunday ustunlar yo'q: ${unknown.join(', ')}`);
    const roles = dto.recipientRoles ?? [];
    if (roles.length > 0) {
      const existing = await this.prisma.role.count({ where: { code: { in: roles } } });
      if (existing !== new Set(roles).size) throw new ConflictException("Qabul qiluvchi rollardan biri topilmadi");
    }
    return {
      name: dto.name.trim(),
      format: dto.format,
      source: dto.source,
      columns: [...new Set(dto.columns)],
      schedule: dto.schedule || null,
      recipientRoles: [...new Set(roles)],
      isActive: dto.isActive ?? true,
    };
  }
}
