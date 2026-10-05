import { IvrAction } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
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
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IVR_DIGITS, NO_INPUT } from './ivr-engine';

export const QUEUE_STRATEGIES = ['longest_idle', 'ring_all', 'round_robin', 'fewest_calls', 'random'] as const;
export const LANGUAGES = ['uz', 'ru'] as const;

export class MenuDto {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9._-]{0,63}$/, { message: "Kod: kichik lotin harflari, raqam, nuqta, chiziq (masalan, main.uz)" })
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsIn(LANGUAGES)
  language?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  promptId?: number | null;

  @IsInt()
  @Min(2)
  @Max(30)
  timeoutSeconds: number;

  @IsInt()
  @Min(1)
  @Max(5)
  maxRetries: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  fallbackQueueId?: number | null;
}

export class OptionDto {
  @IsIn(IVR_DIGITS)
  digit: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label: string;

  @IsEnum(IvrAction)
  action: IvrAction;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  queueId?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  targetMenuId?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  promptId?: number | null;
}

export class OptionsDto {
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => OptionDto)
  options: OptionDto[];
}

export class IvrSettingsDto {
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  entryMenuId: number | null;

  @ValidateIf((_, v) => v !== null)
  @IsInt()
  afterHoursPromptId: number | null;

  @ValidateIf((_, v) => v !== null)
  @IsInt()
  holidayPromptId: number | null;

  @IsBoolean()
  voicemailAfterHours: boolean;
}

export class PromptDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsIn(LANGUAGES)
  language: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text: string;
}

export class QueueDto {
  @IsString()
  @Matches(/^\d{3,6}$/, { message: 'Navbat raqami 3–6 xonali son (UCM6510 dagi raqam)' })
  pbxNumber: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(LANGUAGES)
  language?: string | null;

  @IsBoolean()
  isActive: boolean;

  @IsIn(QUEUE_STRATEGIES)
  strategy: string;

  @IsInt()
  @Min(15)
  @Max(1800)
  maxWaitSeconds: number;

  @IsBoolean()
  callbackEnabled: boolean;

  @IsBoolean()
  announcePosition: boolean;

  @IsInt()
  @Min(15)
  @Max(300)
  announceEverySeconds: number;

  @IsString()
  @Matches(/^[a-z0-9_-]{1,64}$/, { message: 'Musiqa klassi nomi: lotin harflari va raqamlar' })
  musicOnHold: string;

  @IsInt()
  @Min(0)
  @Max(300)
  wrapUpSeconds: number;

  @IsBoolean()
  isRestricted: boolean;
}

export class MemberDto {
  @IsInt()
  userId: number;

  @IsInt()
  @Min(0)
  @Max(3)
  penalty: number;
}

export class MembersDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => MemberDto)
  members: MemberDto[];
}

export class SimulateDto {
  /** Bosilgan tugmalar ketma-ketligi; "timeout" — tugma bosilmadi */
  @IsArray()
  @ArrayMaxSize(30)
  @IsIn([...IVR_DIGITS, NO_INPUT], { each: true })
  input: string[];

  /** Qo'ng'iroq vaqti (ish vaqti va bayramni sinash uchun); berilmasa — hozir */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  at?: Date;
}

export class TicketStatusQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  number: string;
}
