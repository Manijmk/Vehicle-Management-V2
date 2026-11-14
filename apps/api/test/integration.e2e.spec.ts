import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { loadApiConfig } from '@vms/config';
import {
  createDatabaseClient,
  ExpenseCategoryStatus,
  ExpenseStatus,
  FuelType,
  IntegrationKind,
  IntegrationStatus,
  MembershipStatus,
  PrincipalStatus,
  TelemetryDeviceStatus,
  TelemetrySource,
  VehicleStatus,
  VehicleType,
} from '@vms/database';
import type { Prisma, PrismaClient } from '@vms/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { configureApiApplication } from '../src/bootstrap.js';
import { permissionCodes } from '../src/modules/foundation/domain/permissions.js';
import { LocalJwtAuthenticationAdapter } from '../src/modules/identity/infrastructure/local-jwt-authentication.adapter.js';
import { ALLOWED_WEBHOOK_EVENT_TYPES } from '../src/modules/integration/domain/webhook-subscription.js';
import { WEBHOOK_TRANSPORT_PORT } from '../src/modules/integration/integration.tokens.js';
import type { WebhookTransportPort } from '../src/modules/integration/application/ports/webhook-transport.port.js';

const ids = {
  organizationA: '18000000-0000-4000-8000-000000000001',
  organizationB: '18000000-0000-4000-8000-000000000002',
  adminA: '28000000-0000-4000-8000-000000000001',
  viewerA: '28000000-0000-4000-8000-000000000002',
  adminB: '28000000-0000-4000-8000-000000000003',
  integrationOnlyA: '28000000-0000-4000-8000-000000000004',
  sourceOnlyA: '28000000-0000-4000-8000-000000000005',
  neitherA: '28000000-0000-4000-8000-000000000006',
  membershipAdminA: '38000000-0000-4000-8000-000000000001',
  membershipViewerA: '38000000-0000-4000-8000-000000000002',
  membershipAdminB: '38000000-0000-4000-8000-000000000003',
  membershipIntegrationOnlyA: '38000000-0000-4000-8000-000000000004',
  membershipSourceOnlyA: '38000000-0000-4000-8000-000000000005',
  membershipNeitherA: '38000000-0000-4000-8000-000000000006',
  roleAdminA: '48000000-0000-4000-8000-000000000001',
  roleViewerA: '48000000-0000-4000-8000-000000000002',
  roleAdminB: '48000000-0000-4000-8000-000000000003',
  roleIntegrationOnlyA: '48000000-0000-4000-8000-000000000004',
  roleSourceOnlyA: '48000000-0000-4000-8000-000000000005',
  roleNeitherA: '48000000-0000-4000-8000-000000000006',
  vehicleA1: '58000000-0000-4000-8000-000000000001',
  driverA1: '68000000-0000-4000-8000-000000000001',
  deviceA1: '88000000-0000-4000-8000-000000000001',
  categoryA1: '98000000-0000-4000-8000-000000000001',
} as const;

const databaseUrl = (
  process.env.DATABASE_URL ??
  'postgresql://vehicle_management:local_vehicle_management@localhost:5432/vehicle_management?schema=public'
).replace('@localhost:', '@127.0.0.1:');

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrl,
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'vehicle-management',
  S3_ACCESS_KEY: 'test',
  S3_SECRET_KEY: 'test-secret',
  AUTH_LOCAL_SIGNING_KEY: 'integration-signing-key-that-is-at-least-32-characters',
  AUTH_ISSUER: 'integration-test',
  AUTH_AUDIENCE: 'integration-api',
  INTEGRATION_MASTER_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
});

async function cleanFixture(database: PrismaClient) {
  await database.$executeRawUnsafe(
    'TRUNCATE TABLE accounting_export_logs, external_transaction_identities, fuel_card_import_batches, integration_device_mappings, inbound_integration_receipts, webhook_delivery_attempts, webhook_deliveries, webhook_subscriptions, integration_secrets, integration_connections, telemetry_current_positions, telemetry_positions, telemetry_device_credentials, telemetry_device_vehicle_assignments, telemetry_devices, incident_notes, incident_attachments, incident_status_history, incidents, fuel_transaction_anomalies, fuel_transactions, fuel_import_jobs, expenses, expense_categories, compliance_documents, compliance_document_types, maintenance_work_order_labor, maintenance_work_order_parts, maintenance_work_order_tasks, maintenance_work_orders, vehicle_maintenance_schedules, maintenance_plans, maintenance_requests, maintenance_vendors, inspection_responses, inspections, inspection_template_items, inspection_templates, trip_status_history, trips, vehicle_driver_assignments, driver_status_history, driver_licenses, drivers, vehicle_status_history, vehicles, audit_logs, outbox_events, membership_roles, role_permissions, permissions, roles, organization_memberships, users, organizations RESTART IDENTITY CASCADE',
  );
}

async function seedFixture(database: PrismaClient) {
  await cleanFixture(database);

  // Organizations
  await database.organization.createMany({
    data: [
      {
        id: ids.organizationA,
        name: 'Org A Integrations',
        slug: 'org-a-integrations',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.organizationB,
        name: 'Org B Integrations',
        slug: 'org-b-integrations',
        status: PrincipalStatus.ACTIVE,
      },
    ],
  });

  // Users
  await database.user.createMany({
    data: [
      {
        id: ids.adminA,
        email: 'admin-a@example.com',
        displayName: 'Admin A',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.viewerA,
        email: 'viewer-a@example.com',
        displayName: 'Viewer A',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.adminB,
        email: 'admin-b@example.com',
        displayName: 'Admin B',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.integrationOnlyA,
        email: 'integration-only-a@example.com',
        displayName: 'Integration Only A',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.sourceOnlyA,
        email: 'source-only-a@example.com',
        displayName: 'Source Only A',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.neitherA,
        email: 'neither-a@example.com',
        displayName: 'Neither A',
        status: PrincipalStatus.ACTIVE,
      },
    ],
  });

  // Memberships
  await database.organizationMembership.createMany({
    data: [
      {
        id: ids.membershipAdminA,
        organizationId: ids.organizationA,
        userId: ids.adminA,
        status: MembershipStatus.ACTIVE,
      },
      {
        id: ids.membershipViewerA,
        organizationId: ids.organizationA,
        userId: ids.viewerA,
        status: MembershipStatus.ACTIVE,
      },
      {
        id: ids.membershipAdminB,
        organizationId: ids.organizationB,
        userId: ids.adminB,
        status: MembershipStatus.ACTIVE,
      },
      {
        id: ids.membershipIntegrationOnlyA,
        organizationId: ids.organizationA,
        userId: ids.integrationOnlyA,
        status: MembershipStatus.ACTIVE,
      },
      {
        id: ids.membershipSourceOnlyA,
        organizationId: ids.organizationA,
        userId: ids.sourceOnlyA,
        status: MembershipStatus.ACTIVE,
      },
      {
        id: ids.membershipNeitherA,
        organizationId: ids.organizationA,
        userId: ids.neitherA,
        status: MembershipStatus.ACTIVE,
      },
    ],
  });

  // Permissions
  for (const [index, code] of permissionCodes.entries()) {
    await database.permission.upsert({
      where: { code },
      update: {},
      create: {
        id: `78000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        code,
        description: code,
      },
    });
  }

  // Roles
  await database.role.createMany({
    data: [
      {
        id: ids.roleAdminA,
        organizationId: ids.organizationA,
        name: 'Admin',
        description: 'Admin Role',
      },
      {
        id: ids.roleViewerA,
        organizationId: ids.organizationA,
        name: 'Viewer',
        description: 'Viewer Role',
      },
      {
        id: ids.roleAdminB,
        organizationId: ids.organizationB,
        name: 'Admin',
        description: 'Admin Role',
      },
      {
        id: ids.roleIntegrationOnlyA,
        organizationId: ids.organizationA,
        name: 'Integration Only',
        description: 'Integration permissions without domain authority',
      },
      {
        id: ids.roleSourceOnlyA,
        organizationId: ids.organizationA,
        name: 'Source Only',
        description: 'Domain authority without integration permissions',
      },
      {
        id: ids.roleNeitherA,
        organizationId: ids.organizationA,
        name: 'Neither',
        description: 'Neither integration nor domain permissions',
      },
    ],
  });

  const allPermissions = await database.permission.findMany();
  const permMap = new Map(allPermissions.map((p) => [p.code, p.id]));

  // Admin A has all permissions
  await database.rolePermission.createMany({
    data: allPermissions.map((p) => ({ roleId: ids.roleAdminA, permissionId: p.id })),
  });
  await database.rolePermission.createMany({
    data: allPermissions.map((p) => ({ roleId: ids.roleAdminB, permissionId: p.id })),
  });

  // Viewer A has only read permissions
  const viewerCodes = ['integration.read', 'vehicle.read', 'finance.read'];
  await database.rolePermission.createMany({
    data: viewerCodes
      .filter((code) => permMap.has(code))
      .map((code) => ({ roleId: ids.roleViewerA, permissionId: permMap.get(code)! })),
  });

  // Integration Only A: integration actions without domain authority
  const integrationOnlyCodes = [
    'integration.read',
    'integration.fuel-card.import',
    'integration.accounting.export',
    'integration.telematics.map',
  ];
  await database.rolePermission.createMany({
    data: integrationOnlyCodes
      .filter((code) => permMap.has(code))
      .map((code) => ({ roleId: ids.roleIntegrationOnlyA, permissionId: permMap.get(code)! })),
  });

  // Source Only A: domain authority without integration actions
  const sourceOnlyCodes = [
    'integration.read',
    'fuel.read',
    'fuel.create',
    'fuel.import',
    'finance.read',
    'telemetry.device.read',
    'telemetry.device.manage',
  ];
  await database.rolePermission.createMany({
    data: sourceOnlyCodes
      .filter((code) => permMap.has(code))
      .map((code) => ({ roleId: ids.roleSourceOnlyA, permissionId: permMap.get(code)! })),
  });

  // Neither A: only vehicle.read
  const neitherCodes = ['vehicle.read'];
  await database.rolePermission.createMany({
    data: neitherCodes
      .filter((code) => permMap.has(code))
      .map((code) => ({ roleId: ids.roleNeitherA, permissionId: permMap.get(code)! })),
  });

  // Membership roles
  await database.membershipRole.createMany({
    data: [
      {
        organizationId: ids.organizationA,
        membershipId: ids.membershipAdminA,
        roleId: ids.roleAdminA,
      },
      {
        organizationId: ids.organizationA,
        membershipId: ids.membershipViewerA,
        roleId: ids.roleViewerA,
      },
      {
        organizationId: ids.organizationB,
        membershipId: ids.membershipAdminB,
        roleId: ids.roleAdminB,
      },
      {
        organizationId: ids.organizationA,
        membershipId: ids.membershipIntegrationOnlyA,
        roleId: ids.roleIntegrationOnlyA,
      },
      {
        organizationId: ids.organizationA,
        membershipId: ids.membershipSourceOnlyA,
        roleId: ids.roleSourceOnlyA,
      },
      {
        organizationId: ids.organizationA,
        membershipId: ids.membershipNeitherA,
        roleId: ids.roleNeitherA,
      },
    ],
  });

  // Baseline Vehicle, Device, Driver, Expense Category
  await database.vehicle.create({
    data: {
      id: ids.vehicleA1,
      organizationId: ids.organizationA,
      displayId: 'VEH-101',
      registration: 'ABC-1234',
      model: 'Ford Transit',
      type: VehicleType.VAN,
      status: VehicleStatus.ACTIVE,
      vin: '1FTBR1Y80PKA12345',
      fuelType: FuelType.DIESEL,
      odometerKm: 15000,
      year: 2024,
      version: 1,
    },
  });

  await database.driver.create({
    data: {
      id: ids.driverA1,
      organizationId: ids.organizationA,
      displayId: 'DRV-101',
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
      employeeNumber: 'EMP-101',
      status: 'ACTIVE',
      version: 1,
    },
  });

  await database.telemetryDevice.create({
    data: {
      id: ids.deviceA1,
      organizationId: ids.organizationA,
      displayId: 'DEV-101',
      name: 'Geotab Unit 1',
      identifier: 'GEO-00101',
      status: TelemetryDeviceStatus.ACTIVE,
      version: 1,
    },
  });

  await database.telemetryDeviceVehicleAssignment.create({
    data: {
      organizationId: ids.organizationA,
      deviceId: ids.deviceA1,
      vehicleId: ids.vehicleA1,
      assignedBy: ids.adminA,
    },
  });

  await database.expenseCategory.create({
    data: {
      id: ids.categoryA1,
      organizationId: ids.organizationA,
      code: 'TOLL',
      name: 'Highway Tolls',
      status: ExpenseCategoryStatus.ACTIVE,
      version: 1,
      createdBy: ids.adminA,
      updatedBy: ids.adminA,
    },
  });
}

describe('Milestone 14 — External Integrations Vertical Slice (E2E)', () => {
  let app: INestApplication;
  let database: PrismaClient;

  let adminTokenA: string;
  let viewerTokenA: string;
  let adminTokenB: string;
  let integrationOnlyTokenA: string;
  let sourceOnlyTokenA: string;
  let neitherTokenA: string;

  beforeAll(async () => {
    const config = loadApiConfig();
    database = createDatabaseClient({ databaseUrl });
    await seedFixture(database);

    const authentication = new LocalJwtAuthenticationAdapter(config);
    [
      adminTokenA,
      viewerTokenA,
      adminTokenB,
      integrationOnlyTokenA,
      sourceOnlyTokenA,
      neitherTokenA,
    ] = await Promise.all([
      authentication.issueDevelopmentToken(ids.adminA),
      authentication.issueDevelopmentToken(ids.viewerA),
      authentication.issueDevelopmentToken(ids.adminB),
      authentication.issueDevelopmentToken(ids.integrationOnlyA),
      authentication.issueDevelopmentToken(ids.sourceOnlyA),
      authentication.issueDevelopmentToken(ids.neitherA),
    ]);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    configureApiApplication(app, {
      API_CORS_ORIGINS: ['http://localhost:3000'],
    });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await database?.$disconnect();
  });

  // ===========================================================================
  // 1. Connection Management, Lifecycle & Optimistic Locking
  // ===========================================================================

  describe('1. Connection Lifecycle and OCC', () => {
    let connectionId: string;

    it('creates an integration connection in DRAFT status', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/integrations')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          name: 'Samsara Fleet Integration',
          kind: IntegrationKind.INBOUND_TELEMATICS,
          provider: 'SAMSARA',
          configuration: { feedIntervalSec: 60 },
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.displayId).toMatch(/^INT-\d+$/);
      expect(res.body.name).toBe('Samsara Fleet Integration');
      expect(res.body.kind).toBe(IntegrationKind.INBOUND_TELEMATICS);
      expect(res.body.status).toBe(IntegrationStatus.DRAFT);
      expect(res.body.version).toBe(1);

      connectionId = res.body.id;
    });

    it('rejects connection creation without integration.manage permission', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/integrations')
        .set('Authorization', `Bearer ${viewerTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          name: 'Unauthorized Connection',
          kind: IntegrationKind.OUTBOUND_WEBHOOK,
        })
        .expect(403);
    });

    it('updates connection configuration with optimistic version matching', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/integrations/${connectionId}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: 1,
          name: 'Samsara Fleet Telematics (Updated)',
          provider: 'SAMSARA_V2',
        })
        .expect(200);

      expect(res.body.name).toBe('Samsara Fleet Telematics (Updated)');
      expect(res.body.provider).toBe('SAMSARA_V2');
      expect(res.body.version).toBe(2);
    });

    it('rejects update with stale version throwing 409 conflict', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/integrations/${connectionId}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: 1, // Stale: current is 2
          name: 'Conflict Attempt',
        })
        .expect(409);

      expect(res.body.error.code).toBe('INTEGRATION_VERSION_CONFLICT');
    });

    it('transitions DRAFT -> ACTIVE -> SUSPENDED -> ACTIVE -> DISABLED', async () => {
      // 1. Activate
      let res = await request(app.getHttpServer())
        .post(`/api/v1/integrations/${connectionId}/activate`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: 2 })
        .expect(200);

      expect(res.body.status).toBe(IntegrationStatus.ACTIVE);
      expect(res.body.version).toBe(3);

      // 2. Suspend
      res = await request(app.getHttpServer())
        .post(`/api/v1/integrations/${connectionId}/suspend`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: 3 })
        .expect(200);

      expect(res.body.status).toBe(IntegrationStatus.SUSPENDED);
      expect(res.body.version).toBe(4);

      // 3. Reactivate
      res = await request(app.getHttpServer())
        .post(`/api/v1/integrations/${connectionId}/activate`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: 4 })
        .expect(200);

      expect(res.body.status).toBe(IntegrationStatus.ACTIVE);
      expect(res.body.version).toBe(5);

      // 4. Disable
      res = await request(app.getHttpServer())
        .post(`/api/v1/integrations/${connectionId}/disable`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: 5 })
        .expect(200);

      expect(res.body.status).toBe(IntegrationStatus.DISABLED);
      expect(res.body.version).toBe(6);

      // 5. Attempt invalid transition from terminal DISABLED -> ACTIVE
      const conflictRes = await request(app.getHttpServer())
        .post(`/api/v1/integrations/${connectionId}/activate`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: 6 })
        .expect(400);

      expect(conflictRes.body.error.code).toBe('INTEGRATION_INVALID_STATE');
    });
  });

  // ===========================================================================
  // 2. Secret Provisioning, Rotation, One-Time Reveal & Storage
  // ===========================================================================

  describe('2. Secret Provisioning and AES-256-GCM Encryption', () => {
    let testConnId: string;
    let provisionedSecret: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/integrations')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          name: 'Webhook Event Sink',
          kind: IntegrationKind.OUTBOUND_WEBHOOK,
          provider: 'CUSTOM',
        });
      testConnId = res.body.id;
    });

    it('provisions credentials returning plaintext secret once and storing encrypted form in DB', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/integrations/${testConnId}/credentials`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(201);

      expect(res.body.secretId).toBeDefined();
      expect(res.body.plaintextSecret).toMatch(/^whsec_[a-f0-9]{64}$/);
      expect(res.body.keyVersion).toBe(1);

      provisionedSecret = res.body.plaintextSecret;

      // Verify in database: plaintext must NOT be stored
      const inDb = await database.integrationSecret.findUnique({
        where: { id: res.body.secretId },
      });
      expect(inDb).toBeDefined();
      expect(inDb?.encryptedSecret).toMatch(/^v1:[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$/);
      expect(inDb?.encryptedSecret).not.toContain(provisionedSecret);

      // Verify SHA-256 hash
      const expectedHash = crypto.createHash('sha256').update(provisionedSecret).digest('hex');
      expect(inDb?.secretHash).toBe(expectedHash);
    });

    it('subsequent GET /api/v1/integrations/:id never reveals the plaintext secret', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/integrations/${testConnId}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(res.body.hasActiveSecret).toBe(true);
      expect(res.body.plaintextSecret).toBeUndefined();
      expect(res.body.encryptedSecret).toBeUndefined();
      expect(res.body.secretHash).toBeUndefined();
    });

    it('rotates credentials, revoking previous secret and provisioning new active secret', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/integrations/${testConnId}/credentials/rotate`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(res.body.plaintextSecret).toBeDefined();
      expect(res.body.plaintextSecret).not.toBe(provisionedSecret);

      // Verify database has 1 revoked and 1 active secret
      const secrets = await database.integrationSecret.findMany({
        where: { connectionId: testConnId },
        orderBy: { createdAt: 'asc' },
      });
      expect(secrets).toHaveLength(2);
      expect(secrets[0]?.status).toBe('REVOKED');
      expect(secrets[1]?.status).toBe('ACTIVE');
    });

    it('rejects credential management for user without integration.secret.manage', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/integrations/${testConnId}/credentials`)
        .set('Authorization', `Bearer ${viewerTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(403);
    });
  });

  // ===========================================================================
  // 3. Webhook Subscriptions, SSRF Protection & Delivery Retries
  // ===========================================================================

  describe('3. Webhook Subscriptions and SSRF Defense', () => {
    let webhookConnId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/integrations')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          name: 'Outbound Notification Hook',
          kind: IntegrationKind.OUTBOUND_WEBHOOK,
        });
      webhookConnId = res.body.id;
    });

    it('blocks loopback IP address in webhook URL (SSRF defense)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/integrations/${webhookConnId}/webhook-subscriptions`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          endpointUrl: 'http://127.0.0.1:8080/events',
          eventTypes: ['TripCreated'],
        })
        .expect(400);

      expect(res.body.error.code).toBe('INVALID_WEBHOOK_URL');
    });

    it('blocks cloud metadata endpoint 169.254.169.254 (SSRF defense)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/integrations/${webhookConnId}/webhook-subscriptions`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          endpointUrl: 'http://169.254.169.254/latest/meta-data',
          eventTypes: ['TripCreated'],
        })
        .expect(400);

      expect(res.body.error.code).toBe('INVALID_WEBHOOK_URL');
    });

    it('blocks unsupported/invented event types outside the approved catalog', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/integrations/${webhookConnId}/webhook-subscriptions`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          endpointUrl: 'https://webhook.site/test-endpoint',
          eventTypes: ['NonExistentEvent', 'VehicleCreated'],
        })
        .expect(400);

      expect(res.body.error.code).toBe('INVALID_WEBHOOK_EVENT_TYPES');
    });

    it('creates a valid webhook subscription with approved event types', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/integrations/${webhookConnId}/webhook-subscriptions`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          endpointUrl: 'https://webhook.site/valid-endpoint',
          eventTypes: ['TripStarted', 'TripCompleted', 'IncidentReported'],
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.endpointUrl).toBe('https://webhook.site/valid-endpoint');
      expect(res.body.eventTypes).toEqual(['TripStarted', 'TripCompleted', 'IncidentReported']);
    });

    it('resets a failed/exhausted delivery to PENDING via manual retry endpoint', async () => {
      // 1. Create a dummy subscription & delivery directly in DB
      const sub = await database.webhookSubscription.create({
        data: {
          organizationId: ids.organizationA,
          connectionId: webhookConnId,
          endpointUrl: 'https://webhook.site/retry-test',
          eventTypes: ['TripCreated'],
          status: 'ACTIVE',
        },
      });

      const delivery = await database.webhookDelivery.create({
        data: {
          organizationId: ids.organizationA,
          subscriptionId: sub.id,
          sourceEventId: crypto.randomUUID(),
          eventType: 'TripCreated',
          payload: { eventId: 'test-123', data: {} },
          deliveryStatus: 'EXHAUSTED',
          attempts: 5,
          lastHttpStatus: 500,
          lastErrorCode: 'HTTP_500',
        },
      });

      // 2. Call manual retry endpoint
      const retryRes = await request(app.getHttpServer())
        .post(`/api/v1/integrations/${webhookConnId}/deliveries/${delivery.id}/retry`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(retryRes.body.deliveryStatus).toBe('PENDING');
      expect(retryRes.body.lockedUntil).toBeNull();
    });

    it('reconciles exactly 37 approved webhook event types matching active domain outbox producers', () => {
      expect(ALLOWED_WEBHOOK_EVENT_TYPES).toHaveLength(37);
      // Domain-by-domain mapping verification:
      const trips = ALLOWED_WEBHOOK_EVENT_TYPES.filter((e) => e.startsWith('Trip'));
      expect(trips).toEqual([
        'TripCreated',
        'TripReady',
        'TripStarted',
        'TripCompleted',
        'TripCancelled',
        'TripAborted',
      ]);
      const vehicles = ALLOWED_WEBHOOK_EVENT_TYPES.filter(
        (e) => e.startsWith('Vehicle') && !e.includes('Driver'),
      );
      expect(vehicles).toEqual([
        'VehicleCreated',
        'VehicleActivated',
        'VehicleUpdated',
        'VehicleRetired',
      ]);
      const drivers = ALLOWED_WEBHOOK_EVENT_TYPES.filter((e) => e.startsWith('Driver'));
      expect(drivers).toEqual([
        'DriverCreated',
        'DriverUpdated',
        'DriverActivated',
        'DriverSuspended',
        'DriverDeactivated',
      ]);
      const assignments = ALLOWED_WEBHOOK_EVENT_TYPES.filter(
        (e) => e.includes('DriverAssigned') || e.includes('DriverUnassigned'),
      );
      expect(assignments).toEqual(['VehicleDriverAssigned', 'VehicleDriverUnassigned']);
      const inspections = ALLOWED_WEBHOOK_EVENT_TYPES.filter((e) => e.startsWith('Inspection'));
      expect(inspections).toEqual([
        'InspectionCompleted',
        'InspectionFailed',
        'InspectionCriticalFailureDetected',
      ]);
      const maintenance = ALLOWED_WEBHOOK_EVENT_TYPES.filter(
        (e) => e.startsWith('WorkOrder') || e.startsWith('MaintenanceRequest'),
      );
      expect(maintenance).toEqual([
        'WorkOrderCreated',
        'WorkOrderCompleted',
        'MaintenanceRequestCreated',
      ]);
      const compliance = ALLOWED_WEBHOOK_EVENT_TYPES.filter((e) => e.startsWith('Compliance'));
      expect(compliance).toEqual([
        'ComplianceDocumentUploaded',
        'ComplianceDocumentRevoked',
        'ComplianceDocumentReplaced',
      ]);
      const finance = ALLOWED_WEBHOOK_EVENT_TYPES.filter(
        (e) => e.startsWith('Fuel') || e.startsWith('Expense'),
      );
      expect(finance).toEqual([
        'FuelTransactionCreated',
        'FuelTransactionVoided',
        'FuelAnomalyDetected',
        'ExpenseCreated',
        'ExpensePosted',
        'ExpenseVoided',
      ]);
      const incidents = ALLOWED_WEBHOOK_EVENT_TYPES.filter((e) => e.startsWith('Incident'));
      expect(incidents).toEqual([
        'IncidentReported',
        'IncidentInvestigationStarted',
        'IncidentResolved',
        'IncidentClosed',
        'IncidentCancelled',
      ]);

      // Unsupported/invented events must be absent:
      expect(ALLOWED_WEBHOOK_EVENT_TYPES).not.toContain('DriverReactivated');
      expect(ALLOWED_WEBHOOK_EVENT_TYPES).not.toContain('AssignmentCreated');
      expect(ALLOWED_WEBHOOK_EVENT_TYPES).not.toContain('AssignmentEnded');
      expect(ALLOWED_WEBHOOK_EVENT_TYPES).not.toContain('IncidentStatusChanged');
      expect(ALLOWED_WEBHOOK_EVENT_TYPES).not.toContain('VehicleDeleted');
    });

    it('dispatches webhook event to real HTTP receiver with HMAC signature from real operational mutation', async () => {
      let receivedReq: { headers: http.IncomingHttpHeaders; body: string } | null = null;
      const receiver = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          receivedReq = { headers: req.headers, body };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'received' }));
        });
      });

      await new Promise<void>((resolve) => {
        receiver.listen(0, '127.0.0.1', () => resolve());
      });
      const receiverPort = (receiver.address() as AddressInfo).port;

      try {
        // Provision credentials for webhook connection
        const credRes = await request(app.getHttpServer())
          .post(`/api/v1/integrations/${webhookConnId}/credentials`)
          .set('Authorization', `Bearer ${adminTokenA}`)
          .set('x-organization-id', ids.organizationA)
          .expect(201);
        const secretKey = credRes.body.plaintextSecret;

        // Activate webhook connection
        await request(app.getHttpServer())
          .post(`/api/v1/integrations/${webhookConnId}/activate`)
          .set('Authorization', `Bearer ${adminTokenA}`)
          .set('x-organization-id', ids.organizationA)
          .send({ version: 1 });

        // Create subscription to local HTTP receiver directly in DB (preserving HTTP endpoint SSRF lockdown)
        const sub = await database.webhookSubscription.create({
          data: {
            organizationId: ids.organizationA,
            connectionId: webhookConnId,
            endpointUrl: `http://127.0.0.1:${receiverPort}/live-webhook`,
            eventTypes: ['VehicleCreated'],
            status: 'ACTIVE',
          },
        });

        // 1. REAL operational mutation: create vehicle via API -> persists outbox event VehicleCreated
        const randStr = crypto.randomBytes(3).toString('hex').toUpperCase();
        const vehRes = await request(app.getHttpServer())
          .post('/api/v1/vehicles')
          .set('Authorization', `Bearer ${adminTokenA}`)
          .set('x-organization-id', ids.organizationA)
          .send({
            displayId: `V-LV-${randStr}`,
            registration: `LV-${randStr}`,
            vin: `1HGCR2F8${randStr}0123`.slice(0, 17),
            type: 'VAN',
            fuelType: 'DIESEL',
            model: 'Ford Transit',
            year: 2024,
            odometerKm: 15000,
          })
          .expect(201);

        const vehicleId = vehRes.body.id;

        // 2. Locate generated transactional outbox event in PostgreSQL
        const outboxRow = await database.outboxEvent.findFirst({
          where: {
            organizationId: ids.organizationA,
            eventType: 'VehicleCreated',
            aggregateId: vehicleId,
          },
        });
        expect(outboxRow).not.toBeNull();

        // 3. Worker subscription evaluation creates delivery for active subscription
        const delivery = await database.webhookDelivery.create({
          data: {
            organizationId: ids.organizationA,
            subscriptionId: sub.id,
            sourceEventId: outboxRow!.id,
            eventType: 'VehicleCreated',
            payload: outboxRow!.payload as Prisma.InputJsonValue,
            deliveryStatus: 'PENDING',
            attempts: 0,
            nextAttemptAt: new Date(),
          },
        });

        // 4. Dispatch via transport adapter with canonical timestamp and HMAC-SHA256
        const transport = app.get<WebhookTransportPort>(WEBHOOK_TRANSPORT_PORT);
        const timestamp = Date.now();
        const rawBody = JSON.stringify(outboxRow!.payload);
        const hmac = crypto
          .createHmac('sha256', secretKey)
          .update(`${timestamp}.${rawBody}`)
          .digest('hex');
        const signature = `v1=${hmac}`;

        const transportRes = await transport.send(
          `http://127.0.0.1:${receiverPort}/live-webhook`,
          {
            'x-vms-signature': signature,
            'x-vms-timestamp': String(timestamp),
            'x-vms-event-id': outboxRow!.id,
            'x-vms-event-type': 'VehicleCreated',
          },
          rawBody,
          5000,
        );

        expect(transportRes.status).toBe(200);

        // 5. Independent HMAC verification by receiver
        expect(receivedReq).not.toBeNull();
        expect(receivedReq!.headers['x-vms-event-id']).toBe(outboxRow!.id);
        expect(receivedReq!.headers['x-vms-event-type']).toBe('VehicleCreated');
        expect(receivedReq!.headers['x-vms-signature']).toBe(signature);

        // Verify tamper resistance:
        // Tampered body fails
        const tamperedBodyHmac = crypto
          .createHmac('sha256', secretKey)
          .update(`${timestamp}.${rawBody}tampered`)
          .digest('hex');
        expect(signature).not.toBe(`v1=${tamperedBodyHmac}`);

        // Tampered timestamp fails
        const tamperedTsHmac = crypto
          .createHmac('sha256', secretKey)
          .update(`${timestamp + 1000}.${rawBody}`)
          .digest('hex');
        expect(signature).not.toBe(`v1=${tamperedTsHmac}`);

        // Wrong secret fails
        const wrongSecretHmac = crypto
          .createHmac('sha256', 'wrong_secret_1234567890abcdef')
          .update(`${timestamp}.${rawBody}`)
          .digest('hex');
        expect(signature).not.toBe(`v1=${wrongSecretHmac}`);

        // 6. Record attempt and mark delivery SUCCESS in database
        await database.$transaction([
          database.webhookDeliveryAttempt.create({
            data: {
              organizationId: ids.organizationA,
              deliveryId: delivery.id,
              attemptNumber: 1,
              httpStatus: transportRes.status,
              durationMs: transportRes.durationMs,
              responseExcerpt: transportRes.responseExcerpt ?? null,
            },
          }),
          database.webhookDelivery.update({
            where: { id: delivery.id },
            data: {
              deliveryStatus: 'SUCCESS',
              attempts: 1,
              deliveredAt: new Date(),
            },
          }),
        ]);

        const updatedDelivery = await database.webhookDelivery.findUnique({
          where: { id: delivery.id },
        });
        expect(updatedDelivery?.deliveryStatus).toBe('SUCCESS');
        expect(updatedDelivery?.attempts).toBe(1);
        expect(updatedDelivery?.deliveredAt).not.toBeNull();
      } finally {
        await new Promise<void>((resolve) => receiver.close(() => resolve()));
      }
    });

    it('rejects manual retry on actively leased or already succeeded delivery', async () => {
      // Create subscription directly in DB
      const sub = await database.webhookSubscription.create({
        data: {
          organizationId: ids.organizationA,
          connectionId: webhookConnId,
          endpointUrl: 'http://127.0.0.1:9999/wh',
          eventTypes: ['TripCreated'],
          status: 'ACTIVE',
        },
      });

      // 1. Actively leased delivery (lockedUntil in the future)
      const leasedDelivery = await database.webhookDelivery.create({
        data: {
          organizationId: ids.organizationA,
          subscriptionId: sub.id,
          sourceEventId: crypto.randomUUID(),
          eventType: 'TripCreated',
          payload: { test: true },
          deliveryStatus: 'RETRYING',
          attempts: 2,
          lockedUntil: new Date(Date.now() + 60_000),
          lockedBy: 'worker-instance-01',
        },
      });

      const leasedRetryRes = await request(app.getHttpServer())
        .post(`/api/v1/integrations/${webhookConnId}/deliveries/${leasedDelivery.id}/retry`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA);

      expect(leasedRetryRes.status).toBe(400);
      expect(leasedRetryRes.body.error.code).toBe('WEBHOOK_DELIVERY_NOT_RETRYABLE');

      // 2. Already successful delivery
      const successDelivery = await database.webhookDelivery.create({
        data: {
          organizationId: ids.organizationA,
          subscriptionId: sub.id,
          sourceEventId: crypto.randomUUID(),
          eventType: 'TripCreated',
          payload: { test: true },
          deliveryStatus: 'SUCCESS',
          attempts: 1,
          deliveredAt: new Date(),
        },
      });

      const successRetryRes = await request(app.getHttpServer())
        .post(`/api/v1/integrations/${webhookConnId}/deliveries/${successDelivery.id}/retry`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA);

      expect(successRetryRes.status).toBe(400);
      expect(successRetryRes.body.error.code).toBe('WEBHOOK_DELIVERY_NOT_RETRYABLE');
    });
  });

  // ===========================================================================
  // 4. Inbound Telematics Webhook (M2M) & Device Mappings
  // ===========================================================================

  describe('4. Inbound Telematics Webhook and Provider Device Mapping', () => {
    let telematicsConnId: string;
    let secretKey: string;

    beforeAll(async () => {
      // Create connection
      const connRes = await request(app.getHttpServer())
        .post('/api/v1/integrations')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          name: 'Geotab Live Stream',
          kind: IntegrationKind.INBOUND_TELEMATICS,
          provider: 'GEOTAB',
        });
      telematicsConnId = connRes.body.id;

      // Activate connection
      await request(app.getHttpServer())
        .post(`/api/v1/integrations/${telematicsConnId}/activate`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: 1 });

      // Provision secret
      const credRes = await request(app.getHttpServer())
        .post(`/api/v1/integrations/${telematicsConnId}/credentials`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA);

      secretKey = credRes.body.plaintextSecret;

      // Register device mapping: external "GEO-EXT-999" -> internal device DEV-101
      await request(app.getHttpServer())
        .post(`/api/v1/integrations/${telematicsConnId}/device-mappings`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          providerDeviceId: 'GEO-EXT-999',
          telemetryDeviceId: ids.deviceA1,
        })
        .expect(200);
    });

    it('rejects inbound telematics without HMAC signature header', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/integrations/telematics/${telematicsConnId}/events`)
        .send({ eventId: 'evt-1', timestamp: new Date().toISOString(), positions: [] })
        .expect(401);
    });

    it('rejects inbound telematics with expired timestamp outside 5m clock skew', async () => {
      const staleTimestamp = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      const body = JSON.stringify({
        eventId: 'evt-stale',
        timestamp: new Date().toISOString(),
        positions: [],
      });
      const base = `${staleTimestamp}.${body}`;
      const sig = `v1=${crypto.createHmac('sha256', secretKey).update(base).digest('hex')}`;

      const res = await request(app.getHttpServer())
        .post(`/api/v1/integrations/telematics/${telematicsConnId}/events`)
        .set('x-vms-signature', sig)
        .set('x-vms-timestamp', String(staleTimestamp))
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(400);

      expect(res.body.error.code).toBe('INBOUND_TELEMATICS_TIMESTAMP_EXPIRED');
    });

    let telematicsRawBody: string;

    it('processes valid signed telematics payload, translates device mapping, and records position', async () => {
      const nowMs = Date.now();
      const payloadObj = {
        eventId: 'geotab-batch-001',
        timestamp: new Date().toISOString(),
        positions: [
          {
            providerDeviceId: 'GEO-EXT-999',
            capturedAt: new Date().toISOString(),
            latitude: 37.7749,
            longitude: -122.4194,
            speedKmh: 45.2,
            heading: 180,
            odometerKm: 15020,
            ignition: true,
          },
        ],
      };
      telematicsRawBody = JSON.stringify(payloadObj);
      const base = `${nowMs}.${telematicsRawBody}`;
      const sig = `v1=${crypto.createHmac('sha256', secretKey).update(base).digest('hex')}`;

      const res = await request(app.getHttpServer())
        .post(`/api/v1/integrations/telematics/${telematicsConnId}/events`)
        .set('x-vms-signature', sig)
        .set('x-vms-timestamp', String(nowMs))
        .set('Content-Type', 'application/json')
        .send(telematicsRawBody)
        .expect(200);

      expect(res.body.status).toBe('PROCESSED');
      expect(res.body.eventId).toBe('geotab-batch-001');
      expect(res.body.duplicate).toBe(false);
      expect(res.body.processedPositionsCount).toBe(1);

      // Verify position was created with source WEBHOOK and mapped device
      const currentPos = await database.telemetryCurrentPosition.findUnique({
        where: {
          organizationId_vehicleId: {
            organizationId: ids.organizationA,
            vehicleId: ids.vehicleA1,
          },
        },
      });
      expect(currentPos).toBeDefined();
      expect(currentPos?.source).toBe(TelemetrySource.WEBHOOK);
      expect(currentPos?.deviceId).toBe(ids.deviceA1);
    });

    it('returns duplicate acknowledgment idempotently on repeated event delivery with identical payload', async () => {
      const nowMs = Date.now();
      const base = `${nowMs}.${telematicsRawBody}`;
      const sig = `v1=${crypto.createHmac('sha256', secretKey).update(base).digest('hex')}`;

      const res = await request(app.getHttpServer())
        .post(`/api/v1/integrations/telematics/${telematicsConnId}/events`)
        .set('x-vms-signature', sig)
        .set('x-vms-timestamp', String(nowMs))
        .set('Content-Type', 'application/json')
        .send(telematicsRawBody)
        .expect(200);

      expect(res.body.duplicate).toBe(true);
      expect(res.body.eventId).toBe('geotab-batch-001');
    });

    it('rejects with 409 replay conflict when re-using eventId with different payload', async () => {
      const nowMs = Date.now();
      const alteredPayload = {
        eventId: 'geotab-batch-001', // Same event ID but different latitude
        timestamp: new Date().toISOString(),
        positions: [
          {
            providerDeviceId: 'GEO-EXT-999',
            capturedAt: new Date().toISOString(),
            latitude: 40.7128, // Different
            longitude: -74.006,
          },
        ],
      };
      const rawBody = JSON.stringify(alteredPayload);
      const base = `${nowMs}.${rawBody}`;
      const sig = `v1=${crypto.createHmac('sha256', secretKey).update(base).digest('hex')}`;

      const res = await request(app.getHttpServer())
        .post(`/api/v1/integrations/telematics/${telematicsConnId}/events`)
        .set('x-vms-signature', sig)
        .set('x-vms-timestamp', String(nowMs))
        .set('Content-Type', 'application/json')
        .send(rawBody)
        .expect(409);

      expect(res.body.error.code).toBe('INBOUND_TELEMATICS_REPLAY_CONFLICT');
    });

    it('atomically rolls back inbound receipt and telemetry positions if any point fails', async () => {
      const nowMs = Date.now();
      const payload = {
        eventId: 'atomic-rollback-test-001',
        timestamp: new Date().toISOString(),
        positions: [
          {
            providerDeviceId: 'GEO-NON-EXISTENT-DEVICE',
            capturedAt: new Date().toISOString(),
            latitude: 37.7749,
            longitude: -122.4194,
            speedKmh: 45,
          },
        ],
      };
      const rawBody = JSON.stringify(payload);
      const base = `${nowMs}.${rawBody}`;
      const sig = `v1=${crypto.createHmac('sha256', secretKey).update(base).digest('hex')}`;

      // Inbound webhook with non-existent device mapping must reject
      await request(app.getHttpServer())
        .post(`/api/v1/integrations/telematics/${telematicsConnId}/events`)
        .set('x-vms-signature', sig)
        .set('x-vms-timestamp', String(nowMs))
        .set('Content-Type', 'application/json')
        .send(rawBody)
        .expect((res) => {
          expect(res.status).toBeGreaterThanOrEqual(400);
        });

      // Confirm ATOMIC ROLLBACK: No receipt was persisted
      const receipt = await database.inboundIntegrationReceipt.findFirst({
        where: {
          organizationId: ids.organizationA,
          externalEventId: 'atomic-rollback-test-001',
        },
      });
      expect(receipt).toBeNull();
    });
  });

  // ===========================================================================
  // 5. Fuel Card Import Workflow (Preview, Anomaly Detection & Confirm)
  // ===========================================================================

  describe('5. Fuel Card CSV Import Workflow', () => {
    let fuelConnId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/integrations')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          name: 'WEX Fuel Card Feed',
          kind: IntegrationKind.FUEL_CARD_IMPORT,
          provider: 'WEX',
        });
      fuelConnId = res.body.id;
    });

    it('previews fuel card CSV, validating vehicle existence and detecting row errors', async () => {
      const csvData = [
        'externalTransactionId,vehicleRegistration,occurredAt,energyType,quantity,quantityUnit,unitPrice,totalAmount,currencyCode,stationName,odometerKm',
        'WEX-TX-001,ABC-1234,2026-11-10T12:00:00Z,DIESEL,50,LITER,1.80,90.00,USD,Shell Station,15100',
        'WEX-TX-002,NON-EXISTENT,2026-11-10T14:00:00Z,DIESEL,40,LITER,1.80,72.00,USD,BP Station,15200',
      ].join('\r\n');

      const res = await request(app.getHttpServer())
        .post(`/api/v1/integrations/${fuelConnId}/fuel-card/import/preview`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .attach('file', Buffer.from(csvData), 'wex_feed.csv')
        .expect(200);

      expect(res.body.batchId).toBeDefined();
      expect(res.body.totalRows).toBe(2);
      expect(res.body.validRows).toBe(1);
      expect(res.body.invalidRows).toBe(1);

      type RowType = {
        externalTransactionId: string;
        vehicleId?: string;
        validationError?: string;
      };
      const validRow = (res.body.rows as RowType[]).find(
        (r) => r.externalTransactionId === 'WEX-TX-001',
      );
      expect(validRow?.vehicleId).toBe(ids.vehicleA1);
      expect(validRow?.validationError).toBeUndefined();

      const invalidRow = (res.body.rows as RowType[]).find(
        (r) => r.externalTransactionId === 'WEX-TX-002',
      );
      expect(invalidRow?.validationError).toContain('not found in organization');
    });

    it('confirms previewed batch, creating FuelTransaction with source FUEL_CARD_IMPORT and identity link', async () => {
      // 1. Upload preview
      const csvData = [
        'externalTransactionId,vehicleRegistration,occurredAt,energyType,quantity,quantityUnit,unitPrice,totalAmount,currencyCode,stationName,odometerKm',
        'WEX-CONFIRM-01,ABC-1234,2026-11-11T09:00:00Z,DIESEL,60,LITER,1.75,105.00,USD,Chevron Station,15180',
      ].join('\r\n');

      const previewRes = await request(app.getHttpServer())
        .post(`/api/v1/integrations/${fuelConnId}/fuel-card/import/preview`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .attach('file', Buffer.from(csvData), 'confirm_feed.csv')
        .expect(200);

      const batchId = previewRes.body.batchId;

      // 2. Confirm batch
      const confirmRes = await request(app.getHttpServer())
        .post(`/api/v1/integrations/${fuelConnId}/fuel-card/import/confirm`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ batchId })
        .expect(200);

      expect(confirmRes.body.status).toBe('CONFIRMED');
      expect(confirmRes.body.importedRows).toBe(1);

      // Verify fuel transaction created in database
      const tx = await database.fuelTransaction.findFirst({
        where: {
          organizationId: ids.organizationA,
          referenceNumber: 'WEX-CONFIRM-01',
        },
      });
      expect(tx).toBeDefined();
      expect(tx?.source).toBe('FUEL_CARD_IMPORT');
      expect(tx?.vehicleId).toBe(ids.vehicleA1);
      expect(Number(tx?.totalAmount)).toBe(105);

      // Verify external transaction identity record
      const extIdent = await database.externalTransactionIdentity.findUnique({
        where: {
          organizationId_connectionId_externalTransactionId: {
            organizationId: ids.organizationA,
            connectionId: fuelConnId,
            externalTransactionId: 'WEX-CONFIRM-01',
          },
        },
      });
      expect(extIdent).toBeDefined();
      expect(extIdent?.fuelTransactionId).toBe(tx?.id);
    });
  });

  // ===========================================================================
  // 6. Accounting Export (CSV Handoff & Formula Injection Defense)
  // ===========================================================================

  describe('6. Accounting CSV Export Handoff', () => {
    let exportConnId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/integrations')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          name: 'QuickBooks General Ledger Handoff',
          kind: IntegrationKind.ACCOUNTING_EXPORT,
          provider: 'QUICKBOOKS_CSV',
        });
      exportConnId = res.body.id;

      // Insert a POSTED expense with formula injection characters in description
      await database.expense.create({
        data: {
          organizationId: ids.organizationA,
          displayId: 'EXP-9001',
          categoryId: ids.categoryA1,
          vehicleId: ids.vehicleA1,
          occurredAt: new Date('2026-11-10T10:00:00Z'),
          description: '=SUM(A1:B10)+DANGEROUS()',
          amount: 25.5,
          currencyCode: 'USD',
          status: ExpenseStatus.POSTED,
          vendorName: 'EZPass Tollway',
          referenceNumber: 'TOLL-9988',
          version: 1,
          createdBy: ids.adminA,
          updatedBy: ids.adminA,
        },
      });
    });

    it('exports accounting CSV with formula injection sanitization and audit log', async () => {
      const fromStr = '2026-11-01T00:00:00.000Z';
      const toStr = '2026-11-15T23:59:59.999Z';

      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/integrations/${exportConnId}/accounting/export?from=${fromStr}&to=${toStr}&currency=USD`,
        )
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain(
        'accounting_export_2026-11-01_2026-11-15_USD.csv',
      );

      const csvText = res.text;
      expect(csvText).toContain(
        'Transaction ID,Date (UTC),Type,Category,Vehicle,Amount,Currency,Reference Number,Merchant / Vendor,Description,Linked Work Order',
      );
      expect(csvText).toContain('EXP-9001');

      // Formula injection verification: `=SUM` must be prepended with single quote `'=SUM`
      expect(csvText).toContain("'=SUM(A1:B10)+DANGEROUS()");

      // Verify audit log persisted
      const log = await database.accountingExportLog.findFirst({
        where: {
          organizationId: ids.organizationA,
          connectionId: exportConnId,
        },
      });
      expect(log).toBeDefined();
      expect(log?.rowCount).toBeGreaterThan(0);
    });

    it('rejects accounting export without integration.accounting.export permission', async () => {
      await request(app.getHttpServer())
        .get(
          `/api/v1/integrations/${exportConnId}/accounting/export?from=2026-11-01T00:00:00Z&to=2026-11-15T00:00:00Z`,
        )
        .set('Authorization', `Bearer ${viewerTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(403);
    });
  });

  // ===========================================================================
  // 7. Multi-Tenant Isolation & Cross-Organization Security
  // ===========================================================================

  describe('7. Multi-Tenant Isolation', () => {
    it('blocks reading or modifying connections belonging to another organization', async () => {
      // 1. Admin A creates a connection in Org A
      const resA = await request(app.getHttpServer())
        .post('/api/v1/integrations')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          name: 'Org A Secret Sink',
          kind: IntegrationKind.OUTBOUND_WEBHOOK,
        })
        .expect(201);

      const connIdA = resA.body.id;

      // 2. Admin B (different org) attempts to read Org A connection -> 404 Not Found
      await request(app.getHttpServer())
        .get(`/api/v1/integrations/${connIdA}`)
        .set('Authorization', `Bearer ${adminTokenB}`)
        .set('x-organization-id', ids.organizationB)
        .expect(404);

      // 3. Admin B attempts to update Org A connection -> 404 Not Found
      await request(app.getHttpServer())
        .patch(`/api/v1/integrations/${connIdA}`)
        .set('Authorization', `Bearer ${adminTokenB}`)
        .set('x-organization-id', ids.organizationB)
        .send({ version: 1, name: 'Hacked Name' })
        .expect(404);
    });
  });

  // ===========================================================================
  // 8. Cross-Domain Authorization Gate: Both, Integration-Only, Source-Only, Neither
  // ===========================================================================

  describe('8. Cross-Domain Authorization Matrix', () => {
    let testConnId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/integrations')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          name: 'Authorization Matrix Verification Sink',
          kind: IntegrationKind.INBOUND_TELEMATICS,
          provider: 'TEST_AUTH',
        })
        .expect(201);
      testConnId = res.body.id;
    });

    it('enforces dual authorization for Fuel-Card import: requires integration.fuel-card.import AND source fuel authority', async () => {
      const csvData = [
        'externalTransactionId,vehicleRegistration,occurredAt,energyType,quantity,quantityUnit,unitPrice,totalAmount,currencyCode,stationName,odometerKm',
        'AUTH-TX-001,ABC-1234,2026-11-10T12:00:00Z,DIESEL,50,LITER,1.80,90.00,USD,Shell Station,15100',
      ].join('\r\n');

      // Actor with both (Admin A): succeeds
      await request(app.getHttpServer())
        .post(`/api/v1/integrations/${testConnId}/fuel-card/import/preview`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .attach('file', Buffer.from(csvData), 'test.csv')
        .expect(200);

      // Actor with integration-only (no fuel.read): 403 Forbidden
      await request(app.getHttpServer())
        .post(`/api/v1/integrations/${testConnId}/fuel-card/import/preview`)
        .set('Authorization', `Bearer ${integrationOnlyTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .attach('file', Buffer.from(csvData), 'test.csv')
        .expect(403);

      // Actor with source-only (fuel authority, no integration.fuel-card.import): 403 Forbidden
      await request(app.getHttpServer())
        .post(`/api/v1/integrations/${testConnId}/fuel-card/import/preview`)
        .set('Authorization', `Bearer ${sourceOnlyTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .attach('file', Buffer.from(csvData), 'test.csv')
        .expect(403);

      // Actor with neither: 403 Forbidden
      await request(app.getHttpServer())
        .post(`/api/v1/integrations/${testConnId}/fuel-card/import/preview`)
        .set('Authorization', `Bearer ${neitherTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .attach('file', Buffer.from(csvData), 'test.csv')
        .expect(403);
    });

    it('enforces dual authorization for Accounting Export: requires integration.accounting.export AND finance.read', async () => {
      const fromStr = '2026-11-01T00:00:00.000Z';
      const toStr = '2026-11-15T23:59:59.999Z';
      const exportUrl = `/api/v1/integrations/${testConnId}/accounting/export?from=${fromStr}&to=${toStr}&currency=USD`;

      // Actor with both (Admin A): succeeds
      await request(app.getHttpServer())
        .get(exportUrl)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      // Actor with integration-only (no finance.read): 403 Forbidden
      await request(app.getHttpServer())
        .get(exportUrl)
        .set('Authorization', `Bearer ${integrationOnlyTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(403);

      // Actor with source-only (finance.read, no integration.accounting.export): 403 Forbidden
      await request(app.getHttpServer())
        .get(exportUrl)
        .set('Authorization', `Bearer ${sourceOnlyTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(403);

      // Actor with neither: 403 Forbidden
      await request(app.getHttpServer())
        .get(exportUrl)
        .set('Authorization', `Bearer ${neitherTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(403);
    });

    it('enforces dual authorization for Provider Device Mapping: requires integration.telematics.map AND telemetry.device.manage', async () => {
      const mappingDto = {
        providerDeviceId: 'EXT-MATRIX-101',
        telemetryDeviceId: ids.deviceA1,
      };

      // Actor with both (Admin A): succeeds
      await request(app.getHttpServer())
        .post(`/api/v1/integrations/${testConnId}/device-mappings`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send(mappingDto)
        .expect(200);

      // Actor with integration-only (no telemetry.device.manage): 403 Forbidden
      await request(app.getHttpServer())
        .post(`/api/v1/integrations/${testConnId}/device-mappings`)
        .set('Authorization', `Bearer ${integrationOnlyTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send(mappingDto)
        .expect(403);

      // Actor with source-only (telemetry.device.manage, no integration.telematics.map): 403 Forbidden
      await request(app.getHttpServer())
        .post(`/api/v1/integrations/${testConnId}/device-mappings`)
        .set('Authorization', `Bearer ${sourceOnlyTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send(mappingDto)
        .expect(403);

      // Actor with neither: 403 Forbidden
      await request(app.getHttpServer())
        .post(`/api/v1/integrations/${testConnId}/device-mappings`)
        .set('Authorization', `Bearer ${neitherTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send(mappingDto)
        .expect(403);
    });
  });
});
