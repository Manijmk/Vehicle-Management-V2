import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ExpenseStatus, FuelQuantityUnit, FuelTransactionStatus, FuelType } from '@vms/database';

export class CreateFuelTransactionDto {
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  tripId?: string;

  @IsDateString()
  occurredAt!: string;

  @IsIn(Object.values(FuelType))
  energyType!: FuelType;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsOptional()
  @IsIn(Object.values(FuelQuantityUnit))
  quantityUnit?: FuelQuantityUnit;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalAmount?: number;

  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'currencyCode must be a 3-letter ISO code' })
  currencyCode!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  odometerKm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  stationName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNumber?: string;
}

export class VoidFuelTransactionDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ListFuelTransactionsQueryDto {
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  tripId?: string;

  @IsOptional()
  @IsIn(Object.values(FuelTransactionStatus))
  status?: FuelTransactionStatus;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  hasAnomalies?: boolean;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class ImportFuelCsvDto {
  @IsString()
  @IsNotEmpty()
  csvContent!: string;
}

export class CreateExpenseDto {
  @IsUUID()
  categoryId!: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  tripId?: string;

  @IsOptional()
  @IsUUID()
  maintenanceWorkOrderId?: string;

  @IsDateString()
  occurredAt!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'currencyCode must be a 3-letter ISO code' })
  currencyCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  vendorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNumber?: string;

  @IsOptional()
  @IsIn([ExpenseStatus.DRAFT, ExpenseStatus.POSTED])
  status?: ExpenseStatus;
}

export class UpdateExpenseDraftDto {
  @IsOptional()
  @IsInt()
  version?: number;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string | null;

  @IsOptional()
  @IsUUID()
  driverId?: string | null;

  @IsOptional()
  @IsUUID()
  tripId?: string | null;

  @IsOptional()
  @IsUUID()
  maintenanceWorkOrderId?: string | null;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'currencyCode must be a 3-letter ISO code' })
  currencyCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  vendorName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNumber?: string | null;
}

export class VoidExpenseDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ListExpensesQueryDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  tripId?: string;

  @IsOptional()
  @IsUUID()
  maintenanceWorkOrderId?: string;

  @IsOptional()
  @IsIn(Object.values(ExpenseStatus))
  status?: ExpenseStatus;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class CreateExpenseCategoryDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9_]{2,50}$/, {
    message: 'Code must be 2-50 uppercase alphanumeric characters or underscores',
  })
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateExpenseCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class FinanceSummaryQueryDto {
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;
}
