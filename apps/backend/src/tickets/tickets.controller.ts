import { Body, Controller, Get, Header, Param, ParseIntPipe, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { requestMeta } from '../common/http';
import { Permission } from '../common/permissions';
import {
  AnswerTicketDto,
  AssignTicketDto,
  CommentDto,
  CreateTicketDto,
  RouteTicketDto,
  RoutingSuggestionQueryDto,
  TicketsQueryDto,
} from './tickets.dto';
import { TicketsService } from './tickets.service';

@ApiTags('tickets')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  @RequirePermissions(Permission.TicketsRead)
  list(@CurrentUser() user: AuthUser, @Query() query: TicketsQueryDto) {
    return this.tickets.list(user, query);
  }

  /** Holat tablari uchun sanoq (":id" dan oldin turishi shart) */
  @Get('counts')
  @RequirePermissions(Permission.TicketsRead)
  counts(@CurrentUser() user: AuthUser, @Query() query: TicketsQueryDto) {
    return this.tickets.counts(user, query);
  }

  @Get('export')
  @RequirePermissions(Permission.TicketsRead)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="murojaatlar.csv"')
  exportCsv(@CurrentUser() user: AuthUser, @Query() query: TicketsQueryDto, @Req() req: Request) {
    return this.tickets.exportCsv(user, query, requestMeta(req));
  }

  @Get('routing-suggestion')
  @RequirePermissions(Permission.TicketsCreate)
  routingSuggestion(@Query() query: RoutingSuggestionQueryDto) {
    return this.tickets.suggestRoute(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.TicketsRead)
  get(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.tickets.get(user, id, requestMeta(req));
  }

  @Post()
  @RequirePermissions(Permission.TicketsCreate)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto, @Req() req: Request) {
    return this.tickets.create(user, dto, requestMeta(req));
  }

  @Post(':id/route')
  @RequirePermissions(Permission.TicketsRoute)
  route(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: RouteTicketDto) {
    return this.tickets.route(user, id, dto);
  }

  @Post(':id/assign')
  @RequirePermissions(Permission.TicketsAssign)
  assign(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: AssignTicketDto) {
    return this.tickets.assign(user, id, dto);
  }

  @Post(':id/return')
  @RequirePermissions(Permission.TicketsAssign)
  returnTicket(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: CommentDto) {
    return this.tickets.returnTicket(user, id, dto.comment);
  }

  @Post(':id/answer')
  @RequirePermissions(Permission.TicketsAnswer)
  answer(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: AnswerTicketDto) {
    return this.tickets.answer(user, id, dto);
  }

  @Post(':id/approve')
  @RequirePermissions(Permission.TicketsApprove)
  approve(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.tickets.approve(user, id);
  }

  @Post(':id/reject')
  @RequirePermissions(Permission.TicketsApprove)
  reject(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: CommentDto) {
    return this.tickets.reject(user, id, dto.comment);
  }

  @Post(':id/reopen')
  @RequirePermissions(Permission.TicketsReopen)
  reopen(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: CommentDto) {
    return this.tickets.reopen(user, id, dto.comment);
  }

  @Post(':id/comments')
  @RequirePermissions(Permission.TicketsRead)
  comment(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: CommentDto) {
    return this.tickets.addComment(user, id, dto.comment);
  }
}
