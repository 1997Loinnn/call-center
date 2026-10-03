import { OrgUnitType } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateOrgUnitDto {
  @IsInt()
  parentId: number;

  @IsEnum(OrgUnitType)
  type: OrgUnitType;

  @Matches(/^[a-z0-9.-]{2,64}$/, { message: "code: kichik lotin harflari, raqam, '.' va '-'" })
  code: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  shortName?: string;

  @IsOptional()
  @IsInt()
  regionId?: number;

  @IsOptional()
  @IsInt()
  districtId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;
}

export class UpdateOrgUnitDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  shortName?: string;

  @IsOptional()
  @IsInt()
  regionId?: number;

  @IsOptional()
  @IsInt()
  districtId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
