import { ExportFormat, TicketType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { REPORT_SOURCE_KEYS } from '../reports/report-sources';

// ───────────── Toifalar va mavzular ─────────────

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nameUz: string;

  /** Berilsa — shu toifaning mavzusi (operator kartasi) yaratiladi */
  @IsOptional()
  @IsInt()
  parentId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  slaDays?: number;

  @IsOptional()
  @IsBoolean()
  isConfidential?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(TicketType, { each: true })
  ticketTypes?: TicketType[];
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nameUz?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  slaDays?: number;

  @IsOptional()
  @IsBoolean()
  isConfidential?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(TicketType, { each: true })
  ticketTypes?: TicketType[];
}

// ───────────── Yo'naltirish qoidalari ─────────────

/** null = "istalgan" (toifa, hudud yoki tuman). Qoida to'liq almashtiriladi (PUT). */
export class RoutingRuleDto {
  @IsOptional()
  @IsInt()
  categoryId?: number | null;

  @IsOptional()
  @IsInt()
  regionId?: number | null;

  @IsOptional()
  @IsInt()
  districtId?: number | null;

  @IsInt()
  targetOrgUnitId: number;

  @IsInt()
  @Min(1)
  @Max(100000)
  priority: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class RoutingMatchQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  regionId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  districtId?: number;
}

class DuplicateDetectionDto {
  @IsBoolean()
  enabled: boolean;

  @IsInt()
  @Min(1)
  @Max(720)
  windowHours: number;

  @IsInt()
  @Min(2)
  @Max(100)
  minTickets: number;
}

export class AutomationDto {
  @IsBoolean()
  dueSoonReminder: boolean;

  @IsBoolean()
  overdueEscalation: boolean;

  @IsBoolean()
  smsOnCreate: boolean;

  @IsBoolean()
  returnToSupervisor: boolean;

  @ValidateNested()
  @Type(() => DuplicateDetectionDto)
  duplicateDetection: DuplicateDetectionDto;
}

// ───────────── Eksport shablonlari ─────────────

// Qo'lda yoki oddiy cron: "daqiqa soat * * *" (har kuni), "daqiqa soat * * 1-7" (haftada), "daqiqa soat 1 * *" (oyda)
const CRON_PATTERN = /^\d{1,2} \d{1,2} (\*|[1-9]|[12]\d|3[01]) \* (\*|[0-7])$/;

export class ExportTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsEnum(ExportFormat)
  format: ExportFormat;

  @IsIn(REPORT_SOURCE_KEYS)
  source: string;

  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  columns: string[];

  @IsOptional()
  @Matches(CRON_PATTERN, { message: "Jadval: \"daqiqa soat kun * hafta_kuni\" (masalan, 0 18 * * *) yoki bo'sh" })
  schedule?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recipientRoles?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
