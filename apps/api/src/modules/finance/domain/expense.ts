import { ExpenseStatus } from '@vms/database';
import {
  ExpenseAlreadyPostedError,
  ExpenseAlreadyVoidedError,
  InvalidExpenseStateError,
} from './finance-errors.js';
import { assertValidCurrencyCode, roundTo2Decimals } from './money.js';

export interface ExpenseReceiptInfo {
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface CreateExpenseParams {
  id: string;
  organizationId: string;
  displayId: string;
  categoryId: string;
  vehicleId?: string | null | undefined;
  driverId?: string | null | undefined;
  tripId?: string | null | undefined;
  maintenanceWorkOrderId?: string | null | undefined;
  occurredAt: Date;
  description: string;
  amount: number;
  currencyCode: string;
  vendorName?: string | null | undefined;
  referenceNumber?: string | null | undefined;
  status?: ExpenseStatus | undefined;
  receipt?: ExpenseReceiptInfo | null | undefined;
  createdById: string;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
  version?: number | undefined;
}

export interface ReconstituteExpenseParams extends CreateExpenseParams {
  status: ExpenseStatus;
  voidReason?: string | null;
  voidedAt?: Date | null;
  voidedBy?: string | null;
  updatedBy: string;
}

export interface UpdateExpenseDraftParams {
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
  updatedBy: string;
  updatedAt?: Date | undefined;
}

export class Expense {
  private _categoryId: string;
  private _vehicleId: string | null;
  private _driverId: string | null;
  private _tripId: string | null;
  private _maintenanceWorkOrderId: string | null;
  private _occurredAt: Date;
  private _description: string;
  private _amount: number;
  private _currencyCode: string;
  private _vendorName: string | null;
  private _referenceNumber: string | null;
  private _status: ExpenseStatus;
  private _voidReason: string | null;
  private _voidedAt: Date | null;
  private _voidedBy: string | null;
  private _receipt: ExpenseReceiptInfo | null;
  private _updatedAt: Date;
  private _updatedBy: string;
  private _version: number;

  private constructor(
    public readonly id: string,
    public readonly organizationId: string,
    public readonly displayId: string,
    categoryId: string,
    vehicleId: string | null,
    driverId: string | null,
    tripId: string | null,
    maintenanceWorkOrderId: string | null,
    occurredAt: Date,
    description: string,
    amount: number,
    currencyCode: string,
    vendorName: string | null,
    referenceNumber: string | null,
    status: ExpenseStatus,
    voidReason: string | null,
    voidedAt: Date | null,
    voidedBy: string | null,
    receipt: ExpenseReceiptInfo | null,
    public readonly createdById: string,
    public readonly createdAt: Date,
    updatedAt: Date,
    updatedBy: string,
    version: number,
  ) {
    this._categoryId = categoryId;
    this._vehicleId = vehicleId;
    this._driverId = driverId;
    this._tripId = tripId;
    this._maintenanceWorkOrderId = maintenanceWorkOrderId;
    this._occurredAt = occurredAt;
    this._description = description;
    this._amount = amount;
    this._currencyCode = currencyCode;
    this._vendorName = vendorName;
    this._referenceNumber = referenceNumber;
    this._status = status;
    this._voidReason = voidReason;
    this._voidedAt = voidedAt;
    this._voidedBy = voidedBy;
    this._receipt = receipt;
    this._updatedAt = updatedAt;
    this._updatedBy = updatedBy;
    this._version = version;
  }

  public static create(params: CreateExpenseParams): Expense {
    if (params.amount <= 0) {
      throw new InvalidExpenseStateError('Expense amount must be greater than 0');
    }
    const roundedAmount = roundTo2Decimals(params.amount);
    const validatedCurrency = assertValidCurrencyCode(params.currencyCode);

    const cleanDescription = params.description.trim();
    if (!cleanDescription || cleanDescription.length > 500) {
      throw new InvalidExpenseStateError(
        'Expense description must be between 1 and 500 characters',
      );
    }

    const cleanVendor = params.vendorName?.trim() || null;
    if (cleanVendor && cleanVendor.length > 200) {
      throw new InvalidExpenseStateError('Vendor name cannot exceed 200 characters');
    }

    const cleanRef = params.referenceNumber?.trim() || null;
    if (cleanRef && cleanRef.length > 100) {
      throw new InvalidExpenseStateError('Reference number cannot exceed 100 characters');
    }

    const now = params.createdAt ?? new Date();

    return new Expense(
      params.id,
      params.organizationId,
      params.displayId,
      params.categoryId,
      params.vehicleId ?? null,
      params.driverId ?? null,
      params.tripId ?? null,
      params.maintenanceWorkOrderId ?? null,
      params.occurredAt,
      cleanDescription,
      roundedAmount,
      validatedCurrency,
      cleanVendor,
      cleanRef,
      params.status ?? ExpenseStatus.DRAFT,
      null,
      null,
      null,
      params.receipt ?? null,
      params.createdById,
      now,
      params.updatedAt ?? now,
      params.createdById,
      params.version ?? 1,
    );
  }

  public static reconstitute(params: ReconstituteExpenseParams): Expense {
    return new Expense(
      params.id,
      params.organizationId,
      params.displayId,
      params.categoryId,
      params.vehicleId ?? null,
      params.driverId ?? null,
      params.tripId ?? null,
      params.maintenanceWorkOrderId ?? null,
      params.occurredAt,
      params.description,
      params.amount,
      params.currencyCode,
      params.vendorName ?? null,
      params.referenceNumber ?? null,
      params.status,
      params.voidReason ?? null,
      params.voidedAt ?? null,
      params.voidedBy ?? null,
      params.receipt ?? null,
      params.createdById,
      params.createdAt ?? new Date(),
      params.updatedAt ?? new Date(),
      params.updatedBy,
      params.version ?? 1,
    );
  }

  public updateDraft(params: UpdateExpenseDraftParams): void {
    if (this._status === ExpenseStatus.POSTED) {
      throw new ExpenseAlreadyPostedError(this.id);
    }
    if (this._status === ExpenseStatus.VOIDED) {
      throw new ExpenseAlreadyVoidedError(this.id);
    }

    if (params.categoryId !== undefined) {
      this._categoryId = params.categoryId;
    }
    if (params.vehicleId !== undefined) {
      this._vehicleId = params.vehicleId;
    }
    if (params.driverId !== undefined) {
      this._driverId = params.driverId;
    }
    if (params.tripId !== undefined) {
      this._tripId = params.tripId;
    }
    if (params.maintenanceWorkOrderId !== undefined) {
      this._maintenanceWorkOrderId = params.maintenanceWorkOrderId;
    }
    if (params.occurredAt !== undefined) {
      this._occurredAt = params.occurredAt;
    }
    if (params.description !== undefined) {
      const cleanDesc = params.description.trim();
      if (!cleanDesc || cleanDesc.length > 500) {
        throw new InvalidExpenseStateError(
          'Expense description must be between 1 and 500 characters',
        );
      }
      this._description = cleanDesc;
    }
    if (params.amount !== undefined) {
      if (params.amount <= 0) {
        throw new InvalidExpenseStateError('Expense amount must be greater than 0');
      }
      this._amount = roundTo2Decimals(params.amount);
    }
    if (params.currencyCode !== undefined) {
      this._currencyCode = assertValidCurrencyCode(params.currencyCode);
    }
    if (params.vendorName !== undefined) {
      const cleanVendor = params.vendorName?.trim() || null;
      if (cleanVendor && cleanVendor.length > 200) {
        throw new InvalidExpenseStateError('Vendor name cannot exceed 200 characters');
      }
      this._vendorName = cleanVendor;
    }
    if (params.referenceNumber !== undefined) {
      const cleanRef = params.referenceNumber?.trim() || null;
      if (cleanRef && cleanRef.length > 100) {
        throw new InvalidExpenseStateError('Reference number cannot exceed 100 characters');
      }
      this._referenceNumber = cleanRef;
    }

    this._updatedAt = params.updatedAt ?? new Date();
    this._updatedBy = params.updatedBy;
    this._version += 1;
  }

  public post(postedBy: string, postedAt = new Date()): void {
    if (this._status === ExpenseStatus.POSTED) {
      return;
    }
    if (this._status === ExpenseStatus.VOIDED) {
      throw new ExpenseAlreadyVoidedError(this.id);
    }

    this._status = ExpenseStatus.POSTED;
    this._updatedAt = postedAt;
    this._updatedBy = postedBy;
    this._version += 1;
  }

  public voidExpense(reason: string, voidedBy: string, voidedAt = new Date()): void {
    if (this._status === ExpenseStatus.VOIDED) {
      throw new ExpenseAlreadyVoidedError(this.id);
    }
    const cleanReason = reason.trim();
    if (!cleanReason) {
      throw new InvalidExpenseStateError('A reason must be provided to void an expense');
    }

    this._status = ExpenseStatus.VOIDED;
    this._voidReason = cleanReason;
    this._voidedAt = voidedAt;
    this._voidedBy = voidedBy;
    this._updatedAt = voidedAt;
    this._updatedBy = voidedBy;
    this._version += 1;
  }

  public attachReceipt(
    receipt: ExpenseReceiptInfo,
    updatedBy: string,
    updatedAt = new Date(),
  ): void {
    if (this._status === ExpenseStatus.VOIDED) {
      throw new ExpenseAlreadyVoidedError(this.id);
    }
    this._receipt = receipt;
    this._updatedAt = updatedAt;
    this._updatedBy = updatedBy;
    this._version += 1;
  }

  public detachReceipt(updatedBy: string, updatedAt = new Date()): void {
    if (this._status === ExpenseStatus.VOIDED) {
      throw new ExpenseAlreadyVoidedError(this.id);
    }
    this._receipt = null;
    this._updatedAt = updatedAt;
    this._updatedBy = updatedBy;
    this._version += 1;
  }

  public get categoryId(): string {
    return this._categoryId;
  }

  public get vehicleId(): string | null {
    return this._vehicleId;
  }

  public get driverId(): string | null {
    return this._driverId;
  }

  public get tripId(): string | null {
    return this._tripId;
  }

  public get maintenanceWorkOrderId(): string | null {
    return this._maintenanceWorkOrderId;
  }

  public get occurredAt(): Date {
    return this._occurredAt;
  }

  public get description(): string {
    return this._description;
  }

  public get amount(): number {
    return this._amount;
  }

  public get currencyCode(): string {
    return this._currencyCode;
  }

  public get vendorName(): string | null {
    return this._vendorName;
  }

  public get referenceNumber(): string | null {
    return this._referenceNumber;
  }

  public get status(): ExpenseStatus {
    return this._status;
  }

  public get voidReason(): string | null {
    return this._voidReason;
  }

  public get voidedAt(): Date | null {
    return this._voidedAt;
  }

  public get voidedBy(): string | null {
    return this._voidedBy;
  }

  public get receipt(): ExpenseReceiptInfo | null {
    return this._receipt;
  }

  public get version(): number {
    return this._version;
  }

  public get updatedAt(): Date {
    return this._updatedAt;
  }

  public get updatedBy(): string {
    return this._updatedBy;
  }
}
