import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateAssignmentDto {
  @ApiProperty({ description: 'Vehicle ID to assign', format: 'uuid' })
  @IsUUID('4')
  vehicleId!: string;

  @ApiProperty({ description: 'Driver ID to assign', format: 'uuid' })
  @IsUUID('4')
  driverId!: string;

  @ApiPropertyOptional({ description: 'Assignment start timestamp (defaults to current time)' })
  @IsOptional()
  @IsISO8601()
  startedAt?: string;

  @ApiPropertyOptional({ description: 'Optional assignment notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class EndAssignmentDto {
  @ApiProperty({ description: 'Current record version for optimistic concurrency control' })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({ description: 'Reason for ending the assignment' })
  @IsOptional()
  @IsString()
  endReason?: string;

  @ApiPropertyOptional({ description: 'Alternative alias for endReason' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: 'Assignment end timestamp (defaults to current time)' })
  @IsOptional()
  @IsISO8601()
  endedAt?: string;
}

export class ListAssignmentsQueryDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'ENDED'], description: 'Filter by assignment status' })
  @IsOptional()
  @IsEnum(['ACTIVE', 'ENDED'])
  status?: 'ACTIVE' | 'ENDED';

  @ApiPropertyOptional({ description: 'Filter by vehicle ID', format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  vehicleId?: string;

  @ApiPropertyOptional({ description: 'Filter by driver ID', format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  driverId?: string;

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
