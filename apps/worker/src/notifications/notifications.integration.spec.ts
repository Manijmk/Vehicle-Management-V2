import { randomUUID } from 'node:crypto';
import { createDatabaseClient, type PrismaClient } from '@vms/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  LogEmailNotificationProvider,
  LogSmsNotificationProvider,
} from './log-delivery-providers.js';
import { NotificationDeliveryService } from './notification-delivery.service.js';
import { NotificationRuleEvaluatorService } from './notification-rule-evaluator.service.js';
import { ComplianceExpirySchedulerService } from './compliance-expiry-scheduler.service.js';
import type { ClaimedOutboxEvent } from '../outbox/outbox.types.js';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://vehicle_management:local_vehicle_management@localhost:5432/vehicle_management?schema=public';

describe('Worker Notifications & Automation Integration', () => {
  let database: PrismaClient;
  let emailProvider: LogEmailNotificationProvider;
  let smsProvider: LogSmsNotificationProvider;
  let deliveryService: NotificationDeliveryService;
  let ruleEvaluator: NotificationRuleEvaluatorService;
  let complianceScheduler: ComplianceExpirySchedulerService;

  const testOrgId = randomUUID();
  const testUserId = randomUUID();

  beforeAll(async () => {
    database = createDatabaseClient({ databaseUrl });
    emailProvider = new LogEmailNotificationProvider();
    smsProvider = new LogSmsNotificationProvider();
    deliveryService = new NotificationDeliveryService(database, emailProvider, smsProvider);
    ruleEvaluator = new NotificationRuleEvaluatorService(database, deliveryService);
    complianceScheduler = new ComplianceExpirySchedulerService(database, deliveryService);

    // Setup organization, user, membership, and default templates
    await database.organization.create({
      data: {
        id: testOrgId,
        name: 'Worker Notification Org',
        slug: `worker-notif-${Date.now()}`,
      },
    });

    await database.user.create({
      data: {
        id: testUserId,
        email: `notif-user-${Date.now()}@example.com`,
        displayName: 'Notification Tester',
      },
    });

    await database.organizationMembership.create({
      data: {
        organizationId: testOrgId,
        userId: testUserId,
        status: 'ACTIVE',
      },
    });

    // Create required templates
    await database.notificationTemplate.createMany({
      data: [
        {
          organizationId: testOrgId,
          key: 'INCIDENT_CRITICAL_REPORTED',
          category: 'INCIDENT',
          titleTemplate: 'Critical Incident: {{displayId}}',
          bodyTemplate: 'Critical incident occurred: {{description}}',
          enabled: true,
        },
        {
          organizationId: testOrgId,
          key: 'INSPECTION_CRITICAL_FAILURE',
          category: 'CRITICAL_INSPECTION',
          titleTemplate: 'Critical Failure: {{displayId}}',
          bodyTemplate: 'Vehicle {{vehicleId}} failed critical inspection items.',
          enabled: true,
        },
        {
          organizationId: testOrgId,
          key: 'COMPLIANCE_DOCUMENT_EXPIRING',
          category: 'COMPLIANCE_EXPIRY',
          titleTemplate: 'Compliance Alert: {{type}} Expiring',
          bodyTemplate: 'Document {{documentNumber}} will expire on {{expiresAt}}.',
          enabled: true,
        },
      ],
    });
  });

  afterAll(async () => {
    // Clean up
    await database.notificationDeliveryAttempt.deleteMany({ where: { organizationId: testOrgId } });
    await database.notificationRecipient.deleteMany({ where: { organizationId: testOrgId } });
    await database.notification.deleteMany({ where: { organizationId: testOrgId } });
    await database.notificationPreference.deleteMany({ where: { organizationId: testOrgId } });
    await database.notificationTemplate.deleteMany({ where: { organizationId: testOrgId } });
    await database.automationDeduplication.deleteMany({ where: { organizationId: testOrgId } });
    await database.complianceDocument.deleteMany({ where: { organizationId: testOrgId } });
    await database.complianceDocumentType.deleteMany({ where: { organizationId: testOrgId } });
    await database.vehicle.deleteMany({ where: { organizationId: testOrgId } });
    await database.organizationMembership.deleteMany({ where: { organizationId: testOrgId } });
    await database.user.deleteMany({ where: { id: testUserId } });
    await database.organization.deleteMany({ where: { id: testOrgId } });
    await database.$disconnect();
  });

  it('creates notification and delivery attempts on critical IncidentReported event', async () => {
    const eventId = randomUUID();
    const event: ClaimedOutboxEvent = {
      id: eventId,
      organizationId: testOrgId,
      eventType: 'IncidentReported',
      aggregateType: 'Incident',
      aggregateId: randomUUID(),
      payload: {
        incidentId: randomUUID(),
        displayId: 'INC-1001',
        severity: 'CRITICAL',
        description: 'Engine fire reported',
      },
      occurredAt: new Date(),
      attempts: 1,
    };

    await ruleEvaluator.handleEvent(event);

    const notif = await database.notification.findFirst({
      where: {
        organizationId: testOrgId,
        sourceEventId: eventId,
      },
      include: {
        recipients: {
          include: {
            deliveryAttempts: true,
          },
        },
      },
    });

    expect(notif).toBeDefined();
    expect(notif?.category).toBe('INCIDENT');
    expect(notif?.priority).toBe('HIGH');
    expect(notif?.title).toBe('Critical Incident: INC-1001');
    expect(notif?.recipients.length).toBe(1);

    const recipient = notif!.recipients[0]!;
    expect(recipient.userId).toBe(testUserId);
    expect(recipient.status).toBe('DELIVERED');

    // Email delivered attempt
    const emailAttempt = recipient.deliveryAttempts.find((a) => a.channel === 'EMAIL');
    expect(emailAttempt).toBeDefined();
    expect(emailAttempt?.status).toBe('DELIVERED');
  });

  it('ignores non-critical IncidentReported events', async () => {
    const eventId = randomUUID();
    const event: ClaimedOutboxEvent = {
      id: eventId,
      organizationId: testOrgId,
      eventType: 'IncidentReported',
      aggregateType: 'Incident',
      aggregateId: randomUUID(),
      payload: {
        incidentId: randomUUID(),
        displayId: 'INC-1002',
        severity: 'LOW',
        description: 'Minor bumper scratch',
      },
      occurredAt: new Date(),
      attempts: 1,
    };

    await ruleEvaluator.handleEvent(event);

    const notif = await database.notification.findFirst({
      where: {
        organizationId: testOrgId,
        sourceEventId: eventId,
      },
    });

    expect(notif).toBeNull();
  });

  it('guarantees idempotency when an event is replayed', async () => {
    const eventId = randomUUID();
    const event: ClaimedOutboxEvent = {
      id: eventId,
      organizationId: testOrgId,
      eventType: 'InspectionCriticalFailureDetected',
      aggregateType: 'Inspection',
      aggregateId: randomUUID(),
      payload: {
        displayId: 'INSP-1005',
        vehicleId: 'VEH-001',
      },
      occurredAt: new Date(),
      attempts: 1,
    };

    // First delivery
    await ruleEvaluator.handleEvent(event);

    // Second delivery (replay)
    await ruleEvaluator.handleEvent(event);

    const count = await database.notification.count({
      where: {
        organizationId: testOrgId,
        sourceEventId: eventId,
      },
    });

    expect(count).toBe(1);
  });

  it('records SKIPPED attempt when user has SMS enabled but lacks phone number', async () => {
    // Enable SMS preference for this user
    await database.notificationPreference.upsert({
      where: {
        organizationId_userId_category: {
          organizationId: testOrgId,
          userId: testUserId,
          category: 'CRITICAL_INSPECTION',
        },
      },
      update: { smsEnabled: true },
      create: {
        organizationId: testOrgId,
        userId: testUserId,
        category: 'CRITICAL_INSPECTION',
        inAppEnabled: true,
        emailEnabled: true,
        smsEnabled: true,
      },
    });

    const eventId = randomUUID();
    const event: ClaimedOutboxEvent = {
      id: eventId,
      organizationId: testOrgId,
      eventType: 'InspectionCriticalFailureDetected',
      aggregateType: 'Inspection',
      aggregateId: randomUUID(),
      payload: {
        displayId: 'INSP-1006',
        vehicleId: 'VEH-002',
      },
      occurredAt: new Date(),
      attempts: 1,
    };

    await ruleEvaluator.handleEvent(event);

    const notif = await database.notification.findFirst({
      where: { organizationId: testOrgId, sourceEventId: eventId },
      include: {
        recipients: {
          include: { deliveryAttempts: true },
        },
      },
    });

    expect(notif).toBeDefined();
    const recipient = notif!.recipients[0]!;
    const smsAttempt = recipient.deliveryAttempts.find((a) => a.channel === 'SMS');
    expect(smsAttempt).toBeDefined();
    expect(smsAttempt?.status).toBe('SKIPPED');
    expect(smsAttempt?.failureCode).toBe('NO_PHONE_NUMBER');
  });

  it('runs compliance expiry automation and deduplicates within window', async () => {
    // Create vehicle
    const vehicleId = randomUUID();
    await database.vehicle.create({
      data: {
        id: vehicleId,
        organizationId: testOrgId,
        displayId: `VEH-${Date.now()}`,
        vin: `VIN${Date.now()}12345`.substring(0, 17),
        model: 'HiAce',
        year: 2023,
        registration: 'REG-12345',
        odometerKm: 1000,
        type: 'VAN',
        fuelType: 'DIESEL',
        status: 'ACTIVE',
      },
    });

    // Create compliance document type
    const docTypeId = randomUUID();
    await database.complianceDocumentType.create({
      data: {
        id: docTypeId,
        organizationId: testOrgId,
        code: `INSURANCE_${Date.now()}`,
        name: 'Vehicle Insurance',
        subjectType: 'VEHICLE',
        createdBy: testUserId,
        updatedBy: testUserId,
      },
    });

    // Create a document expiring in 5 days (7_DAYS window)
    const docId = randomUUID();
    const expiryDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    await database.complianceDocument.create({
      data: {
        id: docId,
        organizationId: testOrgId,
        displayId: `DOC-${Date.now()}`,
        documentTypeId: docTypeId,
        subjectType: 'VEHICLE',
        vehicleId,
        documentNumber: 'POL-998877',
        status: 'ACTIVE',
        expiresOn: expiryDate,
        objectKey: 'compliance/test.pdf',
        originalFileName: 'test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        createdBy: testUserId,
        updatedBy: testUserId,
      },
    });

    // Run first sweep
    const firstRun = await complianceScheduler.runExpiryScan(testOrgId);
    expect(firstRun.scannedCount).toBeGreaterThanOrEqual(1);
    expect(firstRun.notificationsCreated).toBe(1);

    // Verify notification was created
    const createdNotif = await database.notification.findFirst({
      where: {
        organizationId: testOrgId,
        sourceAggregateId: docId,
        category: 'COMPLIANCE_EXPIRY',
      },
    });
    expect(createdNotif).toBeDefined();
    expect(createdNotif?.title).toContain('Compliance Alert:');

    // Verify deduplication record exists
    const dedup = await database.automationDeduplication.findUnique({
      where: {
        organizationId_ruleKey_aggregateId_windowKey: {
          organizationId: testOrgId,
          ruleKey: 'COMPLIANCE_EXPIRING',
          aggregateId: docId,
          windowKey: '7_DAYS',
        },
      },
    });
    expect(dedup).toBeDefined();

    // Run second sweep in same window -> should create 0 new notifications
    const secondRun = await complianceScheduler.runExpiryScan(testOrgId);
    expect(secondRun.notificationsCreated).toBe(0);
  });
});
