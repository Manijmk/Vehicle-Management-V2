# Reporting and Analytics Vertical Slice Architecture

## 1. Overview and Architectural Boundaries

The Reporting and Analytics vertical slice (Milestone 13) delivers tenant-isolated operational intelligence, financial metrics, vehicle utilization tracking, and regulatory audit visibility across the Vehicle Management System.

Architectural principles strictly preserved:

```text
transport (ReportingController)
  -> application / use cases (ReportingService)
    -> domain (Domain aggregators & CSV/PDF formats)
      -> repository interfaces (ReportingRepository port)
        <- infrastructure adapters (PrismaReportingRepository)
```

### Key Architectural Constraints

1. **Zero Outbox Events**: Analytical reads and report exports generate **zero** transactional outbox events. Operational event sourcing remains confined to transactional state transitions in primary business aggregates.
2. **Read-Only Over Operational Schema**: The reporting subsystem does not introduce a separate data warehouse, star schema, fact tables, ETL pipeline, Kafka, Elasticsearch, or ClickHouse. It runs set-oriented SQL aggregations directly against PostgreSQL operational tables.
3. **Additive Index Migration**: Canonical migration `20261115000000_reporting_analytics` introduces strictly additive composite indexes on high-frequency columns (`organization_id`, `created_at`, `status`, `occurred_at`, `captured_at`) without modifying historical schema structure.
4. **Tenant Isolation**: Every analytical query and export enforces trusted `organizationId` scoping established by backend authentication context. Cross-tenant leakage is strictly impossible.

---

## 2. Reporting Catalog & Endpoints

| Report Name                  | HTTP Endpoint                                      | Description                                                                                 |
| ---------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Fleet Overview**           | `GET /api/v1/reports/fleet-overview`               | Real-time counts of total, active, assigned, and dispatch-blocked vehicles.                 |
| **Vehicle Utilization**      | `GET /api/v1/reports/vehicle-utilization`          | Clipped trip duration overlap, active trip days, mileage, and utilization %.                |
| **Trip Analytics**           | `GET /api/v1/reports/trips`                        | Terminal completion rate, cancellation rate, distance trends, driver throughput.            |
| **Fuel / Energy Analytics**  | `GET /api/v1/reports/fuel`                         | POSTED fuel transactions, physical volume segregated by unit (LITER, KWH, KG).              |
| **Cost / Expense Analytics** | `GET /api/v1/reports/costs`                        | Multi-currency partitioned spend, category breakdown, cost per km.                          |
| **Maintenance Health**       | `GET /api/v1/reports/maintenance`                  | Work order cycle times, blocking requests, operational parts/labor costs, PM compliance.    |
| **Compliance Analytics**     | `GET /api/v1/reports/compliance`                   | Derived compliance state (COMPLIANT, WARNING, NON_COMPLIANT), document expiry horizon.      |
| **Incident Analytics**       | `GET /api/v1/reports/incidents`                    | Safety incidents by type, severity, operational impact, and resolution cycle times.         |
| **Telemetry Health**         | `GET /api/v1/reports/telemetry`                    | Tracking device counts, freshness distribution (<2m, 2-60m, >60m), GPS trip coverage.       |
| **Executive Dashboard**      | `GET /api/v1/reports/dashboard`                    | Bounded composite headline KPIs combining fleet, financial, safety, and operational alerts. |
| **Streaming CSV Export**     | `GET /api/v1/reports/:reportKey/export?format=csv` | Formula-escaped, streaming CSV export up to 50,000 rows.                                    |
| **Summary PDF Export**       | `GET /api/v1/reports/:reportKey/export?format=pdf` | Binary `%PDF-1.4` summary report rendered without external dependencies.                    |

---

## 3. Mathematical Formulas and Edge Cases

### Vehicle Time Utilization Formula

Trip time utilization measures how intensively a vehicle was operated during a reporting window:

$$\text{Utilization \%} = \frac{\sum \text{Active Trip Duration within Window}}{\text{Total Window Duration}} \times 100$$

#### Exact Boundary Overlap Clipping

For any trip whose duration spans before the window start or past the window end:

$$\text{Effective Start} = \max(\text{trip.startedAt}, \text{window.from})$$
$$\text{Effective End} = \min(\text{trip.endedAt} \parallel \text{currentTimestamp}, \text{window.to})$$
$$\text{Duration within Window} = \max(0, \text{Effective End} - \text{Effective Start})$$

- If a vehicle has zero active trip duration, utilization is `0.00%`.
- If a reporting window duration is zero (start equals end), utilization defaults safely to `0.00%` with zero division guarded.

### Terminal Trip Completion Rate Formula

Trip completion rate evaluates execution reliability over closed dispatches:

$$\text{Completion Rate \%} = \frac{\text{Completed Trips}}{\text{Completed} + \text{Cancelled} + \text{Aborted}} \times 100$$

- **Exclusion of Non-Terminal States**: Trips in `DRAFT`, `READY`, or `IN_PROGRESS` are excluded from the denominator. This prevents penalizing active or scheduled runs.
- If there are zero terminal trips, the rate is `null` (rendered as `N/A`).

---

## 4. Multi-Currency Financial Isolation

To maintain strict accounting integrity across international fleet operations:

1. **Zero Foreign Exchange Conversion**: The reporting engine **never** applies currency conversions or arbitrary FX exchange rates.
2. **Partitioned Grouping**: Expenses and fuel costs are strictly grouped and presented in their native currencies (e.g. `USD`, `JPY`, `EUR`, `GBP`, `KWD`).
3. **POSTED Only**: Transactions in `DRAFT` or `VOIDED` status are strictly filtered out from all financial metrics.
4. **Cost per Kilometer**:

$$\text{Cost per km} = \frac{\text{Total Spend in Currency}}{\text{Authoritative Completed Trip Distance (km)}}$$

---

## 5. Energy and Fuel Physical Unit Segregation

Different vehicle powertrains use different physical units of energy:

- Internal Combustion (Diesel, Petrol): **LITER** or **GALLON**
- Battery Electric (BEV): **KWH**
- Fuel Cell Electric / Hydrogen / CNG: **KG**

**Rule**: Volumes are strictly aggregated and presented within their respective units (`LITER`, `GALLON`, `KWH`, `KG`). Liters and kWh are **never** summed together into an aggregate number.

### 5b. Authoritative Fuel Anomaly Semantics

Fuel anomalies are aggregated strictly from persisted `fuel_transaction_anomalies` records matching the authoritative Finance domain vocabulary:

- **Anomaly Codes** (`FuelAnomalyCode`):
  1. `ODOMETER_REGRESSION` (Odometer reading less than previous recorded reading)
  2. `DUPLICATE_REFERENCE` (Duplicate vendor receipt or invoice reference number)
  3. `DUPLICATE_TRANSACTION` (Identical timestamp, vehicle, and fuel quantity)
  4. `FUTURE_TRANSACTION_DATE` (Transaction recorded ahead of current clock time)
  5. `ZERO_DISTANCE_REFUEL` (Refuel occurred with zero intervening kilometers traveled)
  6. `UNUSUAL_UNIT_PRICE` (Unit price exceeds expected statistical variance)
- **Persisted Anomaly Severity** (`FuelAnomalySeverity`): `INFO`, `WARNING`, `CRITICAL`. Reporting reflects actual stored severity and never invents synthetic tiers.

---

## 6. Maintenance Operational Costs vs. General Ledger

- **Work Order Parts & Labor**: Extracted from `maintenance_work_order_parts` and `maintenance_work_order_labor`. These represent internal garage/workshop operational service records and estimate receipts.
- **Finance Ledger**: Vendor invoices and accounts payable entries are formally managed in `expenses`.
- The reporting slice documents this distinction clearly in UI disclosures and API responses.

### 6b. Incident Financial Attribution Absence

The operational database schema establishes **zero direct foreign keys or financial relationships** between `incidents` and financial tables (`expenses`, `fuel_transactions`, or `maintenance_work_order_parts/labor`). While a `MaintenanceRequest` may indicate an optional `sourceIncidentId`, no direct financial cost ledger belongs to an Incident.
Consequently, Reporting does **not** model or estimate `incidentCosts` to prevent speculative estimation and double-counting across ledger boundaries.

---

## 7. Compliance Policy Evaluation vs. Historical Reconstruction

Compliance policies dynamically evaluate registered vehicles and drivers against active document types and driver licenses:

- `COMPLIANT`: All mandatory documents are active and unexpired.
- `WARNING`: All mandatory documents are active, but at least one expires within 30 days.
- `NON_COMPLIANT`: One or more mandatory documents are missing, expired, or revoked.

**Historical Audit Note**: Historical point-in-time daily compliance states cannot be retroactively reconstructed without speculative rollback of policy configurations. Therefore, current derived compliance posture is reported alongside actual historical document activities (uploads and revocations).

### 7b. Incident Domain Vocabulary Reconciliation

The Incident read model strictly reflects the upstream Incident domain schema without synthetic enum creation or translation:

- **Incident Types** (`IncidentType`): `ACCIDENT`, `BREAKDOWN`, `VIOLATION`, `DAMAGE`, `THEFT`, `SAFETY`, `OTHER`.
- **Incident Severities** (`IncidentSeverity`): `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.
- **Incident Statuses** (`IncidentStatus`): `REPORTED`, `INVESTIGATING`, `RESOLVED`, `CLOSED`, `CANCELLED`.
- **Operational Impacts** (`IncidentOperationalImpact`): `NONE`, `VEHICLE`, `DRIVER`, `BOTH`. No invented operational values are used. Presentation layers map these values to descriptive labels (`Vehicle Grounded`, etc.).

---

## 8. Security, RBAC & Audit Policy

### Permission Matrix

| Operation             | Required Base Permission          | Additional Domain Permission Required             |
| --------------------- | --------------------------------- | ------------------------------------------------- |
| Fleet Overview        | `report.read`                     | —                                                 |
| Vehicle Utilization   | `report.read`                     | —                                                 |
| Trip Analytics        | `report.read`                     | `trip.read`                                       |
| Fuel Analytics        | `report.read`                     | `finance.read`                                    |
| Cost Analytics        | `report.read`                     | `finance.read`                                    |
| Maintenance Analytics | `report.read`                     | `maintenance.read`                                |
| Compliance Analytics  | `report.read`                     | `compliance.read`                                 |
| Incident Analytics    | `report.read`                     | `incident.read`                                   |
| Telemetry Analytics   | `report.read`                     | `telemetry.read`                                  |
| Executive Dashboard   | `report.read`                     | —                                                 |
| Export Any Report     | `report.read` AND `report.export` | Same domain permission as query (`<domain>.read`) |

Export is a privileged data exfiltration action. The caller must possess `report.read` (authorization to view reporting intelligence), `report.export` (authorization to extract datasets), AND the corresponding source-domain read permission. Missing any required permission results in an immediate 403 Forbidden rejection.

For composite reports (`fleet-overview` and `dashboard`), exports follow the same permission-aware redaction as the interactive view: fields originating from unauthorized source domains evaluate to `—` or `null` and are never disclosed in CSV/PDF outputs.

### 8b. Telemetry Freshness Policy & Device Statuses

Telemetry reporting directly consumes the authoritative Milestone 12 freshness constants from `telemetry.domain`:

- **Fresh**: $\le 2\text{ minutes}$ ($120\text{ seconds}$).
- **Stale**: $> 2\text{ minutes}$ and $\le 60\text{ minutes}$ ($120$ to $3600\text{ seconds}$).
- **Unknown / Offline**: $> 60\text{ minutes}$ ($> 3600\text{ seconds}$) or no position.

Reporting queries `telemetry_devices` for device statuses (`ACTIVE`, `INACTIVE`, `SUSPENDED`). It does **not** count `telemetry_device_credentials` (`ACTIVE`, `REVOKED`) as physical devices, maintaining clean entity boundary separation.

### 8c. Canonical Default Reporting Range

When `from` and/or `to` query parameters are omitted:

- **Default Duration**: Trailing 30 days.
- **Reference Semantics**: `to = T` (current UTC timestamp evaluated at request time), `from = T - 30 days`.
- **Interval Bounds**: Half-open $[from, to)$ in UTC. Maximum range is 366 days.
- **Metadata**: Every report response and export returns exact `from`, `to`, and `timezone: 'UTC'` timestamps in its metadata payload.

### Audit Logging

Every report export triggers an immutable audit log entry:

- `action`: `REPORT_EXPORTED`
- `entityType`: `Report`
- `entityId`: Random UUID representing the export transaction
- `afterData`: `{ reportKey, format, rowCount, from, to }`
- **Zero Raw File Bytes**: Exported CSV or PDF binary bytes are never stored in the audit log.

---

## 9. Export Architecture

### Streaming CSV with Formula Injection Escaping

- **CSV Formula Injection Mitigation**: Any field starting with `=`, `+`, `-`, or `@` is prepended with a single quote (`'`) to neutralize spreadsheet formula execution vulnerabilities.
- **Safety Limit**: Single export results are capped at 50,000 rows to prevent memory exhaustion.
- **Character Encoding**: UTF-8 encoded text with standard CRLF or LF line endings.

### Summary PDF Export

- Pure TypeScript implementation of the `ReportPdfRenderer` port (`SimplePdfRenderer`).
- Emits valid binary `%PDF-1.4` documents with proper xref tables and standard Helvetica fonts.
- Zero external network requests, zero headless Chromium browsers, and zero binary native bindings required.

---

## 10. Performance & Index Optimization

Composite indexes added in `20261115000000_reporting_analytics`:

- `trips(organization_id, started_at, status)`
- `trips(organization_id, completed_at)`
- `fuel_transactions(organization_id, status, occurred_at)`
- `expenses(organization_id, status, occurred_at)`
- `maintenance_work_orders(organization_id, status, completed_at)`
- `incidents(organization_id, reported_at, status)`
- `telemetry_positions(organization_id, captured_at)`

All report queries execute in under 1 second directly on PostgreSQL. Redis caching is deferred until high concurrency production metrics justify the invalidation complexity.
