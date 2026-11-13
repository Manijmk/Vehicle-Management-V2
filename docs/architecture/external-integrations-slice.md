# External Integrations Vertical Slice Architecture

## 1. Overview and Architectural Boundaries

The External Integrations vertical slice (Milestone 14) enables enterprise inter-system connectivity, outbound webhook dispatch, inbound telematics ingestion, fuel-card file import, and accounting export for the Vehicle Management System.

Architectural principles strictly preserved:

```text
transport (IntegrationController, TelematicsWebhookController)
  -> application / use cases (IntegrationService)
    -> domain (IntegrationConnection, IntegrationSecret, WebhookSubscription,
               WebhookDelivery, TelematicsWebhook, FuelCardImport, AccountingExport)
      -> repository interfaces (IntegrationRepository port)
        <- infrastructure adapters (PrismaIntegrationRepository)
```

### Key Architectural Constraints

1. **Strict Modular Monolith Architecture**: Integrations reside as a core domain module inside `apps/api/src/modules/integration/` and `apps/worker/src/integrations/`. No microservices, message buses (Kafka/RabbitMQ), or external broker dependencies were added.
2. **Deterministic Additive Migration**: Migration `20261116000000_external_integrations` introduces 7 operational integration tables (`integration_connections`, `integration_secrets`, `webhook_subscriptions`, `webhook_deliveries`, `webhook_delivery_attempts`, `integration_device_mappings`, `fuel_card_import_batches`, `external_transaction_identities`, `accounting_export_logs`) with full multi-tenant foreign keys, composite indexes, and optimistic concurrency versioning.
3. **Tenant Isolation**: Every integration entity is permanently partitioned by `organization_id`. Cross-tenant secret lookup, subscription dispatch, telematics mapping, or file import is structurally impossible.
4. **No Proprietary Vendor SDKs**: Implementation uses standardized web protocols (HMAC-SHA256, RFC 4180 CSV, JSON, HTTPS) with no proprietary third-party SDK dependencies (Samsara, Geotab, WEX, QuickBooks, SAP, NetSuite).
5. **No Payment Gateways or General Ledger**: Operates strictly within fleet integration scope: outbound webhooks, telemetry ingestion, fuel card feeds, and CSV accounting handoffs.

---

## 2. Integration Connection Registry & Lifecycle

Each integration connection represents an external system integration registered within an organization.

### Connection Kinds

- `OUTBOUND_WEBHOOK`: Dispatch internal platform domain events to external subscriber HTTP webhooks.
- `INBOUND_TELEMATICS`: Ingest GPS positions, speed, and telemetry from external telematics providers into internal vehicles.
- `FUEL_CARD_IMPORT`: Ingest and validate external fleet fuel card transaction CSV batches into Finance.
- `ACCOUNTING_EXPORT`: Produce standardized CSV exports of posted financial expenses and fuel transactions for general ledger ingestion.

### Lifecycle State Machine

```mermaid
stateDiagram-v2
    [*] --> DRAFT: Register Connection
    DRAFT --> ACTIVE: Activate
    DRAFT --> DISABLED: Disable
    ACTIVE --> SUSPENDED: Suspend (temporary halt)
    ACTIVE --> DISABLED: Disable (terminal)
    SUSPENDED --> ACTIVE: Reactivate
    SUSPENDED --> DISABLED: Disable (terminal)
    DISABLED --> [*]: Terminal State
```

- **Optimistic Concurrency Control**: Every lifecycle transition verifies the client's supplied `version` against current database state. Simultaneous updates trigger `CONCURRENCY_CONFLICT` (HTTP 409).
- **Suspension Semantics**: Suspended connections halt outbound webhook deliveries and reject inbound telematics ingestion with HTTP 422 `INTEGRATION_CONNECTION_INVALID_STATE`.

---

## 3. Secret Encryption & Key Management Model

Integration connections use symmetrical shared secrets for cryptographic HMAC-SHA256 signing of outbound webhooks and validation of inbound telematics.

### Cryptographic Specification

- **Algorithm**: `AES-256-GCM` authenticated symmetric encryption.
- **Key Derivation**: Key material is derived from `INTEGRATION_MASTER_KEY` using SHA-256 (`crypto.createHash('sha256').update(masterKey).digest()`).
- **Encrypted Serialization**: `v1:<ivHex>:<authTagHex>:<ciphertextHex>` (12-byte IV, 16-byte auth tag).
- **Verification Hash**: Plaintext secrets are hashed using SHA-256 (`crypto.createHash('sha256').update(secret).digest('hex')`) for constant-time existence and lookup checks without decrypting payload.
- **One-Time Reveal Guarantee**: The generated `whsec_<64-hex>` secret is returned in plaintext _only once_ in the creation/rotation HTTP response (`POST /api/v1/integrations/:connectionId/credentials`). Subsequent `GET` requests never expose plaintext or cipher keys.
- **Secret Rotation**: Triggering rotation revokes all prior active secrets (`status: REVOKED`) and issues a new active secret with incremented `keyVersion`.

---

## 4. Outbound Signed Webhooks & Delivery Worker

### Approved Event Catalog (`ALLOWED_WEBHOOK_EVENT_TYPES`)

Webhook subscriptions can only bind to approved transactional outbox events:
`TripCreated`, `TripReady`, `TripStarted`, `TripCompleted`, `TripCancelled`, `TripAborted`, `VehicleCreated`, `VehicleActivated`, `VehicleUpdated`, `VehicleRetired`, `DriverCreated`, `DriverActivated`, `DriverSuspended`, `DriverReactivated`, `DriverDeactivated`, `AssignmentCreated`, `AssignmentEnded`, `InspectionCompleted`, `InspectionFailed`, `InspectionCriticalFailureDetected`, `WorkOrderCreated`, `WorkOrderCompleted`, `MaintenanceRequestCreated`, `ComplianceDocumentUploaded`, `ComplianceDocumentRevoked`, `ComplianceDocumentReplaced`, `FuelTransactionCreated`, `FuelTransactionVoided`, `FuelAnomalyDetected`, `ExpenseCreated`, `ExpensePosted`, `ExpenseVoided`, `IncidentReported`, `IncidentStatusChanged`, `IncidentResolved`, `IncidentClosed`, `IncidentCancelled`. Wildcard `*` or arbitrary uncatalogued strings are strictly rejected with HTTP 422.

### Server-Side Request Forgery (SSRF) Prevention

All subscriber endpoint URLs are validated through `assertSafeEndpointUrl()` prior to persistence:

- Must use HTTPS protocol (HTTP permitted only in explicit local dev mode for `localhost`).
- Rejects IPv4 private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`).
- Rejects link-local (`169.254.0.0/16`), multicast (`224.0.0.0/4`), and reserved addresses.
- Rejects loopback addresses and private IPv6 ranges (`::1`, `fc00::/7`, `fe80::/10`).
- Rejects embedded user credentials in URL authority (`https://user:pass@host`).

### Signature Header Format

Each outbound webhook payload is dispatched with headers:

- `X-VMS-Event-ID`: Unique UUID of the outbox source event.
- `X-VMS-Event-Type`: Platform domain event name (e.g. `TripCompleted`).
- `X-VMS-Timestamp`: Millisecond Unix timestamp of dispatch.
- `X-VMS-Signature`: `v1=<hmac-sha256-hex>` where HMAC is computed over `<timestamp>.<jsonBody>`.

### Delivery Worker Engine (`WebhookDeliveryProcessorService`)

- **Leasing & Concurrency**: Runs on a 3-second cycle in `apps/worker`. Uses atomic `UPDATE ... WHERE (lockedUntil IS NULL OR lockedUntil <= NOW())` to claim batches of up to 25 deliveries per cycle with worker-specific `lockedBy` and 30-second lease expiry.
- **Backoff & Jitter**: Failed deliveries are retried up to 5 times using exponential backoff with full jitter:
  $$T_{\text{retry}} = \min(3600, 5 \times 2^{\text{attempt}}) \pm \text{jitter}$$
- **Terminal States**: Succeeds on HTTP 2xx (`SUCCESS`). After 5 attempts, transitions to `EXHAUSTED`.
- **Manual Retry**: `POST /api/v1/integrations/:connectionId/webhooks/deliveries/:deliveryId/retry` resets status to `PENDING`, zeroing backoff for operators.

---

## 5. Inbound Telematics Webhook & Device Mapping

External GPS/telematics providers push position updates via `POST /api/v1/integrations/telematics/:connectionId/events`.

### Authentication & Idempotency

1. **Clock Skew Tolerance**: Webhook header `x-vms-timestamp` must fall within $\pm 300\text{ seconds}$ (5 minutes) of server UTC time.
2. **Constant-Time HMAC Verification**: Webhook body is verified against the connection's active secret using `crypto.timingSafeEqual()`. Mismatched signatures immediately return HTTP 401 Unauthorized.
3. **Payload Deduplication**: Scoped to `(organization_id, connection_id, external_event_id)`. Replays with identical payload return idempotent HTTP 200 `{ status: "DUPLICATE", duplicate: true }`. Conflicting payloads with identical ID return HTTP 409 Conflict.

### Provider-Device Mapping

Telematics providers identify vehicles using vendor-specific IDs (IMEI, serial, device ID).
`IntegrationDeviceMapping` maps `(connectionId, providerDeviceId)` $\rightarrow$ `telemetryDeviceId`.
Positions ingested through the webhook are enriched with the internal telemetry device ID and submitted to `TelemetryService.recordPositionsBatch()` with source `WEBHOOK`, seamlessly updating live vehicle coordinates, speed, and trip routes.

---

## 6. Fuel-Card Batch Import Workflow

Enables bulk ingestion of fleet fuel card CSV statements (e.g., WEX, Comdata, FleetCor, Shell) into the authoritative Finance domain.

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Fleet Administrator
    participant API as Integrations API
    participant Finance as Finance Domain
    participant DB as PostgreSQL

    Admin->>API: POST /integrations/:id/fuel-card/import/preview (CSV file)
    API->>API: Parse RFC 4180 CSV & validate columns
    API->>DB: Query vehicle registrations & duplicate external IDs
    API->>DB: Store FuelCardImportBatch (status: PREVIEW)
    API-->>Admin: Return preview with valid/invalid rows

    Admin->>API: POST /integrations/:id/fuel-card/import/confirm (batchId)
    API->>Finance: createFuelTransaction(source: FUEL_CARD_IMPORT)
    Finance->>DB: Insert FuelTransaction & outbox event
    API->>DB: Insert ExternalTransactionIdentity link
    API->>DB: Update batch (status: CONFIRMED)
    API-->>Admin: Return confirmed importedRows count
```

- **Row-Level Validation**: Each row checks required fields (`externalTransactionId`, `vehicleRegistration`, `occurredAt`, `energyType`, `quantity`, `unitPrice`, `totalAmount`, `currencyCode`).
- **Vehicle Resolution**: Automatically resolves internal `vehicleId` by matching `vehicleRegistration` within the organization. Missing vehicles generate explicit row validation errors without corrupting the batch.
- **External Deduplication**: `ExternalTransactionIdentity` prevents double-posting identical external transaction IDs across re-uploaded files.

---

## 7. Accounting Export & Formula Injection Defense

Financial ledger handoff endpoint `GET /api/v1/integrations/:connectionId/accounting/export` produces audit-ready CSV extracts of all posted transactions within a date window `[from, to)`.

### Multi-Currency Partitioning & Zero FX

In accordance with system-wide financial integrity rules, amounts are **never** converted using estimated foreign exchange rates. Expenses and fuel transactions are strictly grouped and exported with explicit ISO 4217 currency codes.

### CSV Formula Injection Defense

To prevent CSV/spreadsheet code execution exploits in Microsoft Excel, LibreOffice, or Google Sheets, all exported text cells are sanitized:

- Cells beginning with formula triggers (`=`, `+`, `-`, `@`, `\t`, `\r`) are prepended with a neutralizing single quotation mark (`'`).
- Enclosed in RFC 4180 double quotes with internal quotes escaped as `""`.

### Audit Logging

Every generated accounting export creates an immutable `AccountingExportLog` recording `organizationId`, `connectionId`, `actorId`, `fromUtc`, `toUtc`, `rowCount`, and `createdAt`.

---

## 8. Role-Based Access Control (RBAC) & Tenant Isolation

| Permission                      | Purpose                                                                 |
| ------------------------------- | ----------------------------------------------------------------------- |
| `integration.read`              | View connections, subscriptions, deliveries, mappings, batches, exports |
| `integration.manage`            | Create, update, activate, suspend, and disable integration connections  |
| `integration.secret.manage`     | Provision and rotate encrypted AES-256-GCM integration secrets          |
| `integration.webhook.retry`     | Trigger manual retry of failed/exhausted outbound webhook deliveries    |
| `integration.telematics.map`    | Create, update, or remove provider-to-telemetry device mappings         |
| `integration.fuel-card.import`  | Upload CSV previews and confirm fuel card transaction batches           |
| `integration.accounting.export` | Request and download accounting ledger CSV export feeds                 |

Dev Viewers with read-only permissions can inspect integration listings and metadata, but all mutation buttons, secret reveals, and file uploads are blocked and return HTTP 403 Forbidden.

---

## 9. Observability & Prometheus Metrics

Low-cardinality Prometheus metrics tracked by `IntegrationMetricsService`:

- `integrations_webhooks_dispatched_total{status="SUCCESS|RETRYING|EXHAUSTED"}`: Counter of outbound webhook dispatch attempts.
- `integrations_webhook_duration_ms`: Histogram tracking external subscriber response latency.
- `integrations_telematics_ingested_total{status="SUCCESS|DUPLICATE|INVALID"}`: Counter of telematics webhook events processed.
- `integrations_telematics_positions_total`: Total position coordinates ingested.
- `integrations_fuel_card_rows_total{phase="preview|confirmed"}`: Fuel card transaction rows parsed and confirmed.
- `integrations_accounting_exports_total`: Number of ledger CSV exports generated.

---

## 10. Boundary Distinctions, Protocol Scope & Security Hardening

To preserve clear architectural expectations and prevent over-claiming capability:

### 1. Generic Webhook Protocol vs Proprietary Vendor Integration

- The system implements standardized HTTP REST/JSON webhook delivery and inbound signed telematics ingest using raw-body HMAC-SHA256 signatures, Unix millisecond timestamps, and configurable device identifier mappings (`IntegrationDeviceMapping`).
- The system does **not** package proprietary closed-source vendor client SDKs or proprietary streaming protocols (e.g., direct binary protocols for Geotab or proprietary Samsara cloud SDKs). Providers push standardized signed JSON or use adapter middleware.

### 2. Generic Fuel-Card CSV Import vs Live Fuel-Card Provider Connectivity

- The system implements high-assurance RFC 4180 CSV file batch import with two-phase preview and confirmation, strict vehicle registration matching, ISO 4217 currency validation, physical quantity unit partitioning, finance anomaly checks, and external transaction deduplication (`ExternalTransactionIdentity`).
- The system does **not** maintain persistent bidirectional socket connections or live payment card network authorization streams (e.g., direct banking clearing houses or real-time card authorization engines).

### 3. Accounting-Ready Export vs General-Ledger Posting

- The system produces structured, currency-segregated, formula-injection-sanitized CSV export files covering authorized `POSTED` fuel and expense transactions within a specified time window `[from, to)`.
- The system does **not** execute direct remote journal entries or automated transaction booking into third-party ERP general ledgers (e.g., direct SAP, Oracle NetSuite, or QuickBooks Online REST API journal posting).

### 4. Tested Production Security Controls vs Deferred Deployment Hardening

- **Tested Production Controls**:
  - AES-256-GCM encryption with authenticated tags and key versioning for all shared secrets.
  - One-time plaintext secret reveal guarantee.
  - Timing-safe HMAC-SHA256 signature calculation and verification.
  - Strict 5-minute clock skew tolerance on inbound telematics.
  - Multi-tenant data segregation enforced at database and foreign key layers.
  - Outbound SSRF defense verifying scheme, credentials, loopback, private IPv4/IPv6, link-local, and DNS resolution at both subscription and connection dispatch time.
  - Refusal of HTTP redirects (`redirect: 'error'`) during webhook dispatch.
  - Cross-domain dual authorization matrix enforcing source-domain authorities alongside integration permissions.
  - CSV formula injection neutralization.
- **Deferred Deployment Hardening**:
  - Outbound enterprise forward proxy or egress firewall restrictions.
  - External key management service (KMS / HashiCorp Vault) integration for envelope master keys.
  - Cloud Edge Web Application Firewall (WAF) rate limiting on inbound telematics endpoints.
