import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTripDto {
  @ApiProperty({ description: 'Assignment ID under which trip is executed', format: 'uuid' })
  @IsUUID('4')
  assignmentId!: string;

  @ApiProperty({ description: 'Trip origin location', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  origin!: string;

  @ApiProperty({ description: 'Trip destination location', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  destination!: string;

  @ApiPropertyOptional({ description: 'Operational purpose of the trip', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  purpose?: string;

  @ApiPropertyOptional({ description: 'Planned start timestamp' })
  @IsOptional()
  @IsISO8601()
  plannedStartAt?: string;

  @ApiPropertyOptional({ description: 'Planned end timestamp' })
  @IsOptional()
  @IsISO8601()
  plannedEndAt?: string;

  @ApiPropertyOptional({ description: 'Optional operational notes', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateTripDto {
  @ApiProperty({ description: 'Current record version for optimistic concurrency control' })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({ description: 'Trip origin location', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  origin?: string;

  @ApiPropertyOptional({ description: 'Trip destination location', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  destination?: string;

  @ApiPropertyOptional({ description: 'Operational purpose of the trip', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  purpose?: string;

  @ApiPropertyOptional({ description: 'Planned start timestamp' })
  @IsOptional()
  @IsISO8601()
  plannedStartAt?: string;

  @ApiPropertyOptional({ description: 'Planned end timestamp' })
  @IsOptional()
  @IsISO8601()
  plannedEndAt?: string;

  @ApiPropertyOptional({ description: 'Optional operational notes', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class MarkTripReadyDto {
  @ApiProperty({ description: 'Current record version for optimistic concurrency control' })
  @IsInt()
  @Min(1)
  version!: number;
}

export class StartTripDto {
  @ApiProperty({ description: 'Current record version for optimistic concurrency control' })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ description: 'Start odometer reading in kilometers' })
  @IsInt()
  @Min(0)
  startOdometerKm!: number;
}

export class CompleteTripDto {
  @ApiProperty({ description: 'Current record version for optimistic concurrency control' })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ description: 'End odometer reading in kilometers' })
  @IsInt()
  @Min(0)
  endOdometerKm!: number;

  @ApiPropertyOptional({ description: 'Optional operational notes on completion', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CancelTripDto {
  @ApiProperty({ description: 'Current record version for optimistic concurrency control' })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({ description: 'Reason for cancellation' })
  @IsOptional()
  @IsString()
  cancelReason?: string;

  @ApiPropertyOptional({ description: 'Alternative alias for cancelReason' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AbortTripDto {
  @ApiProperty({ description: 'Current record version for optimistic concurrency control' })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ description: 'End odometer reading in kilometers upon abort' })
  @IsInt()
  @Min(0)
  endOdometerKm!: number;

  @ApiPropertyOptional({ description: 'Reason for aborting the trip' })
  @IsOptional()
  @IsString()
  abortReason?: string;

  @ApiPropertyOptional({ description: 'Alternative alias for abortReason' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ListTripsQueryDto {
  @ApiPropertyOptional({
    enum: ['DRAFT', 'READY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ABORTED'],
    description: 'Filter by trip status',
  })
  @IsOptional()
  @IsEnum(['DRAFT', 'READY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ABORTED'])
  status?: 'DRAFT' | 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'ABORTED';

  @ApiPropertyOptional({ description: 'Filter by vehicle ID', format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  vehicleId?: string;

  @ApiPropertyOptional({ description: 'Filter by driver ID', format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  driverId?: string;

  @ApiPropertyOptional({ description: 'Filter by assignment ID', format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  assignmentId?: string;

  @ApiPropertyOptional({
    description: 'Search term matching display ID, origin, destination, vehicle, driver',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Maximum number of items to return', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Number of items to skip', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
