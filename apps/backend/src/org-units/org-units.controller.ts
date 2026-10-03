import { Body, Controller, Get, Param, ParseBoolPipe, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { Permission } from '../common/permissions';
import { CreateOrgUnitDto, UpdateOrgUnitDto } from './org-units.dto';
import { OrgUnitsService } from './org-units.service';

@ApiTags('org-units')
@Controller('org-units')
export class OrgUnitsController {
  constructor(private readonly orgUnits: OrgUnitsService) {}

  @Get('tree')
  @RequirePermissions(Permission.OrgRead)
  tree(@Query('includeInactive', new ParseBoolPipe({ optional: true })) includeInactive?: boolean) {
    return this.orgUnits.tree(includeInactive ?? false);
  }

  @Get(':id')
  @RequirePermissions(Permission.OrgRead)
  get(@Param('id', ParseIntPipe) id: number) {
    return this.orgUnits.get(id);
  }

  @Post()
  @RequirePermissions(Permission.OrgManage)
  create(@Body() dto: CreateOrgUnitDto, @CurrentUser() user: AuthUser) {
    return this.orgUnits.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(Permission.OrgManage)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrgUnitDto, @CurrentUser() user: AuthUser) {
    return this.orgUnits.update(id, dto, user);
  }
}
