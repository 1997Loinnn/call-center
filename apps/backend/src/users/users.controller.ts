import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { requestMeta } from '../common/http';
import { Permission } from '../common/permissions';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto, UsersQueryDto } from './users.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @RequirePermissions(Permission.UsersManage)
  list(@Query() query: UsersQueryDto) {
    return this.users.list(query);
  }

  @Get('assignable')
  @RequirePermissions(Permission.TicketsAssign)
  assignable(@Query('orgUnitId', ParseIntPipe) orgUnitId: number) {
    return this.users.assignable(orgUnitId);
  }

  @Post()
  @RequirePermissions(Permission.UsersManage)
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions(Permission.UsersManage)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.update(id, dto, actor);
  }

  @Post(':id/unlock')
  @HttpCode(204)
  @RequirePermissions(Permission.UsersManage)
  unlock(@Param('id', ParseIntPipe) id: number, @CurrentUser() actor: AuthUser) {
    return this.users.unlock(id, actor);
  }

  @Post(':id/reset-password')
  @HttpCode(204)
  @RequirePermissions(Permission.UsersManage)
  resetPassword(@Param('id', ParseIntPipe) id: number, @Body() dto: ResetPasswordDto, @CurrentUser() actor: AuthUser) {
    return this.users.resetPassword(id, dto.password, actor);
  }

  /** Telefon yo'qolsa: ikki bosqichli himoyani bekor qilish (keyingi kirishda qayta ulanadi). */
  @Post(':id/reset-2fa')
  @HttpCode(204)
  @RequirePermissions(Permission.UsersManage)
  resetTwoFactor(@Param('id', ParseIntPipe) id: number, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.auth.resetTwoFactor(actor, id, requestMeta(req));
  }
}
