import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, HttpCode, Injectable, NotFoundException, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsInt } from 'class-validator';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { hasPermission, ticketScopeWhere } from '../common/data-scope';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { RequestMeta, requestMeta } from '../common/http';
import { Permission } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

export class AddParticipantDto {
  @IsInt()
  orgUnitId: number;
}

/**
 * Ishtirokchi bo'linmalar (prototip: tafsilot paneli → "Mas'ullar → Ishtirokchilar"): asosiy mas'ul bo'linmadan
 * tashqari murojaat ustida ishlaydigan bo'linmalar. Ular murojaatni ko'radi, izoh va vazifa qo'shadi; javobni esa
 * asosiy mas'ul bo'linma tayyorlaydi va tasdiqlaydi.
 */
@Injectable()
export class TicketParticipantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async add(user: AuthUser, ticketId: number, orgUnitId: number, meta: RequestMeta) {
    this.assertCanManage(user);
    const ticket = await this.visibleTicket(user, ticketId);
    const unit = await this.prisma.orgUnit.findFirst({ where: { id: orgUnitId, isActive: true }, select: { id: true, name: true } });
    if (!unit) throw new BadRequestException("Bo'linma topilmadi yoki faol emas");
    if (ticket.assignedOrgUnitId === orgUnitId) throw new BadRequestException("Bu bo'linma murojaatning asosiy mas'uli");
    if (await this.prisma.ticketParticipant.findUnique({ where: { ticketId_orgUnitId: { ticketId, orgUnitId } } })) {
      throw new ConflictException("Bo'linma allaqachon ishtirokchi");
    }
    const participant = await this.prisma.ticketParticipant.create({
      data: { ticketId, orgUnitId, addedById: user.id },
      select: { createdAt: true, orgUnit: { select: { id: true, name: true } }, addedBy: { select: { id: true, fullName: true } } },
    });
    await this.audit.log({
      actorId: user.id,
      action: 'ticket.participant.add',
      entityType: 'Ticket',
      entityId: ticketId,
      details: { number: ticket.number, changes: { participant: { from: null, to: unit.name } } },
      ...meta,
    });
    // Ishtirokchi bo'linma rahbarlariga (murojaatni taqsimlovchilar) xabar
    const heads = await this.prisma.user.findMany({
      where: { orgUnitId, isActive: true, roles: { some: { role: { permissions: { has: Permission.TicketsAssign } } } } },
      select: { id: true },
    });
    const title = `Ishtirokchi sifatida qo'shildi: ${ticket.number}`;
    const link = `/tickets/${ticketId}`;
    if (heads.length > 0) {
      await this.prisma.notification.createMany({ data: heads.map((h) => ({ userId: h.id, type: 'ticket.participant', title, body: ticket.subject, link })) });
      for (const h of heads) this.realtime.emitToUser(h.id, 'notification', { type: 'ticket.participant', title, body: ticket.subject, link });
    }
    return participant;
  }

  async remove(user: AuthUser, ticketId: number, orgUnitId: number, meta: RequestMeta): Promise<void> {
    this.assertCanManage(user);
    const ticket = await this.visibleTicket(user, ticketId);
    const participant = await this.prisma.ticketParticipant.findUnique({
      where: { ticketId_orgUnitId: { ticketId, orgUnitId } },
      include: { orgUnit: { select: { name: true } } },
    });
    if (!participant) throw new NotFoundException('Ishtirokchi topilmadi');
    await this.prisma.ticketParticipant.delete({ where: { ticketId_orgUnitId: { ticketId, orgUnitId } } });
    await this.audit.log({
      actorId: user.id,
      action: 'ticket.participant.remove',
      entityType: 'Ticket',
      entityId: ticketId,
      details: { number: ticket.number, changes: { participant: { from: participant.orgUnit.name, to: null } } },
      ...meta,
    });
  }

  /** Ishtirokchini yo'naltiruvchi (operator, supervisor) yoki taqsimlovchi (bo'linma rahbari) qo'shadi. */
  private assertCanManage(user: AuthUser): void {
    if (!hasPermission(user, Permission.TicketsRoute) && !hasPermission(user, Permission.TicketsAssign)) {
      throw new ForbiddenException("Ishtirokchi qo'shish uchun yo'naltirish yoki taqsimlash huquqi kerak");
    }
  }

  private async visibleTicket(user: AuthUser, id: number) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { AND: [{ id }, ticketScopeWhere(user)] },
      select: { id: true, number: true, subject: true, assignedOrgUnitId: true },
    });
    if (!ticket) throw new NotFoundException('Murojaat topilmadi');
    return ticket;
  }
}

@ApiTags('tickets')
@Controller('tickets/:id/participants')
export class TicketParticipantsController {
  constructor(private readonly participants: TicketParticipantsService) {}

  @Post()
  @RequirePermissions(Permission.TicketsRead)
  add(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: AddParticipantDto, @Req() req: Request) {
    return this.participants.add(user, id, dto.orgUnitId, requestMeta(req));
  }

  @Delete(':orgUnitId')
  @HttpCode(204)
  @RequirePermissions(Permission.TicketsRead)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Param('orgUnitId', ParseIntPipe) orgUnitId: number, @Req() req: Request) {
    return this.participants.remove(user, id, orgUnitId, requestMeta(req));
  }
}
