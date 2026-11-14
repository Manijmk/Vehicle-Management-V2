# Milestone 14 Release Candidate Manifest

**Application:** Vehicle Management System (VMS)  
**Target Release:** Milestone 14 — External Integrations Vertical Slice  
**Branch:** `release/m14-application-candidate`  
**Commit Message:** `chore(release): freeze VMS milestones 12-14 application baseline`

---

## 1. Runtime and System Specifications

| Component           | Target / Declared Version                  | Verified Runtime                |
| :------------------ | :----------------------------------------- | :------------------------------ |
| **Node.js**         | `>=22.12 <23` (`.node-version`, `.nvmrc`)  | Node.js v22.12.0+               |
| **Package Manager** | `pnpm@11.22.0` (`package.json`)            | pnpm 11.22.0                    |
| **PostgreSQL**      | `17-alpine`                                | PostgreSQL 17.0 (Debian/Alpine) |
| **Redis**           | `7.4-alpine`                               | Redis 7.4                       |
| **MinIO (S3)**      | `minio/minio:latest`                       | S3 API compatible storage       |
| **OS Environment**  | Windows 11 host with WSL2 Ubuntu 24.04 LTS | Linux 6.6.x / Windows           |

---

## 2. Canonical Prisma Migration Ledger (18 Migrations)

The canonical sequence consists of exactly 18 migration directories under `packages/database/prisma/migrations`:

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
12. `20261112000000_incident`
13. `20261113000000_notifications_automation`
14. `20261114000000_telemetry_gps`
15. `20261114120000_telemetry_integrity`
16. `20261114180000_telemetry_projection_integrity`
17. `20261115000000_reporting_analytics`
18. `20261116000000_external_integrations`

### Legacy Migration Ledger Notes

- **Initial Migrations (1–5):** Recorded with `manual-apply` checksums in early development databases; canonical SQL files exist in repository.
- **Trip Migration (`20261019000000_trip`):** Contains a historical first record (id `607274de-fb9e-4690-bc09-c1a7fea61790`) with `finished_at = NULL` and `rolled_back_at = '2026-10-29 11:16:39.945085+00'` generated via `prisma migrate resolve --rolled-back`. The active applied record (id `8d098c8b-2a42-42f6-8663-1b44fbe68b22`, checksum `e3b4b4f4...`) was successfully applied at `'2026-10-29 11:17:28.349107+00'`. Fresh database deployments deploy all 18 migrations cleanly with 0 rolled-back attempts.

---

## 3. Automated Test Verification Totals

The complete test suite runs against the committed codebase:

- **API Tests (`apps/api`):** 600 passing (0 failed, 0 skipped) across 35 test suites.
- **Worker Tests (`apps/worker`):** 23 passing (0 failed, 0 skipped) across 5 test suites.
- **Package Tests (`packages/*`):** 5 passing (0 failed, 0 skipped) across 3 test suites (`@vms/config` [2], `@vms/validation` [2], `@vms/observability` [1]).
- **Playwright Browser Tests (`apps/web`):** 46 passing (0 failed, 0 skipped) across 10 test specs.
- **Total Automated Tests:** 674 passing, 0 failing, 0 skipped.

---

## 4. Environment Variables Specification

The application requires the following environment variables (defined and validated by `@vms/config`):

### Core Runtime

- `NODE_ENV`: Application environment (`development`, `test`, `production`).
- `LOG_LEVEL`: Logging verbosity (`trace`, `debug`, `info`, `warn`, `error`, `fatal`).
- `OTEL_ENABLED`: OpenTelemetry exporter toggle (`true` / `false`).
- `OTEL_SERVICE_NAME`: Service identifier for tracing (e.g. `vehicle-management`).
- `OTEL_EXPORTER_OTLP_ENDPOINT`: OpenTelemetry collector URL (e.g. `http://localhost:4318`).

### API Transport & Authentication

- `API_PORT`: Port for NestJS HTTP server (default `3001`).
- `API_CORS_ORIGINS`: Comma-separated list of allowed origins (e.g. `http://localhost:3000`).
- `AUTH_PROVIDER`: Identity provider adapter (`local` for development; OIDC in production).
- `AUTH_ISSUER`: Expected JWT issuer claim.
- `AUTH_AUDIENCE`: Expected JWT audience claim.
- `AUTH_LOCAL_SIGNING_KEY`: Secret used for signing local dev tokens (min 32 chars).
- `INTEGRATION_MASTER_KEY`: 256-bit hexadecimal key (64 hex characters / 32 bytes) used for AES-256-GCM secret encryption.

### Web Application

- `WEB_PORT`: Port for Next.js HTTP server (default `3000`).
- `NEXT_PUBLIC_API_BASE_URL`: Base URL for browser-side API calls (e.g. `http://localhost:3001/api/v1`).

### Infrastructure Services

- `DATABASE_URL`: PostgreSQL connection string with schema parameter.
- `REDIS_URL`: Redis connection string.
- `S3_ENDPOINT`: Object storage endpoint (e.g. `http://localhost:9000`).
- `S3_REGION`: Storage region (e.g. `us-east-1`).
- `S3_BUCKET`: Storage bucket name for documents, receipts, and exports.
- `S3_ACCESS_KEY`: Storage client access key ID.
- `S3_SECRET_KEY`: Storage client secret access key.
- `S3_FORCE_PATH_STYLE`: MinIO path-style access toggle (`true` / `false`).

### Transactional Outbox & Webhook Delivery Worker

- `OUTBOX_POLL_INTERVAL_MS`: Polling interval for transactional outbox table (default `1000`).
- `OUTBOX_BATCH_SIZE`: Maximum batch size of outbox records per cycle (default `20`).
- `OUTBOX_LOCK_TIMEOUT_MS`: Lease lock timeout for outbox dispatch (default `60000`).
- `WEBHOOK_DELIVERY_POLL_INTERVAL_MS`: Polling interval for queued webhook deliveries (default `1000`).
- `WEBHOOK_DELIVERY_BATCH_SIZE`: Batch size for webhook dispatches per cycle (default `20`).
- `WEBHOOK_DELIVERY_LOCK_TIMEOUT_MS`: Lease fencing duration for worker dispatch (default `60000`).

---

## 5. Local Reproduction and Build Procedure

1. **Clone and Checkout:**
   ```bash
   git clone <repo-url>
   git checkout release/m14-application-candidate
   ```
2. **Install Dependencies:**
   ```bash
   pnpm install --frozen-lockfile
   ```
3. **Configure Environment:**
   ```bash
   cp .env.example .env
   # Ensure DATABASE_URL, REDIS_URL, S3_* variables point to running services
   ```
4. **Deploy Database Schema:**
   ```bash
   pnpm db:generate
   pnpm db:migrate:deploy
   pnpm db:seed
   ```
5. **Quality & Validation Checks:**
   ```bash
   pnpm format:check
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   pnpm test:e2e
   ```

---

## 6. Database Backup & Disaster Recovery Requirement

Before applying any production migration or upgrade:

1. Execute a full point-in-time logical or physical backup (`pg_dump -Fc` or WAL archive snapshot).
2. Verify backup integrity by testing restoration on an isolated staging database.
3. Ensure transactional DDL supports clean rollbacks; note that schema migrations containing enum additions or concurrent index builds require strict sequence orchestration.

---

## 7. Production Infrastructure Prerequisites

The following enterprise security and infrastructure controls are prerequisites for production deployment and are explicitly identified as outside the scope of local application milestones:

1. **Managed Key Infrastructure (KMS / HSM):**
   - Migration from local `INTEGRATION_MASTER_KEY` environment variable to AWS KMS, GCP KMS, or HashiCorp Vault with automated envelope encryption and key rotation.
2. **Network Egress Filtering & SSRF Defense-in-Depth:**
   - While application-level DNS lookup and CIDR block checks reject private/link-local/loopback destinations, production deployment requires egress proxies or VPC firewall rules (e.g. AWS Security Groups, Calico NetworkPolicies) blocking RFC 1918 and cloud metadata (`169.254.169.254`) at the packet filter level.
3. **Inbound Rate Limiting & Web Application Firewall (WAF):**
   - Cloudflare / AWS WAF protection against DDoS, credential stuffing, and volumetric attacks targeting webhook receivers and public API endpoints.
4. **TLS Termination & Cipher Governance:**
   - Enforce TLS 1.3 only with strict HSTS, secure cipher suites, and automated certificate lifecycle management (Let's Encrypt / AWS ACM).
5. **Observability, Alerting & Incident Response:**
   - Distributed OpenTelemetry collector pipeline, centralized logging (Elasticsearch/Datadog), Prometheus metrics scraping, and automated paging for worker lease starvation, outbox lag, or webhook failure spikes.
6. **Backup Automation & Restore Drills:**
   - Automated continuous WAL archiving with daily full snapshots, tested with regular automated recovery drills.
