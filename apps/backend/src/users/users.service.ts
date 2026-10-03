import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { Page, pageArgs } from '../common/http';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto, UsersQueryDto } from './users.dto';

const BCRYPT_ROUNDS = 12;

// passwordHash va twoFactorSecret hech qachon API orqali qaytmaydi
const USER_SELECT = {
  id: true,
  username: true,
  fullName: true,
  phone: true,
  email: true,
  sipExtension: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  orgUnit: { select: { id: true, name: true } },
  roles: { select: { role: { select: { code: true, name: true } } } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

const toDto = ({ roles, ...user }: UserRow) => ({ ...user, roles: roles.map((r) => r.role) });

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: UsersQueryDto): Promise<Page<ReturnType<typeof toDto>>> {
    const where: Prisma.UserWhereInput = {
      orgUnitId: query.orgUnitId,
      OR: query.search
        ? [
            { username: { contains: query.search, mode: 'insensitive' } },
            { fullName: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, select: USER_SELECT, orderBy: { fullName: 'asc' }, ...pageArgs(query) }),
      this.prisma.user.count({ where }),
    ]);
    return { items: rows.map(toDto), total, page: query.page, pageSize: query.pageSize };
  }

  /** Murojaatni taqsimlash uchun: bo'linma va uning quyi bo'linmalaridagi faol xodimlar. */
  async assignable(orgUnitId: number) {
    const unit = await this.prisma.orgUnit.findUnique({ where: { id: orgUnitId } });
    if (!unit) throw new NotFoundException("Bo'linma topilmadi");
    return this.prisma.user.findMany({
      where: { isActive: true, orgUnit: { path: { startsWith: unit.path } } },
      select: { id: true, fullName: true, orgUnit: { select: { id: true, name: true } } },
      orderBy: { fullName: 'asc' },
    });
  }

  async create(dto: CreateUserDto, actor: AuthUser) {
    if (await this.prisma.user.findUnique({ where: { username: dto.username } })) {
      throw new ConflictException(`"${dto.username}" login band`);
    }
    const roleIds = await this.resolveRoles(dto.roleCodes);
    const { password, roleCodes, ...data } = dto;
    const user = await this.prisma.user.create({
      data: {
        ...data,
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
        roles: { create: roleIds.map((roleId) => ({ roleId })) },
      },
      select: USER_SELECT,
    });
    await this.audit.log({ actorId: actor.id, action: 'user.create', entityType: 'User', entityId: user.id, details: { username: dto.username, roleCodes } });
    return toDto(user);
  }

  async update(id: number, dto: UpdateUserDto, actor: AuthUser) {
    if (!(await this.prisma.user.findUnique({ where: { id } }))) throw new NotFoundException('Foydalanuvchi topilmadi');
    const { roleCodes, ...data } = dto;
    const roleIds = roleCodes ? await this.resolveRoles(roleCodes) : undefined;

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...data,
        roles: roleIds ? { deleteMany: {}, create: roleIds.map((roleId) => ({ roleId })) } : undefined,
      },
      select: USER_SELECT,
    });
    await this.audit.log({ actorId: actor.id, action: 'user.update', entityType: 'User', entityId: id, details: { ...dto } });
    return toDto(user);
  }

  async resetPassword(id: number, password: string, actor: AuthUser): Promise<void> {
    if (!(await this.prisma.user.findUnique({ where: { id } }))) throw new NotFoundException('Foydalanuvchi topilmadi');
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS), failedLogins: 0, lockedUntil: null },
    });
    await this.audit.log({ actorId: actor.id, action: 'user.reset_password', entityType: 'User', entityId: id });
  }

  private async resolveRoles(codes: string[]): Promise<number[]> {
    const roles = await this.prisma.role.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
    const unknown = codes.filter((code) => !roles.some((role) => role.code === code));
    if (unknown.length > 0) throw new BadRequestException(`Noma'lum rollar: ${unknown.join(', ')}`);
    return roles.map((role) => role.id);
  }
}
