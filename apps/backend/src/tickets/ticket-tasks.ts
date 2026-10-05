import { Body, Controller, ForbiddenException, Get, Injectable, NotFoundException, BadRequestException, Param, ParseIntPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { hasPermission, ticketScopeWhere } from '../common/data-scope';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { RequestMeta, requestMeta } from '../common/http';
import { Permission } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;

  @IsOptional()
  @IsInt()
  assigneeId?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueAt?: Date;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title?: string;
}

const TASK_INCLUDE = {
  assignee: { select: { id: true, fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.TicketTaskInclude;

// Murojaat ustida ishlaydiganlar: yo'naltiruvchi (operator, supervisor), taqsimlovchi va ijrochi
const WORKER_PERMISSIONS = [Permission.TicketsRoute, Permission.TicketsAssign, Permission.TicketsAnswer];

/**
 * Murojaat bo'yicha ichki vazifalar ("Vazifalar" tabi): masalan, "arxivdan nusxa olish", "fuqaroga qayta qo'ng'iroq".
 * Ko'rish — murojaatni ko'ra oladigan har kim; qo'shish va bajarildi deb belgilash — murojaat ustida ishlaydiganlar.
 */
@Injectable()
export class TicketTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async list(user: AuthUser, ticketId: number) {
    await this.visibleTicket(user, ticketId);
    return this.prisma.ticketTask.findMany({ where: { ticketId }, include: TASK_INCLUDE, orderBy: [{ completedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }] });
  }

  /** Vazifa kimga berilishi mumkin: murojaat bo'linmasi (bo'lmasa — foydalanuvchi bo'linmasi) xodimlari. */
  async assignees(user: AuthUser, ticketId: number) {
    const ticket = await this.visibleTicket(user, ticketId);
    const path = ticket.assignedOrgUnit?.path ?? user.orgUnitPath;
    return this.prisma.user.findMany({
      where: { isActive: true, orgUnit: { path: { startsWith: path } } },
      select: { id: true, fullName: true, orgUnit: { select: { name: true } } },
      orderBy: { fullName: 'asc' },
      take: 300,
    });
  }

  async create(user: AuthUser, ticketId: number, dto: CreateTaskDto, meta: RequestMeta) {
    this.assertWorker(user);
    const ticket = await this.visibleTicket(user, ticketId);
    if (dto.assigneeId) {
      const path = ticket.assignedOrgUnit?.path ?? user.orgUnitPath;
      const ok = await this.prisma.user.count({ where: { id: dto.assigneeId, isActive: true, orgUnit: { path: { startsWith: path } } } });
      if (!ok) throw new BadRequestException("Vazifa murojaat bo'linmasi xodimiga beriladi");
    }
    const task = await this.prisma.ticketTask.create({
      data: { ticketId, title: dto.title.trim(), assigneeId: dto.assigneeId, dueAt: dto.dueAt, createdById: user.id },
      include: TASK_INCLUDE,
    });
    await this.audit.log({
      actorId: user.id,
      action: 'ticket.task.create',
      entityType: 'TicketTask',
      entityId: task.id,
      details: { number: ticket.number, title: task.title, assignee: task.assignee?.fullName ?? null },
      ...meta,
    });
    if (task.assigneeId && task.assigneeId !== user.id) {
      const link = `/tickets/${ticketId}`;
      const title = `Yangi vazifa: ${ticket.number}`;
      await this.prisma.notification.create({ data: { userId: task.assigneeId, type: 'ticket.task', title, body: task.title, link } });
      this.realtime.emitToUser(task.assigneeId, 'notification', { type: 'ticket.task', title, body: task.title, link });
    }
    return task;
  }

  async update(user: AuthUser, ticketId: number, taskId: number, dto: UpdateTaskDto, meta: RequestMeta) {
    const ticket = await this.visibleTicket(user, ticketId);
    const task = await this.prisma.ticketTask.findFirst({ where: { id: taskId, ticketId } });
    if (!task) throw new NotFoundException('Vazifa topilmadi');
    const own = task.assigneeId === user.id || task.createdById === user.id;
    if (!own && !hasPermission(user, Permission.TicketsAssign) && !hasPermission(user, Permission.TicketsRoute)) {
      throw new ForbiddenException("Vazifani ijrochi, uni qo'ygan xodim yoki rahbar o'zgartiradi");
    }
    const updated = await this.prisma.ticketTask.update({
      where: { id: taskId },
      data: {
        title: dto.title?.trim(),
        completedAt: dto.completed === undefined ? undefined : dto.completed ? (task.completedAt ?? new Date()) : null,
      },
      include: TASK_INCLUDE,
    });
    await this.audit.log({
      actorId: user.id,
      action: 'ticket.task.update',
      entityType: 'TicketTask',
      entityId: taskId,
      details: {
        number: ticket.number,
        title: updated.title,
        changes: {
          ...(dto.completed !== undefined && dto.completed !== !!task.completedAt ? { completed: { from: !!task.completedAt, to: dto.completed } } : {}),
          ...(dto.title && dto.title.trim() !== task.title ? { title: { from: task.title, to: dto.title.trim() } } : {}),
        },
      },
      ...meta,
    });
    return updated;
  }

  private assertWorker(user: AuthUser): void {
    if (!WORKER_PERMISSIONS.some((p) => hasPermission(user, p))) throw new ForbiddenException("Vazifa qo'shish huquqi yo'q");
  }

  private async visibleTicket(user: AuthUser, id: number) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { AND: [{ id }, ticketScopeWhere(user)] },
      select: { id: true, number: true, assignedOrgUnit: { select: { path: true } } },
    });
    if (!ticket) throw new NotFoundException('Murojaat topilmadi');
    return ticket;
  }
}

@ApiTags('tickets')
@Controller('tickets/:id/tasks')
export class TicketTasksController {
  constructor(private readonly tasks: TicketTasksService) {}

  @Get()
  @RequirePermissions(Permission.TicketsRead)
  list(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.tasks.list(user, id);
  }

  @Get('assignees')
  @RequirePermissions(Permission.TicketsRead)
  assignees(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.tasks.assignees(user, id);
  }

  @Post()
  @RequirePermissions(Permission.TicketsRead)
  create(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: CreateTaskDto, @Req() req: Request) {
    return this.tasks.create(user, id, dto, requestMeta(req));
  }

  @Patch(':taskId')
  @RequirePermissions(Permission.TicketsRead)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: UpdateTaskDto,
    @Req() req: Request,
  ) {
    return this.tasks.update(user, id, taskId, dto, requestMeta(req));
  }
}
