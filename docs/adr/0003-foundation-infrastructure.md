# ADR 0003: Foundation infrastructure and local services

- Status: Accepted
- Date: 2026-08-18

## Context

Local development and CI need production-shaped dependencies without prematurely adopting orchestration or distributed messaging platforms.

## Decision

Use Docker Compose for PostgreSQL, Redis, and MinIO. PostgreSQL is authoritative. Redis is ephemeral coordination infrastructure. MinIO provides a local implementation of the S3-compatible object-storage boundary. Application images use a multi-stage Node 22 Dockerfile.

Milestone 0 includes an intentionally empty baseline Prisma migration so migration history exists before domain tables are introduced. It does not create identity, audit, outbox, or business tables.

OpenTelemetry SDK bootstrap is available to each runtime and is disabled unless explicitly enabled. CI uses PostgreSQL for migration deployment and reserves integration services for tests that require them.

## Consequences

- Developers can reproduce infrastructure with one Compose command.
- No local service is treated as a production topology recommendation.
- Secrets in example configuration are development-only and must be replaced by managed secrets in deployed environments.
- Message brokers, Kubernetes, search clusters, telemetry stores, and warehouses remain out of scope.
