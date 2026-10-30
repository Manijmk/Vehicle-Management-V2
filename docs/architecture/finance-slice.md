# Architecture: Finance — Fuel and Expenses Slice (Milestone 9)

## 1. Overview and Scope

Milestone 9 delivers the **Finance — Fuel and Expenses Vertical Slice** for the Vehicle Management System (VMS). This slice introduces authoritative tracking of energy consumption (fuel/charging), operational fleet expenses, receipt lifecycle management, fuel anomaly detection, and vehicle efficiency metrics while preserving modular monolith architecture and strict tenant isolation.

### Scope Boundaries

- **In Scope (Milestone 9)**:
  - **Core Domain Entities & Value Objects**:
    - `FuelTransaction`: Authoritative record of fuel, energy, or charging transactions (`POSTED -> VOIDED`). Tracks `displayId` (e.g., `FUEL-1001`), `vehicleId`, optional `driverId`, optional `tripId`, `occurredAt`, `energyType` (`DIESEL`, `GASOLINE`, `ELECTRICITY`, `CNG`, `LPG`, `HYDROGEN`), `quantity`, `quantityUnit` (`LITER`, `GALLON`, `KWH`, `KG`), `unitPrice`, `totalAmount`, `currencyCode`, `odometerKm`, `stationName`, `referenceNumber`, `source` (`MANUAL`, `CSV_IMPORT`), and receipt attachments.
    - `FuelTransactionAnomaly`: Automated anomaly detection flags attached to fuel transactions (`ODOMETER_REGRESSION`, `DUPLICATE_REFERENCE`, `DUPLICATE_TRANSACTION`, `FUTURE_TRANSACTION_DATE`, `ZERO_DISTANCE_REFUEL`, `UNUSUAL_UNIT_PRICE`).
    - `ExpenseCategory`: Tenant catalog of expenditure categories (`ACTIVE`, `ARCHIVED`), defining unique code, name, and description.
    - `Expense`: Fleet expenditure record supporting draft lifecycle (`DRAFT -> POSTED -> VOIDED`), `displayId` (e.g., `EXP-1001`), category attribution, multi-dimensional attributions (`vehicleId`, `driverId`, `tripId`, `maintenanceWorkOrderId`), `occurredAt`, `amount`, `currencyCode`, `vendorName`, `referenceNumber`, and receipt attachments.
    - `FuelImportJob`: Async/batch import session tracking for bulk CSV fuel upload, row-level validation, preview, and confirmation.
  - **Operational Invariants & Core Protections**:
    - **Odometer Integrity Protection**: Vehicle authoritative odometer is NEVER mutated or updated by fuel transactions. The odometer value on a fuel transaction is an operational observation strictly used for anomaly detection and consumption delta calculations.
    - **Immutability of Financial History**: Financial transactions are never hard-deleted. Once `POSTED`, records cannot be edited. A posted transaction can only be transitioned to `VOIDED` with a mandatory, non-empty void reason.
    - **Multi-Currency Segregation**: Financial summaries strictly group and aggregate spend by `currencyCode`. No automated or assumed foreign exchange (FX) conversion is performed.
    - **Cross-Organization Integrity**: Tenant data isolation is guaranteed through composite foreign keys `(subject_id, organization_id)` on vehicles, drivers, trips, maintenance work orders, and expense categories.
    - **Receipt Security**: Receipt files are stored in private S3/MinIO buckets under `tenants/{orgId}/finance/...`. Raw storage paths are never leaked; downloads are accessed exclusively via secure, time-limited presigned URLs with verified permissions.
  - **Fuel Metrics & Vehicle Efficiency**:
    - Pure domain calculation of `kmPerUnit`, `unitsPer100Km`, and `costPerKm`.
    - Period-based financial summaries across organizations, individual vehicles, and individual trips.
  - **CSV Fuel Import**:
    - Two-phase preview and confirmation flow.
    - Flexible header aliasing and unit normalization.
    - Pre-flight row-level validation reporting errors and anomalies prior to commit.
  - **Role-Based Access Control (RBAC)**:
    - 10 granular permissions: `finance.fuel.read`, `finance.fuel.create`, `finance.fuel.void`, `finance.fuel.import`, `finance.expense.read`, `finance.expense.create`, `finance.expense.manage`, `finance.expense.void`, `finance.category.manage`, `finance.receipt.download`.
  - **Audit Logging & Transactional Outbox**:
    - Immutable audit logs for all mutations (fuel creation, fuel voiding, fuel CSV import, expense draft creation/update, expense posting, expense voiding, category creation/archival).
    - Outbox events: `FuelTransactionCreated`, `FuelTransactionVoided`, `ExpenseCreated`, `ExpensePosted`, `ExpenseVoided`.
  - **Responsive Web Portal**:
    - Financial overview dashboard (`/finance`).
    - Fuel transactions registry, filters, and detail (`/fuel`, `/fuel/new`, `/fuel/[id]`).
    - CSV Fuel Import wizard (`/fuel/import`).
    - Expenses registry, filters, draft workflow, and detail (`/expenses`, `/expenses/new`, `/expenses/[id]`).
    - Expense categories catalog (`/expense-categories`).
    - Deep integrations on Vehicle detail (`/vehicles/[vehicleId]`), Trip detail (`/trips/[tripId]`), and Maintenance Work Order detail (`/maintenance/work-orders/[workOrderId]`).

- **Out of Scope (Preserved for Future Milestones)**:
  - GPS live breadcrumb tracking and geofencing.
  - Automated telematics CAN bus fuel level polling.
  - Multi-currency automated FX rate synchronization.
  - General ledger accounting exports (ERP integrations like SAP/NetSuite).

---

## 2. Layered Architecture

The Finance slice adheres to the strict dependency direction of the modular monolith:

```text
HTTP Transport (FuelController, ExpenseController, ExpenseCategoryController, FinanceSummaryController)
       │
       ▼
Application Use Cases & Ports (FinanceService, IFinanceRepository, ObjectStoragePort)
       │
       ▼
Domain Entities & Pure Calculations (FuelTransaction, Expense, ExpenseCategory, FuelAnomalyDetector, FuelMetricsCalculator, CsvFuelParser)
       ▲
       │
Infrastructure Adapters (PrismaFinanceRepository, S3ObjectStorageAdapter)
```

1. **Transport Layer**:
   - `FuelController`: Fuel transaction listing, manual logging, receipt upload/download, voiding, and CSV import preview/confirmation.
   - `ExpenseController`: Expense listing, draft creation/updating, posting, voiding, and receipt management.
   - `ExpenseCategoryController`: Expense category catalog management, creation, and archival.
   - `FinanceSummaryController`: Aggregated financial metrics for tenant organization, vehicle-specific finance summaries, and trip-specific costs.
2. **Application Layer**:
   - `FinanceService`: Coordinates database transactions, aggregate lifecycles, anomaly detection, MinIO receipt storage, audit logs, and transactional outbox events.
   - `IFinanceRepository`: Abstract port defining persistence queries and mutation contracts.
   - `ObjectStoragePort`: Shared object storage port for private receipt storage and presigned download URL generation.
3. **Domain Layer**:
   - `FuelTransaction`: Aggregate root enforcing valid energy types, units, non-negative amounts, and terminal `VOIDED` lifecycle.
   - `Expense`: Aggregate root enforcing draft state transitions (`DRAFT -> POSTED -> VOIDED`), immutable posted values, and void reason invariants.
   - `ExpenseCategory`: Catalog entity enforcing unique category codes and active status.
   - `FuelAnomalyDetector`: Pure business rule evaluator flagging odometer regressions, duplicate transactions, zero-distance refuels, future dates, and unusual pricing.
   - `FuelMetricsCalculator`: Pure mathematical calculation of fuel efficiency metrics (`km/L`, `L/100km`, `cost/km`).
   - `CsvFuelParser`: Robust CSV parser with resilient header mapping and data normalization.
4. **Infrastructure Layer**:
   - `PrismaFinanceRepository`: PostgreSQL adapter implementing tenant isolation via composite tenant foreign keys, tenant query filtering, and partial unique indexes.
   - `S3ObjectStorageAdapter`: S3/MinIO implementation for receipt storage and presigned download URL generation.

---

## 3. Database Schema and Multi-Tenancy

Checked-in migration: `20261111000000_finance_fuel_expenses`

### Key Constraints & Indexes

1. **`fuel_transactions`**:
   - Primary key: `id` (UUID).
   - Natural tenant display key: `UNIQUE (organization_id, display_id)`.
   - Composite foreign keys:
     - `FOREIGN KEY (vehicle_id, organization_id) REFERENCES vehicles(id, organization_id)`.
     - `FOREIGN KEY (driver_id, organization_id) REFERENCES drivers(id, organization_id)`.
     - `FOREIGN KEY (trip_id, organization_id) REFERENCES trips(id, organization_id)`.
   - Check constraint: `CHECK (status != 'VOIDED' OR (void_reason IS NOT NULL AND void_reason != ''))`.
   - Check constraint: `CHECK (quantity > 0 AND unit_price >= 0 AND total_amount >= 0)`.
2. **`fuel_transaction_anomalies`**:
   - Foreign key: `FOREIGN KEY (fuel_transaction_id) REFERENCES fuel_transactions(id) ON DELETE CASCADE`.
   - Indexed by `(fuel_transaction_id, code)`.
3. **`expense_categories`**:
   - Primary key: `id` (UUID).
   - Natural tenant unique code: `UNIQUE (organization_id, code)`.
   - Composite foreign key for referencing checks: `UNIQUE (id, organization_id)`.
4. **`expenses`**:
   - Primary key: `id` (UUID).
   - Natural tenant display key: `UNIQUE (organization_id, display_id)`.
   - Composite foreign keys:
     - `FOREIGN KEY (category_id, organization_id) REFERENCES expense_categories(id, organization_id)`.
     - `FOREIGN KEY (vehicle_id, organization_id) REFERENCES vehicles(id, organization_id)`.
     - `FOREIGN KEY (driver_id, organization_id) REFERENCES drivers(id, organization_id)`.
     - `FOREIGN KEY (trip_id, organization_id) REFERENCES trips(id, organization_id)`.
     - `FOREIGN KEY (maintenance_work_order_id, organization_id) REFERENCES maintenance_work_orders(id, organization_id)`.
   - Check constraint: `CHECK (status != 'VOIDED' OR (void_reason IS NOT NULL AND void_reason != ''))`.
   - Check constraint: `CHECK (amount >= 0)`.
5. **`fuel_import_jobs`**:
   - Primary key: `id` (UUID).
   - Scoped to `organization_id`.
   - Tracks `status`, `totalRows`, `importedCount`, `errorCount`, `errorsJson`.

---

## 4. Anomaly Detection and Fuel Efficiency Rules

### Fuel Anomaly Codes

- `ODOMETER_REGRESSION`: The transaction odometer is lower than a previously recorded odometer on an earlier transaction for the same vehicle.
- `DUPLICATE_REFERENCE`: Another transaction exists with the exact same reference number.
- `DUPLICATE_TRANSACTION`: An identical vehicle, occurred date/time, quantity, and total amount combination exists.
- `FUTURE_TRANSACTION_DATE`: The transaction timestamp is in the future.
- `ZERO_DISTANCE_REFUEL`: Consecutive refuels have identical odometer values.
- `UNUSUAL_UNIT_PRICE`: Unit price diverges by more than 2.5x from the 90-day moving average for that energy type.

### Fuel Efficiency Formulas

- `kmPerUnit = deltaOdometerKm / quantity`
- `unitsPer100Km = (quantity / deltaOdometerKm) * 100`
- `costPerKm = totalAmount / deltaOdometerKm`
