import { AlertSeverity } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { PageQueryDto } from '../common/http';

export class LiveQueryDto {
  /** Navbat raqami (Queue.pbxNumber); berilmasa — barcha navbatlar */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  queue?: string;
}

export class AlertsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(['active', 'history'])
  tab?: 'active' | 'history';

  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: AlertSeverity;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

class AlertRuleItemDto {
  @IsInt()
  id: number;

  @IsInt()
  @Min(1)
  threshold: number;

  @IsBoolean()
  isActive: boolean;
}

class AlertNotifyDto {
  @IsBoolean()
  bell: boolean;

  @IsBoolean()
  sms: boolean;

  @IsBoolean()
  telegram: boolean;
}

export class AlertSettingsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AlertRuleItemDto)
  rules: AlertRuleItemDto[];

  @ValidateNested()
  @Type(() => AlertNotifyDto)
  notify: AlertNotifyDto;
}
