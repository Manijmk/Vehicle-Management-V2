# Architecture: Compliance and Documents Slice (Milestone 8)

## 1. Overview and Scope

Milestone 8 delivers the **Compliance and Documents Vertical Slice** for the Vehicle Management System (VMS). Compliance governs regulatory requirements, operating permits, mandatory certifications, and document lifecycle management for fleet vehicles and active drivers.

### Scope Boundaries

- **In Scope (Milestone 8)**:
  - **Core Domain Entities & Value Objects**:
    - `ComplianceDocumentType`: Tenant-level catalog defining compliance rules, requirements, duration limits, and operational blocking flags (`ACTIVE` / `ARCHIVED`).
    - `ComplianceDocument`: Authoritative record of an uploaded compliance file, certificate, or permit (`ACTIVE -> SUPERSEDED / REVOKED`).
    - `SubjectComplianceEvaluation`: Pure, deterministic evaluation of all document requirements for a vehicle or driver.
  - **Operational Invariants & Core Domain Protections**:
    - Subject scope is strictly restricted to `VEHICLE` and `DRIVER`.
    - `Vehicle.status` remains strictly decoupled: `DRAFT -> ACTIVE -> RETIRED`. No `NON_COMPLIANT`, `UNREGISTERED`, or `EXPIRED` status is added to Vehicle.
    - `Driver.status` remains strictly decoupled: `DRAFT -> ACTIVE -> SUSPENDED -> INACTIVE`.
    - `DriverLicense` remains an independent, canonical concept in the Driver domain; it is NOT duplicated as a generic compliance document.
    - Compliance status is DERIVED dynamically on demand: `COMPLIANT`, `WARNING`, or `NON_COMPLIANT`.
    - Operational blocking is derived dynamically: `operationallyBlocked = true` whenever any active document type with `blocksOperation = true` is in state `MISSING` or `EXPIRED`.
    - Trip operational gates: Trip `READY` and `START` check compliance for both the assigned vehicle and driver, rejecting non-compliant dispatch with `409 Conflict` (`TRIP_VEHICLE_NOT_COMPLIANT` / `TRIP_DRIVER_NOT_COMPLIANT`).
    - In-progress trips (`IN_PROGRESS`) can always `COMPLETE` or `ABORT` regardless of document expiration during the trip.
  - **Object Storage & Document Security**:
    - MinIO S3 object storage integration via `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`.
    - Files stored with tenant-isolated, server-generated private keys (`tenants/{orgId}/compliance/{subjectType}/{subjectId}/{uuid}.{ext}`).
    - Server-side SHA-256 integrity checksumming and MIME type verification.
    - Secure time-limited pre-signed download URLs (15-minute expiration); raw storage paths are never leaked.
  - **Document Replacement and Revocation**:
    - Replacing an active document atomizes supersession (`SUPERSEDED`) and inserts the new version (`ACTIVE`) within a single database transaction.
    - Revoking an active document requires a mandatory revocation reason, permanently setting its status to `REVOKED`.
  - **Role-Based Access Control (RBAC)**:
    - 5 granular permissions: `compliance.type.read`, `compliance.type.manage`, `compliance.read`, `compliance.document.upload`, `compliance.document.download`, `compliance.document.manage`.
  - **Optimistic Concurrency & Audit Logging**:
    - Versioned document types and documents with `version` column and concurrency checks.
    - Immutable audit logs for all type updates, document uploads, downloads, replacements, and revocations.
  - **Responsive Web Portal**:
    - Dashboard at `/compliance` with fleet-wide summary metrics (blocked vehicles/drivers, expiring documents) and filterable exceptions list.
    - Catalog management at `/compliance/document-types` and `/compliance/document-types/new`.
    - Document registry at `/compliance/documents` and document detail/lifecycle at `/compliance/documents/[documentId]`.
    - Deep integrations on Vehicle details (`/vehicles/[vehicleId]`), Driver details (`/drivers/[driverId]`), and Trip details (`/trips/[tripId]`).

- **Out of Scope (Preserved for Future Milestones)**:
  - Fuel transactions, charging logs, expenses, accounting ledger, and invoice processing.
  - GPS tracking, live telemetry, and engine diagnostic codes (DTC).
  - Background cron notification engines, automated email/SMS dispatch.

---

## 2. Layered Architecture

The Compliance slice preserves the modular-monolith architectural direction:

```text
HTTP Transport (ComplianceController, VehicleComplianceController, DriverComplianceController)
       │
       ▼
Application Use Cases & Ports (ComplianceService, ComplianceRepository, ObjectStoragePort, OperationalComplianceGatePort)
       │
       ▼
Domain Entities & Pure Evaluation (ComplianceDocumentType, ComplianceDocument, evaluateSubjectCompliance)
       ▲
       │
Infrastructure Adapters (PrismaComplianceRepository, S3ObjectStorageAdapter)
```

1. **Transport Layer**:
   - `ComplianceController`: Tenant-wide document types catalog, fleet document registry, pre-signed download generation, document replacement, and revocation.
   - `VehicleComplianceController`: Vehicle compliance evaluations and vehicle-scoped document uploads.
   - `DriverComplianceController`: Driver compliance evaluations and driver-scoped document uploads.
2. **Application Layer**:
   - `ComplianceService`: Coordinates transactions, policy evaluation, object storage, transactional outbox events, and audit logging.
   - `ObjectStoragePort`: Abstracts object storage operations (`uploadObject`, `generatePresignedDownloadUrl`, `deleteObject`).
   - `OperationalComplianceGatePort`: Exported port consumed by Trip module for pre-dispatch gating.
3. **Domain Layer**:
   - `ComplianceDocumentType`: Entity validating policy invariants (e.g. `blocksOperation` requires `required = true`).
   - `ComplianceDocument`: Entity encapsulating lifecycle states (`ACTIVE`, `SUPERSEDED`, `REVOKED`) and expiration rules.
   - `evaluateSubjectCompliance`: Pure function computing requirement states (`VALID`, `EXPIRING_SOON`, `EXPIRED`, `MISSING`) and overall operational availability.
4. **Infrastructure Layer**:
   - `PrismaComplianceRepository`: PostgreSQL persistence adapter enforcing composite tenant foreign keys, tenant isolation, and partial unique active document indexes.
   - `S3ObjectStorageAdapter`: AWS S3 / MinIO client implementation with path-style addressing and presigned URL generation.

---

## 3. Database Schema and Multi-Tenancy

Checked-in migration: `20261110000000_compliance_documents`

### Key Constraints

1. **`compliance_document_types`**:
   - Primary key: `id` (UUID).
   - Multi-tenant natural key: `UNIQUE (organization_id, code)`.
   - Composite foreign keys for referenced checks: `UNIQUE (id, organization_id, subject_type)`.
   - Check constraint: `CHECK (blocks_operation = false OR required = true)`.
2. **`compliance_documents`**:
   - Composite foreign keys:
     - `FOREIGN KEY (document_type_id, organization_id, subject_type) REFERENCES compliance_document_types(id, organization_id, subject_type)`.
     - `FOREIGN KEY (vehicle_id, organization_id) REFERENCES vehicles(id, organization_id)`.
     - `FOREIGN KEY (driver_id, organization_id) REFERENCES drivers(id, organization_id)`.
   - Subject integrity check constraint: `CHECK ((vehicle_id IS NOT NULL AND driver_id IS NULL) OR (vehicle_id IS NULL AND driver_id IS NOT NULL))`.
   - Partial unique indexes ensuring **at most one ACTIVE document per subject per document type**:
     - `compliance_docs_one_active_vehicle_idx`: `UNIQUE (organization_id, vehicle_id, document_type_id) WHERE status = 'ACTIVE'`.
     - `compliance_docs_one_active_driver_idx`: `UNIQUE (organization_id, driver_id, document_type_id) WHERE status = 'ACTIVE'`.

---

## 4. Operational Gating Verification

Trip lifecycle verification proves:

- `Trip -> READY` evaluates vehicle and driver compliance. Missing/expired blocking document rejects with `409 Conflict`.
- `Trip -> START` re-evaluates compliance at departure time.
- `Trip -> COMPLETE` and `Trip -> ABORT` are **NEVER blocked by compliance**, ensuring that in-progress trips can always be safely concluded.

---

## 5. Security & RBAC Matrix

| Role                   | `compliance.type.read` | `compliance.type.manage` | `compliance.read` | `compliance.document.upload` | `compliance.document.download` | `compliance.document.manage` |
| :--------------------- | :--------------------: | :----------------------: | :---------------: | :--------------------------: | :----------------------------: | :--------------------------: |
| **Organization Admin** |          Yes           |           Yes            |        Yes        |             Yes              |              Yes               |             Yes              |
| **Viewer**             |          Yes           |            No            |        Yes        |              No              |               No               |              No              |
