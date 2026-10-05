import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { hasPermission } from '../common/data-scope';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators';
import { diffFields } from '../common/diff';
import { Permission } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';

export class ArticleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  body: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  categoryId?: number | null;

  @IsBoolean()
  isPublished: boolean;
}

export class ArticlesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;
}

const SELECT = {
  id: true,
  title: true,
  body: true,
  isPublished: true,
  updatedAt: true,
  category: { select: { id: true, nameUz: true, parentId: true } },
  updatedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.KnowledgeArticleSelect;

/**
 * Bilimlar bazasi (F-OP-06): tez-tez beriladigan savollar, xizmatlar tartibi va kerakli hujjatlar.
 * Operator suhbat paytida qidiradi; supervisor va administrator tahrirlaydi (knowledge.manage).
 */
@Injectable()
export class KnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, query: ArticlesQueryDto) {
    const editor = hasPermission(user, Permission.KnowledgeManage);
    const search = query.search?.trim();
    const words = search ? search.split(/\s+/).filter((w) => w.length >= 2).slice(0, 6) : [];
    const where: Prisma.KnowledgeArticleWhereInput = {
      ...(editor ? {} : { isPublished: true }),
      // Toifa tanlansa — shu toifa va uning mavzulariga bog'langan maqolalar
      ...(query.categoryId ? { OR: [{ categoryId: query.categoryId }, { category: { parentId: query.categoryId } }] } : {}),
      AND: words.map((w) => ({ OR: [{ title: { contains: w, mode: 'insensitive' as const } }, { body: { contains: w, mode: 'insensitive' as const } }] })),
    };
    const rows = await this.prisma.knowledgeArticle.findMany({ where, select: SELECT, orderBy: { updatedAt: 'desc' }, take: 100 });
    if (!words.length) return rows;
    // Sarlavhada uchragan maqolalar yuqorida
    const score = (title: string) => words.filter((w) => title.toLowerCase().includes(w.toLowerCase())).length;
    return rows.sort((a, b) => score(b.title) - score(a.title));
  }

  async get(user: AuthUser, id: number) {
    const row = await this.prisma.knowledgeArticle.findUnique({ where: { id }, select: SELECT });
    if (!row || (!row.isPublished && !hasPermission(user, Permission.KnowledgeManage))) throw new NotFoundException('Maqola topilmadi');
    return row;
  }

  async create(user: AuthUser, dto: ArticleDto) {
    const row = await this.prisma.knowledgeArticle.create({
      data: { title: dto.title.trim(), body: dto.body.trim(), categoryId: dto.categoryId ?? null, isPublished: dto.isPublished, updatedById: user.id },
      select: SELECT,
    });
    await this.audit.log({ actorId: user.id, action: 'knowledge.create', entityType: 'KnowledgeArticle', entityId: row.id, details: { name: row.title } });
    return row;
  }

  async update(user: AuthUser, id: number, dto: ArticleDto) {
    const before = await this.prisma.knowledgeArticle.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Maqola topilmadi');
    const row = await this.prisma.knowledgeArticle.update({
      where: { id },
      data: { title: dto.title.trim(), body: dto.body.trim(), categoryId: dto.categoryId ?? null, isPublished: dto.isPublished, updatedById: user.id },
      select: SELECT,
    });
    const changes = diffFields(
      { title: before.title, categoryId: before.categoryId, isPublished: before.isPublished, body: before.body === row.body ? null : "o'zgardi" },
      { title: row.title, categoryId: row.category?.id ?? null, isPublished: row.isPublished, body: before.body === row.body ? null : 'yangi matn' },
      ['title', 'categoryId', 'isPublished', 'body'],
    );
    if (Object.keys(changes).length) {
      await this.audit.log({ actorId: user.id, action: 'knowledge.update', entityType: 'KnowledgeArticle', entityId: id, details: { name: row.title, changes } as unknown as Prisma.InputJsonValue });
    }
    return row;
  }

  async remove(user: AuthUser, id: number): Promise<void> {
    const row = await this.prisma.knowledgeArticle.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Maqola topilmadi');
    await this.prisma.knowledgeArticle.delete({ where: { id } });
    await this.audit.log({ actorId: user.id, action: 'knowledge.delete', entityType: 'KnowledgeArticle', entityId: id, details: { name: row.title } });
  }
}

@ApiTags('knowledge')
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get()
  @RequireAnyPermission(Permission.TicketsCreate, Permission.TicketsRead, Permission.KnowledgeManage)
  list(@CurrentUser() user: AuthUser, @Query() query: ArticlesQueryDto) {
    return this.knowledge.list(user, query);
  }

  @Get(':id')
  @RequireAnyPermission(Permission.TicketsCreate, Permission.TicketsRead, Permission.KnowledgeManage)
  get(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.knowledge.get(user, id);
  }

  @Post()
  @RequirePermissions(Permission.KnowledgeManage)
  create(@CurrentUser() user: AuthUser, @Body() dto: ArticleDto) {
    return this.knowledge.create(user, dto);
  }

  @Put(':id')
  @RequirePermissions(Permission.KnowledgeManage)
  update(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ArticleDto) {
    return this.knowledge.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(Permission.KnowledgeManage)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.knowledge.remove(user, id);
  }
}

@Module({
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
})
export class KnowledgeModule {}
