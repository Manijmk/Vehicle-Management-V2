import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

import { fuelTypes, vehicleTypes } from '../domain/vehicle.js';
import type { FuelType, VehicleType } from '../domain/vehicle.js';

export class CreateVehicleDto {
  @ApiProperty({ minLength: 1, maxLength: 40 })
  @IsString()
  @Length(1, 40)
  readonly displayId!: string;

  @ApiProperty({ pattern: '^[A-Z0-9 ]+$' })
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9\s-]*$/u)
  @Length(2, 30)
  readonly registration!: string;

  @ApiProperty({ pattern: '^[A-HJ-NPR-Z0-9]{17}$' })
  @IsString()
  @Matches(/^[A-HJ-NPR-Z0-9]{17}$/u)
  readonly vin!: string;

  @ApiProperty({ enum: vehicleTypes })
  @IsIn(vehicleTypes)
  readonly type!: VehicleType;

  @ApiProperty({ enum: fuelTypes })
  @IsIn(fuelTypes)
  readonly fuelType!: FuelType;

  @ApiProperty({ maxLength: 100 })
  @IsString()
  @Length(1, 100)
  readonly model!: string;

  @ApiProperty({ minimum: 1900, maximum: 2100 })
  @IsInt()
  @Min(1900)
  @Max(2100)
  readonly year!: number;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  readonly odometerKm!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  readonly notes?: string;
}

export class UpdateVehicleDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 40 })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  readonly displayId?: string;

  @ApiPropertyOptional({ pattern: '^[A-Z0-9 ]+$' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9\s-]*$/u)
  @Length(2, 30)
  readonly registration?: string;

  @ApiPropertyOptional({ enum: vehicleTypes })
  @IsOptional()
  @IsIn(vehicleTypes)
  readonly type?: VehicleType;

  @ApiPropertyOptional({ enum: fuelTypes })
  @IsOptional()
  @IsIn(fuelTypes)
  readonly fuelType?: FuelType;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  readonly model?: string;

  @ApiPropertyOptional({ minimum: 1900, maximum: 2100 })
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  readonly year?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  readonly odometerKm?: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  readonly notes?: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  readonly version!: number;
}

export class ActivateVehicleDto {
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  readonly version?: number;
}

export class RetireVehicleDto {
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @Length(1, 500)
  readonly reason!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  readonly version!: number;
}

export class VehicleIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  readonly vehicleId!: string;
}

export class VehicleFilterDto {
  @ApiPropertyOptional({ enum: ['DRAFT', 'ACTIVE', 'RETIRED'] })
  @IsOptional()
  @IsIn(['DRAFT', 'ACTIVE', 'RETIRED'])
  readonly status?: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  readonly ids?: string[];
}
