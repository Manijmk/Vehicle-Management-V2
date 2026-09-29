# Vehicle Management System

A production-oriented, multi-tenant fleet operations platform built as a domain-driven modular monolith.

Milestone 1 provides identity, organizations, trusted tenancy, permission-based RBAC, immutable audit records, and a transactional outbox. Fleet business modules begin in Milestone 2.

## Workspace

| Path                     | Responsibility                                 |
| ------------------------ | ---------------------------------------------- |
| `apps/api`               | NestJS REST API and OpenAPI composition root   |
| `apps/web`               | Next.js management web application             |
| `apps/worker`            | NestJS background worker composition root      |
| `packages/database`      | Prisma client boundary, schema, and migrations |
| `packages/contracts`     | Transport-neutral shared contracts             |
| `packages/config`        | Validated process configuration                |
| `packages/validation`    | Shared validation primitives                   |
| `packages/observability` | OpenTelemetry-compatible bootstrap             |
| `packages/ui`            | Shared React UI primitives                     |

Read [the architecture overview](docs/architecture/overview.md) and [ADRs](docs/adr/README.md) before making architectural changes.

## Prerequisites

- Node.js 22.12 or later in the Node 22 line
- Corepack and pnpm 11 (the exact pnpm version is declared in `package.json`)
- Docker Desktop or Docker Engine with Compose

The repository intentionally rejects unsupported Node majors. If the host Node installation is unsuitable, run the workspace toolchain from a Node 22 container after starting Docker.

## Local setup

```bash
corepack enable
corepack prepare pnpm@11.22.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev:infra
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

PowerShell equivalent for the environment file:

```powershell
Copy-Item .env.example .env
```

The local services are:

- Web: <http://localhost:3000>
- API health: <http://localhost:3001/api/v1/health>
- OpenAPI UI: <http://localhost:3001/api/docs>
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- MinIO API: `localhost:9000`
- MinIO console: <http://localhost:9001>

Values in `.env.example` are local-development credentials only. Deployed environments must use a secrets manager and unique credentials.

After seeding, generate an eight-hour development bearer token for `dev.admin@example.test`:

```bash
pnpm auth:dev-token
```

Send it as `Authorization: Bearer <token>`. For tenant-scoped routes also send `x-organization-id: 10000000-0000-4000-8000-000000000001`. The token command uses the local/test adapter only; see [ADR 0004](docs/adr/0004-authentication-tenancy-rbac.md).

To stop local infrastructure:

```bash
pnpm dev:infra:down
```

To build and run every application as a container:

```bash
docker compose --profile applications up --build
```

## Validation

```bash
pnpm db:format
pnpm db:generate
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @vms/web exec playwright install chromium
pnpm test:e2e
```

Apply migrations to a configured PostgreSQL database with `pnpm db:migrate:deploy`. The empty baseline is followed by the Milestone 1 identity/organization migration. `pnpm db:seed` is deterministic and idempotent for local development.

## Configuration

Every required setting is documented in `.env.example`. API and worker processes validate their configuration before boot and fail with a consolidated list of invalid fields. OpenTelemetry export is opt-in through `OTEL_ENABLED=true`; the exporter uses the standard OTLP HTTP endpoint.

## Identity foundation APIs

Authenticated discovery uses `GET /api/v1/organizations`. Tenant-scoped APIs include `/me`, organization read/update, member list/create/update, role list/create/assignment, and read-only audit logs under `/api/v1/organizations/{id}`. OpenAPI at `/api/docs` is authoritative for fields and permission-protected operations.

## Roadmap boundary

The exact next milestone is **Milestone 2 — Vehicle vertical slice**. No vehicle functionality is included yet.
