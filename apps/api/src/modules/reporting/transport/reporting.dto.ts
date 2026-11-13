import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class DateRangeQueryDto {
  @ApiPropertyOptional({
    description: 'Inclusive ISO8601 start date (UTC)',
    example: '2026-11-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  readonly from?: string;

  @ApiPropertyOptional({
    description: 'Exclusive ISO8601 end date (UTC)',
    example: '2026-12-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  readonly to?: string;
}

export class VehicleUtilizationQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ description: 'Optional vehicle UUID filter' })
  @IsOptional()
  @IsUUID()
  readonly vehicleId?: string;

  @ApiPropertyOptional({
    enum: ['distance', 'trips', 'duration', 'utilization'],
    default: 'distance',
  })
  @IsOptional()
  @IsIn(['distance', 'trips', 'duration', 'utilization'])
  readonly sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  readonly sortOrder?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 500, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  readonly limit?: number;
}

export class TripAnalyticsQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ description: 'Optional vehicle UUID filter' })
  @IsOptional()
  @IsUUID()
  readonly vehicleId?: string;

  @ApiPropertyOptional({ description: 'Optional driver UUID filter' })
  @IsOptional()
  @IsUUID()
  readonly driverId?: string;

  @ApiPropertyOptional({ description: 'Optional TripStatus filter' })
  @IsOptional()
  @IsString()
  readonly status?: string;
}

export class FuelAnalyticsQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ description: 'Optional vehicle UUID filter' })
  @IsOptional()
  @IsUUID()
  readonly vehicleId?: string;

  @ApiPropertyOptional({ description: 'Optional FuelType filter' })
  @IsOptional()
  @IsString()
  readonly fuelType?: string;
}

export class CostAnalyticsQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ description: 'Optional vehicle UUID filter' })
  @IsOptional()
  @IsUUID()
  readonly vehicleId?: string;

  @ApiPropertyOptional({ description: 'Optional category UUID filter' })
  @IsOptional()
  @IsUUID()
  readonly categoryId?: string;

  @ApiPropertyOptional({ description: 'Optional ISO 4217 currency code filter', example: 'USD' })
  @IsOptional()
  @IsString()
  readonly currency?: string;
}

export class MaintenanceAnalyticsQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ description: 'Optional vehicle UUID filter' })
  @IsOptional()
  @IsUUID()
  readonly vehicleId?: string;

  @ApiPropertyOptional({ description: 'Optional status filter' })
  @IsOptional()
  @IsString()
  readonly status?: string;
}

export class ComplianceAnalyticsQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ description: 'Optional subject type filter' })
  @IsOptional()
  @IsString()
  readonly subjectType?: string;
}

export class IncidentAnalyticsQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ description: 'Optional IncidentType filter' })
  @IsOptional()
  @IsString()
  readonly type?: string;

  @ApiPropertyOptional({ description: 'Optional IncidentSeverity filter' })
  @IsOptional()
  @IsString()
  readonly severity?: string;

  @ApiPropertyOptional({ description: 'Optional IncidentStatus filter' })
  @IsOptional()
  @IsString()
  readonly status?: string;
}

export class ExportReportQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ enum: ['csv', 'pdf'], default: 'csv' })
  @IsIn(['csv', 'pdf'])
  readonly format!: 'csv' | 'pdf';

  @ApiPropertyOptional({ description: 'Optional vehicle filter' })
  @IsOptional()
  @IsUUID()
  readonly vehicleId?: string;

  @ApiPropertyOptional({ description: 'Optional driver filter' })
  @IsOptional()
  @IsUUID()
  readonly driverId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  readonly categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  readonly currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  readonly status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  readonly type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  readonly severity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  readonly fuelType?: string;
}
