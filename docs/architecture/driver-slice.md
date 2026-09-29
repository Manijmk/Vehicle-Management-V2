# Architecture: Driver Management Slice (Milestone 3)

## 1. Overview and Scope

Milestone 3 delivers the **Driver Management Vertical Slice** of the Vehicle Management System (VMS). It establishes an autonomous driver registry with lifecycle state machines, driver licensing and qualifications, derived operational eligibility, and immutable audit trails under strict multi-tenant boundaries.

### Scope Boundaries

- **In Scope**:
  - Driver entity management (`firstName`, `lastName`, `email`, `phone`, `employeeNumber`, `displayId`, `status`, `notes`, `version`).
  - Driver lifecycle transitions: `DRAFT -> ACTIVE -> SUSPENDED -> INACTIVE` (with `INACTIVE` terminal).
  - Driver license model and deterministic date-range validity.
  - Derived operational eligibility policy (`eligible: boolean`, `reasonCodes: string[]`).
  - Strict tenant isolation enforced at repository, database constraint, and REST layers.
  - Optimistic concurrency control across driver and license updates.
  - Role-based access control with 8 dedicated driver permission codes.
  - Transactional outbox events for all consequential mutations.
  - Immutable audit logging for driver and license operations.
  - Next.js Management Web UI with search, filtering, pagination, eligibility indicator, lifecycle modals, and license management.
  - Complete backend integration tests, worker outbox integration tests, and Playwright browser E2E acceptance tests.
- **Out of Scope (Milestone 4+)**:
  - Vehicle-Driver assignment.
  - Trip records and dispatching.
  - Driver hours tracking / ELD integrations.

---

## 2. Layered Architecture

The Driver slice strictly adheres to the repository's directional dependency rule:

```text
HTTP Transport (DriverController, DTOs)
       │
       ▼
Application Use Cases & Repository Ports (DriverRepository, DriverService)
       │
       ▼
Domain Rules & Eligibility Policy (Driver, DriverLicense, DriverEligibility)
       ▲
       │
Infrastructure Adapters (PrismaDriverRepository, PostgreSQL)
```

- **Domain Model (`apps/api/src/modules/driver/domain/driver.ts`)**: Pure TypeScript functions and types. Zero dependencies on NestJS, Prisma, Express, or Next.js. Encapsulates status transition validation, identifier normalization, deterministic license validity checks, and dynamic eligibility evaluation.
- **Application Layer (`apps/api/src/modules/driver/application/`)**: Defines `DriverRepository` interface and `DriverService`. Orchestrates transactional mutations, concurrency-safe `DRV-XXXX` display ID allocation, audit logging, and outbox event persistence.
- **Infrastructure Layer (`apps/api/src/modules/driver/infrastructure/prisma-driver.repository.ts`)**: Implements `DriverRepository` using Prisma Client inside interactive database transactions (`prisma.$transaction`). Enforces tenant filters on all queries and mutations.
- **Transport Layer (`apps/api/src/modules/driver/transport/`)**: `DriverController` exposes REST endpoints, validates inputs via `class-validator` DTOs, validates tenant context via `@TenantScoped()`, enforces RBAC via `@RequirePermissions()`, and formats Swagger/OpenAPI documentation.

---

## 3. Database Schema and Constraints

The persistent schema is codified in Prisma migration `20260929000000_driver` and establishes 3 tables:

### 3.1 `drivers` Table

| Column            | Type             | Nullable | Notes                                                              |
| :---------------- | :--------------- | :------- | :----------------------------------------------------------------- |
| `id`              | `uuid`           | No       | Primary Key (`gen_random_uuid()`)                                  |
| `organization_id` | `uuid`           | No       | Tenant Foreign Key -> `organizations(id)` ON DELETE RESTRICT       |
| `display_id`      | `varchar(40)`    | No       | Unique per tenant `(organization_id, display_id)`                  |
| `employee_number` | `varchar(50)`    | Yes      | Unique per tenant `(organization_id, employee_number)`             |
| `first_name`      | `varchar(100)`   | No       | Normalized driver first name                                       |
| `last_name`       | `varchar(100)`   | No       | Normalized driver last name                                        |
| `email`           | `varchar(320)`   | Yes      | Optional contact email                                             |
| `phone`           | `varchar(50)`    | Yes      | Optional contact phone                                             |
| `status`          | `driver_status`  | No       | Enum: `DRAFT`, `ACTIVE`, `SUSPENDED`, `INACTIVE` (default `DRAFT`) |
| `notes`           | `varchar(500)`   | Yes      | Operational notes                                                  |
| `version`         | `integer`        | No       | Default 1, incremented on every update                             |
| `created_at`      | `timestamptz(3)` | No       | Default `now()`                                                    |
| `updated_at`      | `timestamptz(3)` | No       | Updated on write                                                   |

### 3.2 `driver_licenses` Table

| Column            | Type             | Nullable | Notes                                                            |
| :---------------- | :--------------- | :------- | :--------------------------------------------------------------- |
| `id`              | `uuid`           | No       | Primary Key (`gen_random_uuid()`)                                |
| `organization_id` | `uuid`           | No       | Tenant Foreign Key -> `organizations(id)`                        |
| `driver_id`       | `uuid`           | No       | Composite FK -> `(driver_id, organization_id)` ON DELETE CASCADE |
| `license_number`  | `varchar(50)`    | No       | Normalized license number                                        |
| `issuing_country` | `varchar(3)`     | No       | ISO 3166-1 alpha country code                                    |
| `issuing_region`  | `varchar(50)`    | Yes      | Optional state/province/region                                   |
| `license_classes` | `text[]`         | No       | Array of vehicle classes (e.g. `['B', 'C1']`)                    |
| `issue_date`      | `timestamptz(3)` | No       | Effective issue date                                             |
| `expiry_date`     | `timestamptz(3)` | No       | Expiration date                                                  |
| `notes`           | `varchar(500)`   | Yes      | Optional license notes                                           |
| `version`         | `integer`        | No       | Default 1, incremented on mutation                               |
| `created_at`      | `timestamptz(3)` | No       | Default `now()`                                                  |
| `updated_at`      | `timestamptz(3)` | No       | Updated on write                                                 |

### 3.3 `driver_status_history` Table

| Column            | Type             | Nullable | Notes                                                            |
| :---------------- | :--------------- | :------- | :--------------------------------------------------------------- |
| `id`              | `uuid`           | No       | Primary Key (`gen_random_uuid()`)                                |
| `organization_id` | `uuid`           | No       | Tenant Foreign Key -> `organizations(id)`                        |
| `driver_id`       | `uuid`           | No       | Composite FK -> `(driver_id, organization_id)` ON DELETE CASCADE |
| `from_status`     | `driver_status`  | Yes      | `null` on creation, previous status on transition                |
| `to_status`       | `driver_status`  | No       | Destination status                                               |
| `reason`          | `varchar(500)`   | No       | Transition justification                                         |
| `changed_by`      | `uuid`           | No       | Foreign Key -> `users(id)` ON DELETE RESTRICT                    |
| `request_id`      | `varchar(100)`   | No       | Request correlation ID                                           |
| `ip_address`      | `varchar(45)`    | Yes      | Client IP address                                                |
| `user_agent`      | `varchar(500)`   | Yes      | Client User-Agent header                                         |
| `created_at`      | `timestamptz(3)` | No       | Append-only timestamp                                            |

### 3.4 Relational Constraints and Indexes

- **Tenant Scope Isolation**: Composite foreign keys `(driver_id, organization_id)` on both `driver_licenses` and `driver_status_history` reference `drivers(id, organization_id)`. Cross-tenant references are physically prevented by database constraints.
- **Uniqueness**:
  - `@@unique([organizationId, displayId])` on `drivers`
  - `@@unique([organizationId, employeeNumber])` on `drivers`
  - `@@unique([organizationId, licenseNumber, issuingCountry])` on `driver_licenses`
- **Performance Indexes**:
  - `drivers`: `(organization_id, status)`, `(organization_id, last_name, first_name)`
  - `driver_licenses`: `(organization_id, driver_id)`, `(organization_id, expiry_date)`
  - `driver_status_history`: `(organization_id, driver_id, created_at)`

---

## 4. Driver Lifecycle State Machine

The driver lifecycle enforces strict operational states:

```text
       ┌──────────────┐
       │    DRAFT     │ (Default on creation)
       └──────┬───────┘
              │
        ┌─────┴────────┐
        ▼              │
   ┌─────────┐         │
   │ ACTIVE  │◀────┐   │
   └────┬────┘     │   │
        │          │   │
        ▼          │   │
  ┌───────────┐    │   │
  │ SUSPENDED │────┘   │
  └─────┬─────┘        │
        │              │
        ▼              ▼
   ┌───────────────────────┐
   │       INACTIVE        │ (Terminal)
   └───────────────────────┘
```

### Transition Invariants

1. **Creation**: Driver is created in `DRAFT` status. An initial status history record is inserted with `fromStatus: null`, `toStatus: DRAFT`, `reason: 'Driver created'`.
2. **Activation (`DRAFT -> ACTIVE`)**:
   - Requires at least one qualifying, valid, unexpired license at the time of activation (`isLicenseValid(license)` must be true).
   - If no valid license exists, the operation is rejected with `NO_VALID_DRIVER_LICENSE`.
3. **Suspension (`ACTIVE -> SUSPENDED`)**:
   - Requires a documented reason.
   - Used for temporary disqualifications, medical leaves, or administrative holds.
4. **Reactivation (`SUSPENDED -> ACTIVE`)**:
   - Requires at least one qualifying, valid, unexpired license.
5. **Deactivation (`* -> INACTIVE`)**:
   - Permitted from `DRAFT`, `ACTIVE`, or `SUSPENDED`.
   - Requires a documented reason.
   - `INACTIVE` is terminal: any subsequent transition attempt throws `INVALID_DRIVER_STATUS_TRANSITION`.

---

## 5. Driver License Model and Deterministic Validity

Driver licenses represent official authorizations issued by governing jurisdictions:

- **No Redundant Status Field**: License validity is derived dynamically from `issueDate <= referenceDate && expiryDate >= referenceDate`.
- **Date Invariant**: `assertLicenseDateRange(issueDate, expiryDate)` guarantees `issueDate <= expiryDate`. Inverted date ranges are rejected with `INVALID_LICENSE_DATE_RANGE` (HTTP 400).
- **No Side-Effect Auto-Mutation**: An expired license does NOT automatically mutate the driver's aggregate status to `SUSPENDED` in the database. Instead, expiration affects the driver's derived eligibility in real time.

---

## 6. Derived Driver Eligibility Policy

Operational eligibility determines whether a driver is qualified for dispatch:

- **Calculation Function**: `calculateDriverEligibility(status, licenses, referenceDate)`.
- **Eligibility Conditions**: A driver is `eligible: true` if and only if:
  1. `status === 'ACTIVE'`.
  2. The driver holds at least one license valid on `referenceDate`.
- **Reason Codes**:
  - `DRIVER_NOT_ACTIVE`: Driver is not in `ACTIVE` status.
  - `DRIVER_DRAFT`: Driver is still in draft state.
  - `DRIVER_SUSPENDED`: Driver is currently suspended.
  - `DRIVER_INACTIVE`: Driver is permanently deactivated.
  - `NO_VALID_LICENSE`: Driver has no licenses registered.
  - `LICENSE_EXPIRED`: Driver has registered licenses, but none are currently valid.

---

## 7. Optimistic Concurrency and Versioning

Every mutation operation requires an expected integer `version`:

- `Driver`: Updates, activations, suspensions, and deactivations verify `where: { id, organizationId, version }` and increment `version: { increment: 1 }`.
- `DriverLicense`: Updates verify `where: { id, driverId, organizationId, version }` and increment `version: { increment: 1 }`.
- If the expected version does not match the database state, the mutation affects 0 rows and immediately throws `CONCURRENCY_CONFLICT` (HTTP 409).
- The web UI handles this by rendering an actionable conflict banner with a "Reload latest data" control.

---

## 8. Role-Based Access Control and Multi-Tenancy

Authorization relies on 8 stable permission codes registered in the permission catalogue and database seed:

- `driver.read`: View driver profiles, listings, licenses, and eligibility.
- `driver.create`: Register new drivers in DRAFT status.
- `driver.update`: Modify driver metadata.
- `driver.activate`: Activate or reactivate drivers.
- `driver.suspend`: Suspend active drivers.
- `driver.deactivate`: Permanently deactivate drivers.
- `driver.license.manage`: Add, update, or remove driver licenses.
- `driver.history.read`: Inspect status transition history.

### Default Role Assignments

- **Organization Admin**: Granted all 8 driver permissions.
- **Viewer**: Granted `driver.read` and `driver.history.read`. Mutations attempt return HTTP 403 `PERMISSION_DENIED`.

---

## 9. Transactional Outbox and Audit Integration

All state mutations occur inside atomic PostgreSQL transactions and persist audit logs and outbox events simultaneously:

- **Audit Actions**:
  - `driver.created`
  - `driver.updated`
  - `driver.activated`
  - `driver.suspended`
  - `driver.deactivated`
  - `driver.license.added`
  - `driver.license.updated`
  - `driver.license.removed`
- **Outbox Events**:
  - `DriverCreated`
  - `DriverUpdated`
  - `DriverActivated`
  - `DriverSuspended`
  - `DriverDeactivated`
  - `DriverLicenseAdded`
  - `DriverLicenseUpdated`
  - `DriverLicenseRemoved`
- The asynchronous worker claims and publishes these events with lease locks and exponential backoff.

---

## 10. REST API Specification

| Method   | Endpoint                              | Permission              | Description                                           |
| :------- | :------------------------------------ | :---------------------- | :---------------------------------------------------- |
| `GET`    | `/api/v1/drivers`                     | `driver.read`           | List paginated drivers with search & status filters   |
| `POST`   | `/api/v1/drivers`                     | `driver.create`         | Create a driver in DRAFT status                       |
| `GET`    | `/api/v1/drivers/:id`                 | `driver.read`           | Retrieve driver profile with licenses and eligibility |
| `PATCH`  | `/api/v1/drivers/:id`                 | `driver.update`         | Update driver profile with version check              |
| `POST`   | `/api/v1/drivers/:id/activate`        | `driver.activate`       | Activate/reactivate driver (requires valid license)   |
| `POST`   | `/api/v1/drivers/:id/suspend`         | `driver.suspend`        | Suspend driver with mandatory reason                  |
| `POST`   | `/api/v1/drivers/:id/deactivate`      | `driver.deactivate`     | Permanently deactivate driver                         |
| `GET`    | `/api/v1/drivers/:id/status-history`  | `driver.history.read`   | List status transitions with audit actors             |
| `GET`    | `/api/v1/drivers/:id/licenses`        | `driver.read`           | List driver's licenses                                |
| `POST`   | `/api/v1/drivers/:id/licenses`        | `driver.license.manage` | Add a new license to driver                           |
| `PATCH`  | `/api/v1/drivers/:id/licenses/:licId` | `driver.license.manage` | Update license with version check                     |
| `DELETE` | `/api/v1/drivers/:id/licenses/:licId` | `driver.license.manage` | Remove a license                                      |
