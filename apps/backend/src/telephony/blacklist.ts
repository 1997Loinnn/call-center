import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, Injectable, NotFoundException, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators';
import { requestMeta } from '../common/http';
import { Permission } from '../common/permissions';
import { maskPhone, normalizePhone } from '../common/phone';
import { PrismaService } from '../prisma/prisma.service';

export class BlacklistDto {
  @IsString()
  @Matches(/^[+\d\s()-]{5,20}$/, { message: "Telefon raqami noto'g'ri" })
  phone: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason: string;

  /** Muddatli blok; berilmasa — doimiy */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date;
}

/** Qora ro'yxat (F-TEL-09): bezori va spam raqamlar. PBX'ga "Navbatlar va IVR → PBX'ga yuklash" bilan o'tadi. */
@Injectable()
export class BlacklistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.blacklistedNumber.findMany({
      include: { createdBy: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Amaldagi (muddati o'tmagan) raqamlar — PBX konfiguratsiyasi uchun */
  async activeNumbers(now = new Date()): Promise<string[]> {
    const rows = await this.prisma.blacklistedNumber.findMany({ where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { phone: true } });
    return rows.map((r) => r.phone).sort();
  }

  async isBlocked(phone: string): Promise<boolean> {
    const row = await this.prisma.blacklistedNumber.findUnique({ where: { phone: normalizePhone(phone) } });
    return !!row && (!row.expiresAt || row.expiresAt > new Date());
  }

  async add(user: AuthUser, dto: BlacklistDto, meta: ReturnType<typeof requestMeta>) {
    const phone = normalizePhone(dto.phone);
    if (phone === '1097' || phone.length < 5) throw new BadRequestException("Bu raqamni bloklab bo'lmaydi");
    if (dto.expiresAt && dto.expiresAt <= new Date()) throw new BadRequestException("Muddat kelajakdagi sana bo'lishi kerak");
    const existing = await this.prisma.blacklistedNumber.findUnique({ where: { phone } });
    if (existing && (!existing.expiresAt || existing.expiresAt > new Date())) throw new ConflictException("Raqam allaqachon qora ro'yxatda");
    const data = { phone, reason: dto.reason.trim(), expiresAt: dto.expiresAt ?? null, createdById: user.id, createdAt: new Date() };
    const row = existing
      ? await this.prisma.blacklistedNumber.update({ where: { phone }, data, include: { createdBy: { select: { id: true, fullName: true } } } })
      : await this.prisma.blacklistedNumber.create({ data, include: { createdBy: { select: { id: true, fullName: true } } } });
    await this.audit.log({ actorId: user.id, action: 'blacklist.add', entityType: 'BlacklistedNumber', entityId: row.id, details: { phone: maskPhone(phone), reason: row.reason }, ...meta });
    return row;
  }

  async remove(user: AuthUser, id: number, meta: ReturnType<typeof requestMeta>): Promise<void> {
    const row = await this.prisma.blacklistedNumber.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Yozuv topilmadi');
    await this.prisma.blacklistedNumber.delete({ where: { id } });
    await this.audit.log({ actorId: user.id, action: 'blacklist.remove', entityType: 'BlacklistedNumber', entityId: id, details: { phone: maskPhone(row.phone), reason: row.reason }, ...meta });
  }
}

@ApiTags('telephony')
@Controller('telephony/blacklist')
export class BlacklistController {
  constructor(private readonly blacklist: BlacklistService) {}

  @Get()
  @RequireAnyPermission(Permission.BlacklistManage, Permission.MonitoringView, Permission.SettingsManage)
  list() {
    return this.blacklist.list();
  }

  @Post()
  @RequirePermissions(Permission.BlacklistManage)
  add(@CurrentUser() user: AuthUser, @Body() dto: BlacklistDto, @Req() req: Request) {
    return this.blacklist.add(user, dto, requestMeta(req));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(Permission.BlacklistManage)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.blacklist.remove(user, id, requestMeta(req));
  }
}
