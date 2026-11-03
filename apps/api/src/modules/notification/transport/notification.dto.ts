import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import type { NotificationCategory } from '../domain/notification.js';

export class ListNotificationsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter only unread notifications',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unreadOnly?: boolean = false;

  @ApiPropertyOptional({
    description: 'Page limit (1-100)',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Cursor ID for pagination',
  })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}

export class UpdateNotificationPreferenceDto {
  @ApiProperty({
    description: 'Notification category to configure',
    enum: ['CRITICAL_INSPECTION', 'COMPLIANCE_EXPIRY', 'MAINTENANCE', 'INCIDENT', 'GENERAL'],
    example: 'MAINTENANCE',
  })
  @IsIn(['CRITICAL_INSPECTION', 'COMPLIANCE_EXPIRY', 'MAINTENANCE', 'INCIDENT', 'GENERAL'])
  category!: NotificationCategory;

  @ApiProperty({
    description: 'Whether in-app delivery is enabled',
    example: true,
  })
  @IsBoolean()
  inAppEnabled!: boolean;

  @ApiProperty({
    description: 'Whether email delivery is enabled',
    example: true,
  })
  @IsBoolean()
  emailEnabled!: boolean;

  @ApiProperty({
    description: 'Whether SMS delivery is enabled',
    example: false,
  })
  @IsBoolean()
  smsEnabled!: boolean;
}

export class UpdateNotificationTemplateDto {
  @ApiPropertyOptional({
    description: 'Updated title template with optional {{variables}}',
    example: 'Critical Incident Reported: {{displayId}}',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(250)
  titleTemplate?: string;

  @ApiPropertyOptional({
    description: 'Updated body template with optional {{variables}}',
    example: 'A critical incident was reported: {{title}} at {{occurredAt}}.',
  })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(4000)
  bodyTemplate?: string;

  @ApiPropertyOptional({
    description: 'Whether the template is actively enabled for triggers',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: 'Administrative description of when this template triggers',
    example: 'Triggered when an incident with CRITICAL severity is reported',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
