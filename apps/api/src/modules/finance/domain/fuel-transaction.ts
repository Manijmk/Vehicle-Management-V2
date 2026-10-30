import {
  FuelQuantityUnit,
  FuelTransactionSource,
  FuelTransactionStatus,
  type FuelType,
} from '@vms/database';
import {
  FuelTransactionAlreadyVoidedError,
  InvalidFuelTransactionStateError,
} from './finance-errors.js';
import {
  assertValidCurrencyCode,
  calculateFuelTotalAmount,
  isAmountWithinTolerance,
  roundTo2Decimals,
  roundTo3Decimals,
  roundTo4Decimals,
} from './money.js';

export interface FuelReceiptInfo {
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface CreateFuelTransactionParams {
  id: string;
  organizationId: string;
  displayId: string;
  vehicleId: string;
  driverId?: string | null | undefined;
  tripId?: string | null | undefined;
  occurredAt: Date;
  energyType: FuelType;
  quantity: number;
  quantityUnit?: FuelQuantityUnit | undefined;
  unitPrice: number;
  totalAmount?: number | null | undefined;
  currencyCode: string;
  odometerKm?: number | null | undefined;
  stationName?: string | null | undefined;
  referenceNumber?: string | null | undefined;
  source?: FuelTransactionSource | undefined;
  receipt?: FuelReceiptInfo | null | undefined;
  importBatchId?: string | null | undefined;
  createdById: string;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
  version?: number | undefined;
}

export interface ReconstituteFuelTransactionParams extends CreateFuelTransactionParams {
  status: FuelTransactionStatus;
  voidReason?: string | null;
  voidedAt?: Date | null;
  voidedBy?: string | null;
  updatedBy: string;
}

export class FuelTransaction {
  private _quantity: number;
  private _unitPrice: number;
  private _totalAmount: number;
  private _currencyCode: string;
  private _odometerKm: number | null;
  private _stationName: string | null;
  private _referenceNumber: string | null;
  private _status: FuelTransactionStatus;
  private _voidReason: string | null;
  private _voidedAt: Date | null;
  private _voidedBy: string | null;
  private _receipt: FuelReceiptInfo | null;
  private _version: number;
  private _updatedAt: Date;
  private _updatedBy: string;

  private constructor(
    public readonly id: string,
    public readonly organizationId: string,
    public readonly displayId: string,
    public readonly vehicleId: string,
    public readonly driverId: string | null,
    public readonly tripId: string | null,
    public readonly occurredAt: Date,
    public readonly energyType: FuelType,
    quantity: number,
    public readonly quantityUnit: FuelQuantityUnit,
    unitPrice: number,
    totalAmount: number,
    currencyCode: string,
    odometerKm: number | null,
    stationName: string | null,
    referenceNumber: string | null,
    public readonly source: FuelTransactionSource,
    status: FuelTransactionStatus,
    voidReason: string | null,
    voidedAt: Date | null,
    voidedBy: string | null,
    receipt: FuelReceiptInfo | null,
    public readonly importBatchId: string | null,
    public readonly createdById: string,
    public readonly createdAt: Date,
    updatedAt: Date,
    updatedBy: string,
    version: number,
  ) {
    this._quantity = quantity;
    this._unitPrice = unitPrice;
    this._totalAmount = totalAmount;
    this._currencyCode = currencyCode;
    this._odometerKm = odometerKm;
    this._stationName = stationName;
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

  public static create(params: CreateFuelTransactionParams): FuelTransaction {
    if (params.quantity <= 0) {
      throw new InvalidFuelTransactionStateError('Fuel quantity must be greater than 0');
    }
    if (params.unitPrice < 0) {
      throw new InvalidFuelTransactionStateError('Fuel unit price cannot be negative');
    }

    const roundedQuantity = roundTo3Decimals(params.quantity);
    const roundedUnitPrice = roundTo4Decimals(params.unitPrice);
    const calculatedTotal = calculateFuelTotalAmount(roundedQuantity, roundedUnitPrice);

    let finalTotal = calculatedTotal;
    if (params.totalAmount !== undefined && params.totalAmount !== null) {
      const roundedProvidedTotal = roundTo2Decimals(params.totalAmount);
      if (roundedProvidedTotal < 0) {
        throw new InvalidFuelTransactionStateError('Total amount cannot be negative');
      }
      if (!isAmountWithinTolerance(calculatedTotal, roundedProvidedTotal, 0.05)) {
        throw new InvalidFuelTransactionStateError(
          `Provided total amount ${roundedProvidedTotal} differs significantly from calculated ${calculatedTotal} (quantity * unitPrice)`,
        );
      }
      finalTotal = roundedProvidedTotal;
    }

    const validatedCurrency = assertValidCurrencyCode(params.currencyCode);

    let validatedOdometer: number | null = null;
    if (params.odometerKm !== undefined && params.odometerKm !== null) {
      if (!Number.isInteger(params.odometerKm) || params.odometerKm < 0) {
        throw new InvalidFuelTransactionStateError('Odometer must be a non-negative integer');
      }
      validatedOdometer = params.odometerKm;
    }

    const now = params.createdAt ?? new Date();

    return new FuelTransaction(
      params.id,
      params.organizationId,
      params.displayId,
      params.vehicleId,
      params.driverId ?? null,
      params.tripId ?? null,
      params.occurredAt,
      params.energyType,
      roundedQuantity,
      params.quantityUnit ?? FuelQuantityUnit.LITER,
      roundedUnitPrice,
      finalTotal,
      validatedCurrency,
      validatedOdometer,
      params.stationName?.trim() || null,
      params.referenceNumber?.trim() || null,
      params.source ?? FuelTransactionSource.MANUAL,
      FuelTransactionStatus.POSTED,
      null,
      null,
      null,
      params.receipt ?? null,
      params.importBatchId ?? null,
      params.createdById,
      now,
      params.updatedAt ?? now,
      params.createdById,
      params.version ?? 1,
    );
  }

  public static reconstitute(params: ReconstituteFuelTransactionParams): FuelTransaction {
    return new FuelTransaction(
      params.id,
      params.organizationId,
      params.displayId,
      params.vehicleId,
      params.driverId ?? null,
      params.tripId ?? null,
      params.occurredAt,
      params.energyType,
      params.quantity,
      params.quantityUnit ?? FuelQuantityUnit.LITER,
      params.unitPrice,
      params.totalAmount ?? calculateFuelTotalAmount(params.quantity, params.unitPrice),
      params.currencyCode,
      params.odometerKm ?? null,
      params.stationName ?? null,
      params.referenceNumber ?? null,
      params.source ?? FuelTransactionSource.MANUAL,
      params.status,
      params.voidReason ?? null,
      params.voidedAt ?? null,
      params.voidedBy ?? null,
      params.receipt ?? null,
      params.importBatchId ?? null,
      params.createdById,
      params.createdAt ?? new Date(),
      params.updatedAt ?? new Date(),
      params.updatedBy,
      params.version ?? 1,
    );
  }

  public voidTransaction(reason: string, voidedBy: string, voidedAt = new Date()): void {
    if (this._status === FuelTransactionStatus.VOIDED) {
      throw new FuelTransactionAlreadyVoidedError(this.id);
    }
    const cleanReason = reason.trim();
    if (!cleanReason) {
      throw new InvalidFuelTransactionStateError(
        'A reason must be provided to void a fuel transaction',
      );
    }

    this._status = FuelTransactionStatus.VOIDED;
    this._voidReason = cleanReason;
    this._voidedAt = voidedAt;
    this._voidedBy = voidedBy;
    this._updatedAt = voidedAt;
    this._updatedBy = voidedBy;
    this._version += 1;
  }

  public attachReceipt(receipt: FuelReceiptInfo, updatedBy: string, updatedAt = new Date()): void {
    if (this._status === FuelTransactionStatus.VOIDED) {
      throw new FuelTransactionAlreadyVoidedError(this.id);
    }
    this._receipt = receipt;
    this._updatedAt = updatedAt;
    this._updatedBy = updatedBy;
    this._version += 1;
  }

  public detachReceipt(updatedBy: string, updatedAt = new Date()): void {
    if (this._status === FuelTransactionStatus.VOIDED) {
      throw new FuelTransactionAlreadyVoidedError(this.id);
    }
    this._receipt = null;
    this._updatedAt = updatedAt;
    this._updatedBy = updatedBy;
    this._version += 1;
  }

  public get quantity(): number {
    return this._quantity;
  }

  public get unitPrice(): number {
    return this._unitPrice;
  }

  public get totalAmount(): number {
    return this._totalAmount;
  }

  public get currencyCode(): string {
    return this._currencyCode;
  }

  public get odometerKm(): number | null {
    return this._odometerKm;
  }

  public get stationName(): string | null {
    return this._stationName;
  }

  public get referenceNumber(): string | null {
    return this._referenceNumber;
  }

  public get status(): FuelTransactionStatus {
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

  public get receipt(): FuelReceiptInfo | null {
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
