# ADR 0001: Domain-driven modular monolith

- Status: Accepted
- Date: 2026-08-18

## Context

The product spans many related fleet workflows and needs strong transactional consistency and tenant isolation. Splitting those workflows into independently deployed services before their boundaries and load characteristics are known would add distributed failure modes and operational cost.

## Decision

Build a modular monolith for transactional business capabilities. Each backend module owns its domain, use cases, repository interfaces, infrastructure adapters, and transport adapters. Dependencies point inward, and cross-module access uses explicit contracts or events.

The web application and background worker are separate runtime processes. Telemetry, notifications, integrations, and reporting are designed as extractable boundaries but remain modules until measured load or independent deployment requirements justify extraction.

## Consequences

- Transactions and local development stay straightforward.
- Module boundaries require review and automated tests because process isolation does not enforce them.
- A future extraction moves an adapter boundary rather than rewriting domain logic.
- Distributed infrastructure is introduced only with a demonstrated need.
