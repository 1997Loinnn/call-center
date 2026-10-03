import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { Permission } from '../common/permissions';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto, UsersQueryDto } from './users.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

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

  @Post(':id/reset-password')
  @HttpCode(204)
  @RequirePermissions(Permission.UsersManage)
  resetPassword(@Param('id', ParseIntPipe) id: number, @Body() dto: ResetPasswordDto, @CurrentUser() actor: AuthUser) {
    return this.users.resetPassword(id, dto.password, actor);
  }
}
