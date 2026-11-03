import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import type {
  IncidentAttachmentType,
  IncidentOperationalImpact,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
} from '../domain/incident.js';

export class ReportIncidentDto {
  @ApiProperty({
    description: 'Type of incident',
    enum: ['ACCIDENT', 'BREAKDOWN', 'VIOLATION', 'DAMAGE', 'THEFT', 'SAFETY', 'OTHER'],
    example: 'ACCIDENT',
  })
  @IsIn(['ACCIDENT', 'BREAKDOWN', 'VIOLATION', 'DAMAGE', 'THEFT', 'SAFETY', 'OTHER'])
  type!: IncidentType;

  @ApiProperty({
    description: 'Classification severity',
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    example: 'HIGH',
  })
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  severity!: IncidentSeverity;

  @ApiProperty({ description: 'Incident title', example: 'Minor rear collision at traffic stop' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @ApiProperty({
    description: 'Full narrative description of the incident',
    example: 'Vehicle was rear-ended at a red light. Bumper damaged, no injuries reported.',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  description!: string;

  @ApiProperty({
    description: 'When the incident occurred (ISO 8601)',
    example: '2026-11-02T08:30:00.000Z',
  })
  @IsISO8601()
  occurredAt!: string;

  @ApiPropertyOptional({
    description: 'Location details or cross streets',
    example: 'Corner of 5th Ave and Main St',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  locationText?: string;

  @ApiPropertyOptional({
    description: 'Derived operational dispatch blocking impact',
    enum: ['NONE', 'VEHICLE', 'DRIVER', 'BOTH'],
    default: 'NONE',
    example: 'VEHICLE',
  })
  @IsOptional()
  @IsIn(['NONE', 'VEHICLE', 'DRIVER', 'BOTH'])
  operationalImpact?: IncidentOperationalImpact;

  @ApiPropertyOptional({ description: 'Subject Vehicle ID (derived if tripId provided)' })
  @IsOptional()
  @IsUUID('4')
  vehicleId?: string;

  @ApiPropertyOptional({ description: 'Subject Driver ID (derived if tripId provided)' })
  @IsOptional()
  @IsUUID('4')
  driverId?: string;

  @ApiPropertyOptional({ description: 'Originating active Trip ID' })
  @IsOptional()
  @IsUUID('4')
  tripId?: string;
}

export class UpdateIncidentDto {
  @ApiProperty({ description: 'Expected version for optimistic concurrency control', example: 1 })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({ description: 'Updated title' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Updated narrative description' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  severity?: IncidentSeverity;

  @ApiPropertyOptional({ description: 'Updated location text' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  locationText?: string;

  @ApiPropertyOptional({ enum: ['NONE', 'VEHICLE', 'DRIVER', 'BOTH'] })
  @IsOptional()
  @IsIn(['NONE', 'VEHICLE', 'DRIVER', 'BOTH'])
  operationalImpact?: IncidentOperationalImpact;
}

export class StartInvestigationDto {
  @ApiProperty({ description: 'Expected version for optimistic concurrency control', example: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class ResolveIncidentDto {
  @ApiProperty({ description: 'Expected version for optimistic concurrency control', example: 1 })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({
    description: 'Resolution summary explaining investigation conclusions and corrective actions',
    example:
      'Police report filed, driver cleared of fault, vehicle repaired and cleared for service.',
  })
  @IsOptional()
  @IsString()
  resolutionSummary?: string;
}

export class CloseIncidentDto {
  @ApiProperty({ description: 'Expected version for optimistic concurrency control', example: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class CancelIncidentDto {
  @ApiProperty({ description: 'Expected version for optimistic concurrency control', example: 1 })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({
    description: 'Reason for incident cancellation (e.g., duplicate report)',
    example: 'Reported in duplicate with INC-1002.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  cancelReason?: string;

  @ApiPropertyOptional({
    description: 'Alternative name for cancelReason',
    example: 'Reported in duplicate with INC-1002.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  cancellationReason?: string;
}

export class AddIncidentNoteDto {
  @ApiProperty({
    description: 'Investigation note body',
    example: 'Contacted insurance representative for report copy.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

export class UploadIncidentAttachmentDto {
  @ApiPropertyOptional({ enum: ['PHOTO', 'DOCUMENT', 'OTHER'], default: 'OTHER' })
  @IsOptional()
  @IsIn(['PHOTO', 'DOCUMENT', 'OTHER'])
  attachmentType?: IncidentAttachmentType;

  @ApiPropertyOptional({ description: 'Optional attachment description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Optional attachment caption' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;
}

export class CreateIncidentMaintenanceRequestDto {
  @ApiPropertyOptional({ description: 'Custom title for maintenance request' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Detailed maintenance notes' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ enum: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] })
  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'CRITICAL'])
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';

  @ApiPropertyOptional({ description: 'Whether the maintenance request blocks operation' })
  @IsOptional()
  @IsBoolean()
  blocksOperation?: boolean;
}

export class ListIncidentsQueryDto {
  @ApiPropertyOptional({ enum: ['REPORTED', 'INVESTIGATING', 'RESOLVED', 'CLOSED', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['REPORTED', 'INVESTIGATING', 'RESOLVED', 'CLOSED', 'CANCELLED'])
  status?: IncidentStatus;

  @ApiPropertyOptional({
    enum: ['ACCIDENT', 'BREAKDOWN', 'VIOLATION', 'DAMAGE', 'THEFT', 'SAFETY', 'OTHER'],
  })
  @IsOptional()
  @IsIn(['ACCIDENT', 'BREAKDOWN', 'VIOLATION', 'DAMAGE', 'THEFT', 'SAFETY', 'OTHER'])
  type?: IncidentType;

  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  severity?: IncidentSeverity;

  @ApiPropertyOptional({ description: 'Filter by vehicle ID' })
  @IsOptional()
  @IsUUID('4')
  vehicleId?: string;

  @ApiPropertyOptional({ description: 'Filter by driver ID' })
  @IsOptional()
  @IsUUID('4')
  driverId?: string;

  @ApiPropertyOptional({ description: 'Filter by trip ID' })
  @IsOptional()
  @IsUUID('4')
  tripId?: string;

  @ApiPropertyOptional({ enum: ['NONE', 'VEHICLE', 'DRIVER', 'BOTH'] })
  @IsOptional()
  @IsIn(['NONE', 'VEHICLE', 'DRIVER', 'BOTH'])
  operationalImpact?: IncidentOperationalImpact;

  @ApiPropertyOptional({
    description: 'Search title, displayId, vehicle registration, or driver name',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter from occurrence date' })
  @IsOptional()
  @IsISO8601()
  fromOccurredAt?: string;

  @ApiPropertyOptional({ description: 'Filter to occurrence date' })
  @IsOptional()
  @IsISO8601()
  toOccurredAt?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
