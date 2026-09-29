# ADR 0002: pnpm monorepo and Node runtime

- Status: Accepted
- Date: 2026-08-18

## Context

The system has three TypeScript applications and several narrow shared packages. Reproducible dependency resolution and one validation entrypoint are required.

## Decision

Use a pnpm workspace with application packages under `apps/` and shared packages under `packages/`. Use Node.js 22 LTS, strict TypeScript, ESM, a pinned pnpm major, ESLint flat configuration, and Prettier. CI and container images use the same Node major.

Use Next.js for `web`, NestJS for `api` and `worker`, Prisma for PostgreSQL access and migrations, Vitest for unit/integration testing, and Playwright for browser E2E testing.

## Consequences

- A single lockfile provides deterministic installs.
- Internal packages use explicit `@vms/*` exports and can be checked independently.
- Developers need a supported Node runtime; Docker remains an alternative when the host runtime is unsuitable.
- ESM compatibility is a package-selection requirement.
