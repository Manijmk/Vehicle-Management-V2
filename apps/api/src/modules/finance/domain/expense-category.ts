import { ExpenseCategoryStatus } from '@vms/database';
import { InvalidExpenseStateError } from './finance-errors.js';

export interface CreateExpenseCategoryParams {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  description?: string | null | undefined;
  status?: ExpenseCategoryStatus | undefined;
  createdById: string;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
  version?: number | undefined;
}

export interface ReconstituteExpenseCategoryParams extends CreateExpenseCategoryParams {
  status: ExpenseCategoryStatus;
  updatedBy: string;
}

export class ExpenseCategory {
  private _name: string;
  private _description: string | null;
  private _status: ExpenseCategoryStatus;
  private _updatedAt: Date;
  private _updatedBy: string;
  private _version: number;

  private constructor(
    public readonly id: string,
    public readonly organizationId: string,
    public readonly code: string,
    name: string,
    description: string | null,
    status: ExpenseCategoryStatus,
    public readonly createdById: string,
    public readonly createdAt: Date,
    updatedAt: Date,
    updatedBy: string,
    version: number,
  ) {
    this._name = name;
    this._description = description;
    this._status = status;
    this._updatedAt = updatedAt;
    this._updatedBy = updatedBy;
    this._version = version;
  }

  public static create(params: CreateExpenseCategoryParams): ExpenseCategory {
    const cleanCode = params.code.trim().toUpperCase();
    if (!/^[A-Z0-9_]{2,50}$/.test(cleanCode)) {
      throw new InvalidExpenseStateError(
        `Expense category code '${params.code}' is invalid. Must be 2-50 uppercase alphanumeric characters or underscores`,
      );
    }

    const cleanName = params.name.trim();
    if (!cleanName || cleanName.length < 2 || cleanName.length > 100) {
      throw new InvalidExpenseStateError(
        'Expense category name must be between 2 and 100 characters',
      );
    }

    const cleanDescription = params.description?.trim() || null;
    if (cleanDescription && cleanDescription.length > 500) {
      throw new InvalidExpenseStateError(
        'Expense category description cannot exceed 500 characters',
      );
    }

    const now = params.createdAt ?? new Date();

    return new ExpenseCategory(
      params.id,
      params.organizationId,
      cleanCode,
      cleanName,
      cleanDescription,
      params.status ?? ExpenseCategoryStatus.ACTIVE,
      params.createdById,
      now,
      params.updatedAt ?? now,
      params.createdById,
      params.version ?? 1,
    );
  }

  public static reconstitute(params: ReconstituteExpenseCategoryParams): ExpenseCategory {
    return new ExpenseCategory(
      params.id,
      params.organizationId,
      params.code,
      params.name,
      params.description ?? null,
      params.status,
      params.createdById,
      params.createdAt ?? new Date(),
      params.updatedAt ?? new Date(),
      params.updatedBy,
      params.version ?? 1,
    );
  }

  public update(
    name: string,
    description: string | null | undefined,
    updatedBy: string,
    updatedAt = new Date(),
  ): void {
    const cleanName = name.trim();
    if (!cleanName || cleanName.length < 2 || cleanName.length > 100) {
      throw new InvalidExpenseStateError(
        'Expense category name must be between 2 and 100 characters',
      );
    }

    const cleanDescription = description?.trim() || null;
    if (cleanDescription && cleanDescription.length > 500) {
      throw new InvalidExpenseStateError(
        'Expense category description cannot exceed 500 characters',
      );
    }

    this._name = cleanName;
    this._description = cleanDescription;
    this._updatedAt = updatedAt;
    this._updatedBy = updatedBy;
    this._version += 1;
  }

  public archive(updatedBy: string, updatedAt = new Date()): void {
    if (this._status === ExpenseCategoryStatus.ARCHIVED) {
      return;
    }
    this._status = ExpenseCategoryStatus.ARCHIVED;
    this._updatedAt = updatedAt;
    this._updatedBy = updatedBy;
    this._version += 1;
  }

  public get name(): string {
    return this._name;
  }

  public get description(): string | null {
    return this._description;
  }

  public get status(): ExpenseCategoryStatus {
    return this._status;
  }

  public get updatedAt(): Date {
    return this._updatedAt;
  }

  public get updatedBy(): string {
    return this._updatedBy;
  }

  public get version(): number {
    return this._version;
  }
}
