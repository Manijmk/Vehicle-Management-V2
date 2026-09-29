import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@vms/database';

import type { ClaimedOutboxEvent, OutboxStore } from './outbox.types.js';
import { WORKER_DATABASE } from './tokens.js';

interface ClaimedRow {
  id: string;
  organization_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: unknown;
  occurred_at: Date;
  attempts: number;
}

@Injectable()
export class PrismaOutboxStore implements OutboxStore {
  constructor(@Inject(WORKER_DATABASE) private readonly database: PrismaClient) {}

  async claim(
    batchSize: number,
    workerId: string,
    lockTimeoutMs: number,
  ): Promise<ClaimedOutboxEvent[]> {
    const staleBefore = new Date(Date.now() - lockTimeoutMs);
    const rows = await this.database.$queryRaw<ClaimedRow[]>`
      UPDATE outbox_events
      SET status = 'PROCESSING'::"OutboxStatus",
          locked_at = NOW(),
          locked_by = ${workerId},
          attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM outbox_events
        WHERE (status = 'PENDING'::"OutboxStatus" AND available_at <= NOW())
           OR (status = 'PROCESSING'::"OutboxStatus" AND locked_at < ${staleBefore})
        ORDER BY occurred_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${batchSize}
      )
      RETURNING id, organization_id, event_type, aggregate_type, aggregate_id,
                payload, occurred_at, attempts
    `;
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      eventType: row.event_type,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      payload: row.payload,
      occurredAt: row.occurred_at,
      attempts: row.attempts,
    }));
  }

  async markPublished(eventId: string, workerId: string): Promise<void> {
    await this.database.outboxEvent.updateMany({
      where: { id: eventId, status: 'PROCESSING', lockedBy: workerId },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: null,
      },
    });
  }

  async reschedule(
    eventId: string,
    workerId: string,
    attempts: number,
    error: string,
  ): Promise<void> {
    const delayMs = Math.min(60_000, 2 ** Math.min(attempts, 10) * 1000);
    await this.database.outboxEvent.updateMany({
      where: { id: eventId, status: 'PROCESSING', lockedBy: workerId },
      data: {
        status: 'PENDING',
        availableAt: new Date(Date.now() + delayMs),
        lockedAt: null,
        lockedBy: null,
        lastError: error.slice(0, 1000),
      },
    });
  }
}
