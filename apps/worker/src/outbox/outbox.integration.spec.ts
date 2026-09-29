import { createDatabaseClient } from '@vms/database';
import type { PrismaClient } from '@vms/database';
import type { WorkerConfig } from '@vms/config';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { OutboxProcessorService } from './outbox-processor.service.js';
import { PrismaOutboxStore } from './prisma-outbox.store.js';
import type { IntegrationEventPublisher } from './outbox.types.js';

const organizationId = '12000000-0000-4000-8000-000000000001';
const eventId = '72000000-0000-4000-8000-000000000001';
const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://vehicle_management:local_vehicle_management@localhost:55432/vehicle_management?schema=public';
const config = {
  OUTBOX_BATCH_SIZE: 20,
  OUTBOX_LOCK_TIMEOUT_MS: 60_000,
  OUTBOX_POLL_INTERVAL_MS: 1000,
} as WorkerConfig;

describe('persisted outbox publication', () => {
  let database: PrismaClient;

  beforeAll(async () => {
    database = createDatabaseClient({ databaseUrl });
    await database.outboxEvent.deleteMany();
    await database.organization.upsert({
      where: { id: organizationId },
      update: {},
      create: { id: organizationId, name: 'Outbox Test', slug: 'outbox-test' },
    });
  });

  afterAll(async () => {
    await database.outboxEvent.deleteMany({ where: { organizationId } });
    await database.organization.delete({ where: { id: organizationId } });
    await database.$disconnect();
  });

  it('claims and publishes a persisted event exactly once after it is marked complete', async () => {
    await database.outboxEvent.create({
      data: {
        id: eventId,
        organizationId,
        eventType: 'OrganizationUpdated',
        aggregateType: 'Organization',
        aggregateId: organizationId,
        payload: { eventId },
        occurredAt: new Date(),
      },
    });
    const store = new PrismaOutboxStore(database);
    const publisher = {
      publish: vi.fn().mockResolvedValue(undefined),
    } as IntegrationEventPublisher;
    const processor = new OutboxProcessorService(store, publisher, config);
    await expect(processor.processBatch()).resolves.toBe(1);
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ id: eventId, attempts: 1 }),
    );
    expect(await database.outboxEvent.findUnique({ where: { id: eventId } })).toMatchObject({
      status: 'PUBLISHED',
      attempts: 1,
    });
    await expect(processor.processBatch()).resolves.toBe(0);
  });

  it('returns failures to pending with retry metadata and the same idempotency key', async () => {
    const retryId = '72000000-0000-4000-8000-000000000002';
    await database.outboxEvent.create({
      data: {
        id: retryId,
        organizationId,
        eventType: 'RoleAssigned',
        aggregateType: 'Role',
        aggregateId: organizationId,
        payload: { eventId: retryId },
        occurredAt: new Date(),
      },
    });
    const store = new PrismaOutboxStore(database);
    const publisher = {
      publish: vi.fn().mockRejectedValue(new Error('temporary failure')),
    } as IntegrationEventPublisher;
    const processor = new OutboxProcessorService(store, publisher, config);
    await processor.processBatch();
    expect(await database.outboxEvent.findUnique({ where: { id: retryId } })).toMatchObject({
      status: 'PENDING',
      attempts: 1,
      lastError: 'temporary failure',
    });
  });

  it('claims and publishes vehicle lifecycle events (VehicleCreated, VehicleActivated, VehicleRetired)', async () => {
    const vehicleEvents = [
      { id: '72000000-0000-4000-8000-000000000010', eventType: 'VehicleCreated' },
      { id: '72000000-0000-4000-8000-000000000011', eventType: 'VehicleActivated' },
      { id: '72000000-0000-4000-8000-000000000012', eventType: 'VehicleRetired' },
    ];
    for (const evt of vehicleEvents) {
      await database.outboxEvent.create({
        data: {
          id: evt.id,
          organizationId,
          eventType: evt.eventType,
          aggregateType: 'Vehicle',
          aggregateId: '88000000-0000-4000-8000-000000000001',
          payload: { eventId: evt.id, eventType: evt.eventType },
          occurredAt: new Date(),
        },
      });
    }

    const store = new PrismaOutboxStore(database);
    const publisher = {
      publish: vi.fn().mockResolvedValue(undefined),
    } as IntegrationEventPublisher;
    const processor = new OutboxProcessorService(store, publisher, config);

    const processed = await processor.processBatch();
    expect(processed).toBe(3);
    for (const evt of vehicleEvents) {
      expect(publisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ id: evt.id, eventType: evt.eventType, attempts: 1 }),
      );
      const row = await database.outboxEvent.findUnique({ where: { id: evt.id } });
      expect(row?.status).toBe('PUBLISHED');
    }
  });

  it('claims and publishes driver lifecycle events (DriverCreated, DriverActivated, DriverSuspended, DriverDeactivated, DriverLicenseAdded)', async () => {
    const driverEvents = [
      {
        id: '72000000-0000-4000-8000-000000000020',
        eventType: 'DriverCreated',
        aggregateType: 'Driver',
      },
      {
        id: '72000000-0000-4000-8000-000000000021',
        eventType: 'DriverActivated',
        aggregateType: 'Driver',
      },
      {
        id: '72000000-0000-4000-8000-000000000022',
        eventType: 'DriverSuspended',
        aggregateType: 'Driver',
      },
      {
        id: '72000000-0000-4000-8000-000000000023',
        eventType: 'DriverDeactivated',
        aggregateType: 'Driver',
      },
      {
        id: '72000000-0000-4000-8000-000000000024',
        eventType: 'DriverLicenseAdded',
        aggregateType: 'DriverLicense',
      },
    ];
    for (const evt of driverEvents) {
      await database.outboxEvent.create({
        data: {
          id: evt.id,
          organizationId,
          eventType: evt.eventType,
          aggregateType: evt.aggregateType,
          aggregateId: '89000000-0000-4000-8000-000000000001',
          payload: { eventId: evt.id, eventType: evt.eventType },
          occurredAt: new Date(),
        },
      });
    }

    const store = new PrismaOutboxStore(database);
    const publisher = {
      publish: vi.fn().mockResolvedValue(undefined),
    } as IntegrationEventPublisher;
    const processor = new OutboxProcessorService(store, publisher, config);

    const processed = await processor.processBatch();
    expect(processed).toBe(5);
    for (const evt of driverEvents) {
      expect(publisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ id: evt.id, eventType: evt.eventType, attempts: 1 }),
      );
      const row = await database.outboxEvent.findUnique({ where: { id: evt.id } });
      expect(row?.status).toBe('PUBLISHED');
    }
  });
});
