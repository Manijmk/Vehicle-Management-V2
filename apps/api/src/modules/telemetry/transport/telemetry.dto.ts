import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TelemetrySource } from '@vms/database';

export class CreateDeviceDto {
  @ApiProperty({ description: 'Device display name', example: 'GPS Tracker A' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({
    description: 'Unique device hardware identifier (IMEI/Serial)',
    example: 'IMEI-864209876543210',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  identifier!: string;

  @ApiPropertyOptional({ description: 'Optional device notes', example: 'Installed under dashboard' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ description: 'Optional arbitrary metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateDeviceDto {
  @ApiPropertyOptional({ description: 'Device display name', example: 'GPS Tracker A - Updated' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: 'Optional device notes', example: 'Relocated to glove box' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ description: 'Optional arbitrary metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class AssignDeviceDto {
  @ApiProperty({ description: 'Target vehicle ID to assign device to' })
  @IsUUID()
  vehicleId!: string;

  @ApiPropertyOptional({ description: 'Optional assignment notes' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UnassignDeviceDto {
  @ApiPropertyOptional({ description: 'Optional unassignment notes' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class IngestPositionDto {
  @ApiProperty({ description: 'Device ID' })
  @IsUUID()
  deviceId!: string;

  @ApiProperty({ description: 'Captured at ISO8601 timestamp' })
  @IsDateString()
  capturedAt!: string;

  @ApiProperty({ description: 'Latitude between -90 and 90', example: 37.7749 })
  @IsNumber()
  latitude!: number;

  @ApiProperty({ description: 'Longitude between -180 and 180', example: -122.4194 })
  @IsNumber()
  longitude!: number;

  @ApiPropertyOptional({ description: 'Speed in km/h (0..300)', example: 65.5 })
  @IsOptional()
  @IsNumber()
  speedKmh?: number;

  @ApiPropertyOptional({ description: 'Heading in degrees (0..360)', example: 180 })
  @IsOptional()
  @IsNumber()
  heading?: number;

  @ApiPropertyOptional({ description: 'Altitude in meters', example: 15.2 })
  @IsOptional()
  @IsNumber()
  altitudeM?: number;

  @ApiPropertyOptional({ description: 'Accuracy in meters', example: 3.5 })
  @IsOptional()
  @IsNumber()
  accuracyM?: number;

  @ApiPropertyOptional({ description: 'Ignition state', example: true })
  @IsOptional()
  @IsBoolean()
  ignition?: boolean;

  @ApiPropertyOptional({ description: 'Odometer reading in km', example: 12500 })
  @IsOptional()
  @IsInt()
  odometerKm?: number;

  @ApiPropertyOptional({
    description: 'Telemetry source',
    enum: TelemetrySource,
    default: TelemetrySource.DEVICE,
  })
  @IsOptional()
  @IsEnum(TelemetrySource)
  source?: TelemetrySource;

  @ApiPropertyOptional({ description: 'Provider message ID for idempotency deduplication' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  providerMessageId?: string;

  @ApiPropertyOptional({ description: 'Optional raw metadata payload' })
  @IsOptional()
  @IsObject()
  rawMetadata?: Record<string, unknown>;
}

export class BatchIngestDto {
  @ApiProperty({
    description: 'List of telemetry positions to ingest (1..100)',
    type: [IngestPositionDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => IngestPositionDto)
  positions!: IngestPositionDto[];
}

export class HistoryQueryDto {
  @ApiPropertyOptional({ description: 'Filter history starting from ISO8601 timestamp' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Filter history ending at ISO8601 timestamp' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Max items to return (1..500)', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 50;

  @ApiPropertyOptional({ description: 'Pagination cursor ID' })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}
