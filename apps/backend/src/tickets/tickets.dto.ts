import { TicketChannel, TicketStatus, TicketType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../common/http';

export class CreateTicketDto {
  @IsOptional()
  @IsEnum(TicketChannel)
  channel?: TicketChannel;

  @IsEnum(TicketType)
  type: TicketType;

  @IsOptional()
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @IsInt()
  regionId?: number;

  @IsOptional()
  @IsInt()
  districtId?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  citizenPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  citizenName?: string;

  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  cadastreNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  applicationNumber?: string;

  /** Yaratish bilan birga mas'ul bo'linmaga yo'naltirish */
  @IsOptional()
  @IsInt()
  targetOrgUnitId?: number;

  /** "Ma'lumot berildi": murojaat ijroga yuborilmasdan yopiladi (F-OP-07) */
  @IsOptional()
  @IsBoolean()
  closeImmediately?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  answer?: string;

  /** Murojaat qaysi qo'ng'iroq davomida yaratilgani (PBX uniqueid) */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  pbxCallId?: string;
}

export class TicketsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(TicketType)
  type?: TicketType;

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
  assignedOrgUnitId?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  overdue?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class RoutingSuggestionQueryDto {
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

export class RouteTicketDto {
  @IsInt()
  orgUnitId: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class AssignTicketDto {
  @IsInt()
  assigneeId: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class AnswerTicketDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  answer: string;
}

/** Sabab majburiy bo'lgan amallar: qaytarish, rad etish, qayta ochish, izoh. */
export class CommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  comment: string;
}
