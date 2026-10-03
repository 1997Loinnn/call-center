import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../common/http';

export class AuditQueryDto extends PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  actorId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  action?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
