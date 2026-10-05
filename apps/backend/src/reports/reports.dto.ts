import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional } from 'class-validator';
import { PERIOD_KEYS, PeriodKey } from '../common/period';

export class PeriodQueryDto {
  @IsOptional()
  @IsIn(PERIOD_KEYS)
  period?: PeriodKey;

  /** Ixtiyoriy oraliq (ISO 8601): berilsa period o'rniga ishlatiladi */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
