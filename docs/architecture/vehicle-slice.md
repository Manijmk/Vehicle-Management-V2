# Architecture: Vehicle Management Slice (Milestone 2)

## 1. Overview and Scope

Milestone 2 delivers the operational **Vehicle Management Vertical Slice** of the Vehicle Management System (VMS). It establishes vehicle fleet registry operations under strict multi-tenant boundaries.

In accordance with architectural principles, this milestone strictly focuses on vehicles:

- **In Scope**: Vehicle registration, validation, identity uniqueness, status lifecycle, history tracking, tenant isolation, optimistic concurrency, transactional outbox events, immutable audit logging, management web UI, and browser E2E acceptance tests.
- **Out of Scope (Milestone 3+)**: Drivers, Vehicle-Driver assignments, Trips, Telematics, Maintenance, Fuel logs.

---

## 2. Layered Architecture

The Vehicle slice adheres to the modular-monolith dependency rule:

```text
HTTP Transport (VehicleController, DTOs)
       │
       ▼
Application Use Cases & Repository Ports (VehicleRepository, operations)
       │
       ▼
Domain Rules & Lifecycle (Vehicle, VehicleStatus, Invariants)
       ▲
       │
Infrastructure Adapters (PrismaVehicleRepository, PostgreSQL)
```

- **Domain Model**: Pure TypeScript entities with zero external framework dependencies (no NestJS, no Prisma, no HTTP, no UI). Encapsulates invariants such as VIN validation (17 characters uppercase), plate registration normalization, and legal lifecycle transitions.
- **Application Layer**: Owns transactional use cases, display ID generation, optimistic concurrency validation, status history logging, outbox event generation, and audit logging.
- **Infrastructure Layer**: `PrismaVehicleRepository` executes all mutations inside atomic PostgreSQL transactions (`prisma.$transaction`).
- **Transport Layer**: `VehicleController` parses requests, validates inputs via `class-validator` DTOs, enforces route permissions via `@RequirePermissions`, and maps errors to stable RFC-compliant HTTP statuses.

---

## 3. Database Schema and Constraints

The persistent schema is codified in Prisma migration `20260919000000_vehicle` and enforces relational integrity:

### 3.1 `vehicles` Table

| Column            | Type             | Nullable | Notes                                                          |
| :---------------- | :--------------- | :------- | :------------------------------------------------------------- |
| `id`              | `uuid`           | No       | Primary Key (`gen_random_uuid()`)                              |
| `organization_id` | `uuid`           | No       | Tenant Foreign Key -> `organizations(id)` ON DELETE RESTRICT   |
| `display_id`      | `text`           | No       | Unique per tenant `(organization_id, display_id)`              |
| `registration`    | `text`           | No       | Unique per tenant `(organization_id, registration)`            |
| `vin`             | `text`           | No       | Globally unique `(vin)`                                        |
| `type`            | `vehicle_type`   | No       | Enum: `CAR`, `VAN`, `TRUCK`, `BUS`, `MOTORCYCLE`, `OTHER`      |
| `fuel_type`       | `fuel_type`      | No       | Enum: `PETROL`, `DIESEL`, `HYBRID`, `ELECTRIC`, `GAS`, `OTHER` |
| `model`           | `text`           | No       | Vehicle make/model                                             |
| `year`            | `integer`        | No       | Manufacturing year                                             |
| `odometer_km`     | `integer`        | No       | Current odometer reading                                       |
| `status`          | `vehicle_status` | No       | Enum: `DRAFT`, `ACTIVE`, `RETIRED`                             |
| `notes`           | `text`           | Yes      | Optional fleet notes                                           |
| `version`         | `integer`        | No       | Default 1, incremented on every mutation                       |
| `created_at`      | `timestamptz`    | No       | Default `now()`                                                |
| `updated_at`      | `timestamptz`    | No       | Default `now()`                                                |

### 3.2 `vehicle_status_history` Table

| Column             | Type             | Nullable | Notes                                             |
| :----------------- | :--------------- | :------- | :------------------------------------------------ |
| `id`               | `uuid`           | No       | Primary Key (`gen_random_uuid()`)                 |
| `organization_id`  | `uuid`           | No       | Tenant Foreign Key -> `organizations(id)`         |
| `vehicle_id`       | `uuid`           | No       | Composite FK -> `(vehicle_id, organization_id)`   |
| `previous_status`  | `vehicle_status` | Yes      | `null` on creation, previous status on transition |
| `new_status`       | `vehicle_status` | No       | Destination status                                |
| `reason`           | `text`           | No       | Mandatory transition/intake justification         |
| `changed_by`       | `uuid`           | No       | Actor ID (`users(id)`)                            |
| `request_id`       | `text`           | Yes      | Request correlation ID                            |
| `request_metadata` | `jsonb`          | Yes      | IP address, user-agent                            |
| `created_at`       | `timestamptz`    | No       | Append-only timestamp                             |

### 3.3 Relational and Tenant Constraints

- Composite foreign key `vehicle_status_history_vehicle_id_organization_id_fkey` references `vehicles(id, organization_id)` with `ON DELETE CASCADE`. This structurally guarantees status history can never point to a vehicle in a different organization.
- Unique constraints:
  - `vehicles_organization_id_display_id_key` on `(organization_id, display_id)`
  - `vehicles_organization_id_registration_key` on `(organization_id, registration)`
  - `vehicles_vin_key` on `(vin)`

---

## 4. Vehicle Lifecycle State Machine

The Vehicle lifecycle is deliberately narrow and non-cyclical:

```text
    ┌──────────────┐
    │    DRAFT     │ (Default on creation)
    └──────┬───────┘
           │
     ┌─────┴────────┐
     ▼              ▼
┌─────────┐   ┌─────────┐
│ ACTIVE  │──▶│ RETIRED │ (Terminal)
└─────────┘   └─────────┘
```

### Transition Rules

1. **Creation**: Defaults to `DRAFT`. Persists an initial history record with `previousStatus: null`, `newStatus: DRAFT`.
2. **`DRAFT -> ACTIVE`**: Explicit `POST /api/v1/vehicles/:id/activate`. Requires `vehicle.activate` permission.
3. **`DRAFT -> RETIRED`**: Direct decommissioning of uncommissioned vehicles. Explicit `POST /api/v1/vehicles/:id/retire`.
4. **`ACTIVE -> RETIRED`**: Decommissioning of active vehicles. Explicit `POST /api/v1/vehicles/:id/retire`. Requires mandatory `reason`.
5. **Terminal State**: `RETIRED` is irreversible. Any mutation, activation, or transition attempt on a `RETIRED` vehicle returns `INVALID_VEHICLE_TRANSITION` (HTTP 409 Conflict).

---

## 5. Security, Authorization, and Permissions

All operations require trusted tenant context established by the identity boundary (`Authorization: Bearer <JWT>`, `x-organization-id: <UUID>`). Cross-tenant access returns HTTP 404 (or 403) to prevent IDOR leaks.

### Granular Vehicle Permissions

| Permission Code        | Description                                 | Default Roles                             |
| :--------------------- | :------------------------------------------ | :---------------------------------------- |
| `vehicle.read`         | View vehicle lists and details              | Organization Admin, Fleet Manager, Viewer |
| `vehicle.create`       | Register new vehicles in DRAFT status       | Organization Admin, Fleet Manager         |
| `vehicle.update`       | Update metadata (model, odometer, notes)    | Organization Admin, Fleet Manager         |
| `vehicle.activate`     | Transition vehicle from DRAFT to ACTIVE     | Organization Admin, Fleet Manager         |
| `vehicle.retire`       | Permanently retire vehicle                  | Organization Admin                        |
| `vehicle.history.read` | View vehicle lifecycle status audit history | Organization Admin, Fleet Manager, Viewer |

---

## 6. Concurrency and Transactional Consistency

### 6.1 Optimistic Concurrency

Mutations check and increment the `version` integer column:

```sql
UPDATE vehicles
SET model = $1, odometer_km = $2, notes = $3, version = version + 1, updated_at = now()
WHERE id = $4 AND organization_id = $5 AND version = $6
```

If the version does not match, the repository throws `ApplicationError('CONCURRENCY_CONFLICT')`, which maps to HTTP 409 Conflict. The frontend UI captures this and renders a version conflict reload banner.

### 6.2 Atomic Outbox and Audit

Every consequential mutation executes inside `prisma.$transaction`:

1. Persist/update `Vehicle` record.
2. Persist `VehicleStatusHistory` record (if lifecycle changed).
3. Append immutable `AuditLog` entry (capturing actor, action, before/after states, request ID, user agent).
4. Persist `OutboxEvent` (`VehicleCreated`, `VehicleUpdated`, `VehicleActivated`, or `VehicleRetired`).

If any operation fails, all changes roll back atomically.

---

## 7. REST API Endpoints

All routes are mounted under `/api/v1`:

| Method  | Endpoint                              | Permission             | Description                                       |
| :------ | :------------------------------------ | :--------------------- | :------------------------------------------------ |
| `GET`   | `/vehicles`                           | `vehicle.read`         | Paginated list with `search` and `status` filters |
| `POST`  | `/vehicles`                           | `vehicle.create`       | Create vehicle in DRAFT status                    |
| `GET`   | `/vehicles/:vehicleId`                | `vehicle.read`         | Vehicle detail overview                           |
| `PATCH` | `/vehicles/:vehicleId`                | `vehicle.update`       | Update metadata with optimistic concurrency       |
| `POST`  | `/vehicles/:vehicleId/activate`       | `vehicle.activate`     | Transition DRAFT -> ACTIVE                        |
| `POST`  | `/vehicles/:vehicleId/retire`         | `vehicle.retire`       | Transition to terminal RETIRED state              |
| `GET`   | `/vehicles/:vehicleId/status-history` | `vehicle.history.read` | Chronological transition history                  |

---

## 8. Web Management Interface

Next.js App Router screens (`apps/web`):

- `/vehicles` (also mapped via `/app/vehicles` rewrite): Filterable, searchable, paginated fleet table. Loading, empty, search-no-results, and error states.
- `/vehicles/new` (rewrite `/app/vehicles/new`): Registration form validating plate format, 17-char VIN, and required fields.
- `/vehicles/:vehicleId` (rewrite `/app/vehicles/:vehicleId`): Vehicle detail, metadata editing with conflict detection, activation action, retirement modal with justification, terminal status notice, and status history timeline.
- Tenant Header Bar: Displays current organization, authenticated principal, and switcher for `Dev Admin` / `Dev Viewer`.
