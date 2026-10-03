import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PageQueryDto } from '../common/http';

// TZ 9-bo'lim: parol kamida 12 belgi
const PASSWORD_MIN_LENGTH = 12;

export class CreateUserDto {
  @Matches(/^[a-z0-9._-]{3,64}$/, { message: "username: kichik lotin harflari, raqam, '.', '_' va '-'" })
  username: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(128)
  password: string;

  @IsString()
  @MaxLength(255)
  fullName: string;

  @IsInt()
  orgUnitId: number;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roleCodes: string[];

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @Matches(/^\d{2,16}$/, { message: 'sipExtension: faqat raqamlar' })
  sipExtension?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fullName?: string;

  @IsOptional()
  @IsInt()
  orgUnitId?: number;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roleCodes?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @Matches(/^\d{2,16}$/, { message: 'sipExtension: faqat raqamlar' })
  sipExtension?: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(128)
  password: string;
}

export class UsersQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  orgUnitId?: number;
}
