# Architecture: Vehicle-Driver Assignment Slice (Milestone 4)

## 1. Overview and Scope

Milestone 4 delivers the **Vehicle-Driver Assignment Vertical Slice** of the Vehicle Management System (VMS). It establishes the first explicit, operational relationship between the independent **Vehicle** and **Driver** aggregates, enforcing strict operational eligibility policies, single-active-assignment integrity, bidirectional aggregate lifecycle guards, optimistic concurrency, transactional outbox publication, and immutable audit logs under trusted multi-tenant boundaries.

### Scope Boundaries

- **In Scope (Milestone 4)**:
  - Persistent assignment entity (`vehicle_driver_assignments`) linking `(organization_id, vehicle_id)` and `(organization_id, driver_id)`.
  - Assignment lifecycle state machine: `ACTIVE -> ENDED` (with `ENDED` terminal).
  - Single active assignment constraint per vehicle and per driver enforced via partial unique indexes in PostgreSQL.
  - Cross-aggregate operational eligibility rules:
    - Vehicle must be in `ACTIVE` status to be assigned.
    - Driver must be in `ACTIVE` status and operationally eligible (valid, unexpired license) to be assigned.
  - Bidirectional aggregate lifecycle guards:
    - Active assignment blocks Vehicle retirement (`VEHICLE_HAS_ACTIVE_ASSIGNMENT` 409 Conflict).
    - Active assignment blocks Driver terminal deactivation (`DRIVER_HAS_ACTIVE_ASSIGNMENT` 409 Conflict).
    - Driver suspension is permitted while assigned; assignment remains active but operational eligibility dynamically transitions to `false`.
  - Optimistic concurrency control via integer `version` field (`CONCURRENCY_CONFLICT` 409).
  - Role-based access control with 3 dedicated assignment permission codes (`assignment.read`, `assignment.create`, `assignment.end`).
  - Transactional outbox events for all mutations (`VehicleDriverAssigned`, `VehicleDriverUnassigned`).
  - Immutable audit logging for assignment creation and termination.
  - Web UI for listing, filtering, creating, and ending assignments, with contextual cards embedded in Vehicle and Driver detail views.
  - Full suite of domain unit tests, API integration tests, worker outbox integration tests, and Playwright browser E2E acceptance tests.
- **Out of Scope (Milestone 5+)**:
  - Trip dispatching, manifests, routes, and waypoints.
  - Driver hours of service (HOS) / electronic logging device (ELD) telematics.
  - Vehicle maintenance work orders and inspection forms.

---

## 2. Layered Architecture

The Assignment slice adheres strictly to the modular monolith dependency direction:

```text
HTTP Transport (AssignmentController, VehicleAssignmentController, DriverAssignmentController, DTOs)
       │
       ▼
Application Use Cases & Repository Ports (AssignmentRepository, AssignmentService)
       │
       ▼
Domain Rules & Validation Policies (Assignment, AssignmentStatus, Eligibility Assertions)
       ▲
       │
Infrastructure Adapters (PrismaAssignmentRepository, PostgreSQL)
```

- **Domain Model (`apps/api/src/modules/assignment/domain/assignment.ts`)**: Pure TypeScript functions and types. Free from any dependency on NestJS, Prisma, Express, or Next.js. Encapsulates lifecycle transitions, timestamp order assertions, text normalization, and eligibility rules.
- **Application Layer (`apps/api/src/modules/assignment/application/`)**: Defines the `AssignmentRepository` interface and `AssignmentService`. Coordinates interactive database transactions, optimistic concurrency checks, cross-aggregate verification, outbox event generation, and audit logging.
- **Infrastructure Layer (`apps/api/src/modules/assignment/infrastructure/prisma-assignment.repository.ts`)**: Implements `AssignmentRepository` using Prisma Client inside interactive database transactions (`database.$transaction`). Enforces trusted tenant filtering on all queries and mutations.
- **Transport Layer (`apps/api/src/modules/assignment/transport/`)**: Three REST controllers (`AssignmentController`, `VehicleAssignmentController`, `DriverAssignmentController`) with `@TenantScoped()`, `@RequirePermissions()`, and `class-validator` DTOs with strict whitelisting.

---

## 3. Database Schema and Constraints

The persistent schema is codified in Prisma migration `20260929120000_assignment` and creates the `vehicle_driver_assignments` table:

### 3.1 `vehicle_driver_assignments` Table

| Column            | Type               | Nullable | Notes                                                              |
| :---------------- | :----------------- | :------- | :----------------------------------------------------------------- |
| `id`              | `uuid`             | No       | Primary Key (`gen_random_uuid()`)                                  |
| `organization_id` | `uuid`             | No       | Tenant Foreign Key -> `organizations(id)` ON DELETE RESTRICT       |
| `vehicle_id`      | `uuid`             | No       | Composite FK -> `(vehicle_id, organization_id)` ON DELETE RESTRICT |
| `driver_id`       | `uuid`             | No       | Composite FK -> `(driver_id, organization_id)` ON DELETE RESTRICT  |
| `status`          | `AssignmentStatus` | No       | Enum: `ACTIVE`, `ENDED` (default `ACTIVE`)                         |
| `started_at`      | `timestamptz(3)`   | No       | Assignment start timestamp (default `CURRENT_TIMESTAMP`)           |
| `ended_at`        | `timestamptz(3)`   | Yes      | Timestamp when assignment was ended                                |
| `end_reason`      | `varchar(500)`     | Yes      | Mandatory reason provided upon ending assignment                   |
| `notes`           | `varchar(500)`     | Yes      | Operational notes                                                  |
| `version`         | `integer`          | No       | Default 1, incremented on state mutation                           |
| `created_at`      | `timestamptz(3)`   | No       | Default `CURRENT_TIMESTAMP`                                        |
| `updated_at`      | `timestamptz(3)`   | No       | Managed on update                                                  |

### 3.2 Database Indexes and Integrity Rules

1. **Partial Unique Indexes for Active Single Assignment**:
   - `idx_assignments_active_vehicle`: `UNIQUE (organization_id, vehicle_id) WHERE status = 'ACTIVE'`
   - `idx_assignments_active_driver`: `UNIQUE (organization_id, driver_id) WHERE status = 'ACTIVE'`
     These database-level partial unique indexes ensure that even under concurrent race conditions, no vehicle or driver can ever have more than one active assignment in the same organization.
2. **Composite Foreign Keys**:
   - `(vehicle_id, organization_id)` references `vehicles(id, organization_id)`
   - `(driver_id, organization_id)` references `drivers(id, organization_id)`
     This guarantees at the database engine level that cross-tenant pairings are physically impossible.
3. **Lookup & Pagination Indexes**:
   - `(organization_id, vehicle_id)`
   - `(organization_id, driver_id)`
   - `(organization_id, status)`

---

## 4. State Machine and Lifecycle Transitions

The assignment aggregate follows a strict 2-state lifecycle:

```text
       ┌──────────┐
       │  ACTIVE  │
       └────┬─────┘
            │
            │ endAssignment(reason, version)
            ▼
       ┌──────────┐
       │  ENDED   │  (Terminal)
       └──────────┘
```

- **Creation**: Always begins in `ACTIVE` status (`version: 1`).
- **Termination**: Transition to `ENDED` requires:
  - Valid `endReason` (1–500 characters).
  - Version check matching current database version.
  - `endedAt` timestamp, which must be equal to or greater than `startedAt`.
- **Terminal State**: `ENDED` is strictly terminal. Attempting to end an already-ended assignment returns `ASSIGNMENT_ALREADY_ENDED` (HTTP 409 Conflict).

---

## 5. Cross-Aggregate Operational Rules

### 5.1 Assignment Preconditions

Before an assignment can be created:

1. **Vehicle Status**: Must be `ACTIVE`. If in `DRAFT` or `RETIRED`, throws `VEHICLE_NOT_ACTIVE` (409 Conflict).
2. **Vehicle Availability**: Must not already have an active assignment. If actively assigned, throws `VEHICLE_ALREADY_ASSIGNED` (409 Conflict).
3. **Driver Status**: Must be `ACTIVE`. If in `DRAFT`, `SUSPENDED`, or `INACTIVE`, throws `DRIVER_NOT_ACTIVE` (409 Conflict).
4. **Driver Availability**: Must not already have an active assignment. If actively assigned, throws `DRIVER_ALREADY_ASSIGNED` (409 Conflict).
5. **Driver Operational Eligibility**: Evaluated deterministically at the assignment reference date (`startedAt`). The driver must possess at least one valid, unexpired license. If not eligible, throws `DRIVER_NOT_ELIGIBLE` (409 Conflict).

### 5.2 Aggregate Lifecycle Guards

To preserve operational consistency across aggregates:

- **Vehicle Retirement Guard**: `VehicleRepository.retireVehicle` queries for any existing `ACTIVE` assignment for that vehicle. If found, it throws `VEHICLE_HAS_ACTIVE_ASSIGNMENT` (409 Conflict). Retirement is allowed only after the active assignment is ended.
- **Driver Deactivation Guard**: `DriverRepository.deactivateDriver` queries for any existing `ACTIVE` assignment for that driver. If found, it throws `DRIVER_HAS_ACTIVE_ASSIGNMENT` (409 Conflict). Terminal deactivation is allowed only after the active assignment is ended.
- **Driver Suspension Coexistence**: Suspending an actively assigned driver is permitted (e.g. for medical reviews or temporary administrative holds). The assignment remains `ACTIVE`, but the driver's derived operational eligibility dynamically evaluates to `false`. Once reactivated, eligibility returns to `true`.

---

## 6. Optimistic Concurrency Control

Assignments utilize an integer `version` field starting at `1`:

- Any mutation (`endAssignment`) must provide the expected version.
- Repository executes:
  ```ts
  const result = await tx.vehicleDriverAssignment.updateMany({
    where: { id: input.assignmentId, organizationId: input.organizationId, version: input.version },
    data: { status: 'ENDED', endedAt, endReason, version: { increment: 1 } },
  });
  if (result.count === 0) throw new ApplicationError('CONCURRENCY_CONFLICT', '...');
  ```
- Stale version requests return `CONCURRENCY_CONFLICT` (HTTP 409), preventing lost updates.

---

## 7. Transactional Outbox Events

All assignment mutations atomically persist outbox events inside the same PostgreSQL transaction:

| Event Type                | Trigger           | Payload Attributes                                                              |
| :------------------------ | :---------------- | :------------------------------------------------------------------------------ |
| `VehicleDriverAssigned`   | Assignment create | `assignmentId`, `organizationId`, `vehicleId`, `driverId`, `startedAt`, `notes` |
| `VehicleDriverUnassigned` | Assignment end    | `assignmentId`, `organizationId`, `vehicleId`, `driverId`, `endedAt`, `reason`  |

Worker outbox processor polls, locks, and publishes these events at least once with idempotency keys.

---

## 8. Immutable Audit Logging

Every assignment mutation records an immutable audit entry in `audit_logs`:

- **Creation**: Action `'assignment.created'`, entity type `'VehicleDriverAssignment'`, `beforeData: null`, `afterData: <assignment_snapshot>`, actor ID, request ID, IP address, user-agent.
- **Termination**: Action `'assignment.ended'`, entity type `'VehicleDriverAssignment'`, `beforeData: <previous_snapshot>`, `afterData: <ended_snapshot>`, actor ID, request ID, IP address, user-agent.

---

## 9. Role-Based Access Control (RBAC)

The permission registry defines 3 dedicated assignment permissions:

| Permission Code     | Description                           | Actions Allowed                                              |
| :------------------ | :------------------------------------ | :----------------------------------------------------------- |
| `assignment.read`   | Read assignment records and history   | GET `/assignments`, `/vehicles/:id/current-assignment`, etc. |
| `assignment.create` | Pair active vehicle & eligible driver | POST `/assignments`                                          |
| `assignment.end`    | Terminate an active assignment        | POST `/assignments/:id/end`                                  |

Viewers receive `assignment.read` only. Mutation endpoints strictly verify permissions via `@RequirePermissions()`.

---

## 10. Web UI Architecture

The Next.js 16 Web application provides seamless, responsive assignment workflows:

- **`/assignments`**: Searchable, filterable list page with status filter (`ALL`, `ACTIVE`, `ENDED`), operational eligibility indicators, and pagination.
- **`/assignments/new`**: Interactive creation workflow with dropdown selectors for active vehicles and active eligible drivers (supporting `?vehicleId=` and `?driverId=` pre-selection).
- **`/assignments/[assignmentId]`**: Detailed view with modal confirmation for ending assignments and concurrency conflict recovery.
- **Contextual Cards**:
  - Vehicle detail page (`/vehicles/[vehicleId]`): Displays Current Driver Assignment card and Assignment History card, plus guard warning on retirement.
  - Driver detail page (`/drivers/[driverId]`): Displays Current Vehicle Assignment card and Assignment History card, plus guard warning on deactivation.

---

## 11. Verification Matrix

| Test Suite              | Coverage                                                               | Status  |
| :---------------------- | :--------------------------------------------------------------------- | :------ |
| Assignment Domain Tests | State machine, eligibility policies, timestamp assertions, normalizers | 17/17   |
| Backend E2E Tests       | Full lifecycle, guards, partial unique indexes, isolation, concurrency | 9/9     |
| Worker Outbox Tests     | Assignment event publication, lease locking, payload integrity         | 7/7     |
| Total Backend API Tests | Complete suite across foundation, vehicle, driver, and assignment      | 79/79   |
| Web Next.js Build       | Static generation and TypeScript strict typechecking (all 9 routes)    | Clean   |
| Playwright Browser E2E  | UI lifecycle, bidirectional cards, retire/deactivate guards, RBAC      | 2 tests |
