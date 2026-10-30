import { createDatabaseClient } from '@vms/database';
import type { PrismaClient } from '@vms/database';
import type { WorkerConfig } from '@vms/config';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { OutboxProcessorService } from './outbox-processor.service.js';
import { PrismaOutboxStore } from './prisma-outbox.store.js';
import { LoggingEventPublisher } from './logging-event.publisher.js';
import type { IntegrationEventPublisher } from './outbox.types.js';

const organizationId = '12000000-0000-4000-8000-000000000001';
const eventId = '72000000-0000-4000-8000-000000000001';
const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://vehicle_management:local_vehicle_management@localhost:5432/vehicle_management?schema=public';
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
    try {
      await database.organization.delete({ where: { id: organizationId } });
    } catch {
      // Ignore if organization has foreign key references from other test suites
    }
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

  it('claims and publishes assignment lifecycle events (VehicleDriverAssigned, VehicleDriverUnassigned)', async () => {
    const assignmentEvents = [
      {
        id: '72000000-0000-4000-8000-000000000030',
        eventType: 'VehicleDriverAssigned',
        aggregateType: 'VehicleDriverAssignment',
      },
      {
        id: '72000000-0000-4000-8000-000000000031',
        eventType: 'VehicleDriverUnassigned',
        aggregateType: 'VehicleDriverAssignment',
      },
    ];
    for (const evt of assignmentEvents) {
      await database.outboxEvent.create({
        data: {
          id: evt.id,
          organizationId,
          eventType: evt.eventType,
          aggregateType: evt.aggregateType,
          aggregateId: '90000000-0000-4000-8000-000000000001',
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
    expect(processed).toBe(2);
    for (const evt of assignmentEvents) {
      expect(publisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ id: evt.id, eventType: evt.eventType, attempts: 1 }),
      );
      const row = await database.outboxEvent.findUnique({ where: { id: evt.id } });
      expect(row?.status).toBe('PUBLISHED');
    }
  });

  it('claims and publishes trip lifecycle events (TripCreated, TripReady, TripStarted, TripCompleted, TripCancelled, TripAborted)', async () => {
    const tripEvents = [
      { id: '72000000-0000-4000-8000-000000000040', eventType: 'TripCreated' },
      { id: '72000000-0000-4000-8000-000000000041', eventType: 'TripReady' },
      { id: '72000000-0000-4000-8000-000000000042', eventType: 'TripStarted' },
      { id: '72000000-0000-4000-8000-000000000043', eventType: 'TripCompleted' },
      { id: '72000000-0000-4000-8000-000000000044', eventType: 'TripCancelled' },
      { id: '72000000-0000-4000-8000-000000000045', eventType: 'TripAborted' },
    ];
    for (const evt of tripEvents) {
      await database.outboxEvent.create({
        data: {
          id: evt.id,
          organizationId,
          eventType: evt.eventType,
          aggregateType: 'Trip',
          aggregateId: '91000000-0000-4000-8000-000000000001',
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
    expect(processed).toBe(6);
    for (const evt of tripEvents) {
      expect(publisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ id: evt.id, eventType: evt.eventType, attempts: 1 }),
      );
      const row = await database.outboxEvent.findUnique({ where: { id: evt.id } });
      expect(row?.status).toBe('PUBLISHED');
    }
  });

  it('claims and publishes inspection lifecycle events (InspectionCreated, InspectionCompleted, InspectionFailed, InspectionCriticalFailureDetected, InspectionCancelled)', async () => {
    const inspectionEvents = [
      { id: '72000000-0000-4000-8000-000000000050', eventType: 'InspectionCreated' },
      { id: '72000000-0000-4000-8000-000000000051', eventType: 'InspectionCompleted' },
      { id: '72000000-0000-4000-8000-000000000052', eventType: 'InspectionFailed' },
      {
        id: '72000000-0000-4000-8000-000000000053',
        eventType: 'InspectionCriticalFailureDetected',
      },
      { id: '72000000-0000-4000-8000-000000000054', eventType: 'InspectionCancelled' },
    ];
    for (const evt of inspectionEvents) {
      await database.outboxEvent.create({
        data: {
          id: evt.id,
          organizationId,
          eventType: evt.eventType,
          aggregateType: 'Inspection',
          aggregateId: '92000000-0000-4000-8000-000000000001',
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
    for (const evt of inspectionEvents) {
      expect(publisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ id: evt.id, eventType: evt.eventType, attempts: 1 }),
      );
      const row = await database.outboxEvent.findUnique({ where: { id: evt.id } });
      expect(row?.status).toBe('PUBLISHED');
    }
  });

  it('claims and publishes maintenance lifecycle events', async () => {
    const maintenanceEvents = [
      { id: '72000000-0000-4000-8000-000000000060', eventType: 'MaintenanceRequestCreated' },
      { id: '72000000-0000-4000-8000-000000000061', eventType: 'MaintenanceRequestConverted' },
      { id: '72000000-0000-4000-8000-000000000062', eventType: 'MaintenanceRequestCancelled' },
      { id: '72000000-0000-4000-8000-000000000063', eventType: 'WorkOrderCreated' },
      { id: '72000000-0000-4000-8000-000000000064', eventType: 'WorkOrderStarted' },
      { id: '72000000-0000-4000-8000-000000000065', eventType: 'WorkOrderCompleted' },
      { id: '72000000-0000-4000-8000-000000000066', eventType: 'WorkOrderCancelled' },
    ];
    for (const evt of maintenanceEvents) {
      await database.outboxEvent.create({
        data: {
          id: evt.id,
          organizationId,
          eventType: evt.eventType,
          aggregateType: 'Maintenance',
          aggregateId: '93000000-0000-4000-8000-000000000001',
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
    expect(processed).toBe(7);
    for (const evt of maintenanceEvents) {
      expect(publisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ id: evt.id, eventType: evt.eventType, attempts: 1 }),
      );
      const row = await database.outboxEvent.findUnique({ where: { id: evt.id } });
      expect(row?.status).toBe('PUBLISHED');
    }
  });

  it('LoggingEventPublisher automatically and idempotently creates a blocking maintenance request on InspectionCriticalFailureDetected', async () => {
    // 1. Setup user, vehicle, inspection template, inspection
    const userId = '02000000-0000-4000-8000-000000000001';
    await database.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        email: 'worker-test@vms.local',
        displayName: 'Worker Test User',
      },
    });

    const vehicleId = '32000000-0000-4000-8000-000000000001';
    await database.vehicle.upsert({
      where: { id: vehicleId },
      update: {},
      create: {
        id: vehicleId,
        organizationId,
        displayId: 'VEH-999',
        type: 'CAR',
        fuelType: 'PETROL',
        vin: '1HGCR2F83HA000999',
        registration: 'REG-999',
        model: 'Accord',
        year: 2021,
        status: 'ACTIVE',
        odometerKm: 45000,
      },
    });

    const templateId = '62000000-0000-4000-8000-000000000001';
    await database.inspectionTemplate.upsert({
      where: { id: templateId },
      update: {},
      create: {
        id: templateId,
        organizationId,
        name: 'Safety Inspection',
        type: 'PRE_TRIP',
        status: 'ACTIVE',
        version: 1,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    const inspectionId = '82000000-0000-4000-8000-000000000001';
    await database.inspection.upsert({
      where: { id: inspectionId },
      update: {},
      create: {
        id: inspectionId,
        organizationId,
        displayId: 'INSP-999',
        templateId,
        vehicleId,
        type: 'PRE_TRIP',
        status: 'COMPLETED',
        result: 'FAIL',
        hasCriticalFailure: true,
        version: 1,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    const loggingPublisher = new LoggingEventPublisher(database);
    const event = {
      id: '72000000-0000-4000-8000-000000000070',
      organizationId,
      eventType: 'InspectionCriticalFailureDetected',
      aggregateType: 'Inspection',
      aggregateId: inspectionId,
      payload: { inspectionId, vehicleId },
      attempts: 1,
      lastError: null,
      occurredAt: new Date(),
    };

    // First delivery
    await loggingPublisher.publish(event);

    const createdMr = await database.maintenanceRequest.findFirst({
      where: { organizationId, sourceInspectionId: inspectionId },
    });
    expect(createdMr).not.toBeNull();
    expect(createdMr?.priority).toBe('CRITICAL');
    expect(createdMr?.blocksOperation).toBe(true);
    expect(createdMr?.status).toBe('OPEN');
    expect(createdMr?.vehicleId).toBe(vehicleId);

    // Second delivery (idempotency verification)
    await expect(loggingPublisher.publish(event)).resolves.not.toThrow();

    const count = await database.maintenanceRequest.count({
      where: { organizationId, sourceInspectionId: inspectionId },
    });
    expect(count).toBe(1);

    // Cleanup
    await database.maintenanceRequest.deleteMany({ where: { organizationId } });
    await database.inspection.deleteMany({ where: { id: inspectionId } });
    await database.inspectionTemplate.deleteMany({ where: { id: templateId } });
    await database.vehicle.deleteMany({ where: { id: vehicleId } });
  });
});
