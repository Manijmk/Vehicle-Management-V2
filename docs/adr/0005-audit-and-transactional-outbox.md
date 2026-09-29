# ADR 0005: Immutable audit and PostgreSQL transactional outbox

- Status: Accepted
- Date: 2026-08-18

## Context

Foundational administration needs tamper-resistant accountability and reliable integration events without introducing a broker before one is operationally justified.

## Decision

Every consequential Milestone 1 mutation writes its business state, audit record, and outbox event in one Prisma/PostgreSQL transaction. Audit records have no mutation API and a database trigger rejects row updates or deletes.

The worker claims ready events with one `UPDATE ... FOR UPDATE SKIP LOCKED` operation. Claims carry a worker ID and lease time so abandoned work can be reclaimed. Successful publication marks an event published; failures return it to pending with bounded exponential retry metadata. Publishers receive the stable outbox UUID as the event idempotency key.

The initial publisher is a logging adapter behind `IntegrationEventPublisher`. It proves the boundary without adding Kafka. Delivery is at least once: a worker can publish and fail before recording success, so every future consumer must deduplicate by event ID.

## Consequences

- Committed business mutations never depend on publisher availability.
- Operations can inspect pending, processing, published, attempt, lock, and error state.
- Broker selection, dead-letter policy, retention, and consumer inbox tables remain future operational decisions.
