import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators';
import { Permission } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';

/** Ma'lumotnomalar: formalardagi tanlov ro'yxatlari uchun. */
@ApiTags('reference')
@Controller('reference')
export class ReferenceController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('categories')
  categories() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      select: { id: true, parentId: true, code: true, nameUz: true, nameRu: true, slaDays: true, isConfidential: true },
      orderBy: [{ sortOrder: 'asc' }, { nameUz: 'asc' }],
    });
  }

  @Get('regions')
  regions() {
    return this.prisma.region.findMany({
      select: {
        id: true,
        soato: true,
        nameUz: true,
        nameRu: true,
        districts: { select: { id: true, soato: true, nameUz: true }, orderBy: { nameUz: 'asc' } },
      },
      orderBy: { soato: 'asc' },
    });
  }

  @Get('queues')
  queues() {
    return this.prisma.queue.findMany({ where: { isActive: true }, orderBy: { pbxNumber: 'asc' } });
  }

  @Get('roles')
  @RequirePermissions(Permission.UsersManage)
  roles() {
    return this.prisma.role.findMany({
      select: { id: true, code: true, name: true, description: true, scope: true, permissions: true, isSystem: true },
      orderBy: { name: 'asc' },
    });
  }
}
