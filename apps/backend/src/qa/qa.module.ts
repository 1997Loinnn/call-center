import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseIntPipe, Post, Put, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { callScopeWhere, hasPermission } from '../common/data-scope';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators';
import { requestMeta } from '../common/http';
import { Permission } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { QaChecklistItem, SettingsService } from '../settings/settings.service';

export class EvaluateDto {
  /** Har bir band uchun ball (varaqadagi tartibda) */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @IsInt({ each: true })
  @Min(0, { each: true })
  scores: number[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

class ChecklistItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  item: string;

  @IsInt()
  @Min(1)
  @Max(100)
  max: number;
}

export class ChecklistDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  items: ChecklistItemDto[];
}

/** Baholash natijasi 0–100: bandlar ballari yig'indisi varaqaning umumiy ballariga nisbatan. */
export function scoreOf(checklist: QaChecklistItem[], scores: number[]): { total: number; items: { item: string; max: number; score: number }[] } {
  if (scores.length !== checklist.length) throw new BadRequestException('Har bir band baholanishi kerak');
  const items = checklist.map((c, i) => {
    if (scores[i] > c.max) throw new BadRequestException(`«${c.item}»: ko'pi bilan ${c.max} ball`);
    return { item: c.item, max: c.max, score: scores[i] };
  });
  const max = items.reduce((s, c) => s + c.max, 0);
  const got = items.reduce((s, c) => s + c.score, 0);
  return { total: max > 0 ? Math.round((got / max) * 100) : 0, items };
}

const EVAL_SELECT = {
  id: true,
  score: true,
  checklist: true,
  comment: true,
  createdAt: true,
  evaluator: { select: { id: true, fullName: true } },
  agent: { select: { id: true, fullName: true } },
} satisfies Prisma.QaEvaluationSelect;

/**
 * Sifat nazorati (F-QA-02): supervisor yozuvni tinglab, baholash varaqasi bo'yicha baholaydi;
 * natija operator samaradorligi hisobotiga (Analitika → Operatorlar, "Baho") kiradi.
 */
@Injectable()
export class QaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  checklist() {
    return this.settings.get('qa_checklist');
  }

  async saveChecklist(user: AuthUser, dto: ChecklistDto) {
    const before = await this.settings.get('qa_checklist');
    const saved = await this.settings.set('qa_checklist', dto.items.map((i) => ({ item: i.item.trim(), max: i.max })), user.id);
    await this.audit.log({
      actorId: user.id,
      action: 'settings.update',
      entityType: 'Setting',
      entityId: 'qa_checklist',
      details: { name: 'Baholash varaqasi', changes: { items: { from: before.map((i) => `${i.item} (${i.max})`).join('; '), to: saved.map((i) => `${i.item} (${i.max})`).join('; ') } } },
    });
    return saved;
  }

  private async visibleCall(user: AuthUser, callId: number) {
    const call = await this.prisma.call.findFirst({ where: { AND: [{ id: callId }, callScopeWhere(user)] }, select: { id: true, pbxCallId: true, agentId: true, recording: { select: { deletedAt: true } } } });
    if (!call) throw new NotFoundException("Qo'ng'iroq topilmadi");
    return call;
  }

  async forCall(user: AuthUser, callId: number) {
    const call = await this.visibleCall(user, callId);
    // Operator faqat o'z suhbatining baholarini ko'radi
    if (!hasPermission(user, Permission.MonitoringView) && call.agentId !== user.id) throw new ForbiddenException();
    return this.prisma.qaEvaluation.findMany({ where: { callId }, select: EVAL_SELECT, orderBy: { createdAt: 'desc' } });
  }

  async evaluate(user: AuthUser, callId: number, dto: EvaluateDto, meta: ReturnType<typeof requestMeta>) {
    const call = await this.visibleCall(user, callId);
    if (!call.agentId) throw new BadRequestException("Bu qo'ng'iroqda operator yo'q (javobsiz yoki IVR da yakunlangan)");
    if (call.agentId === user.id) throw new ForbiddenException("O'z suhbatingizni baholab bo'lmaydi");
    const result = scoreOf(await this.settings.get('qa_checklist'), dto.scores);
    const row = await this.prisma.qaEvaluation.create({
      data: {
        callId,
        evaluatorId: user.id,
        agentId: call.agentId,
        score: result.total,
        checklist: result.items as unknown as Prisma.InputJsonValue,
        comment: dto.comment?.trim() || null,
      },
      select: EVAL_SELECT,
    });
    await this.audit.log({ actorId: user.id, action: 'qa.evaluate', entityType: 'Call', entityId: callId, details: { pbxCallId: call.pbxCallId, score: result.total, agent: row.agent.fullName }, ...meta });
    return row;
  }
}

@ApiTags('qa')
@Controller()
export class QaController {
  constructor(private readonly qa: QaService) {}

  @Get('qa/checklist')
  @RequireAnyPermission(Permission.MonitoringView, Permission.SettingsManage, Permission.CallsRead)
  checklist() {
    return this.qa.checklist();
  }

  @Put('qa/checklist')
  @RequirePermissions(Permission.SettingsManage)
  saveChecklist(@CurrentUser() user: AuthUser, @Body() dto: ChecklistDto) {
    return this.qa.saveChecklist(user, dto);
  }

  @Get('calls/:id/evaluations')
  @RequirePermissions(Permission.CallsRead)
  forCall(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.qa.forCall(user, id);
  }

  @Post('calls/:id/evaluations')
  @RequirePermissions(Permission.MonitoringView, Permission.RecordingsPlay)
  evaluate(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: EvaluateDto, @Req() req: Request) {
    return this.qa.evaluate(user, id, dto, requestMeta(req));
  }
}

@Module({
  controllers: [QaController],
  providers: [QaService],
})
export class QaModule {}
