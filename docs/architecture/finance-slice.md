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

Checked-in migration: `20261111000000_finance_fuel_expenses` followed by corrective migration `20261111120000_finance_integrity`.

Full chronological sequence verified from `packages/database/prisma/migrations`:

1. `20260818000000_foundation`
2. `20260818115052_identity_organization_foundation`
3. `20260919000000_vehicle`
4. `20260929000000_driver`
5. `20260929120000_assignment`
6. `20261019000000_trip`
7. `20261029000000_inspection`
8. `20261109000000_maintenance`
9. `20261110000000_compliance_documents`
10. `20261111000000_finance_fuel_expenses`
11. `20261111120000_finance_integrity`

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

### Anomaly Vocabulary Reconciliation & Design Decisions

The PostgreSQL schema and domain model define exactly six authoritative anomaly codes:

1. `ODOMETER_REGRESSION`
2. `DUPLICATE_REFERENCE`
3. `DUPLICATE_TRANSACTION`
4. `FUTURE_TRANSACTION_DATE`
5. `ZERO_DISTANCE_REFUEL`
6. `UNUSUAL_UNIT_PRICE`

**Design Decision: Deferred Tank Capacity Anomaly (`EXCESS_CAPACITY`)**:
The core `Vehicle` domain aggregate tracks operational attributes (VIN, license plate, make, model, year, status, authoritative odometer) but does not model fuel tank volume or battery pack kWh capacity. Because no authoritative vehicle specification exists in the system to define tank size, attempting to flag fuel quantity against an arbitrary or non-authoritative number would lead to spurious false-positive anomalies. In adherence to VMS architecture invariants, fuel volume checks against tank capacity are deferred until vehicle asset specifications are formalized in a future milestone.

### Currency Registry & Exact Decimal Financial Authority

To guarantee financial integrity and eliminate binary floating-point rounding drift:

1. **ISO 4217 Currency Registry (`currency-registry.ts`)**:
   - Maintains an authoritative catalog of active ISO 4217 world currencies (`ISO_4217_CURRENCIES`) with their official decimal fraction digits (e.g., 2 for USD/EUR, 0 for JPY/KRW, 3 for KWD/BHD).
   - Inbound currency codes are strictly validated via `assertValidCurrencyCode(code)`. Fictitious codes (e.g., `ABC`, `ZZZ`) are rejected with `INVALID_CURRENCY_CODE` (HTTP 400).
2. **Exact Decimal Arithmetic (`exact-decimal.ts`)**:
   - All financial multiplications, divisions, additions, and subtractions are executed via a custom arbitrary-precision `ExactDecimal` value object backed by scaled `BigInt`.
   - IEEE-754 binary floating-point operations (`number`) are completely avoided during financial rule evaluation.
   - Total amount validation enforces exact mathematical identity: `quantity * unitPrice == totalAmount`. Loose floating-point tolerances (such as `±0.05`) are forbidden.
3. **Money Transport Boundary and Serialization**:
   - **Input Validation & Bounds**: REST DTOs accept monetary and quantity inputs as bounded JSON numbers:
     - `quantity`: bounded by `@Min(0.001)` and `@Max(999999999.999)` matching database `Decimal(12, 3)`.
     - `unitPrice`: bounded by `@Min(0)` and `@Max(99999999.9999)` matching database `Decimal(12, 4)`.
     - `totalAmount` & Expense `amount`: bounded by `@Min(0.0001)` and `@Max(9999999999.9999)` matching database `Decimal(14, 4)`.
   - **Lossless Conversion Proof**: Standard IEEE-754 double precision floats support up to 53 bits of mantissa ($9,007,199,254,740,991 \approx 9 \times 10^{15}$, or 15–17 decimal digits). The largest supported financial amount ($9,999,999,999.9999$) requires exactly 14 decimal digits when scaled to integer subunits ($99,999,999,999,999$), strictly below $9,007,199,254,740,991$. As proven by unit boundary tests, conversion from input `number` into `ExactDecimal` is 100% lossless across all supported values.
   - **API Output Serialization**: Returned values are serialized as JSON numbers rounded strictly to the minor unit fraction digits declared by the currency's ISO 4217 definition (e.g. 2 for USD, 0 for JPY, 3 for KWD).

4. **Receipt Security and Download Flow**:
   - Presigned download URLs are generated dynamically with a 15-minute TTL.
   - S3/MinIO `GetObjectCommand` specifies `ResponseContentDisposition: attachment; filename="..."` to force client-side download without rendering sensitive receipt bytes inline.
   - The frontend never renders raw S3 keys, permanent public URLs, or bucket hosts into the DOM.
   - Downloading receipts requires the explicit `finance.receipt.download` permission (granted to Organization Admin and Manager roles; denied to Viewer).

### Fuel Efficiency Formulas

- `kmPerUnit = deltaOdometerKm / quantity`
- `unitsPer100Km = (quantity / deltaOdometerKm) * 100`
- `costPerKm = totalAmount / deltaOdometerKm`
