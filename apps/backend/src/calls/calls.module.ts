import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CallDirection, CallResult, Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser } from '../common/auth-user';
import { callScopeWhere } from '../common/data-scope';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PageQueryDto, pageArgs } from '../common/http';
import { Permission } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';

export class CallsQueryDto extends PageQueryDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  agentId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  number?: string;

  @IsOptional()
  @IsEnum(CallResult)
  result?: CallResult;

  @IsOptional()
  @IsEnum(CallDirection)
  direction?: CallDirection;
}

@Injectable()
export class CallsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, query: CallsQueryDto) {
    const where: Prisma.CallWhereInput = {
      AND: [
        callScopeWhere(user),
        {
          agentId: query.agentId,
          result: query.result,
          direction: query.direction,
          startedAt: query.from || query.to ? { gte: query.from, lte: query.to } : undefined,
          OR: query.number
            ? [{ callerNumber: { contains: query.number } }, { calledNumber: { contains: query.number } }]
            : undefined,
        },
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.call.findMany({
        where,
        include: {
          agent: { select: { id: true, fullName: true } },
          queue: { select: { id: true, name: true } },
          ticket: { select: { id: true, number: true } },
          recording: { select: { id: true, durationSeconds: true } },
        },
        orderBy: { startedAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.call.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}

@ApiTags('calls')
@Controller('calls')
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Get()
  @RequirePermissions(Permission.CallsRead)
  list(@CurrentUser() user: AuthUser, @Query() query: CallsQueryDto) {
    return this.calls.list(user, query);
  }
}

@Module({
  controllers: [CallsController],
  providers: [CallsService],
})
export class CallsModule {}
