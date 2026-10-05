import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AgentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { Permission } from '../common/permissions';
import { TelephonyService } from './telephony.service';

export class AgentStatusDto {
  @IsEnum(AgentStatus)
  status: AgentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class PhoneNumberDto {
  @IsString()
  @MaxLength(32)
  number: string;
}

@ApiTags('telephony')
@Controller('telephony')
export class TelephonyController {
  constructor(private readonly telephony: TelephonyService) {}

  @Get('info')
  @RequirePermissions(Permission.TelephonyUse)
  info(@CurrentUser() user: AuthUser) {
    return { driver: this.telephony.driver, sipExtension: user.sipExtension };
  }

  @Post('agent-status')
  @HttpCode(204)
  @RequirePermissions(Permission.TelephonyUse)
  setStatus(@CurrentUser() user: AuthUser, @Body() dto: AgentStatusDto) {
    return this.telephony.setAgentStatus(user, dto.status, dto.reason);
  }

  @Post('originate')
  @HttpCode(204)
  @RequirePermissions(Permission.TelephonyUse)
  originate(@CurrentUser() user: AuthUser, @Body() dto: PhoneNumberDto) {
    return this.telephony.originate(user, dto.number);
  }

  /** Ishlab chiqish uchun: PBX_DRIVER=mock bo'lganda kiruvchi qo'ng'iroqni taqlid qiladi. */
  @Post('dev/simulate-call')
  @RequirePermissions(Permission.TelephonyUse)
  simulate(@CurrentUser() user: AuthUser, @Body() dto: PhoneNumberDto): Promise<{ pbxCallId: string }> {
    return this.telephony.simulateIncomingCall(user, dto.number);
  }
}
