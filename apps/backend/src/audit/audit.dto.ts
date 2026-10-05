import { Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../common/http';
import { AUDIT_CATEGORY_KEYS, AuditCategory } from './audit-presenter';

export class AuditQueryDto extends PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  actorId?: number;

  /** Amal nomi yoki prefiksi (masalan, "auth.") */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  action?: string;

  @IsOptional()
  @IsIn(AUDIT_CATEGORY_KEYS)
  category?: AuditCategory;

  /** Foydalanuvchi (F.I.Sh. yoki login), obyekt raqami yoki IP */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
