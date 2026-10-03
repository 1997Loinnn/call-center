import { BadRequestException, Controller, Get, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { requestMeta } from '../common/http';
import { Permission } from '../common/permissions';
import { CitizensService } from './citizens.service';

@ApiTags('citizens')
@Controller('citizens')
export class CitizensController {
  constructor(private readonly citizens: CitizensService) {}

  @Get('card')
  @RequirePermissions(Permission.CitizensRead)
  card(@Query('phone') phone: string | undefined, @CurrentUser() user: AuthUser, @Req() req: Request) {
    if (!phone || phone.replace(/\D/g, '').length < 3) throw new BadRequestException('Telefon raqami kiritilmagan');
    return this.citizens.cardByPhone(phone, user, requestMeta(req));
  }
}
