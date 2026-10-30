import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import type {
  MaintenancePlanStatus,
  MaintenancePriority,
  MaintenanceRequestSource,
  MaintenanceRequestStatus,
  MaintenanceVendorStatus,
  MaintenanceWorkOrderStatus,
  ScheduleDueState,
  WorkOrderTaskStatus,
} from '../domain/index.js';

export class VersionedActionDto {
  @ApiProperty({ description: 'Current record version for optimistic locking', example: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

// ---------------------------------------------------------------------
// Maintenance Request DTOs
// ---------------------------------------------------------------------

export class CreateMaintenanceRequestDto {
  @ApiProperty({ description: 'Vehicle ID' })
  @IsUUID('4')
  vehicleId!: string;

  @ApiPropertyOptional({
    description: 'Request origin source',
    enum: ['MANUAL', 'INSPECTION', 'PREVENTIVE'],
    default: 'MANUAL',
  })
  @IsOptional()
  @IsIn(['MANUAL', 'INSPECTION', 'PREVENTIVE'])
  sourceType?: MaintenanceRequestSource;

  @ApiPropertyOptional({ description: 'Origin inspection ID if derived from DVIR' })
  @IsOptional()
  @IsUUID('4')
  sourceInspectionId?: string;

  @ApiProperty({ description: 'Brief summary title', example: 'Front brake grinding' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'Detailed defect description' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Priority level',
    enum: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'],
    default: 'NORMAL',
  })
  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'CRITICAL'])
  priority?: MaintenancePriority;

  @ApiPropertyOptional({
    description: 'Whether this request operationally blocks the vehicle from trip dispatch',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  blocksOperation?: boolean;
}

export class UpdateMaintenanceRequestDto {
  @ApiPropertyOptional({ description: 'Updated title' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Updated description' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Priority level',
    enum: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'],
  })
  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'CRITICAL'])
  priority?: MaintenancePriority;

  @ApiPropertyOptional({ description: 'Whether this request operationally blocks the vehicle' })
  @IsOptional()
  @IsBoolean()
  blocksOperation?: boolean;

  @ApiProperty({ description: 'Current record version for optimistic locking' })
  @IsInt()
  @Min(1)
  version!: number;
}

export class ConvertRequestToWorkOrderDto {
  @ApiProperty({ description: 'Current request version' })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({ description: 'Assigned maintenance vendor ID' })
  @IsOptional()
  @IsUUID('4')
  vendorId?: string;

  @ApiPropertyOptional({ description: 'Work order title override' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Work order description override' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Work order priority override',
    enum: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'],
  })
  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'CRITICAL'])
  priority?: MaintenancePriority;

  @ApiPropertyOptional({ description: 'Whether the converted work order blocks operations' })
  @IsOptional()
  @IsBoolean()
  blocksOperation?: boolean;
}

export class CancelMaintenanceRequestDto {
  @ApiProperty({
    description: 'Mandatory reason for cancellation',
    example: 'Resolved via quick inspection',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  cancelReason!: string;

  @ApiProperty({ description: 'Current request version' })
  @IsInt()
  @Min(1)
  version!: number;
}

export class ListMaintenanceRequestsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by vehicle ID' })
  @IsOptional()
  @IsUUID('4')
  vehicleId?: string;

  @ApiPropertyOptional({
    description: 'Filter by request status',
    enum: ['OPEN', 'CONVERTED', 'CANCELLED'],
  })
  @IsOptional()
  @IsIn(['OPEN', 'CONVERTED', 'CANCELLED'])
  status?: MaintenanceRequestStatus;

  @ApiPropertyOptional({
    description: 'Filter by priority',
    enum: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'],
  })
  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'CRITICAL'])
  priority?: MaintenancePriority;

  @ApiPropertyOptional({
    description: 'Filter by source type',
    enum: ['MANUAL', 'INSPECTION', 'PREVENTIVE'],
  })
  @IsOptional()
  @IsIn(['MANUAL', 'INSPECTION', 'PREVENTIVE'])
  sourceType?: MaintenanceRequestSource;

  @ApiPropertyOptional({ description: 'Search title or display ID' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

// ---------------------------------------------------------------------
// Maintenance Plan DTOs
// ---------------------------------------------------------------------

export class CreateMaintenancePlanDto {
  @ApiProperty({ description: 'Plan name', example: 'Standard 10k Oil & Filter Service' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: 'Plan description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Trigger calendar interval in days', example: 180 })
  @IsOptional()
  @IsInt()
  @Min(1)
  intervalDays?: number;

  @ApiPropertyOptional({ description: 'Trigger mileage interval in km', example: 10000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  intervalOdometerKm?: number;

  @ApiPropertyOptional({
    description: 'Default priority for work orders created from this plan',
    enum: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'],
    default: 'NORMAL',
  })
  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'CRITICAL'])
  defaultPriority?: MaintenancePriority;

  @ApiPropertyOptional({
    description: 'Whether vehicle is operationally blocked when schedule becomes due',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  blocksOperationWhenDue?: boolean;
}

export class UpdateMaintenancePlanDto {
  @ApiPropertyOptional({ description: 'Updated name' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: 'Updated description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Trigger calendar interval in days' })
  @IsOptional()
  @IsInt()
  @Min(1)
  intervalDays?: number;

  @ApiPropertyOptional({ description: 'Trigger mileage interval in km' })
  @IsOptional()
  @IsInt()
  @Min(1)
  intervalOdometerKm?: number;

  @ApiPropertyOptional({
    description: 'Default priority',
    enum: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'],
  })
  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'CRITICAL'])
  defaultPriority?: MaintenancePriority;

  @ApiPropertyOptional({ description: 'Blocks operation when due' })
  @IsOptional()
  @IsBoolean()
  blocksOperationWhenDue?: boolean;

  @ApiProperty({ description: 'Current version for optimistic locking' })
  @IsInt()
  @Min(1)
  version!: number;
}

export class ListMaintenancePlansQueryDto {
  @ApiPropertyOptional({ description: 'Filter by status', enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'] })
  @IsOptional()
  @IsIn(['DRAFT', 'ACTIVE', 'ARCHIVED'])
  status?: MaintenancePlanStatus;

  @ApiPropertyOptional({ description: 'Search plan name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

// ---------------------------------------------------------------------
// Vehicle Maintenance Schedule DTOs
// ---------------------------------------------------------------------

export class CreateMaintenanceScheduleDto {
  @ApiProperty({ description: 'Vehicle ID' })
  @IsUUID('4')
  vehicleId!: string;

  @ApiProperty({ description: 'Active Maintenance Plan ID' })
  @IsUUID('4')
  maintenancePlanId!: string;
}

export class ListMaintenanceSchedulesQueryDto {
  @ApiPropertyOptional({ description: 'Filter by vehicle ID' })
  @IsOptional()
  @IsUUID('4')
  vehicleId?: string;

  @ApiPropertyOptional({ description: 'Filter by maintenance plan ID' })
  @IsOptional()
  @IsUUID('4')
  maintenancePlanId?: string;

  @ApiPropertyOptional({
    description: 'Filter by due status',
    enum: ['UPCOMING', 'DUE', 'OVERDUE'],
  })
  @IsOptional()
  @IsIn(['UPCOMING', 'DUE', 'OVERDUE'])
  dueState?: ScheduleDueState;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

// ---------------------------------------------------------------------
// Maintenance Vendor DTOs
// ---------------------------------------------------------------------

export class CreateMaintenanceVendorDto {
  @ApiProperty({ description: 'Vendor/Shop name', example: 'Downtown Fleet Repairs' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: 'Primary contact representative' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactName?: string;

  @ApiPropertyOptional({ description: 'Contact phone number' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ description: 'Contact email' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional({ description: 'Vendor service notes or contract details' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateMaintenanceVendorDto {
  @ApiPropertyOptional({ description: 'Updated vendor name' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: 'Updated contact name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactName?: string;

  @ApiPropertyOptional({ description: 'Updated phone' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ description: 'Updated email' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional({ description: 'Updated notes' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ description: 'Vendor operational status', enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: MaintenanceVendorStatus;

  @ApiProperty({ description: 'Current record version for optimistic locking' })
  @IsInt()
  @Min(1)
  version!: number;
}

export class ListMaintenanceVendorsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by vendor status', enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: MaintenanceVendorStatus;

  @ApiPropertyOptional({ description: 'Search vendor name or contact' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

// ---------------------------------------------------------------------
// Maintenance Work Order DTOs
// ---------------------------------------------------------------------

export class CreateMaintenanceWorkOrderDto {
  @ApiProperty({ description: 'Target vehicle ID' })
  @IsUUID('4')
  vehicleId!: string;

  @ApiPropertyOptional({ description: 'Associated Maintenance Request ID' })
  @IsOptional()
  @IsUUID('4')
  maintenanceRequestId?: string;

  @ApiPropertyOptional({ description: 'Associated Vehicle Maintenance Schedule ID' })
  @IsOptional()
  @IsUUID('4')
  maintenanceScheduleId?: string;

  @ApiPropertyOptional({ description: 'Assigned vendor ID' })
  @IsOptional()
  @IsUUID('4')
  vendorId?: string;

  @ApiProperty({ description: 'Work Order Title', example: 'Replace Front Brake Pads and Rotors' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'Work order details and scope of work' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Work order priority',
    enum: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'],
    default: 'NORMAL',
  })
  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'CRITICAL'])
  priority?: MaintenancePriority;

  @ApiPropertyOptional({
    description: 'Whether work order operationally blocks vehicle from dispatch',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  blocksOperation?: boolean;
}

export class UpdateMaintenanceWorkOrderDto {
  @ApiPropertyOptional({ description: 'Assigned vendor ID' })
  @IsOptional()
  @IsUUID('4')
  vendorId?: string;

  @ApiPropertyOptional({ description: 'Updated title' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Updated description' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Updated priority',
    enum: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'],
  })
  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'CRITICAL'])
  priority?: MaintenancePriority;

  @ApiPropertyOptional({ description: 'Updated operational blocking flag' })
  @IsOptional()
  @IsBoolean()
  blocksOperation?: boolean;

  @ApiProperty({ description: 'Current record version for optimistic locking' })
  @IsInt()
  @Min(1)
  version!: number;
}

export class CompleteMaintenanceWorkOrderDto {
  @ApiProperty({
    description: 'Mandatory completion summary notes',
    example: 'Brake pads replaced; road tested OK.',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  completionNotes!: string;

  @ApiPropertyOptional({
    description: 'Vehicle odometer reading upon work order completion in km',
    example: 45200,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  odometerAtCompletion?: number;

  @ApiProperty({ description: 'Current record version' })
  @IsInt()
  @Min(1)
  version!: number;
}

export class CancelMaintenanceWorkOrderDto {
  @ApiProperty({
    description: 'Mandatory reason for cancellation',
    example: 'Work postponed by management',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  cancelReason!: string;

  @ApiProperty({ description: 'Current record version' })
  @IsInt()
  @Min(1)
  version!: number;
}

export class ListMaintenanceWorkOrdersQueryDto {
  @ApiPropertyOptional({ description: 'Filter by vehicle ID' })
  @IsOptional()
  @IsUUID('4')
  vehicleId?: string;

  @ApiPropertyOptional({
    description: 'Filter by work order status',
    enum: ['DRAFT', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  })
  @IsOptional()
  @IsIn(['DRAFT', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
  status?: MaintenanceWorkOrderStatus;

  @ApiPropertyOptional({
    description: 'Filter by priority',
    enum: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'],
  })
  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'CRITICAL'])
  priority?: MaintenancePriority;

  @ApiPropertyOptional({ description: 'Filter by assigned vendor ID' })
  @IsOptional()
  @IsUUID('4')
  vendorId?: string;

  @ApiPropertyOptional({ description: 'Search title, description, or display ID' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

// ---------------------------------------------------------------------
// Tasks, Parts, Labor DTOs
// ---------------------------------------------------------------------

export class AddWorkOrderTaskDto {
  @ApiProperty({ description: 'Task description', example: 'Inspect front brake rotor thickness' })
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  description!: string;

  @ApiPropertyOptional({
    description: 'Initial task status',
    enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'],
    default: 'PENDING',
  })
  @IsOptional()
  @IsIn(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'])
  status?: WorkOrderTaskStatus;

  @ApiPropertyOptional({ description: 'Order index for display' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Optional technician notes' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateWorkOrderTaskDto {
  @ApiPropertyOptional({ description: 'Updated description' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Task status',
    enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'],
  })
  @IsOptional()
  @IsIn(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'])
  status?: WorkOrderTaskStatus;

  @ApiPropertyOptional({ description: 'Order index' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class AddWorkOrderPartDto {
  @ApiProperty({ description: 'Part description', example: 'Semi-Metallic Front Brake Pad Set' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  description!: string;

  @ApiPropertyOptional({ description: 'OEM or manufacturer part number', example: 'BRK-55210-A' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  partNumber?: string;

  @ApiProperty({ description: 'Quantity used', example: 1 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity!: number;

  @ApiProperty({ description: 'Cost per unit in currency units', example: 75.5 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost!: number;
}

export class AddWorkOrderLaborDto {
  @ApiProperty({
    description: 'Labor operation description',
    example: 'Brake pad replacement and brake bleed',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  description!: string;

  @ApiProperty({ description: 'Billed labor hours', example: 1.5 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  hours!: number;

  @ApiProperty({ description: 'Hourly rate in currency units', example: 95.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  hourlyRate!: number;

  @ApiPropertyOptional({ description: 'Technician name or identifier' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  technicianName?: string;
}
