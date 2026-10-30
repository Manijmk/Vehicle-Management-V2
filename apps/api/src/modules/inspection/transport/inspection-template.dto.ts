import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

import type {
  InspectionItemSeverity,
  InspectionTemplateStatus,
  InspectionType,
} from '../domain/inspection-template.js';

export class CreateTemplateItemDto {
  @ApiProperty({ description: 'Checklist category' })
  @IsString()
  @IsNotEmpty()
  category!: string;

  @ApiProperty({ description: 'Question prompt for the item' })
  @IsString()
  @IsNotEmpty()
  prompt!: string;

  @ApiPropertyOptional({ description: 'Additional instructions or guidance' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Whether answering this item is required', default: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({
    description: 'Item severity',
    enum: ['NORMAL', 'CRITICAL'],
    default: 'NORMAL',
  })
  @IsOptional()
  @IsIn(['NORMAL', 'CRITICAL'])
  severity?: InspectionItemSeverity;

  @ApiPropertyOptional({ description: 'Order index for display', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateInspectionTemplateDto {
  @ApiProperty({ description: 'Template display name' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Template purpose description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Inspection type',
    enum: ['PRE_TRIP', 'POST_TRIP', 'PERIODIC', 'SAFETY', 'CUSTOM'],
  })
  @IsIn(['PRE_TRIP', 'POST_TRIP', 'PERIODIC', 'SAFETY', 'CUSTOM'])
  type!: InspectionType;

  @ApiPropertyOptional({
    description: 'Checklist items',
    type: [CreateTemplateItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTemplateItemDto)
  items?: CreateTemplateItemDto[];
}

export class UpdateInspectionTemplateDto {
  @ApiProperty({ description: 'Optimistic concurrency version' })
  @IsInt()
  version!: number;

  @ApiPropertyOptional({ description: 'Template display name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Template description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Replacement checklist items (only allowed in DRAFT)',
    type: [CreateTemplateItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTemplateItemDto)
  items?: CreateTemplateItemDto[];
}

export class VersionedActionDto {
  @ApiProperty({ description: 'Optimistic concurrency version' })
  @IsInt()
  version!: number;
}

export class ListInspectionTemplatesQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by inspection type',
    enum: ['PRE_TRIP', 'POST_TRIP', 'PERIODIC', 'SAFETY', 'CUSTOM'],
  })
  @IsOptional()
  @IsIn(['PRE_TRIP', 'POST_TRIP', 'PERIODIC', 'SAFETY', 'CUSTOM'])
  type?: InspectionType;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
  })
  @IsOptional()
  @IsIn(['DRAFT', 'ACTIVE', 'ARCHIVED'])
  status?: InspectionTemplateStatus;

  @ApiPropertyOptional({ description: 'Search by template name' })
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
