import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

import { driverStatuses } from '../domain/driver.js';
import type { DriverStatus } from '../domain/driver.js';

export class CreateDriverDto {
  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 40,
    description: 'Display identifier (auto-allocated if omitted)',
  })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  readonly displayId?: string;

  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  readonly firstName!: string;

  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  readonly lastName!: string;

  @ApiPropertyOptional({ maxLength: 320 })
  @IsOptional()
  @IsEmail()
  readonly email?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  readonly phone?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  readonly employeeNumber?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  readonly notes?: string;
}

export class UpdateDriverDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 40 })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  readonly displayId?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  readonly firstName?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  readonly lastName?: string;

  @ApiPropertyOptional({ maxLength: 320 })
  @IsOptional()
  @IsEmail()
  readonly email?: string | null;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  readonly phone?: string | null;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  readonly employeeNumber?: string | null;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  readonly notes?: string | null;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  readonly version!: number;
}

export class ActivateDriverDto {
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  readonly version?: number;
}

export class SuspendDriverDto {
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @Length(1, 500)
  readonly reason!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  readonly version!: number;
}

export class DeactivateDriverDto {
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @Length(1, 500)
  readonly reason!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  readonly version!: number;
}

export class AddLicenseDto {
  @ApiProperty({ minLength: 1, maxLength: 50 })
  @IsString()
  @Length(1, 50)
  readonly licenseNumber!: string;

  @ApiProperty({ minLength: 2, maxLength: 3, description: 'ISO 3166-1 alpha country code' })
  @IsString()
  @Matches(/^[A-Za-z]{2,3}$/u, { message: 'issuingCountry must be a 2 or 3-letter country code' })
  readonly issuingCountry!: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  readonly issuingRegion?: string;

  @ApiProperty({
    type: [String],
    description: 'List of license classes/categories e.g. ["B", "C"]',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  readonly licenseClasses!: string[];

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  readonly issueDate!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  readonly expiryDate!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  readonly notes?: string;
}

export class UpdateLicenseDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 50 })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  readonly licenseNumber?: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 3 })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2,3}$/u)
  readonly issuingCountry?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  readonly issuingRegion?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  readonly licenseClasses?: string[];

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  readonly issueDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  readonly expiryDate?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  readonly notes?: string | null;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  readonly version!: number;
}

export class DriverFilterDto {
  @ApiPropertyOptional({ enum: driverStatuses })
  @IsOptional()
  @IsIn(driverStatuses)
  readonly status?: DriverStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  readonly search?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  readonly limit?: number;
}
