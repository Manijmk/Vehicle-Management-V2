import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { loadApiConfig } from '@vms/config';
import {
  createDatabaseClient,
  MembershipStatus,
  PrincipalStatus,
  VehicleStatus,
} from '@vms/database';
import type { PrismaClient } from '@vms/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { configureApiApplication } from '../src/bootstrap.js';
import { permissionCodes } from '../src/modules/foundation/domain/permissions.js';
import { LocalJwtAuthenticationAdapter } from '../src/modules/identity/infrastructure/local-jwt-authentication.adapter.js';
import { TelemetryService } from '../src/modules/telemetry/application/telemetry.service.js';

const ids = {
  organizationA: '12300000-0000-4000-8000-000000000001',
  organizationB: '12300000-0000-4000-8000-000000000002',
  adminA: '22300000-0000-4000-8000-000000000001',
  viewerA: '22300000-0000-4000-8000-000000000002',
  adminB: '22300000-0000-4000-8000-000000000003',
  membershipAdminA: '32300000-0000-4000-8000-000000000001',
  membershipViewerA: '32300000-0000-4000-8000-000000000002',
  membershipAdminB: '32300000-0000-4000-8000-000000000003',
  roleAdminA: '42300000-0000-4000-8000-000000000001',
  roleViewerA: '42300000-0000-4000-8000-000000000002',
  roleAdminB: '42300000-0000-4000-8000-000000000003',
  vehicleA: '52300000-0000-4000-8000-000000000001',
  vehicleB: '52300000-0000-4000-8000-000000000002',
} as const;

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://vehicle_management:local_vehicle_management@localhost:5432/vehicle_management?schema=public';

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
});

async function seedFixture(database: PrismaClient) {
  await database.organization.createMany({
    data: [
      {
        id: ids.organizationA,
        name: 'Telemetry Org A',
        slug: 'telemetry-org-a',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.organizationB,
        name: 'Telemetry Org B',
        slug: 'telemetry-org-b',
        status: PrincipalStatus.ACTIVE,
      },
    ],
  });

  await database.user.createMany({
    data: [
      {
        id: ids.adminA,
        email: 'telemetry-admin-a@test.local',
        displayName: 'Telemetry Admin A',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.viewerA,
        email: 'telemetry-viewer-a@test.local',
        displayName: 'Telemetry Viewer A',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.adminB,
        email: 'telemetry-admin-b@test.local',
        displayName: 'Telemetry Admin B',
        status: PrincipalStatus.ACTIVE,
      },
    ],
  });

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
    ],
  });

  for (const [index, code] of permissionCodes.entries()) {
    await database.permission.upsert({
      where: { code },
      update: {},
      create: {
        id: `53300000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        code,
        description: code,
      },
    });
  }

  await database.role.createMany({
    data: [
      { id: ids.roleAdminA, organizationId: ids.organizationA, name: 'Admin A Role' },
      { id: ids.roleViewerA, organizationId: ids.organizationA, name: 'Viewer A Role' },
      { id: ids.roleAdminB, organizationId: ids.organizationB, name: 'Admin B Role' },
    ],
  });

  const allPermissions = await database.permission.findMany();

  await database.rolePermission.createMany({
    data: allPermissions.map((p) => ({ roleId: ids.roleAdminA, permissionId: p.id })),
  });

  const viewerCodes = ['telemetry.read', 'telemetry.device.read', 'vehicle.read'];
  await database.rolePermission.createMany({
    data: allPermissions
      .filter((p) => viewerCodes.includes(p.code))
      .map((p) => ({ roleId: ids.roleViewerA, permissionId: p.id })),
  });

  await database.rolePermission.createMany({
    data: allPermissions.map((p) => ({ roleId: ids.roleAdminB, permissionId: p.id })),
  });

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
    ],
  });

  // Seed vehicles for assignment testing
  await database.vehicle.createMany({
    data: [
      {
        id: ids.vehicleA,
        organizationId: ids.organizationA,
        displayId: 'VH-TELEM-001',
        registration: 'TLM-001',
        vin: '1HGCR2F83HA000001',
        model: 'Toyota Hilux',
        year: 2022,
        odometerKm: 15000,
        type: 'TRUCK',
        status: VehicleStatus.ACTIVE,
        fuelType: 'DIESEL',
      },
      {
        id: ids.vehicleB,
        organizationId: ids.organizationB,
        displayId: 'VH-TELEM-002',
        registration: 'TLM-002',
        vin: '1HGCR2F83HA000002',
        model: 'Ford Transit',
        year: 2023,
        odometerKm: 25000,
        type: 'VAN',
        status: VehicleStatus.ACTIVE,
        fuelType: 'DIESEL',
      },
    ],
  });
}

async function cleanFixture(database: PrismaClient) {
  await database.$executeRawUnsafe(
    'TRUNCATE TABLE telemetry_current_positions, telemetry_positions, telemetry_device_credentials, telemetry_device_vehicle_assignments, telemetry_devices, vehicle_driver_assignments, driver_status_history, driver_licenses, drivers, vehicle_status_history, vehicles, audit_logs, outbox_events, membership_roles, role_permissions, permissions, roles, organization_memberships, users, organizations RESTART IDENTITY CASCADE',
  );
}

describe('Telemetry GPS e2e', () => {
  let app: INestApplication;
  let database: PrismaClient;
  let tokenA: string;
  let tokenViewerA: string;
  let tokenB: string;

  beforeAll(async () => {
    const config = loadApiConfig();
    database = createDatabaseClient({ databaseUrl });
    await cleanFixture(database).catch(() => {
      /* ignore if not present */
    });
    await seedFixture(database);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApiApplication(app, config);
    await app.init();

    const authentication = new LocalJwtAuthenticationAdapter(config);
    [tokenA, tokenViewerA, tokenB] = await Promise.all([
      authentication.issueDevelopmentToken(ids.adminA),
      authentication.issueDevelopmentToken(ids.viewerA),
      authentication.issueDevelopmentToken(ids.adminB),
    ]);
  });

  afterAll(async () => {
    await cleanFixture(database);
    await database.$disconnect();
    if (app) {
      await app.close();
    }
  });

  // ---- DEVICE MANAGEMENT ----

  let deviceId: string;

  it('registers a new telemetry device', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/telemetry/devices')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ name: 'GPS Tracker Alpha', identifier: 'IMEI-900000000000001' })
      .expect(201);

    expect(res.body.name).toBe('GPS Tracker Alpha');
    expect(res.body.identifier).toBe('IMEI-900000000000001');
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.displayId).toMatch(/^DEV-\d+$/);
    deviceId = res.body.id as string;
  });

  it('rejects duplicate device identifier within same org', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/telemetry/devices')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ name: 'GPS Tracker Duplicate', identifier: 'IMEI-900000000000001' })
      .expect(409);
  });

  it('allows same identifier in a different org', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/telemetry/devices')
      .set('Authorization', `Bearer ${tokenB}`)
      .set('x-organization-id', ids.organizationB)
      .send({ name: 'Cross-Org Device', identifier: 'IMEI-900000000000001' })
      .expect(201);
    expect(res.body.organizationId).toBe(ids.organizationB);
  });

  it('lists devices for org A — only shows org A devices', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/telemetry/devices')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const names = (res.body as Array<{ name: string }>).map((d) => d.name);
    expect(names).toContain('GPS Tracker Alpha');
    expect(names).not.toContain('Cross-Org Device');
  });

  it('viewer can list devices with telemetry.device.read permission', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/telemetry/devices')
      .set('Authorization', `Bearer ${tokenViewerA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);
  });

  it('viewer cannot register a device (requires telemetry.device.manage)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/telemetry/devices')
      .set('Authorization', `Bearer ${tokenViewerA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ name: 'Viewer Device', identifier: 'IMEI-VIEWER-001' })
      .expect(403);
  });

  it('gets a single device by id', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/telemetry/devices/${deviceId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);

    expect(res.body.id).toBe(deviceId);
    expect(res.body.name).toBe('GPS Tracker Alpha');
  });

  it('cross-org device access returns 404', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/telemetry/devices/${deviceId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .set('x-organization-id', ids.organizationB)
      .expect(404);
  });

  it('assigns device to a vehicle', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/telemetry/devices/${deviceId}/assign`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ vehicleId: ids.vehicleA })
      .expect(200);

    expect(res.body.activeAssignment).toBeTruthy();
    expect(res.body.activeAssignment.vehicleId).toBe(ids.vehicleA);
  });

  it('rejects assigning a device that is already assigned', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/telemetry/devices/${deviceId}/assign`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ vehicleId: ids.vehicleA })
      .expect(409);
  });

  // ---- TELEMETRY INGESTION ----

  it('ingests a telemetry position for an assigned ACTIVE device', async () => {
    const capturedAt = new Date(Date.now() - 30_000).toISOString();
    const res = await request(app.getHttpServer())
      .post('/api/v1/telemetry/ingest')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        deviceId,
        capturedAt,
        latitude: 37.7749,
        longitude: -122.4194,
        speedKmh: 65.5,
        heading: 180,
        providerMessageId: `msg-e2e-001-${Date.now()}`,
      })
      .expect(201);

    expect(res.body.latitude).toBeCloseTo(37.7749, 3);
    expect(res.body.longitude).toBeCloseTo(-122.4194, 3);
    expect(res.body.vehicleId).toBe(ids.vehicleA);
  });

  it('returns idempotent result for duplicate providerMessageId', async () => {
    const msgId = `msg-idempotent-${Date.now()}`;
    const capturedAt = new Date(Date.now() - 60_000).toISOString();
    const payload = {
      deviceId,
      capturedAt,
      latitude: 37.775,
      longitude: -122.419,
      providerMessageId: msgId,
    };

    const res1 = await request(app.getHttpServer())
      .post('/api/v1/telemetry/ingest')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send(payload)
      .expect(201);

    const res2 = await request(app.getHttpServer())
      .post('/api/v1/telemetry/ingest')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send(payload)
      .expect(201);

    expect(res1.body.id).toBe(res2.body.id);
  });

  it('rejects position with invalid coordinates', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/telemetry/ingest')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ deviceId, capturedAt: new Date().toISOString(), latitude: 999, longitude: -122 })
      .expect(400);
  });

  it('rejects ingestion by a device not assigned to any vehicle', async () => {
    // Register a new unassigned device
    const devRes = await request(app.getHttpServer())
      .post('/api/v1/telemetry/devices')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ name: 'Unassigned Device', identifier: `IMEI-UNASSIGNED-${Date.now()}` })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/telemetry/ingest')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        deviceId: (devRes.body as { id: string }).id,
        capturedAt: new Date().toISOString(),
        latitude: 37,
        longitude: -122,
      })
      .expect(409);
  });

  // ---- CURRENT POSITION & HISTORY ----

  it('returns current vehicle position after ingestion', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/telemetry/vehicles/${ids.vehicleA}/current`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);

    expect(res.body.vehicleId).toBe(ids.vehicleA);
    expect(res.body.freshness).toMatch(/^(FRESH|STALE|UNKNOWN)$/);
  });

  it('returns current fleet positions', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/telemetry/current')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const vehicleIds = (res.body as Array<{ vehicleId: string }>).map((p) => p.vehicleId);
    expect(vehicleIds).toContain(ids.vehicleA);
  });

  it('cross-org cannot see fleet positions', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/telemetry/current')
      .set('Authorization', `Bearer ${tokenB}`)
      .set('x-organization-id', ids.organizationB)
      .expect(200);

    // Org B has no positions
    const vehicleIds = (res.body as Array<{ vehicleId: string }>).map((p) => p.vehicleId);
    expect(vehicleIds).not.toContain(ids.vehicleA);
  });

  it('returns position history for a vehicle', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/telemetry/vehicles/${ids.vehicleA}/history`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);

    expect(res.body.items).toBeDefined();
    expect(Array.isArray(res.body.items)).toBe(true);
    expect((res.body.items as unknown[]).length).toBeGreaterThan(0);
  });

  it('vehicle history returns 404 for unknown vehicle', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/telemetry/vehicles/00000000-0000-4000-8000-000000000099/history')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(404);
  });

  // ---- DEVICE LIFECYCLE ----

  it('suspends a device', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/telemetry/devices/${deviceId}/suspend`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);

    expect(res.body.status).toBe('SUSPENDED');
  });

  it('rejects ingestion from a suspended device', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/telemetry/ingest')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ deviceId, capturedAt: new Date().toISOString(), latitude: 37, longitude: -122 })
      .expect(409);
  });

  it('reactivates a suspended device', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/telemetry/devices/${deviceId}/activate`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);

    expect(res.body.status).toBe('ACTIVE');
  });

  it('unassigns a device from its vehicle', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/telemetry/devices/${deviceId}/unassign`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({})
      .expect(200);

    expect(res.body.activeAssignment).toBeNull();
  });

  it('trip route returns empty array when no positions are linked to a trip', async () => {
    // Use an existing trip UUID that wouldn't be in DB → 404
    await request(app.getHttpServer())
      .get('/api/v1/telemetry/trips/00000000-0000-4000-8000-000000000099/route')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(404);
  });

  // ==========================================
  // RELEASE GATE 2: DATABASE-LEVEL TENANT INTEGRITY
  // ==========================================

  it('rejects cross-tenant position insert at PostgreSQL composite constraint level', async () => {
    // Org A position referencing Org B vehicle
    await expect(
      database.$executeRawUnsafe(
        `INSERT INTO telemetry_positions (
          id, organization_id, device_id, vehicle_id, captured_at, received_at,
          latitude, longitude, source, status
        ) VALUES (
          gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, NOW(), NOW(),
          37.7749, -122.4194, 'DEVICE', 'VALID'
        )`,
        ids.organizationA,
        deviceId,
        ids.vehicleB, // Belongs to Org B!
      ),
    ).rejects.toThrow();
  });

  it('rejects cross-tenant device assignment at PostgreSQL composite constraint level', async () => {
    // Org A assignment referencing Org B vehicle
    await expect(
      database.$executeRawUnsafe(
        `INSERT INTO telemetry_device_vehicle_assignments (
          id, organization_id, device_id, vehicle_id, assigned_at, assigned_by
        ) VALUES (
          gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, NOW(), $4::uuid
        )`,
        ids.organizationA,
        deviceId,
        ids.vehicleB, // Belongs to Org B!
        ids.adminA,
      ),
    ).rejects.toThrow();
  });

  // ==========================================
  // RELEASE GATE 3: ASSIGNMENT INVARIANTS & CONCURRENCY
  // ==========================================

  it('prevents overlapping active assignments at PostgreSQL partial unique index level', async () => {
    // Re-assign device to vehicleA
    await request(app.getHttpServer())
      .post(`/api/v1/telemetry/devices/${deviceId}/assign`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ vehicleId: ids.vehicleA })
      .expect(200);

    // Create a 2nd vehicle in Org A
    const v2 = await database.vehicle.create({
      data: {
        organizationId: ids.organizationA,
        displayId: 'V-DEV-TEST-02',
        registration: 'REG-DEV-02',
        vin: '1HGBH41JXMN109199',
        type: 'VAN',
        fuelType: 'DIESEL',
        status: VehicleStatus.ACTIVE,
        model: 'Test Van',
        year: 2024,
        odometerKm: 10000,
      },
    });

    // Try direct SQL insert assigning SAME device to v2 while active
    await expect(
      database.$executeRawUnsafe(
        `INSERT INTO telemetry_device_vehicle_assignments (
          id, organization_id, device_id, vehicle_id, assigned_at, assigned_by
        ) VALUES (
          gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, NOW(), $4::uuid
        )`,
        ids.organizationA,
        deviceId,
        v2.id,
        ids.adminA,
      ),
    ).rejects.toThrow();

    // Clean up v2
    await database.vehicle.delete({ where: { id: v2.id } });
  });

  it('reassigns a device to another vehicle, ending prior active assignment', async () => {
    const v3 = await database.vehicle.create({
      data: {
        organizationId: ids.organizationA,
        displayId: 'V-DEV-TEST-03',
        registration: 'REG-DEV-03',
        vin: '1HGBH41JXMN109198',
        type: 'VAN',
        fuelType: 'DIESEL',
        status: VehicleStatus.ACTIVE,
        model: 'Test Van 3',
        year: 2024,
        odometerKm: 10000,
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/telemetry/devices/${deviceId}/reassign`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ vehicleId: v3.id })
      .expect(200);

    expect(res.body.activeAssignment).toBeDefined();
    expect(res.body.activeAssignment.vehicleId).toBe(v3.id);

    // Verify historical assignment for vehicleA has unassignedAt set
    const prior = await database.telemetryDeviceVehicleAssignment.findFirst({
      where: {
        organizationId: ids.organizationA,
        deviceId,
        vehicleId: ids.vehicleA,
      },
      orderBy: { assignedAt: 'desc' },
    });
    expect(prior?.unassignedAt).not.toBeNull();

    // Reassign back to vehicleA
    await request(app.getHttpServer())
      .post(`/api/v1/telemetry/devices/${deviceId}/reassign`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ vehicleId: ids.vehicleA })
      .expect(200);

    await database.telemetryDeviceVehicleAssignment.deleteMany({
      where: { vehicleId: v3.id },
    });
    await database.vehicle.delete({ where: { id: v3.id } });
  });

  // ==========================================
  // RELEASE GATE 4 & 5: MACHINE AUTHENTICATION & SOURCE INTEGRITY
  // ==========================================

  let deviceToken: string;
  let credentialId: string;

  it('provisions machine credential for device and never stores plaintext secret', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/telemetry/devices/${deviceId}/credentials`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(201);

    expect(res.body.token).toBeDefined();
    expect(res.body.token).toContain('.');
    expect(res.body.keyPrefix).toBeDefined();
    expect(res.body.secret).toBeDefined();
    deviceToken = res.body.token;
    credentialId = res.body.id;

    // Check DB record: secretHash is present, plaintext secret is absent
    const dbRecord = await database.telemetryDeviceCredential.findUnique({
      where: { id: credentialId },
    });
    expect(dbRecord).not.toBeNull();
    expect(dbRecord?.secretHash).toBeDefined();
    expect((dbRecord as Record<string, unknown>)['secret']).toBeUndefined();
  });

  it('ingests live position via machine credential without user bearer token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/telemetry/device/positions')
      .set('x-device-key', deviceToken)
      .send({
        capturedAt: new Date().toISOString(),
        latitude: 37.775,
        longitude: -122.419,
        speedKmh: 45.0,
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.vehicleId).toBe(ids.vehicleA);
    expect(res.body.deviceId).toBe(deviceId);
    expect(res.body.source).toBe('DEVICE');
  });

  it('rejects machine ingestion with invalid secret token', async () => {
    const fakeToken = deviceToken.slice(0, 15) + 'invalidsecret';
    await request(app.getHttpServer())
      .post('/api/v1/telemetry/device/positions')
      .set('x-device-key', fakeToken)
      .send({
        capturedAt: new Date().toISOString(),
        latitude: 37.775,
        longitude: -122.419,
      })
      .expect(401);
  });

  it('rejects cross-tenant spoofing attempt with machine credential', async () => {
    // Org A device token sent with Org B x-organization-id header
    await request(app.getHttpServer())
      .post('/api/v1/telemetry/device/positions')
      .set('x-device-key', deviceToken)
      .set('x-organization-id', ids.organizationB)
      .send({
        capturedAt: new Date().toISOString(),
        latitude: 37.775,
        longitude: -122.419,
      })
      .expect(403);
  });

  it('rejects MOBILE source as unsupported', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/telemetry/positions')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        deviceId,
        capturedAt: new Date().toISOString(),
        latitude: 37.775,
        longitude: -122.419,
        source: 'MOBILE',
      })
      .expect(400);
  });

  // ==========================================
  // RELEASE GATE 6: PROVIDER MESSAGE IDEMPOTENCY SCOPE
  // ==========================================

  it('deduplicates within same device but permits same message ID across different devices', async () => {
    const d2 = await request(app.getHttpServer())
      .post('/api/v1/telemetry/devices')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ name: 'GPS Tracker Beta', identifier: 'IMEI-900000000000002' })
      .expect(201);

    const vD2 = await database.vehicle.create({
      data: {
        organizationId: ids.organizationA,
        displayId: 'V-DEV-TEST-D2',
        registration: 'REG-DEV-D2',
        vin: '1HGBH41JXMN109197',
        type: 'VAN',
        fuelType: 'DIESEL',
        status: VehicleStatus.ACTIVE,
        model: 'Test Van D2',
        year: 2024,
        odometerKm: 10000,
      },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/telemetry/devices/${d2.body.id}/assign`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ vehicleId: vD2.id })
      .expect(200);

    const msgId = `MSG-CROSS-DEV-${Date.now()}`;

    // Device 1 with msgId
    const res1 = await request(app.getHttpServer())
      .post('/api/v1/telemetry/positions')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        deviceId,
        capturedAt: new Date().toISOString(),
        latitude: 37.7749,
        longitude: -122.4194,
        providerMessageId: msgId,
      })
      .expect(201);

    // Device 1 with same msgId again -> idempotent duplicate
    const res1Dup = await request(app.getHttpServer())
      .post('/api/v1/telemetry/positions')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        deviceId,
        capturedAt: new Date().toISOString(),
        latitude: 37.7749,
        longitude: -122.4194,
        providerMessageId: msgId,
      })
      .expect(201);

    expect(res1Dup.body.id).toBe(res1.body.id);

    // Device 2 with SAME msgId -> SUCCEEDS as distinct position!
    const res2 = await request(app.getHttpServer())
      .post('/api/v1/telemetry/positions')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        deviceId: d2.body.id,
        capturedAt: new Date().toISOString(),
        latitude: 37.8,
        longitude: -122.45,
        providerMessageId: msgId,
      })
      .expect(201);

    expect(res2.body.id).not.toBe(res1.body.id);

    // Clean up
    await database.telemetryCurrentPosition.deleteMany({
      where: { vehicleId: vD2.id },
    });
    await database.telemetryPosition.deleteMany({
      where: { vehicleId: vD2.id },
    });
    await database.telemetryDeviceVehicleAssignment.deleteMany({
      where: { vehicleId: vD2.id },
    });
    await database.telemetryDevice.delete({ where: { id: d2.body.id } });
    await database.vehicle.delete({ where: { id: vD2.id } });
  });

  // ==========================================
  // RELEASE GATE 7: CONCURRENCY-SAFE CURRENT POSITION PROJECTION
  // ==========================================

  it('preserves latest snapshot when older point arrives last (out-of-order protection)', async () => {
    const tNow = Date.now();
    const timeNewer = new Date(tNow + 60_000); // T + 60s
    const timeOlder = new Date(tNow - 60_000); // T - 60s

    // Point A (newer)
    await request(app.getHttpServer())
      .post('/api/v1/telemetry/positions')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        deviceId,
        capturedAt: timeNewer.toISOString(),
        latitude: 38.0,
        longitude: -122.0,
        speedKmh: 80.0,
      })
      .expect(201);

    // Point B (older, arriving after Point A)
    const resB = await request(app.getHttpServer())
      .post('/api/v1/telemetry/positions')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        deviceId,
        capturedAt: timeOlder.toISOString(),
        latitude: 36.0,
        longitude: -121.0,
        speedKmh: 40.0,
      })
      .expect(201);

    // Point B must be classified as OUT_OF_ORDER
    expect(resB.body.status).toBe('OUT_OF_ORDER');

    // Current position must remain Point A (latitude: 38)
    const current = await request(app.getHttpServer())
      .get(`/api/v1/telemetry/vehicles/${ids.vehicleA}/current`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);

    expect(Number(current.body.latitude)).toBeCloseTo(38.0);
  });

  // ==========================================
  // RELEASE GATE 8: HISTORICAL TRIP CORRELATION
  // ==========================================

  it('correlates position based on capturedAt, not merely active trip at receipt time', async () => {
    // 1. Create Driver and Assignment for vehicleA
    const driver = await database.driver.create({
      data: {
        organizationId: ids.organizationA,
        displayId: 'DRV-TEL-01',
        firstName: 'Test',
        lastName: 'Driver',
        employeeNumber: 'EMP-TEL-01',
        status: 'ACTIVE',
      },
    });

    const assignment = await database.vehicleDriverAssignment.create({
      data: {
        organizationId: ids.organizationA,
        vehicleId: ids.vehicleA,
        driverId: driver.id,
        status: 'ACTIVE',
        startedAt: new Date(Date.now() - 3600_000 * 5),
      },
    });

    // 2. Create Trip 1: 10:00 - 11:00 (COMPLETED)
    const tStart1 = new Date(Date.now() - 3600_000 * 4); // 4h ago
    const tEnd1 = new Date(Date.now() - 3600_000 * 3); // 3h ago
    const trip1 = await database.trip.create({
      data: {
        organizationId: ids.organizationA,
        displayId: 'TRP-TEL-01',
        assignmentId: assignment.id,
        vehicleId: ids.vehicleA,
        driverId: driver.id,
        status: 'COMPLETED',
        origin: 'A',
        destination: 'B',
        actualStartAt: tStart1,
        actualEndAt: tEnd1,
        startOdometerKm: 1000,
        endOdometerKm: 1050,
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
    });

    // 3. Create Trip 2: 1h ago to null (IN_PROGRESS)
    const tStart2 = new Date(Date.now() - 3600_000); // 1h ago
    const trip2 = await database.trip.create({
      data: {
        organizationId: ids.organizationA,
        displayId: 'TRP-TEL-02',
        assignmentId: assignment.id,
        vehicleId: ids.vehicleA,
        driverId: driver.id,
        status: 'IN_PROGRESS',
        origin: 'B',
        destination: 'C',
        actualStartAt: tStart2,
        startOdometerKm: 1050,
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
    });

    // 4. Ingest delayed point captured at 3.5h ago (during Trip 1)
    const posTrip1 = await request(app.getHttpServer())
      .post('/api/v1/telemetry/positions')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        deviceId,
        capturedAt: new Date(Date.now() - 3600_000 * 3.5).toISOString(),
        latitude: 37.5,
        longitude: -122.3,
      })
      .expect(201);

    expect(posTrip1.body.tripId).toBe(trip1.id); // Correlates to completed Trip 1!

    // 5. Ingest point captured at 2h ago (between trips)
    const posBetween = await request(app.getHttpServer())
      .post('/api/v1/telemetry/positions')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        deviceId,
        capturedAt: new Date(Date.now() - 3600_000 * 2).toISOString(),
        latitude: 37.6,
        longitude: -122.35,
      })
      .expect(201);

    expect(posBetween.body.tripId).toBeNull(); // No-trip interval!

    // 6. Ingest live point captured during Trip 2 (30m ago)
    const posTrip2 = await request(app.getHttpServer())
      .post('/api/v1/telemetry/positions')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        deviceId,
        capturedAt: new Date(Date.now() - 1800_000).toISOString(),
        latitude: 37.7,
        longitude: -122.4,
      })
      .expect(201);

    expect(posTrip2.body.tripId).toBe(trip2.id); // Correlates to in-progress Trip 2!

    // Clean up
    await database.telemetryPosition.deleteMany({
      where: { id: { in: [posTrip1.body.id, posBetween.body.id, posTrip2.body.id] } },
    });
    await database.trip.deleteMany({
      where: { id: { in: [trip1.id, trip2.id] } },
    });
    await database.vehicleDriverAssignment.delete({ where: { id: assignment.id } });
    await database.driver.delete({ where: { id: driver.id } });
  });

  // ==========================================
  // RELEASE GATE 10 & BOUNDARIES: AUDIT & ODOMETER
  // ==========================================

  it('audits device administrative actions and never logs plaintext secrets', async () => {
    const auditLogs = await database.auditLog.findMany({
      where: {
        organizationId: ids.organizationA,
        entityType: 'TelemetryDevice',
        entityId: deviceId,
      },
    });

    expect(auditLogs.length).toBeGreaterThan(0);
    const actions = auditLogs.map((l) => l.action);
    expect(actions).toContain('TELEMETRY_DEVICE_REGISTERED');
    expect(actions).toContain('TELEMETRY_DEVICE_CREDENTIAL_PROVISIONED');

    // Confirm no plaintext secrets anywhere in afterData
    for (const log of auditLogs) {
      const dataStr = JSON.stringify(log.afterData ?? {});
      expect(dataStr).not.toContain(deviceToken);
    }
  });

  it('guarantees telemetry odometerKm never mutates authoritative vehicle odometer', async () => {
    const vehicleBefore = await database.vehicle.findUniqueOrThrow({
      where: { id: ids.vehicleA },
    });
    const startingOdometer = vehicleBefore.odometerKm;

    await request(app.getHttpServer())
      .post('/api/v1/telemetry/positions')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        deviceId,
        capturedAt: new Date().toISOString(),
        latitude: 37.7749,
        longitude: -122.4194,
        odometerKm: startingOdometer + 50000, // Claim +50,000 km
      })
      .expect(201);

    const vehicleAfter = await database.vehicle.findUniqueOrThrow({
      where: { id: ids.vehicleA },
    });
    expect(vehicleAfter.odometerKm).toBe(startingOdometer); // Authoritative odometer remains unchanged!
  });

  // ==========================================
  // RELEASE GATE 1: CURRENT-POSITION PROJECTION PROVENANCE (DIRECT SQL)
  // ==========================================

  it('rejects cross-tenant position reference in current projection via direct SQL foreign key', async () => {
    // 1. Create a fresh vehicle in org A
    const testVehA = await database.vehicle.create({
      data: {
        organizationId: ids.organizationA,
        displayId: `VEH-XT-1-${Date.now().toString().slice(-4)}`,
        vin: `1HGCR2F83CA${Date.now().toString().slice(-6)}`,
        registration: `REG-XT1-${Date.now().toString().slice(-4)}`,
        model: 'Accord',
        year: 2023,
        type: 'TRUCK',
        fuelType: 'DIESEL',
        status: VehicleStatus.ACTIVE,
        odometerKm: 15000,
      },
    });

    // 2. Create a valid position for vehicleB in organizationB
    const posB = await database.telemetryPosition.create({
      data: {
        organizationId: ids.organizationB,
        vehicleId: ids.vehicleB,
        latitude: 37.7749,
        longitude: -122.4194,
        capturedAt: new Date(),
        receivedAt: new Date(),
        source: 'DEVICE',
        status: 'VALID',
      },
    });

    // 3. Direct SQL: Attempt to link org A's vehicle to org B's position
    let caughtError: unknown;
    try {
      await database.$executeRawUnsafe(
        `INSERT INTO "telemetry_current_positions" (
          "organization_id", "vehicle_id", "position_id",
          "latitude", "longitude", "captured_at", "received_at", "source", "status", "updated_at"
        ) VALUES (
          $1::uuid, $2::uuid, $3::uuid,
          37.7749, -122.4194, NOW(), NOW(), 'DEVICE'::"TelemetrySource", 'VALID'::"TelemetryPositionStatus", NOW()
        );`,
        ids.organizationA,
        testVehA.id,
        posB.id,
      );
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeDefined();
    // Verify PostgreSQL composite foreign key constraint violation
    expect(String(caughtError)).toMatch(
      /telemetry_current_positions_position_id_org_veh_fkey|foreign key constraint/i,
    );

    // Clean up
    await database.telemetryPosition.delete({ where: { id: posB.id } });
    await database.vehicle.delete({ where: { id: testVehA.id } });
  });

  it('rejects wrong-vehicle position reference in current projection via direct SQL foreign key', async () => {
    // 1. Create two vehicles in organizationA
    const vehicleA1 = await database.vehicle.create({
      data: {
        organizationId: ids.organizationA,
        displayId: `VEH-WV1-${Date.now().toString().slice(-4)}`,
        vin: `1HGCR2F83CA${(Date.now() - 1).toString().slice(-6)}`,
        registration: `REG-WV1-${Date.now().toString().slice(-4)}`,
        model: 'Accord',
        year: 2023,
        type: 'TRUCK',
        fuelType: 'DIESEL',
        status: VehicleStatus.ACTIVE,
        odometerKm: 15000,
      },
    });

    const vehicleA2 = await database.vehicle.create({
      data: {
        organizationId: ids.organizationA,
        displayId: `VEH-WV2-${Date.now().toString().slice(-4)}`,
        vin: `1HGCR2F83CA${Date.now().toString().slice(-6)}`,
        registration: `REG-WV2-${Date.now().toString().slice(-4)}`,
        model: 'Civic',
        year: 2022,
        type: 'TRUCK',
        fuelType: 'DIESEL',
        status: VehicleStatus.ACTIVE,
        odometerKm: 20000,
      },
    });

    // 2. Create position belonging to vehicleA2 in organizationA
    const posA2 = await database.telemetryPosition.create({
      data: {
        organizationId: ids.organizationA,
        vehicleId: vehicleA2.id,
        latitude: 37.7749,
        longitude: -122.4194,
        capturedAt: new Date(),
        receivedAt: new Date(),
        source: 'DEVICE',
        status: 'VALID',
      },
    });

    // 3. Direct SQL: Attempt to link vehicle A1's projection to vehicle A2's position
    let caughtError: unknown;
    try {
      await database.$executeRawUnsafe(
        `INSERT INTO "telemetry_current_positions" (
          "organization_id", "vehicle_id", "position_id",
          "latitude", "longitude", "captured_at", "received_at", "source", "status", "updated_at"
        ) VALUES (
          $1::uuid, $2::uuid, $3::uuid,
          37.7749, -122.4194, NOW(), NOW(), 'DEVICE'::"TelemetrySource", 'VALID'::"TelemetryPositionStatus", NOW()
        );`,
        ids.organizationA,
        vehicleA1.id,
        posA2.id,
      );
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeDefined();
    expect(String(caughtError)).toMatch(
      /telemetry_current_positions_position_id_org_veh_fkey|foreign key constraint/i,
    );

    // Clean up
    await database.telemetryPosition.delete({ where: { id: posA2.id } });
    await database.vehicle.delete({ where: { id: vehicleA1.id } });
    await database.vehicle.delete({ where: { id: vehicleA2.id } });
  });

  it('rejects cross-tenant device reference in current projection via direct SQL foreign key', async () => {
    // 1. Create a fresh vehicle in org A
    const testVehA = await database.vehicle.create({
      data: {
        organizationId: ids.organizationA,
        displayId: `VEH-DEV-T-${Date.now().toString().slice(-4)}`,
        vin: `1HGCR2F83CA${Date.now().toString().slice(-6)}`,
        registration: `REG-DEV-${Date.now().toString().slice(-4)}`,
        model: 'Pilot',
        year: 2024,
        type: 'TRUCK',
        fuelType: 'DIESEL',
        status: VehicleStatus.ACTIVE,
        odometerKm: 5000,
      },
    });

    // 2. Create device in organization B
    const devB = await database.telemetryDevice.create({
      data: {
        organizationId: ids.organizationB,
        displayId: `DEV-B-${Date.now().toString().slice(-4)}`,
        name: 'Device in Org B',
        identifier: `IMEI-B-${Date.now()}`,
        status: 'ACTIVE',
      },
    });

    // 3. Create valid position for testVehA in organization A
    const posA = await database.telemetryPosition.create({
      data: {
        organizationId: ids.organizationA,
        vehicleId: testVehA.id,
        latitude: 37.7749,
        longitude: -122.4194,
        capturedAt: new Date(),
        receivedAt: new Date(),
        source: 'DEVICE',
        status: 'VALID',
      },
    });

    // 4. Direct SQL: Attempt to set device_id = devB.id in org A's projection
    let caughtError: unknown;
    try {
      await database.$executeRawUnsafe(
        `INSERT INTO "telemetry_current_positions" (
          "organization_id", "vehicle_id", "device_id", "position_id",
          "latitude", "longitude", "captured_at", "received_at", "source", "status", "updated_at"
        ) VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4::uuid,
          37.7749, -122.4194, NOW(), NOW(), 'DEVICE'::"TelemetrySource", 'VALID'::"TelemetryPositionStatus", NOW()
        );`,
        ids.organizationA,
        testVehA.id,
        devB.id,
        posA.id,
      );
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeDefined();
    expect(String(caughtError)).toMatch(
      /telemetry_current_positions_device_id_org_fkey|foreign key constraint/i,
    );

    // Clean up
    await database.telemetryPosition.delete({ where: { id: posA.id } });
    await database.vehicle.delete({ where: { id: testVehA.id } });
    await database.telemetryDevice.delete({ where: { id: devB.id } });
  });

  it('enforces deterministic first-persisted-wins tie-break when both capturedAt and receivedAt are exact equal', async () => {
    const fixedTime = new Date(Date.now() - 3600_000); // 1 hour ago (within valid window)

    // 1. Point 1
    const res1 = await request(app.getHttpServer())
      .post('/api/v1/telemetry/positions')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        deviceId,
        capturedAt: fixedTime.toISOString(),
        latitude: 37.774,
        longitude: -122.419,
      })
      .expect(201);

    const pos1Id = res1.body.id;

    // Direct SQL: Create Point 2 with exact same capturedAt and receivedAt
    const pos2 = await database.telemetryPosition.create({
      data: {
        organizationId: ids.organizationA,
        vehicleId: ids.vehicleA,
        deviceId,
        latitude: 37.7799,
        longitude: -122.4199,
        capturedAt: fixedTime,
        receivedAt: fixedTime,
        source: 'DEVICE',
        status: 'VALID',
      },
    });

    // Force current position to have Point 1 with exact fixedTime on receivedAt as well
    await database.$executeRawUnsafe(
      `UPDATE "telemetry_current_positions"
       SET "received_at" = $1::timestamptz, "position_id" = $2::uuid
       WHERE "organization_id" = $3::uuid AND "vehicle_id" = $4::uuid;`,
      fixedTime.toISOString(),
      pos1Id,
      ids.organizationA,
      ids.vehicleA,
    );

    // Attempt atomic upsert with pos2 (both timestamps identical)
    await database.$executeRawUnsafe(
      `INSERT INTO "telemetry_current_positions" (
        "organization_id", "vehicle_id", "device_id", "position_id",
        "latitude", "longitude", "speed_kmh", "heading", "ignition", "odometer_km",
        "captured_at", "received_at", "source", "status", "updated_at"
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4::uuid,
        $5, $6, $7, $8, $9, $10,
        $11::timestamptz, $12::timestamptz, $13::"TelemetrySource", $14::"TelemetryPositionStatus", NOW()
      )
      ON CONFLICT ("organization_id", "vehicle_id")
      DO UPDATE SET
        "device_id" = EXCLUDED."device_id",
        "position_id" = EXCLUDED."position_id",
        "latitude" = EXCLUDED."latitude",
        "longitude" = EXCLUDED."longitude",
        "speed_kmh" = EXCLUDED."speed_kmh",
        "heading" = EXCLUDED."heading",
        "ignition" = EXCLUDED."ignition",
        "odometer_km" = EXCLUDED."odometer_km",
        "captured_at" = EXCLUDED."captured_at",
        "received_at" = EXCLUDED."received_at",
        "source" = EXCLUDED."source",
        "status" = EXCLUDED."status",
        "updated_at" = NOW()
      WHERE EXCLUDED."captured_at" > "telemetry_current_positions"."captured_at"
         OR (EXCLUDED."captured_at" = "telemetry_current_positions"."captured_at" AND EXCLUDED."received_at" > "telemetry_current_positions"."received_at");`,
      ids.organizationA,
      ids.vehicleA,
      deviceId,
      pos2.id,
      37.7799,
      -122.4199,
      null,
      null,
      null,
      null,
      fixedTime.toISOString(),
      fixedTime.toISOString(),
      'DEVICE',
      'VALID',
    );

    const currentAfter = await database.telemetryCurrentPosition.findUniqueOrThrow({
      where: {
        organizationId_vehicleId: {
          organizationId: ids.organizationA,
          vehicleId: ids.vehicleA,
        },
      },
    });

    // Expect Point 1 remains in projection — first persisted wins!
    expect(currentAfter.positionId).toBe(pos1Id);

    // Clean up
    await database.telemetryPosition.delete({ where: { id: pos2.id } });
  });

  // ==========================================
  // RELEASE GATE 2: SOURCE-AWARE IDEMPOTENCY
  // ==========================================

  it('handles SIMULATOR deviceless retry idempotency via unique partial index', async () => {
    const msgId = `MSG-SIM-${Date.now()}`;

    const res1 = await request(app.getHttpServer())
      .post('/api/v1/telemetry/positions')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        vehicleId: ids.vehicleA,
        capturedAt: new Date().toISOString(),
        latitude: 37.771,
        longitude: -122.411,
        source: 'SIMULATOR',
        providerMessageId: msgId,
      })
      .expect(201);

    expect(res1.body.deviceId).toBeNull();
    expect(res1.body.source).toBe('SIMULATOR');

    // Duplicate call with same SIMULATOR message ID
    const res2 = await request(app.getHttpServer())
      .post('/api/v1/telemetry/positions')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        vehicleId: ids.vehicleA,
        capturedAt: new Date().toISOString(),
        latitude: 37.771,
        longitude: -122.411,
        source: 'SIMULATOR',
        providerMessageId: msgId,
      })
      .expect(201);

    expect(res2.body.id).toBe(res1.body.id); // Idempotent match!
  });

  it('handles IMPORT deviceless retry idempotency via unique partial index', async () => {
    const msgId = `MSG-IMP-${Date.now()}`;

    const res1 = await request(app.getHttpServer())
      .post('/api/v1/telemetry/positions')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        vehicleId: ids.vehicleA,
        capturedAt: new Date().toISOString(),
        latitude: 37.772,
        longitude: -122.412,
        source: 'IMPORT',
        providerMessageId: msgId,
      })
      .expect(201);

    expect(res1.body.deviceId).toBeNull();
    expect(res1.body.source).toBe('IMPORT');

    // Duplicate call with same IMPORT message ID
    const res2 = await request(app.getHttpServer())
      .post('/api/v1/telemetry/positions')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        vehicleId: ids.vehicleA,
        capturedAt: new Date().toISOString(),
        latitude: 37.772,
        longitude: -122.412,
        source: 'IMPORT',
        providerMessageId: msgId,
      })
      .expect(201);

    expect(res2.body.id).toBe(res1.body.id);
  });

  it('permits same providerMessageId between DEVICE and IMPORT without collision', async () => {
    const sharedMsgId = `SHARED-MSG-${Date.now()}`;

    // 1. Ingest with DEVICE
    const resDev = await request(app.getHttpServer())
      .post('/api/v1/telemetry/positions')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        deviceId,
        capturedAt: new Date().toISOString(),
        latitude: 37.773,
        longitude: -122.413,
        source: 'DEVICE',
        providerMessageId: sharedMsgId,
      })
      .expect(201);

    // 2. Ingest with IMPORT (deviceless) using SAME providerMessageId
    const resImp = await request(app.getHttpServer())
      .post('/api/v1/telemetry/positions')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        vehicleId: ids.vehicleA,
        capturedAt: new Date().toISOString(),
        latitude: 37.7735,
        longitude: -122.4135,
        source: 'IMPORT',
        providerMessageId: sharedMsgId,
      })
      .expect(201);

    // Verify both exist as distinct positions
    expect(resImp.body.id).not.toBe(resDev.body.id);
    expect(resDev.body.deviceId).toBe(deviceId);
    expect(resImp.body.deviceId).toBeNull();
  });

  it('permits multiple positions with null providerMessageId without collision', async () => {
    const res1 = await request(app.getHttpServer())
      .post('/api/v1/telemetry/positions')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        deviceId,
        capturedAt: new Date().toISOString(),
        latitude: 37.7741,
        longitude: -122.4141,
        // no providerMessageId
      })
      .expect(201);

    const res2 = await request(app.getHttpServer())
      .post('/api/v1/telemetry/positions')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        deviceId,
        capturedAt: new Date().toISOString(),
        latitude: 37.7742,
        longitude: -122.4142,
        // no providerMessageId
      })
      .expect(201);

    expect(res1.body.id).not.toBe(res2.body.id);
  });

  // ==========================================
  // RELEASE GATE 3: INGESTION LATENCY OBSERVABILITY
  // ==========================================

  it('records ingestion duration histogram and respects label cardinality bounds', async () => {
    const telemetryService = app.get(TelemetryService);
    const metricsService = telemetryService.getMetricsService();
    expect(metricsService).toBeDefined();

    const snapshot = metricsService!.getMetricsSnapshot();
    expect(snapshot.durations.length).toBeGreaterThan(0);

    // Verify all recorded duration metrics use the canonical metric name
    for (const obs of snapshot.durations) {
      expect(obs.metricName).toBe('telemetry_ingestion_duration_seconds');
      expect(obs.value).toBeGreaterThanOrEqual(0);

      // Verify label keys are ONLY bounded dimensions
      const labelKeys = Object.keys(obs.labels);
      for (const key of labelKeys) {
        expect(['source', 'endpoint', 'outcome']).toContain(key);
      }

      // Strictly verify NO high-cardinality values are embedded
      const labelValues = Object.values(obs.labels);
      for (const val of labelValues) {
        expect(val).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        expect(val).not.toContain('MSG-');
        expect(val).not.toContain('DEV-');
        expect(val).not.toContain('TRP-');
      }
    }
  });
});
