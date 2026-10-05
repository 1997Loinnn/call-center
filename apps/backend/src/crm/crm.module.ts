import { Body, Controller, Delete, Get, HttpCode, Module, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators';
import { Permission } from '../common/permissions';
import { SettingsService } from '../settings/settings.service';
import { CategoriesService } from './categories.service';
import { AutomationDto, CreateCategoryDto, ExportTemplateDto, RoutingMatchQueryDto, RoutingRuleDto, UpdateCategoryDto } from './crm.dto';
import { ExportTemplatesService } from './export-templates.service';
import { RoutingRulesService } from './routing-rules.service';

/** CRM sozlamalari → Toifalar va mavzular. */
@ApiTags('crm')
@Controller('crm/categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @RequirePermissions(Permission.SettingsManage)
  list() {
    return this.categories.list();
  }

  @Post()
  @RequirePermissions(Permission.SettingsManage)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCategoryDto) {
    return this.categories.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(Permission.SettingsManage)
  update(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto) {
    return this.categories.update(id, dto, user);
  }
}

/** CRM sozlamalari → Yo'naltirish qoidalari va avtomatik amallar. */
@ApiTags('crm')
@Controller('crm')
export class RoutingController {
  constructor(
    private readonly rules: RoutingRulesService,
    private readonly settings: SettingsService,
  ) {}

  @Get('routing-rules')
  @RequirePermissions(Permission.OrgManage)
  list() {
    return this.rules.list();
  }

  /** ":id" dan oldin: berilgan toifa va hudud uchun ishlaydigan qoida */
  @Get('routing-rules/match')
  @RequirePermissions(Permission.OrgManage)
  match(@Query() query: RoutingMatchQueryDto) {
    return this.rules.match(query);
  }

  @Post('routing-rules')
  @RequirePermissions(Permission.OrgManage)
  create(@CurrentUser() user: AuthUser, @Body() dto: RoutingRuleDto) {
    return this.rules.create(dto, user);
  }

  @Put('routing-rules/:id')
  @RequirePermissions(Permission.OrgManage)
  replace(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: RoutingRuleDto) {
    return this.rules.replace(id, dto, user);
  }

  @Delete('routing-rules/:id')
  @HttpCode(204)
  @RequirePermissions(Permission.OrgManage)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.rules.remove(id, user);
  }

  @Get('automation')
  @RequirePermissions(Permission.SettingsManage)
  automation() {
    return this.settings.get('automation');
  }

  @Put('automation')
  @RequirePermissions(Permission.SettingsManage)
  saveAutomation(@CurrentUser() user: AuthUser, @Body() dto: AutomationDto) {
    return this.settings.set('automation', dto, user.id);
  }
}

/** CRM sozlamalari → Eksport shablonlari: hisobotchi ko'radi va yuklab oladi, administrator tahrirlaydi. */
@ApiTags('crm')
@Controller('crm/export-templates')
export class ExportTemplatesController {
  constructor(private readonly templates: ExportTemplatesService) {}

  @Get()
  @RequireAnyPermission(Permission.ReportsView, Permission.SettingsManage)
  list() {
    return this.templates.list();
  }

  @Post()
  @RequirePermissions(Permission.SettingsManage)
  create(@CurrentUser() user: AuthUser, @Body() dto: ExportTemplateDto) {
    return this.templates.create(dto, user);
  }

  @Put(':id')
  @RequirePermissions(Permission.SettingsManage)
  replace(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ExportTemplateDto) {
    return this.templates.replace(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(Permission.SettingsManage)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.templates.remove(id, user);
  }
}

@Module({
  controllers: [CategoriesController, RoutingController, ExportTemplatesController],
  providers: [CategoriesService, RoutingRulesService, ExportTemplatesService],
})
export class CrmModule {}
