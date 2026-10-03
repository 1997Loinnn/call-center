import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { widestScope } from '../common/data-scope';
import { RequestMeta } from '../common/http';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload, LOCK_MINUTES, MAX_FAILED_LOGINS } from './auth.constants';

const userWithRoles = Prisma.validator<Prisma.UserDefaultArgs>()({
  include: { orgUnit: true, roles: { include: { role: true } } },
});
type UserWithRoles = Prisma.UserGetPayload<typeof userWithRoles>;

export function toAuthUser(user: UserWithRoles): AuthUser {
  const roles = user.roles.map((userRole) => userRole.role);
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    orgUnitId: user.orgUnitId,
    orgUnitPath: user.orgUnit.path,
    orgUnitName: user.orgUnit.name,
    sipExtension: user.sipExtension,
    roles: roles.map((role) => role.code),
    permissions: [...new Set(roles.flatMap((role) => role.permissions))],
    scope: widestScope(roles.map((role) => role.scope)),
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  /** Har bir so'rovda foydalanuvchi bazadan o'qiladi: rol yoki faollik o'zgarsa, darhol kuchga kiradi. */
  async loadAuthUser(userId: number): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, ...userWithRoles });
    if (!user || !user.isActive) return null;
    return toAuthUser(user);
  }

  async login(username: string, password: string, meta: RequestMeta): Promise<{ token: string; user: AuthUser }> {
    const invalid = new UnauthorizedException("Login yoki parol noto'g'ri");
    const user = await this.prisma.user.findUnique({ where: { username }, ...userWithRoles });

    if (!user || !user.isActive) {
      await this.audit.log({ action: 'auth.login_failed', details: { username }, ...meta });
      throw invalid;
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.audit.log({ actorId: user.id, action: 'auth.login_locked', ...meta });
      throw new UnauthorizedException("Hisob vaqtincha bloklangan. Keyinroq urinib ko'ring.");
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      const failed = user.failedLogins + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins: lock ? 0 : failed,
          lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      await this.audit.log({ actorId: user.id, action: 'auth.login_failed', details: { locked: lock }, ...meta });
      throw invalid;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await this.audit.log({ actorId: user.id, action: 'auth.login', ...meta });

    const payload: JwtPayload = { sub: user.id, username: user.username };
    return { token: await this.jwt.signAsync(payload), user: toAuthUser(user) };
  }
}
