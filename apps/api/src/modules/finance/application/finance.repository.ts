import type {
  ExpenseCategoryStatus,
  ExpenseStatus,
  FuelAnomalyCode,
  FuelAnomalySeverity,
  FuelQuantityUnit,
  FuelTransactionSource,
  FuelTransactionStatus,
  FuelType,
} from '@vms/database';
import type { ExpenseCategory } from '../domain/expense-category.js';
import type { Expense } from '../domain/expense.js';
import type { FuelAnomalyItem, HistoricalFuelContext } from '../domain/fuel-anomaly-detector.js';
import type { FuelIntervalMetric, VehicleEfficiencySummary } from '../domain/fuel-metrics.js';
import type { FuelTransaction } from '../domain/fuel-transaction.js';

export interface FinanceMutationMetadata {
  actorId: string;
  requestId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface FuelAnomalyDetail {
  id: string;
  code: FuelAnomalyCode;
  severity: FuelAnomalySeverity;
  description: string;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
}

export interface FuelTransactionDetail {
  id: string;
  organizationId: string;
  displayId: string;
  vehicleId: string;
  vehicle: {
    id: string;
    displayId: string;
    registration: string;
    model: string;
  };
  driverId?: string | null;
  driver?: {
    id: string;
    displayId: string;
    firstName: string;
    lastName: string;
    employeeNumber?: string | null;
  } | null;
  tripId?: string | null;
  trip?: {
    id: string;
    displayId: string;
    origin: string;
    destination: string;
  } | null;
  occurredAt: Date;
  energyType: FuelType;
  quantity: number;
  quantityUnit: FuelQuantityUnit;
  unitPrice: number;
  totalAmount: number;
  currencyCode: string;
  odometerKm?: number | null;
  stationName?: string | null;
  referenceNumber?: string | null;
  source: FuelTransactionSource;
  status: FuelTransactionStatus;
  voidReason?: string | null;
  voidedAt?: Date | null;
  voidedBy?: string | null;
  hasReceipt: boolean;
  receiptFileName?: string | null;
  receiptContentType?: string | null;
  receiptSizeBytes?: number | null;
  receiptStorageKey?: string | null;
  version: number;
  anomalies: FuelAnomalyDetail[];
  metrics?: FuelIntervalMetric | null;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
}

export interface ListFuelTransactionsFilter {
  vehicleId?: string | undefined;
  driverId?: string | undefined;
  tripId?: string | undefined;
  status?: FuelTransactionStatus | undefined;
  hasAnomalies?: boolean | undefined;
  fromDate?: Date | undefined;
  toDate?: Date | undefined;
  search?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface ExpenseCategoryDetail {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  description?: string | null;
  status: ExpenseCategoryStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExpenseDetail {
  id: string;
  organizationId: string;
  displayId: string;
  categoryId: string;
  category: {
    id: string;
    code: string;
    name: string;
  };
  vehicleId?: string | null;
  vehicle?: {
    id: string;
    displayId: string;
    registration: string;
    model: string;
  } | null;
  driverId?: string | null;
  driver?: {
    id: string;
    displayId: string;
    firstName: string;
    lastName: string;
  } | null;
  tripId?: string | null;
  trip?: {
    id: string;
    displayId: string;
    origin: string;
    destination: string;
  } | null;
  maintenanceWorkOrderId?: string | null;
  maintenanceWorkOrder?: {
    id: string;
    displayId: string;
    description?: string | null;
  } | null;
  occurredAt: Date;
  description: string;
  amount: number;
  currencyCode: string;
  vendorName?: string | null;
  referenceNumber?: string | null;
  status: ExpenseStatus;
  voidReason?: string | null;
  voidedAt?: Date | null;
  voidedBy?: string | null;
  hasReceipt: boolean;
  receiptFileName?: string | null;
  receiptContentType?: string | null;
  receiptSizeBytes?: number | null;
  receiptStorageKey?: string | null;
  version: number;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
}

export interface ListExpensesFilter {
  categoryId?: string | undefined;
  vehicleId?: string | undefined;
  driverId?: string | undefined;
  tripId?: string | undefined;
  maintenanceWorkOrderId?: string | undefined;
  status?: ExpenseStatus | undefined;
  fromDate?: Date | undefined;
  toDate?: Date | undefined;
  search?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface CurrencySpendSummary {
  currencyCode: string;
  fuelSpend: number;
  expenseSpend: number;
  totalSpend: number;
}

export interface CategorySpendSummary {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  currencyCode: string;
  totalAmount: number;
  expenseCount: number;
}

export interface VehicleSpendSummary {
  vehicleId: string;
  displayId: string;
  registration: string;
  currencyCode: string;
  fuelSpend: number;
  expenseSpend: number;
  totalSpend: number;
}

export interface FinanceSummaryResult {
  spendByCurrency: CurrencySpendSummary[];
  spendByCategory: CategorySpendSummary[];
  topVehiclesBySpend: VehicleSpendSummary[];
  totalFuelTransactions: number;
  totalExpenses: number;
  activeAnomaliesCount: number;
}

export interface VehicleFinanceSummaryResult {
  vehicleId: string;
  displayId: string;
  registration: string;
  spendByCurrency: CurrencySpendSummary[];
  spendByCategory: CategorySpendSummary[];
  efficiency: VehicleEfficiencySummary;
  recentFuelTransactions: FuelTransactionDetail[];
  recentExpenses: ExpenseDetail[];
}

export interface TripFinanceSummaryResult {
  tripId: string;
  displayId: string;
  origin: string;
  destination: string;
  distanceKm?: number | null;
  spendByCurrency: CurrencySpendSummary[];
  fuelTransactions: FuelTransactionDetail[];
  expenses: ExpenseDetail[];
}

export interface FinanceRepository {
  // Fuel Transactions
  allocateFuelDisplayId(organizationId: string): Promise<string>;
  saveFuelTransaction(
    transaction: FuelTransaction,
    anomalies: FuelAnomalyItem[],
    metadata: FinanceMutationMetadata,
    eventType: 'FuelTransactionCreated' | 'FuelTransactionVoided' | 'FuelTransactionReceiptUpdated',
  ): Promise<FuelTransactionDetail>;
  findFuelTransactionById(
    organizationId: string,
    id: string,
  ): Promise<FuelTransactionDetail | null>;
  findFuelTransactionEntityById(
    organizationId: string,
    id: string,
  ): Promise<FuelTransaction | null>;
  listFuelTransactions(
    organizationId: string,
    filter?: ListFuelTransactionsFilter,
  ): Promise<{ items: FuelTransactionDetail[]; total: number }>;
  getHistoricalFuelContext(
    organizationId: string,
    vehicleId: string,
    referenceNumber?: string | null,
    energyType?: FuelType,
    occurredAt?: Date,
  ): Promise<HistoricalFuelContext>;

  // Expenses
  allocateExpenseDisplayId(organizationId: string): Promise<string>;
  saveExpense(
    expense: Expense,
    metadata: FinanceMutationMetadata,
    eventType:
      | 'ExpenseCreated'
      | 'ExpenseUpdated'
      | 'ExpensePosted'
      | 'ExpenseVoided'
      | 'ExpenseReceiptUpdated',
  ): Promise<ExpenseDetail>;
  findExpenseById(organizationId: string, id: string): Promise<ExpenseDetail | null>;
  findExpenseEntityById(organizationId: string, id: string): Promise<Expense | null>;
  listExpenses(
    organizationId: string,
    filter?: ListExpensesFilter,
  ): Promise<{ items: ExpenseDetail[]; total: number }>;

  // Expense Categories
  saveExpenseCategory(
    category: ExpenseCategory,
    metadata: FinanceMutationMetadata,
    eventType: 'ExpenseCategoryCreated' | 'ExpenseCategoryUpdated' | 'ExpenseCategoryArchived',
  ): Promise<ExpenseCategoryDetail>;
  findExpenseCategoryById(organizationId: string, id: string): Promise<ExpenseCategory | null>;
  findExpenseCategoryByCode(organizationId: string, code: string): Promise<ExpenseCategory | null>;
  listExpenseCategories(
    organizationId: string,
    includeArchived?: boolean,
  ): Promise<ExpenseCategoryDetail[]>;

  // Attribution Lookups
  findVehicleByRegistration(
    organizationId: string,
    registration: string,
  ): Promise<{ id: string; displayId: string; registration: string; odometerKm: number } | null>;
  findVehicleById(
    organizationId: string,
    id: string,
  ): Promise<{ id: string; displayId: string; registration: string; odometerKm: number } | null>;
  findDriverByNumberOrDisplayId(
    organizationId: string,
    identifier: string,
  ): Promise<{
    id: string;
    displayId: string;
    employeeNumber: string | null;
    firstName: string;
    lastName: string;
  } | null>;
  findDriverById(
    organizationId: string,
    id: string,
  ): Promise<{
    id: string;
    displayId: string;
    employeeNumber: string | null;
    firstName: string;
    lastName: string;
  } | null>;
  findTripById(
    organizationId: string,
    tripId: string,
  ): Promise<{
    id: string;
    displayId: string;
    vehicleId: string;
    driverId: string;
    origin: string;
    destination: string;
    distanceKm?: number | null;
  } | null>;
  findWorkOrderById(
    organizationId: string,
    workOrderId: string,
  ): Promise<{
    id: string;
    displayId: string;
    vehicleId: string;
    description?: string | null;
  } | null>;

  // Summaries & Metrics
  getFinanceSummary(
    organizationId: string,
    filter?: { fromDate?: Date | undefined; toDate?: Date | undefined } | undefined,
  ): Promise<FinanceSummaryResult>;
  getVehicleFinanceSummary(
    organizationId: string,
    vehicleId: string,
  ): Promise<VehicleFinanceSummaryResult>;
  getTripFinanceSummary(organizationId: string, tripId: string): Promise<TripFinanceSummaryResult>;
}
