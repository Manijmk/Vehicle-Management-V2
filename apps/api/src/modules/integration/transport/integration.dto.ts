import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IntegrationKind, IntegrationStatus, WebhookDeliveryStatus } from '@vms/database';

export class CreateIntegrationConnectionDto {
  @ApiProperty({ description: 'Human-readable name of the integration connection' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ enum: IntegrationKind, description: 'Kind of integration' })
  @IsEnum(IntegrationKind)
  kind!: IntegrationKind;

  @ApiPropertyOptional({ description: 'Provider identifier (e.g. SAMSARA, GEOTAB, WEX, CUSTOM)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  provider?: string;

  @ApiPropertyOptional({ description: 'Optional JSON configuration object' })
  @IsOptional()
  configuration?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Optional legacy JSON configuration alias' })
  @IsOptional()
  config?: Record<string, unknown>;
}

export class UpdateIntegrationConnectionDto {
  @ApiProperty({ description: 'Expected optimistic locking version' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({ description: 'Human-readable name of the integration connection' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Provider identifier (e.g. SAMSARA, GEOTAB, WEX, CUSTOM)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  provider?: string;

  @ApiPropertyOptional({ description: 'Optional JSON configuration object' })
  @IsOptional()
  configuration?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Optional legacy JSON configuration alias' })
  @IsOptional()
  config?: Record<string, unknown>;
}

export class ConnectionActionDto {
  @ApiProperty({ description: 'Expected optimistic locking version' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class CreateWebhookSubscriptionDto {
  @ApiProperty({ description: 'Destination endpoint URL for outbound webhooks' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  endpointUrl!: string;

  @ApiProperty({
    description: 'Array of event types to subscribe to, or ["*"] for all allowed events',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  eventTypes!: string[];
}

export class CreateDeviceMappingDto {
  @ApiProperty({ description: 'Provider external device identifier' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  providerDeviceId!: string;

  @ApiProperty({ description: 'Internal VMS TelemetryDevice UUID' })
  @IsUUID('4')
  telemetryDeviceId!: string;
}

export class ListConnectionsQueryDto {
  @ApiPropertyOptional({ enum: IntegrationKind })
  @IsOptional()
  @IsEnum(IntegrationKind)
  kind?: IntegrationKind;

  @ApiPropertyOptional({ enum: IntegrationStatus })
  @IsOptional()
  @IsEnum(IntegrationStatus)
  status?: IntegrationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class ListDeliveriesQueryDto {
  @ApiPropertyOptional({ enum: WebhookDeliveryStatus })
  @IsOptional()
  @IsEnum(WebhookDeliveryStatus)
  status?: WebhookDeliveryStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  eventType?: string;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class ConfirmFuelCardImportDto {
  @ApiProperty({ description: 'Batch ID of previewed fuel card import' })
  @IsUUID('4')
  batchId!: string;
}

export class AccountingExportQueryDto {
  @ApiProperty({ description: 'Start of reporting window in ISO 8601 UTC format' })
  @IsString()
  @IsNotEmpty()
  from!: string;

  @ApiProperty({ description: 'End of reporting window in ISO 8601 UTC format' })
  @IsString()
  @IsNotEmpty()
  to!: string;

  @ApiPropertyOptional({ description: 'ISO 4217 Currency Code' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}
