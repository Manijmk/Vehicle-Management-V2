import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

import type { InspectionType } from '../domain/inspection-template.js';
import type {
  InspectionResponseResult,
  InspectionResult,
  InspectionStatus,
} from '../domain/inspection.js';

export class CreateInspectionDto {
  @ApiProperty({ description: 'Inspection template ID' })
  @IsUUID()
  templateId!: string;

  @ApiProperty({
    description: 'Inspection type',
    enum: ['PRE_TRIP', 'POST_TRIP', 'PERIODIC', 'SAFETY', 'CUSTOM'],
  })
  @IsIn(['PRE_TRIP', 'POST_TRIP', 'PERIODIC', 'SAFETY', 'CUSTOM'])
  type!: InspectionType;

  @ApiPropertyOptional({ description: 'Vehicle ID (required for standalone inspections)' })
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @ApiPropertyOptional({ description: 'Trip ID (required for PRE_TRIP and POST_TRIP)' })
  @IsOptional()
  @IsUUID()
  tripId?: string;

  @ApiPropertyOptional({ description: 'Initial notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class SaveResponseItemDto {
  @ApiProperty({ description: 'Template item ID being answered' })
  @IsUUID()
  templateItemId!: string;

  @ApiProperty({
    description: 'Checklist response result',
    enum: ['PASS', 'FAIL', 'NOT_APPLICABLE'],
  })
  @IsIn(['PASS', 'FAIL', 'NOT_APPLICABLE'])
  response!: InspectionResponseResult;

  @ApiPropertyOptional({ description: 'Optional response comment or defect details' })
  @IsOptional()
  @IsString()
  comment?: string;
}

export class SaveInspectionResponsesDto {
  @ApiProperty({ description: 'Optimistic concurrency version' })
  @IsInt()
  version!: number;

  @ApiProperty({
    description: 'Array of checklist item responses',
    type: [SaveResponseItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveResponseItemDto)
  responses!: SaveResponseItemDto[];
}

export class CancelInspectionDto {
  @ApiProperty({ description: 'Optimistic concurrency version' })
  @IsInt()
  version!: number;

  @ApiProperty({ description: 'Reason for cancelling the inspection' })
  @IsString()
  @IsNotEmpty()
  cancelReason!: string;
}

export class ListInspectionsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by inspection type',
    enum: ['PRE_TRIP', 'POST_TRIP', 'PERIODIC', 'SAFETY', 'CUSTOM'],
  })
  @IsOptional()
  @IsIn(['PRE_TRIP', 'POST_TRIP', 'PERIODIC', 'SAFETY', 'CUSTOM'])
  type?: InspectionType;

  @ApiPropertyOptional({
    description: 'Filter by inspection status',
    enum: ['DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  })
  @IsOptional()
  @IsIn(['DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
  status?: InspectionStatus;

  @ApiPropertyOptional({
    description: 'Filter by result',
    enum: ['PASS', 'FAIL'],
  })
  @IsOptional()
  @IsIn(['PASS', 'FAIL'])
  result?: InspectionResult;

  @ApiPropertyOptional({ description: 'Filter by vehicle ID' })
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @ApiPropertyOptional({ description: 'Filter by driver ID' })
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @ApiPropertyOptional({ description: 'Filter by trip ID' })
  @IsOptional()
  @IsUUID()
  tripId?: string;

  @ApiPropertyOptional({ description: 'Filter by critical failure presence' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  hasCriticalFailure?: boolean;

  @ApiPropertyOptional({ description: 'Search display ID or vehicle registration' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Page limit (1-100)', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: 'Page offset', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
