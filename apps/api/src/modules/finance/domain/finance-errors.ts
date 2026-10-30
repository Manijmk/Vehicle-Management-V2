import type { ApplicationErrorCode } from '../../foundation/domain/errors.js';
import { ApplicationError } from '../../foundation/domain/errors.js';

export class FinanceError extends ApplicationError {
  constructor(code: ApplicationErrorCode, message: string, details?: unknown) {
    super(code, message, details);
    this.name = 'FinanceError';
  }
}

export class FuelTransactionNotFoundError extends FinanceError {
  constructor(id: string) {
    super('FUEL_TRANSACTION_NOT_FOUND', `Fuel transaction '${id}' was not found`);
  }
}

export class FuelTransactionAlreadyVoidedError extends FinanceError {
  constructor(id: string) {
    super('FUEL_TRANSACTION_ALREADY_VOIDED', `Fuel transaction '${id}' is already voided`);
  }
}

export class InvalidFuelTransactionStateError extends FinanceError {
  constructor(message: string) {
    super('INVALID_FUEL_TRANSACTION_STATE', message);
  }
}

export class ExpenseNotFoundError extends FinanceError {
  constructor(id: string) {
    super('EXPENSE_NOT_FOUND', `Expense '${id}' was not found`);
  }
}

export class ExpenseAlreadyPostedError extends FinanceError {
  constructor(id: string) {
    super(
      'EXPENSE_ALREADY_POSTED',
      `Expense '${id}' is already posted and cannot be modified as draft`,
    );
  }
}

export class ExpenseAlreadyVoidedError extends FinanceError {
  constructor(id: string) {
    super('EXPENSE_ALREADY_VOIDED', `Expense '${id}' is already voided`);
  }
}

export class InvalidExpenseStateError extends FinanceError {
  constructor(message: string) {
    super('INVALID_EXPENSE_STATE', message);
  }
}

export class ExpenseCategoryNotFoundError extends FinanceError {
  constructor(identifier: string) {
    super('EXPENSE_CATEGORY_NOT_FOUND', `Expense category '${identifier}' was not found`);
  }
}

export class ExpenseCategoryDuplicateCodeError extends FinanceError {
  constructor(code: string) {
    super('EXPENSE_CATEGORY_DUPLICATE_CODE', `Expense category with code '${code}' already exists`);
  }
}

export class ExpenseCategoryArchivedError extends FinanceError {
  constructor(code: string) {
    super(
      'EXPENSE_CATEGORY_ARCHIVED',
      `Expense category '${code}' is archived and cannot receive new expenses`,
    );
  }
}

export class InvalidCurrencyCodeError extends FinanceError {
  constructor(code: string) {
    super(
      'INVALID_CURRENCY_CODE',
      `Currency code '${code}' is invalid. Expected 3 uppercase letters (ISO 4217)`,
    );
  }
}

export class CsvFuelImportError extends FinanceError {
  constructor(message: string, errors?: Array<{ row: number; column?: string; message: string }>) {
    super('CSV_FUEL_IMPORT_ERROR', message, errors);
  }
}

export class ReceiptStorageError extends FinanceError {
  constructor(message: string, original?: unknown) {
    super('RECEIPT_STORAGE_ERROR', message, original);
  }
}
