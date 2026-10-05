import { BadRequestException, ConflictException, ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { DataCipher } from '../common/crypto';
import { widestScope } from '../common/data-scope';
import { RequestMeta } from '../common/http';
import { maskPhone } from '../common/phone';
import { generateSecret, otpauthUri, verifyTotp } from '../common/totp';
import { isUzMobile, SmsService } from '../integrations/sms';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { JwtPayload, LOCK_MINUTES, MAX_FAILED_LOGINS } from './auth.constants';

const userWithRoles = Prisma.validator<Prisma.UserDefaultArgs>()({
  include: { orgUnit: true, roles: { include: { role: true } } },
});
type UserWithRoles = Prisma.UserGetPayload<typeof userWithRoles>;

/** SMS kodi: 5 daqiqa amal qiladi, 5 urinish, qayta so'rash 60 soniyadan keyin. */
const CODE_TTL_MS = 5 * 60_000;
const CODE_ATTEMPTS = 5;
const CODE_RESEND_MS = 60_000;
/** Parol tasdiqlangach 2FA kodini kiritish uchun vaqt */
const CHALLENGE_TTL_SECONDS = 5 * 60;

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
    twoFactor: !!user.twoFactorEnabledAt,
  };
}

export type LoginOutcome =
  | { status: 'ok'; token: string; user: AuthUser }
  /** Ikkinchi bosqich: setup — ilova hali ulanmagan (rol talab qiladi), QR ko'rsatiladi */
  | { status: 'mfa'; challenge: string; setup: boolean };

interface ChallengePayload {
  sub: number;
  purpose: 'mfa';
  method: 'password' | 'sms';
}

/**
 * Kirish (TZ 4, 9-bo'limlar): login + parol yoki SMS kodi; rahbariyat, supervisor va administratorlar uchun
 * ikkinchi bosqich — TOTP ilovasi (Google/Microsoft Authenticator). Har bir urinish audit jurnaliga yoziladi.
 */
@Injectable()
export class AuthService {
  private readonly challengeSecret: string;
  private readonly codeSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly sms: SmsService,
    private readonly cipher: DataCipher,
    config: ConfigService,
  ) {
    const secret = config.getOrThrow<string>('JWT_SECRET');
    // Alohida kalit: ikkinchi bosqich tokeni kirish tokeni sifatida ishlatib bo'lmaydi
    this.challengeSecret = `${secret}:mfa-challenge`;
    this.codeSecret = `${secret}:login-code`;
  }

  /** Har bir so'rovda foydalanuvchi bazadan o'qiladi: rol yoki faollik o'zgarsa, darhol kuchga kiradi. */
  async loadAuthUser(userId: number): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, ...userWithRoles });
    if (!user || !user.isActive) return null;
    return toAuthUser(user);
  }

  // ───────────── Birinchi bosqich ─────────────

  async login(username: string, password: string, meta: RequestMeta): Promise<LoginOutcome> {
    const user = await this.activeUser(username, meta);
    if (!(await bcrypt.compare(password, user.passwordHash))) await this.failed(user, meta, 'password');
    return this.afterFirstFactor(user, 'password', meta);
  }

  /** SMS kodi so'rovi. Javob har doim bir xil: login mavjudmi-yo'qligi undan bilinmaydi. */
  async requestLoginCode(username: string, meta: RequestMeta): Promise<{ sent: true }> {
    if (!this.sms.driver) throw new ServiceUnavailableException("SMS shlyuzi ulanmagan: login va parol bilan kiring");
    const user = await this.prisma.user.findUnique({ where: { username }, select: { id: true, isActive: true, phone: true, lockedUntil: true } });
    if (!user || !user.isActive || !user.phone || !isUzMobile(user.phone) || (user.lockedUntil && user.lockedUntil > new Date())) {
      await this.audit.log({ actorId: user?.id ?? null, action: 'auth.code_failed', details: { username, reason: 'no_phone_or_user' }, ...meta });
      return { sent: true };
    }
    const recent = await this.prisma.loginCode.findFirst({ where: { userId: user.id, createdAt: { gt: new Date(Date.now() - CODE_RESEND_MS) } } });
    if (recent) return { sent: true };
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.loginCode.create({ data: { userId: user.id, codeHash: this.hashCode(user.id, code), expiresAt: new Date(Date.now() + CODE_TTL_MS) } });
    await this.sms.send({ phone: user.phone, text: `1097 Call-markaz: tizimga kirish kodi ${code}. Kodni hech kimga aytmang.`, template: 'login_code' });
    await this.audit.log({ actorId: user.id, action: 'auth.code_sent', details: { phone: maskPhone(user.phone) }, ...meta });
    return { sent: true };
  }

  async verifyLoginCode(username: string, code: string, meta: RequestMeta): Promise<LoginOutcome> {
    const user = await this.activeUser(username, meta);
    const row = await this.prisma.loginCode.findFirst({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: CODE_ATTEMPTS } },
      orderBy: { createdAt: 'desc' },
    });
    const ok = !!row && this.sameHash(row.codeHash, this.hashCode(user.id, code.trim()));
    if (!ok) {
      if (row) await this.prisma.loginCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
      await this.failed(user, meta, 'sms');
    }
    await this.prisma.loginCode.update({ where: { id: row!.id }, data: { usedAt: new Date() } });
    return this.afterFirstFactor(user, 'sms', meta);
  }

  // ───────────── Ikkinchi bosqich (TOTP) ─────────────

  async verifyTwoFactor(challenge: string, code: string, meta: RequestMeta): Promise<LoginOutcome> {
    const { user, method } = await this.fromChallenge(challenge);
    if (!user.twoFactorEnabledAt || !user.twoFactorSecret) throw new BadRequestException('Ikki bosqichli himoya hali ulanmagan');
    const step = verifyTotp(this.cipher.decrypt(user.twoFactorSecret), code, user.twoFactorLastStep);
    if (step === null) await this.failed(user, meta, 'totp');
    await this.prisma.user.update({ where: { id: user.id }, data: { twoFactorLastStep: step } });
    return this.complete(user, method, meta, true);
  }

  /** Rol talab qilgan, lekin hali ulanmagan foydalanuvchi: kirish jarayonida yangi kalit va QR. */
  async setupWithChallenge(challenge: string): Promise<{ secret: string; uri: string }> {
    const { user } = await this.fromChallenge(challenge);
    if (user.twoFactorEnabledAt) throw new ConflictException('Ikki bosqichli himoya allaqachon ulangan');
    return this.newSecret(user.id, user.username);
  }

  async enableWithChallenge(challenge: string, code: string, meta: RequestMeta): Promise<LoginOutcome> {
    const { user, method } = await this.fromChallenge(challenge);
    if (user.twoFactorEnabledAt) throw new ConflictException('Ikki bosqichli himoya allaqachon ulangan');
    await this.enable(user, code, meta);
    return this.complete(user, method, meta, true);
  }

  // ───────────── O'z hisobim (kirgan foydalanuvchi) ─────────────

  async twoFactorStatus(auth: AuthUser): Promise<{ enabled: boolean; required: boolean }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.id }, ...userWithRoles });
    return { enabled: !!user.twoFactorEnabledAt, required: await this.roleRequires(user) };
  }

  async selfSetup(auth: AuthUser): Promise<{ secret: string; uri: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.id } });
    if (user.twoFactorEnabledAt) throw new ConflictException('Ikki bosqichli himoya allaqachon ulangan');
    return this.newSecret(user.id, user.username);
  }

  async selfEnable(auth: AuthUser, code: string, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.id }, ...userWithRoles });
    if (user.twoFactorEnabledAt) throw new ConflictException('Ikki bosqichli himoya allaqachon ulangan');
    await this.enable(user, code, meta);
  }

  async selfDisable(auth: AuthUser, code: string, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.id }, ...userWithRoles });
    if (!user.twoFactorEnabledAt || !user.twoFactorSecret) return;
    if (await this.roleRequires(user)) throw new ForbiddenException("Rolingiz uchun ikki bosqichli himoya majburiy: uni o'chirib bo'lmaydi");
    if (verifyTotp(this.cipher.decrypt(user.twoFactorSecret), code, user.twoFactorLastStep) === null) throw new BadRequestException("Kod noto'g'ri");
    await this.prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: null, twoFactorEnabledAt: null, twoFactorLastStep: null } });
    await this.audit.log({ actorId: user.id, action: 'auth.2fa_disabled', entityType: 'User', entityId: user.id, ...meta });
  }

  /** Administrator: telefon yo'qolsa — 2FA bekor qilinadi, keyingi kirishda qayta ulanadi. */
  async resetTwoFactor(actor: AuthUser, userId: number, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true } });
    if (!user) throw new BadRequestException('Foydalanuvchi topilmadi');
    await this.prisma.user.update({ where: { id: userId }, data: { twoFactorSecret: null, twoFactorEnabledAt: null, twoFactorLastStep: null } });
    await this.audit.log({ actorId: actor.id, action: 'user.reset_2fa', entityType: 'User', entityId: userId, details: { username: user.username }, ...meta });
  }

  // ───────────── Yordamchi ─────────────

  private async activeUser(username: string, meta: RequestMeta): Promise<UserWithRoles> {
    const user = await this.prisma.user.findUnique({ where: { username }, ...userWithRoles });
    if (!user || !user.isActive) {
      await this.audit.log({ action: 'auth.login_failed', details: { username }, ...meta });
      throw new UnauthorizedException("Login yoki parol noto'g'ri");
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.audit.log({ actorId: user.id, action: 'auth.login_locked', ...meta });
      throw new UnauthorizedException("Hisob vaqtincha bloklangan. Keyinroq urinib ko'ring.");
    }
    return user;
  }

  /** Noto'g'ri parol, SMS kodi yoki 2FA kodi: bitta hisoblagich (5 xato — vaqtincha bloklash). */
  private async failed(user: UserWithRoles, meta: RequestMeta, factor: 'password' | 'sms' | 'totp'): Promise<never> {
    const failed = user.failedLogins + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
    });
    await this.audit.log({ actorId: user.id, action: factor === 'totp' ? 'auth.2fa_failed' : 'auth.login_failed', details: { locked: lock, factor }, ...meta });
    throw new UnauthorizedException(factor === 'password' ? "Login yoki parol noto'g'ri" : "Kod noto'g'ri yoki muddati o'tgan");
  }

  private async roleRequires(user: UserWithRoles): Promise<boolean> {
    const security = await this.settings.get('security');
    return security.enforceTwoFactor && user.roles.some((r) => security.twoFactorRoles.includes(r.role.code));
  }

  private async afterFirstFactor(user: UserWithRoles, method: 'password' | 'sms', meta: RequestMeta): Promise<LoginOutcome> {
    if (user.twoFactorEnabledAt || (await this.roleRequires(user))) {
      const payload: ChallengePayload = { sub: user.id, purpose: 'mfa', method };
      const challenge = await this.jwt.signAsync(payload, { secret: this.challengeSecret, expiresIn: CHALLENGE_TTL_SECONDS });
      return { status: 'mfa', challenge, setup: !user.twoFactorEnabledAt };
    }
    return this.complete(user, method, meta, false);
  }

  private async complete(user: UserWithRoles, method: 'password' | 'sms', meta: RequestMeta, twoFactor: boolean): Promise<LoginOutcome> {
    const fresh = await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
      ...userWithRoles,
    });
    await this.audit.log({ actorId: user.id, action: 'auth.login', details: { method, twoFactor }, ...meta });
    const payload: JwtPayload = { sub: user.id, username: user.username };
    return { status: 'ok', token: await this.jwt.signAsync(payload), user: toAuthUser(fresh) };
  }

  private async fromChallenge(challenge: string): Promise<{ user: UserWithRoles; method: 'password' | 'sms' }> {
    let payload: ChallengePayload;
    try {
      payload = await this.jwt.verifyAsync<ChallengePayload>(challenge, { secret: this.challengeSecret });
    } catch {
      throw new UnauthorizedException("Kirish vaqti tugadi: login va parolni qayta kiriting");
    }
    if (payload.purpose !== 'mfa') throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, ...userWithRoles });
    if (!user || !user.isActive || (user.lockedUntil && user.lockedUntil > new Date())) throw new UnauthorizedException('Hisob faol emas yoki bloklangan');
    return { user, method: payload.method };
  }

  private async newSecret(userId: number, username: string): Promise<{ secret: string; uri: string }> {
    const secret = generateSecret();
    // Tasdiqlanmagan kalit: twoFactorEnabledAt bo'sh qoladi, kod tekshirilgach yoqiladi
    await this.prisma.user.update({ where: { id: userId }, data: { twoFactorSecret: this.cipher.encrypt(secret), twoFactorLastStep: null } });
    return { secret, uri: otpauthUri(secret, username) };
  }

  private async enable(user: { id: number; twoFactorSecret: string | null }, code: string, meta: RequestMeta): Promise<void> {
    if (!user.twoFactorSecret) throw new BadRequestException("Avval QR kodni skanerlang");
    const step = verifyTotp(this.cipher.decrypt(user.twoFactorSecret), code, null);
    if (step === null) throw new BadRequestException("Kod noto'g'ri: ilovadagi joriy 6 raqamli kodni kiriting");
    await this.prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabledAt: new Date(), twoFactorLastStep: step } });
    await this.audit.log({ actorId: user.id, action: 'auth.2fa_enabled', entityType: 'User', entityId: user.id, ...meta });
  }

  private hashCode(userId: number, code: string): string {
    return createHmac('sha256', this.codeSecret).update(`${userId}:${code}`).digest('hex');
  }

  private sameHash(a: string, b: string): boolean {
    return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }
}
