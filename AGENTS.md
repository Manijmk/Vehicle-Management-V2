# Engineering Guide

This repository contains the Vehicle Management System. Treat this file and the documents under `docs/` as persistent engineering context.

## Scope and delivery

- Work one roadmap milestone at a time. Do not begin a later milestone without an explicit request.
- Preserve a modular-monolith architecture until measured operational needs justify extraction.
- Keep changes coherent, reviewable, tested, and documented.
- Never commit credentials or local `.env` files.

## Required reading

Before changing code:

1. Read this file.
2. Read `docs/architecture/overview.md`.
3. Read the ADR index and any ADRs relevant to the change.
4. Inspect the existing workspace and working tree.

## Architecture rules

Backend modules follow this dependency direction:

```text
transport -> application/use cases -> domain -> repository interfaces
                                             <- infrastructure adapters
```

- Domain code must not depend on NestJS, HTTP, Prisma, Redis, object storage, or frontend code.
- Controllers validate and translate transport concerns; they do not contain business rules.
- Important lifecycle changes use named application operations, not generic status mutation.
- Organization-owned data is always scoped by trusted `organizationId` context established by the backend.
- Cross-organization references and reads are critical security defects.
- Consequential state changes must eventually emit events through the transactional outbox.
- Shared packages must remain narrowly scoped. Do not create a general-purpose dumping ground.

## Workspace conventions

- Package manager: pnpm, using the version declared by the root `packageManager` field.
- Runtime: the Node version declared in `.nvmrc` and `.node-version`.
- TypeScript is strict; do not suppress errors without a documented reason.
- Internal packages use the `@vms/*` namespace.
- Public package exports must be explicit.
- Tests live next to their subject as `*.spec.ts`/`*.test.ts`, with cross-component tests under `test/` or `e2e/`.
- Environment variables are documented in `.env.example` and validated at process startup.

## Validation before handoff

Run, at minimum, the relevant subset of:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

When database behavior changes, also validate Prisma formatting, generation, migration status, and migrations against a disposable PostgreSQL instance. Review `git diff --check` and `git diff` before reporting completion.
