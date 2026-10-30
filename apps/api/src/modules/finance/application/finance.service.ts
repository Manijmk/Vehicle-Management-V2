import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ExpenseCategoryStatus,
  ExpenseStatus,
  FuelQuantityUnit,
  FuelTransactionSource,
  type FuelType,
} from '@vms/database';
import { ApplicationError } from '../../foundation/domain/errors.js';
import type { ObjectStoragePort } from '../../compliance/application/object-storage.port.js';
import { OBJECT_STORAGE_PORT } from '../../compliance/compliance.tokens.js';
import { parseFuelCsv } from '../domain/csv-fuel-parser.js';
import { ExpenseCategory } from '../domain/expense-category.js';
import { Expense } from '../domain/expense.js';
import {
  ExpenseCategoryArchivedError,
  ExpenseCategoryDuplicateCodeError,
  ExpenseCategoryNotFoundError,
  ExpenseNotFoundError,
  FuelTransactionNotFoundError,
  ReceiptStorageError,
} from '../domain/finance-errors.js';
import { detectFuelAnomalies } from '../domain/fuel-anomaly-detector.js';
import { FuelTransaction } from '../domain/fuel-transaction.js';
import { FINANCE_REPOSITORY } from '../finance.tokens.js';
import type {
  ExpenseCategoryDetail,
  ExpenseDetail,
  FinanceMutationMetadata,
  FinanceRepository,
  FinanceSummaryResult,
  FuelTransactionDetail,
  ListExpensesFilter,
  ListFuelTransactionsFilter,
  TripFinanceSummaryResult,
  VehicleFinanceSummaryResult,
} from './finance.repository.js';

export interface CreateFuelTransactionInput {
  vehicleId?: string | undefined;
  driverId?: string | undefined;
  tripId?: string | undefined;
  occurredAt: Date;
  energyType: FuelType;
  quantity: number;
  quantityUnit?: FuelQuantityUnit | undefined;
  unitPrice: number;
  totalAmount?: number | undefined;
  currencyCode: string;
  odometerKm?: number | undefined;
  stationName?: string | undefined;
  referenceNumber?: string | undefined;
  source?: FuelTransactionSource | undefined;
}

export interface VoidFuelTransactionInput {
  reason: string;
}

export interface CreateExpenseInput {
  categoryId: string;
  vehicleId?: string | undefined;
  driverId?: string | undefined;
  tripId?: string | undefined;
  maintenanceWorkOrderId?: string | undefined;
  occurredAt: Date;
  description: string;
  amount: number;
  currencyCode: string;
  vendorName?: string | undefined;
  referenceNumber?: string | undefined;
  status?: ExpenseStatus | undefined; // DRAFT or POSTED
}

export interface UpdateExpenseDraftInput {
  categoryId?: string | undefined;
  vehicleId?: string | null | undefined;
  driverId?: string | null | undefined;
  tripId?: string | null | undefined;
  maintenanceWorkOrderId?: string | null | undefined;
  occurredAt?: Date | undefined;
  description?: string | undefined;
  amount?: number | undefined;
  currencyCode?: string | undefined;
  vendorName?: string | null | undefined;
  referenceNumber?: string | null | undefined;
}

export interface VoidExpenseInput {
  reason: string;
}

export interface CreateExpenseCategoryInput {
  code: string;
  name: string;
  description?: string | undefined;
}

export interface UpdateExpenseCategoryInput {
  name: string;
  description?: string | undefined;
}

export interface UploadReceiptFile {
  buffer: Buffer;
  originalname: string;
  mimetype?: string | undefined;
  size?: number | undefined;
}

const ALLOWED_RECEIPT_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const MAX_RECEIPT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    @Inject(FINANCE_REPOSITORY) private readonly repository: FinanceRepository,
    @Inject(OBJECT_STORAGE_PORT) private readonly objectStorage: ObjectStoragePort,
  ) {}

  // =========================================================================
  // Fuel Transactions
  // =========================================================================

  public async createFuelTransaction(
    organizationId: string,
    input: CreateFuelTransactionInput,
    metadata: FinanceMutationMetadata,
  ): Promise<FuelTransactionDetail> {
    let effectiveVehicleId = input.vehicleId;
    let effectiveDriverId = input.driverId;

    // Trip attribution
    if (input.tripId) {
      const trip = await this.repository.findTripById(organizationId, input.tripId);
      if (!trip) {
        throw new ApplicationError(
          'TRIP_NOT_FOUND',
          `Trip '${input.tripId}' was not found in this organization`,
        );
      }
      effectiveVehicleId = trip.vehicleId;
      effectiveDriverId = trip.driverId;
    }

    if (!effectiveVehicleId) {
      throw new ApplicationError(
        'VEHICLE_REQUIRED',
        'A vehicle or valid trip must be specified for a fuel transaction',
      );
    }

    const vehicle = await this.repository.findVehicleById(organizationId, effectiveVehicleId);
    if (!vehicle) {
      throw new ApplicationError(
        'VEHICLE_NOT_FOUND',
        `Vehicle '${effectiveVehicleId}' was not found in this organization`,
      );
    }

    if (effectiveDriverId) {
      const driver = await this.repository.findDriverById(organizationId, effectiveDriverId);
      if (!driver) {
        throw new ApplicationError(
          'DRIVER_NOT_FOUND',
          `Driver '${effectiveDriverId}' was not found in this organization`,
        );
      }
    }

    const displayId = await this.repository.allocateFuelDisplayId(organizationId);
    const fuelTransactionId = randomUUID();

    const entity = FuelTransaction.create({
      id: fuelTransactionId,
      organizationId,
      displayId,
      vehicleId: effectiveVehicleId,
      driverId: effectiveDriverId ?? null,
      tripId: input.tripId ?? null,
      occurredAt: input.occurredAt,
      energyType: input.energyType,
      quantity: input.quantity,
      quantityUnit: input.quantityUnit ?? FuelQuantityUnit.LITER,
      unitPrice: input.unitPrice,
      totalAmount: input.totalAmount ?? null,
      currencyCode: input.currencyCode,
      odometerKm: input.odometerKm ?? null,
      stationName: input.stationName ?? null,
      referenceNumber: input.referenceNumber ?? null,
      source: input.source ?? FuelTransactionSource.MANUAL,
      createdById: metadata.actorId,
    });

    // Detect anomalies
    const historicalContext = await this.repository.getHistoricalFuelContext(
      organizationId,
      effectiveVehicleId,
      input.referenceNumber ?? null,
      input.energyType,
      input.occurredAt,
    );

    const anomalies = detectFuelAnomalies(
      {
        occurredAt: entity.occurredAt,
        odometerKm: entity.odometerKm,
        referenceNumber: entity.referenceNumber,
        unitPrice: entity.unitPrice,
        quantity: entity.quantity,
        totalAmount: entity.totalAmount,
      },
      historicalContext,
    );

    return this.repository.saveFuelTransaction(
      entity,
      anomalies,
      metadata,
      'FuelTransactionCreated',
    );
  }

  public async getFuelTransaction(
    organizationId: string,
    id: string,
  ): Promise<FuelTransactionDetail> {
    const detail = await this.repository.findFuelTransactionById(organizationId, id);
    if (!detail) {
      throw new FuelTransactionNotFoundError(id);
    }
    return detail;
  }

  public async listFuelTransactions(
    organizationId: string,
    filter?: ListFuelTransactionsFilter,
  ): Promise<{ items: FuelTransactionDetail[]; total: number }> {
    return this.repository.listFuelTransactions(organizationId, filter);
  }

  public async voidFuelTransaction(
    organizationId: string,
    id: string,
    input: VoidFuelTransactionInput,
    metadata: FinanceMutationMetadata,
  ): Promise<FuelTransactionDetail> {
    const entity = await this.repository.findFuelTransactionEntityById(organizationId, id);
    if (!entity) {
      throw new FuelTransactionNotFoundError(id);
    }

    entity.voidTransaction(input.reason, metadata.actorId);

    return this.repository.saveFuelTransaction(entity, [], metadata, 'FuelTransactionVoided');
  }

  public async uploadFuelReceipt(
    organizationId: string,
    id: string,
    file: UploadReceiptFile,
    metadata: FinanceMutationMetadata,
  ): Promise<FuelTransactionDetail> {
    const entity = await this.repository.findFuelTransactionEntityById(organizationId, id);
    if (!entity) {
      throw new FuelTransactionNotFoundError(id);
    }

    this.validateReceiptFile(file);

    const ext = file.originalname.includes('.') ? file.originalname.split('.').pop() : 'bin';
    const objectKey = `tenants/${organizationId}/finance/fuel/${id}/${randomUUID()}.${ext}`;
    const contentType = file.mimetype || 'application/octet-stream';

    try {
      await this.objectStorage.putObject({
        objectKey,
        body: file.buffer,
        contentType,
      });
    } catch (err) {
      throw new ReceiptStorageError(`Failed to store fuel receipt file in S3: ${String(err)}`, err);
    }

    entity.attachReceipt(
      {
        storageKey: objectKey,
        fileName: file.originalname,
        contentType,
        sizeBytes: file.size || file.buffer.length,
      },
      metadata.actorId,
    );

    return this.repository.saveFuelTransaction(
      entity,
      [],
      metadata,
      'FuelTransactionReceiptUpdated',
    );
  }

  public async getFuelReceiptDownloadUrl(
    organizationId: string,
    id: string,
  ): Promise<{ url: string; fileName: string; contentType: string }> {
    const detail = await this.repository.findFuelTransactionById(organizationId, id);
    if (!detail) {
      throw new FuelTransactionNotFoundError(id);
    }
    if (!detail.receiptStorageKey) {
      throw new ApplicationError(
        'RECEIPT_NOT_FOUND',
        'This fuel transaction does not have an attached receipt',
      );
    }

    const url = await this.objectStorage.getSignedDownloadUrl({
      objectKey: detail.receiptStorageKey,
      expiresInSeconds: 900, // 15 minutes
    });

    return {
      url,
      fileName: detail.receiptFileName || 'receipt.pdf',
      contentType: detail.receiptContentType || 'application/pdf',
    };
  }

  // =========================================================================
  // CSV Fuel Import
  // =========================================================================

  public async importFuelCsvPreview(
    organizationId: string,
    csvContent: string,
  ): Promise<{
    totalRows: number;
    validCount: number;
    invalidCount: number;
    rows: Array<{
      rowNumber: number;
      date: string;
      registration: string;
      vehicleMatched: boolean;
      vehicleId?: string | undefined;
      vehicleDisplayId?: string | undefined;
      driverNumber?: string | undefined;
      driverMatched: boolean;
      driverId?: string | undefined;
      energyType: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      totalAmount: number;
      currency: string;
      odometerKm?: number | null | undefined;
      stationName?: string | null | undefined;
      referenceNumber?: string | null | undefined;
      errors: string[];
    }>;
  }> {
    const parsed = parseFuelCsv(csvContent);

    const previewRows = [];
    let validCount = 0;
    let invalidCount = 0;

    for (const row of parsed.validRows) {
      const rowErrors: string[] = [];
      const vehicle = await this.repository.findVehicleByRegistration(
        organizationId,
        row.registration,
      );
      if (!vehicle) {
        rowErrors.push(
          `Vehicle registration '${row.registration}' does not exist in this organization`,
        );
      }

      let driverId: string | undefined = undefined;
      let driverMatched = false;
      if (row.driverNumber) {
        const driver = await this.repository.findDriverByNumberOrDisplayId(
          organizationId,
          row.driverNumber,
        );
        if (driver) {
          driverId = driver.id;
          driverMatched = true;
        } else {
          rowErrors.push(`Driver '${row.driverNumber}' not found in this organization`);
        }
      }

      if (rowErrors.length > 0) {
        invalidCount++;
      } else {
        validCount++;
      }

      previewRows.push({
        rowNumber: row.rowNumber,
        date: row.date.toISOString(),
        registration: row.registration,
        vehicleMatched: !!vehicle,
        vehicleId: vehicle?.id,
        vehicleDisplayId: vehicle?.displayId,
        driverNumber: row.driverNumber ?? undefined,
        driverMatched,
        driverId,
        energyType: row.energyType,
        quantity: row.quantity,
        unit: row.unit,
        unitPrice: row.unitPrice,
        totalAmount: row.totalAmount,
        currency: row.currency,
        odometerKm: row.odometerKm,
        stationName: row.stationName,
        referenceNumber: row.referenceNumber,
        errors: rowErrors,
      });
    }

    for (const err of parsed.errors) {
      invalidCount++;
      previewRows.push({
        rowNumber: err.row,
        date: '',
        registration: '',
        vehicleMatched: false,
        driverMatched: false,
        energyType: '',
        quantity: 0,
        unit: '',
        unitPrice: 0,
        totalAmount: 0,
        currency: '',
        errors: [err.message],
      });
    }

    previewRows.sort((a, b) => a.rowNumber - b.rowNumber);

    return {
      totalRows: parsed.totalRows,
      validCount,
      invalidCount,
      rows: previewRows,
    };
  }

  public async importFuelCsvConfirm(
    organizationId: string,
    csvContent: string,
    metadata: FinanceMutationMetadata,
  ): Promise<{
    importedCount: number;
    failedCount: number;
    createdTransactions: FuelTransactionDetail[];
    errors: Array<{ row: number; error: string }>;
  }> {
    const preview = await this.importFuelCsvPreview(organizationId, csvContent);
    const createdTransactions: FuelTransactionDetail[] = [];
    const errors: Array<{ row: number; error: string }> = [];

    for (const row of preview.rows) {
      if (row.errors.length > 0) {
        errors.push({ row: row.rowNumber, error: row.errors.join('; ') });
        continue;
      }

      try {
        const created = await this.createFuelTransaction(
          organizationId,
          {
            vehicleId: row.vehicleId!,
            driverId: row.driverId,
            occurredAt: new Date(row.date),
            energyType: row.energyType as FuelType,
            quantity: row.quantity,
            quantityUnit: row.unit as FuelQuantityUnit,
            unitPrice: row.unitPrice,
            totalAmount: row.totalAmount,
            currencyCode: row.currency,
            odometerKm: row.odometerKm ?? undefined,
            stationName: row.stationName ?? undefined,
            referenceNumber: row.referenceNumber ?? undefined,
            source: FuelTransactionSource.CSV_IMPORT,
          },
          metadata,
        );
        createdTransactions.push(created);
      } catch (err) {
        errors.push({
          row: row.rowNumber,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      importedCount: createdTransactions.length,
      failedCount: errors.length,
      createdTransactions,
      errors,
    };
  }

  // =========================================================================
  // Expenses
  // =========================================================================

  public async createExpense(
    organizationId: string,
    input: CreateExpenseInput,
    metadata: FinanceMutationMetadata,
  ): Promise<ExpenseDetail> {
    const category = await this.repository.findExpenseCategoryById(
      organizationId,
      input.categoryId,
    );
    if (!category) {
      throw new ExpenseCategoryNotFoundError(input.categoryId);
    }
    if (category.status === ExpenseCategoryStatus.ARCHIVED) {
      throw new ExpenseCategoryArchivedError(category.code);
    }

    let effectiveVehicleId = input.vehicleId;
    let effectiveDriverId = input.driverId;

    // Trip attribution
    if (input.tripId) {
      const trip = await this.repository.findTripById(organizationId, input.tripId);
      if (!trip) {
        throw new ApplicationError(
          'TRIP_NOT_FOUND',
          `Trip '${input.tripId}' was not found in this organization`,
        );
      }
      effectiveVehicleId = trip.vehicleId;
      effectiveDriverId = trip.driverId;
    }

    // Work Order attribution
    if (input.maintenanceWorkOrderId) {
      const wo = await this.repository.findWorkOrderById(
        organizationId,
        input.maintenanceWorkOrderId,
      );
      if (!wo) {
        throw new ApplicationError(
          'WORK_ORDER_NOT_FOUND',
          `Maintenance work order '${input.maintenanceWorkOrderId}' was not found in this organization`,
        );
      }
      if (!effectiveVehicleId) {
        effectiveVehicleId = wo.vehicleId;
      }
    }

    if (effectiveVehicleId) {
      const vehicle = await this.repository.findVehicleById(organizationId, effectiveVehicleId);
      if (!vehicle) {
        throw new ApplicationError(
          'VEHICLE_NOT_FOUND',
          `Vehicle '${effectiveVehicleId}' was not found in this organization`,
        );
      }
    }

    if (effectiveDriverId) {
      const driver = await this.repository.findDriverById(organizationId, effectiveDriverId);
      if (!driver) {
        throw new ApplicationError(
          'DRIVER_NOT_FOUND',
          `Driver '${effectiveDriverId}' was not found in this organization`,
        );
      }
    }

    const displayId = await this.repository.allocateExpenseDisplayId(organizationId);
    const expenseId = randomUUID();

    const entity = Expense.create({
      id: expenseId,
      organizationId,
      displayId,
      categoryId: input.categoryId,
      vehicleId: effectiveVehicleId ?? null,
      driverId: effectiveDriverId ?? null,
      tripId: input.tripId ?? null,
      maintenanceWorkOrderId: input.maintenanceWorkOrderId ?? null,
      occurredAt: input.occurredAt,
      description: input.description,
      amount: input.amount,
      currencyCode: input.currencyCode,
      vendorName: input.vendorName ?? null,
      referenceNumber: input.referenceNumber ?? null,
      status: input.status ?? ExpenseStatus.DRAFT,
      createdById: metadata.actorId,
    });

    const eventType = entity.status === ExpenseStatus.POSTED ? 'ExpensePosted' : 'ExpenseCreated';

    return this.repository.saveExpense(entity, metadata, eventType);
  }

  public async getExpense(organizationId: string, id: string): Promise<ExpenseDetail> {
    const detail = await this.repository.findExpenseById(organizationId, id);
    if (!detail) {
      throw new ExpenseNotFoundError(id);
    }
    return detail;
  }

  public async listExpenses(
    organizationId: string,
    filter?: ListExpensesFilter,
  ): Promise<{ items: ExpenseDetail[]; total: number }> {
    return this.repository.listExpenses(organizationId, filter);
  }

  public async updateExpenseDraft(
    organizationId: string,
    id: string,
    input: UpdateExpenseDraftInput,
    metadata: FinanceMutationMetadata,
  ): Promise<ExpenseDetail> {
    const entity = await this.repository.findExpenseEntityById(organizationId, id);
    if (!entity) {
      throw new ExpenseNotFoundError(id);
    }

    if (input.categoryId && input.categoryId !== entity.categoryId) {
      const category = await this.repository.findExpenseCategoryById(
        organizationId,
        input.categoryId,
      );
      if (!category) {
        throw new ExpenseCategoryNotFoundError(input.categoryId);
      }
      if (category.status === ExpenseCategoryStatus.ARCHIVED) {
        throw new ExpenseCategoryArchivedError(category.code);
      }
    }

    let effectiveVehicleId = input.vehicleId;
    let effectiveDriverId = input.driverId;

    if (input.tripId) {
      const trip = await this.repository.findTripById(organizationId, input.tripId);
      if (!trip) {
        throw new ApplicationError(
          'TRIP_NOT_FOUND',
          `Trip '${input.tripId}' was not found in this organization`,
        );
      }
      effectiveVehicleId = trip.vehicleId;
      effectiveDriverId = trip.driverId;
    }

    entity.updateDraft({
      ...input,
      vehicleId: effectiveVehicleId,
      driverId: effectiveDriverId,
      updatedBy: metadata.actorId,
    });

    return this.repository.saveExpense(entity, metadata, 'ExpenseUpdated');
  }

  public async postExpense(
    organizationId: string,
    id: string,
    metadata: FinanceMutationMetadata,
  ): Promise<ExpenseDetail> {
    const entity = await this.repository.findExpenseEntityById(organizationId, id);
    if (!entity) {
      throw new ExpenseNotFoundError(id);
    }

    entity.post(metadata.actorId);

    return this.repository.saveExpense(entity, metadata, 'ExpensePosted');
  }

  public async voidExpense(
    organizationId: string,
    id: string,
    input: VoidExpenseInput,
    metadata: FinanceMutationMetadata,
  ): Promise<ExpenseDetail> {
    const entity = await this.repository.findExpenseEntityById(organizationId, id);
    if (!entity) {
      throw new ExpenseNotFoundError(id);
    }

    entity.voidExpense(input.reason, metadata.actorId);

    return this.repository.saveExpense(entity, metadata, 'ExpenseVoided');
  }

  public async uploadExpenseReceipt(
    organizationId: string,
    id: string,
    file: UploadReceiptFile,
    metadata: FinanceMutationMetadata,
  ): Promise<ExpenseDetail> {
    const entity = await this.repository.findExpenseEntityById(organizationId, id);
    if (!entity) {
      throw new ExpenseNotFoundError(id);
    }

    this.validateReceiptFile(file);

    const ext = file.originalname.includes('.') ? file.originalname.split('.').pop() : 'bin';
    const objectKey = `tenants/${organizationId}/finance/expenses/${id}/${randomUUID()}.${ext}`;
    const contentType = file.mimetype || 'application/octet-stream';

    try {
      await this.objectStorage.putObject({
        objectKey,
        body: file.buffer,
        contentType,
      });
    } catch (err) {
      throw new ReceiptStorageError(`Failed to store expense receipt in S3: ${String(err)}`, err);
    }

    entity.attachReceipt(
      {
        storageKey: objectKey,
        fileName: file.originalname,
        contentType,
        sizeBytes: file.size || file.buffer.length,
      },
      metadata.actorId,
    );

    return this.repository.saveExpense(entity, metadata, 'ExpenseReceiptUpdated');
  }

  public async getExpenseReceiptDownloadUrl(
    organizationId: string,
    id: string,
  ): Promise<{ url: string; fileName: string; contentType: string }> {
    const detail = await this.repository.findExpenseById(organizationId, id);
    if (!detail) {
      throw new ExpenseNotFoundError(id);
    }
    if (!detail.receiptStorageKey) {
      throw new ApplicationError(
        'RECEIPT_NOT_FOUND',
        'This expense does not have an attached receipt',
      );
    }

    const url = await this.objectStorage.getSignedDownloadUrl({
      objectKey: detail.receiptStorageKey,
      expiresInSeconds: 900,
    });

    return {
      url,
      fileName: detail.receiptFileName || 'receipt.pdf',
      contentType: detail.receiptContentType || 'application/pdf',
    };
  }

  // =========================================================================
  // Expense Categories
  // =========================================================================

  public async createExpenseCategory(
    organizationId: string,
    input: CreateExpenseCategoryInput,
    metadata: FinanceMutationMetadata,
  ): Promise<ExpenseCategoryDetail> {
    const existing = await this.repository.findExpenseCategoryByCode(
      organizationId,
      input.code.trim().toUpperCase(),
    );
    if (existing) {
      throw new ExpenseCategoryDuplicateCodeError(input.code);
    }

    const entity = ExpenseCategory.create({
      id: randomUUID(),
      organizationId,
      code: input.code,
      name: input.name,
      description: input.description,
      createdById: metadata.actorId,
    });

    return this.repository.saveExpenseCategory(entity, metadata, 'ExpenseCategoryCreated');
  }

  public async updateExpenseCategory(
    organizationId: string,
    id: string,
    input: UpdateExpenseCategoryInput,
    metadata: FinanceMutationMetadata,
  ): Promise<ExpenseCategoryDetail> {
    const entity = await this.repository.findExpenseCategoryById(organizationId, id);
    if (!entity) {
      throw new ExpenseCategoryNotFoundError(id);
    }

    entity.update(input.name, input.description, metadata.actorId);

    return this.repository.saveExpenseCategory(entity, metadata, 'ExpenseCategoryUpdated');
  }

  public async archiveExpenseCategory(
    organizationId: string,
    id: string,
    metadata: FinanceMutationMetadata,
  ): Promise<ExpenseCategoryDetail> {
    const entity = await this.repository.findExpenseCategoryById(organizationId, id);
    if (!entity) {
      throw new ExpenseCategoryNotFoundError(id);
    }

    entity.archive(metadata.actorId);

    return this.repository.saveExpenseCategory(entity, metadata, 'ExpenseCategoryArchived');
  }

  public async listExpenseCategories(
    organizationId: string,
    includeArchived?: boolean,
  ): Promise<ExpenseCategoryDetail[]> {
    return this.repository.listExpenseCategories(organizationId, includeArchived);
  }

  // =========================================================================
  // Summaries & Analytics
  // =========================================================================

  public async getFinanceSummary(
    organizationId: string,
    filter?: { fromDate?: Date | undefined; toDate?: Date | undefined } | undefined,
  ): Promise<FinanceSummaryResult> {
    return this.repository.getFinanceSummary(organizationId, filter);
  }

  public async getVehicleFinanceSummary(
    organizationId: string,
    vehicleId: string,
  ): Promise<VehicleFinanceSummaryResult> {
    const vehicle = await this.repository.findVehicleById(organizationId, vehicleId);
    if (!vehicle) {
      throw new ApplicationError(
        'VEHICLE_NOT_FOUND',
        `Vehicle '${vehicleId}' was not found in this organization`,
      );
    }
    return this.repository.getVehicleFinanceSummary(organizationId, vehicleId);
  }

  public async getTripFinanceSummary(
    organizationId: string,
    tripId: string,
  ): Promise<TripFinanceSummaryResult> {
    const trip = await this.repository.findTripById(organizationId, tripId);
    if (!trip) {
      throw new ApplicationError(
        'TRIP_NOT_FOUND',
        `Trip '${tripId}' was not found in this organization`,
      );
    }
    return this.repository.getTripFinanceSummary(organizationId, tripId);
  }

  private validateReceiptFile(file: UploadReceiptFile): void {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new ApplicationError('FILE_EMPTY', 'Uploaded receipt file cannot be empty');
    }
    const size = file.size || file.buffer.length;
    if (size > MAX_RECEIPT_SIZE_BYTES) {
      throw new ApplicationError(
        'FILE_TOO_LARGE',
        `File size (${Math.round(size / 1024 / 1024)}MB) exceeds maximum allowed size of 10MB`,
      );
    }
    if (file.mimetype && !ALLOWED_RECEIPT_MIME_TYPES.has(file.mimetype)) {
      throw new ApplicationError(
        'UNSUPPORTED_FILE_TYPE',
        `MIME type '${file.mimetype}' is not supported. Allowed types: PDF, JPEG, PNG, WEBP`,
      );
    }
  }
}
