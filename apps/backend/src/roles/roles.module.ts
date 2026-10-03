import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DataScope, Prisma } from '@prisma/client';
import { ArrayUnique, IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { Permission } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { diffPermissions, losesUserManagement, normalizePermissions, ROLE_CODE_PATTERN, unknownPermissions } from './role-rules';

export class CreateRoleDto {
  @Matches(ROLE_CODE_PATTERN, { message: 'Kod: lotin bosh harflari, raqam va "_" (3–64 belgi), masalan SHIFT_LEAD' })
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsEnum(DataScope)
  scope: DataScope;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions: string[];
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(DataScope)
  scope?: DataScope;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions?: string[];
}

const ROLE_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  scope: true,
  permissions: true,
  isSystem: true,
  _count: { select: { users: true } },
} satisfies Prisma.RoleSelect;

const toDto = ({ _count, ...role }: Prisma.RoleGetPayload<{ select: typeof ROLE_SELECT }>) => ({ ...role, userCount: _count.users });

/** Rollar va huquqlar (TZ 4-bo'lim): ko'rish, tahrirlash, qo'shimcha rol yaratish. */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const roles = await this.prisma.role.findMany({ select: ROLE_SELECT, orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] });
    return roles.map(toDto);
  }

  async create(dto: CreateRoleDto, actor: AuthUser) {
    this.assertKnown(dto.permissions);
    if (await this.prisma.role.findUnique({ where: { code: dto.code } })) throw new ConflictException(`"${dto.code}" kodli rol bor`);
    const role = await this.prisma.role.create({
      data: { ...dto, permissions: normalizePermissions(dto.permissions), isSystem: false },
      select: ROLE_SELECT,
    });
    await this.audit.log({ actorId: actor.id, action: 'role.create', entityType: 'Role', entityId: role.id, details: { code: role.code, scope: role.scope, permissions: role.permissions } });
    return toDto(role);
  }

  async update(id: number, dto: UpdateRoleDto, actor: AuthUser) {
    const before = await this.prisma.role.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Rol topilmadi');
    // Tekshiruv normalizatsiyadan OLDIN: normalizePermissions noma'lum kodni jimgina tashlab yuboradi
    if (dto.permissions) this.assertKnown(dto.permissions);
    const permissions = dto.permissions ? normalizePermissions(dto.permissions) : undefined;
    if (permissions && losesUserManagement(before.permissions, permissions)) await this.assertUserManagementRemains(id);

    const role = await this.prisma.role.update({
      where: { id },
      data: { name: dto.name, description: dto.description, scope: dto.scope, permissions },
      select: ROLE_SELECT,
    });
    await this.audit.log({
      actorId: actor.id,
      action: 'role.update',
      entityType: 'Role',
      entityId: id,
      details: {
        code: before.code,
        ...(dto.name && dto.name !== before.name ? { name: { from: before.name, to: dto.name } } : {}),
        ...(dto.scope && dto.scope !== before.scope ? { scope: { from: before.scope, to: dto.scope } } : {}),
        ...(permissions ? diffPermissions(before.permissions, permissions) : {}),
      },
    });
    return toDto(role);
  }

  async remove(id: number, actor: AuthUser): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { id }, select: ROLE_SELECT });
    if (!role) throw new NotFoundException('Rol topilmadi');
    if (role.isSystem) throw new BadRequestException("Tizim rolini o'chirib bo'lmaydi");
    if (role._count.users > 0) throw new BadRequestException(`Rol ${role._count.users} ta foydalanuvchiga biriktirilgan — avval ularni boshqa rolga o'tkazing`);
    await this.prisma.role.delete({ where: { id } });
    await this.audit.log({ actorId: actor.id, action: 'role.delete', entityType: 'Role', entityId: id, details: { code: role.code } });
  }

  private assertKnown(permissions: string[]): void {
    const unknown = unknownPermissions(permissions);
    if (unknown.length > 0) throw new BadRequestException(`Noma'lum ruxsatlar: ${unknown.join(', ')}`);
  }

  /** Rol "Foydalanuvchilar" huquqini yo'qotsa ham, boshqa rol orqali kamida bitta faol boshqaruvchi qolishi shart. */
  private async assertUserManagementRemains(roleId: number): Promise<void> {
    const managers = await this.prisma.user.count({
      where: {
        isActive: true,
        roles: { some: { role: { id: { not: roleId }, permissions: { has: Permission.UsersManage } } } },
      },
    });
    if (managers === 0) {
      throw new BadRequestException("Kamida bitta faol foydalanuvchida «Foydalanuvchilar» huquqi qolishi kerak — aks holda tizimni boshqarib bo'lmaydi");
    }
  }
}

@ApiTags('roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermissions(Permission.UsersManage)
  list() {
    return this.roles.list();
  }

  @Post()
  @RequirePermissions(Permission.UsersManage)
  create(@Body() dto: CreateRoleDto, @CurrentUser() actor: AuthUser) {
    return this.roles.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions(Permission.UsersManage)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto, @CurrentUser() actor: AuthUser) {
    return this.roles.update(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(Permission.UsersManage)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() actor: AuthUser) {
    return this.roles.remove(id, actor);
  }
}

@Module({
  controllers: [RolesController],
  providers: [RolesService],
})
export class RolesModule {}
