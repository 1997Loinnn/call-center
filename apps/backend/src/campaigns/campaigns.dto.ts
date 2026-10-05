import { CampaignContactStatus, CampaignStatus, CampaignType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ContactInputDto {
  @IsString()
  @MaxLength(32)
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;
}

/** Kontaktlar manbai: qo'lda ro'yxat va/yoki davrda yopilgan murojaatlar fuqarolari. */
export class ContactsSourceDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20_000)
  @ValidateNested({ each: true })
  @Type(() => ContactInputDto)
  contacts?: ContactInputDto[];

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  closedFrom?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  closedTo?: Date;

  @IsOptional()
  @IsInt()
  categoryId?: number;
}

export class CreateCampaignDto extends ContactsSourceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsEnum(CampaignType)
  type: CampaignType;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  script?: string;

  @IsInt()
  @Min(1)
  @Max(10)
  maxAttempts: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startsAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endsAt?: Date;

  /** Yaratilgandan keyingi holat: qoralama, rejalashtirilgan yoki darhol faol */
  @IsIn([CampaignStatus.DRAFT, CampaignStatus.SCHEDULED, CampaignStatus.ACTIVE])
  status: CampaignStatus;
}

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  script?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxAttempts?: number;

  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;
}

export const RESULT_STATUSES = [
  CampaignContactStatus.REACHED,
  CampaignContactStatus.NO_ANSWER,
  CampaignContactStatus.BUSY,
  CampaignContactStatus.WRONG_NUMBER,
  CampaignContactStatus.CALL_LATER,
] as const;

export class ContactResultDto {
  @IsIn(RESULT_STATUSES)
  status: CampaignContactStatus;

  /** "Keyinroq qo'ng'iroq": qachon */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  callLaterAt?: Date;

  /** So'rovnoma: murojaat hal qilindimi */
  @IsOptional()
  @IsIn(['yes', 'partly', 'no'])
  resolved?: 'yes' | 'partly' | 'no';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
