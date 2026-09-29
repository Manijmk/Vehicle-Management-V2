import { describe, expect, it, vi } from 'vitest';
import type { WorkerConfig } from '@vms/config';

import { OutboxProcessorService } from './outbox-processor.service.js';
import type { ClaimedOutboxEvent, IntegrationEventPublisher, OutboxStore } from './outbox.types.js';

const event: ClaimedOutboxEvent = {
  id: '70000000-0000-4000-8000-000000000001',
  organizationId: '10000000-0000-4000-8000-000000000001',
  eventType: 'MembershipCreated',
  aggregateType: 'OrganizationMembership',
  aggregateId: '30000000-0000-4000-8000-000000000001',
  payload: { eventId: '70000000-0000-4000-8000-000000000001' },
  occurredAt: new Date(),
  attempts: 1,
};

const config = {
  OUTBOX_BATCH_SIZE: 20,
  OUTBOX_LOCK_TIMEOUT_MS: 60_000,
  OUTBOX_POLL_INTERVAL_MS: 1000,
} as WorkerConfig;

describe('OutboxProcessorService', () => {
  it('marks successfully published events', async () => {
    const store = {
      claim: vi.fn().mockResolvedValue([event]),
      markPublished: vi.fn(),
      reschedule: vi.fn(),
    } as unknown as OutboxStore;
    const publisher = {
      publish: vi.fn().mockResolvedValue(undefined),
    } as IntegrationEventPublisher;
    const processor = new OutboxProcessorService(store, publisher, config);
    await expect(processor.processBatch()).resolves.toBe(1);
    expect(publisher.publish).toHaveBeenCalledWith(event);
    expect(store.markPublished).toHaveBeenCalledOnce();
    expect(store.reschedule).not.toHaveBeenCalled();
  });

  it('reschedules a failed delivery using the stable event id', async () => {
    const store = {
      claim: vi.fn().mockResolvedValue([event]),
      markPublished: vi.fn(),
      reschedule: vi.fn(),
    } as unknown as OutboxStore;
    const publisher = {
      publish: vi.fn().mockRejectedValue(new Error('broker unavailable')),
    } as IntegrationEventPublisher;
    const processor = new OutboxProcessorService(store, publisher, config);
    await processor.processBatch();
    expect(store.reschedule).toHaveBeenCalledWith(
      event.id,
      expect.any(String),
      event.attempts,
      'broker unavailable',
    );
  });
});
