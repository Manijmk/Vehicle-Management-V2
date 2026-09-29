import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { loadApiConfig } from '@vms/config';
import { createDatabaseClient, MembershipStatus, PrincipalStatus } from '@vms/database';
import type { PrismaClient } from '@vms/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { configureApiApplication } from '../src/bootstrap.js';
import { permissionCodes } from '../src/modules/foundation/domain/permissions.js';
import { LocalJwtAuthenticationAdapter } from '../src/modules/identity/infrastructure/local-jwt-authentication.adapter.js';

const ids = {
  organizationA: '11000000-0000-4000-8000-000000000001',
  organizationB: '11000000-0000-4000-8000-000000000002',
  adminA: '21000000-0000-4000-8000-000000000001',
  viewerA: '21000000-0000-4000-8000-000000000002',
  adminB: '21000000-0000-4000-8000-000000000003',
  membershipAdminA: '31000000-0000-4000-8000-000000000001',
  membershipViewerA: '31000000-0000-4000-8000-000000000002',
  membershipAdminB: '31000000-0000-4000-8000-000000000003',
  roleAdminA: '41000000-0000-4000-8000-000000000001',
  roleViewerA: '41000000-0000-4000-8000-000000000002',
  roleAdminB: '41000000-0000-4000-8000-000000000003',
} as const;

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://vehicle_management:local_vehicle_management@localhost:55432/vehicle_management?schema=public';

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
      { id: ids.organizationA, name: 'Org A', slug: 'org-a', status: PrincipalStatus.ACTIVE },
      { id: ids.organizationB, name: 'Org B', slug: 'org-b', status: PrincipalStatus.ACTIVE },
    ],
  });

  await database.user.createMany({
    data: [
      {
        id: ids.adminA,
        email: 'admin-a@test.local',
        displayName: 'Admin A',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.viewerA,
        email: 'viewer-a@test.local',
        displayName: 'Viewer A',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.adminB,
        email: 'admin-b@test.local',
        displayName: 'Admin B',
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
    await database.permission.create({
      data: {
        id: `52000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
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

  // Admin A has all permissions
  await database.rolePermission.createMany({
    data: allPermissions.map((p) => ({ roleId: ids.roleAdminA, permissionId: p.id })),
  });

  // Viewer A has only read permissions
  const viewerCodes = ['organization.read', 'vehicle.read', 'vehicle.history.read'];
  await database.rolePermission.createMany({
    data: allPermissions
      .filter((p) => viewerCodes.includes(p.code))
      .map((p) => ({ roleId: ids.roleViewerA, permissionId: p.id })),
  });

  // Admin B has all permissions in Org B
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
}

describe('Vehicle Vertical Slice API and Persistence', () => {
  let application: INestApplication;
  let database: PrismaClient;
  let adminTokenA: string;
  let viewerTokenA: string;
  let adminTokenB: string;

  beforeAll(async () => {
    database = createDatabaseClient({ databaseUrl });
    await database.$executeRawUnsafe(
      'TRUNCATE TABLE vehicle_status_history, vehicles, outbox_events, audit_logs, membership_roles, role_permissions, permissions, roles, organization_memberships, users, organizations RESTART IDENTITY CASCADE',
    );
    await seedFixture(database);

    const authentication = new LocalJwtAuthenticationAdapter(loadApiConfig());
    [adminTokenA, viewerTokenA, adminTokenB] = await Promise.all([
      authentication.issueDevelopmentToken(ids.adminA),
      authentication.issueDevelopmentToken(ids.viewerA),
      authentication.issueDevelopmentToken(ids.adminB),
    ]);

    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    application = module.createNestApplication();
    configureApiApplication(application, { API_CORS_ORIGINS: ['http://localhost:3000'] });
    await application.init();
  }, 60_000);

  afterAll(async () => {
    await application.close();
    await database.$disconnect();
  });

  it('rejects unauthenticated requests to vehicles endpoint', async () => {
    const res = await request(application.getHttpServer()).get('/api/v1/vehicles').expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects requests without organization header', async () => {
    const res = await request(application.getHttpServer())
      .get('/api/v1/vehicles')
      .set('authorization', `Bearer ${adminTokenA}`)
      .expect(403);
    expect(res.body.error.code).toBe('INVALID_TENANT_CONTEXT');
  });

  it('creates a vehicle in DRAFT status, persists history, audit, and outbox', async () => {
    const payload = {
      displayId: 'V-101',
      registration: 'AB-123CD',
      vin: '1HGBH41JXMN109186',
      type: 'VAN',
      fuelType: 'DIESEL',
      model: 'Ford Transit',
      year: 2023,
      odometerKm: 15420,
      notes: 'Initial fleet addition',
    };

    const res = await request(application.getHttpServer())
      .post('/api/v1/vehicles')
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send(payload)
      .expect(201);

    expect(res.body).toMatchObject({
      id: expect.any(String),
      organizationId: ids.organizationA,
      displayId: 'V-101',
      registration: 'AB-123CD',
      vin: '1HGBH41JXMN109186',
      type: 'VAN',
      fuelType: 'DIESEL',
      model: 'Ford Transit',
      year: 2023,
      odometerKm: 15420,
      status: 'DRAFT',
      notes: 'Initial fleet addition',
      version: 1,
    });

    const vehicleId = res.body.id;

    // Verify status history
    const historyRes = await request(application.getHttpServer())
      .get(`/api/v1/vehicles/${vehicleId}/status-history`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);

    expect(historyRes.body).toHaveLength(1);
    expect(historyRes.body[0]).toMatchObject({
      vehicleId,
      organizationId: ids.organizationA,
      previousStatus: 'DRAFT',
      newStatus: 'DRAFT',
      reason: 'Vehicle created',
      changedBy: ids.adminA,
    });

    // Verify audit log
    const auditLogs = await database.auditLog.findMany({
      where: { organizationId: ids.organizationA, entityId: vehicleId },
    });
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]).toMatchObject({
      action: 'vehicle.created',
      entityType: 'Vehicle',
      actorId: ids.adminA,
    });
    expect(auditLogs[0]!.beforeData).toBeNull();
    expect(auditLogs[0]!.afterData).toMatchObject({ id: vehicleId, status: 'DRAFT' });

    // Verify outbox event
    const outboxEvents = await database.outboxEvent.findMany({
      where: { organizationId: ids.organizationA, aggregateId: vehicleId },
    });
    expect(outboxEvents).toHaveLength(1);
    expect(outboxEvents[0]).toMatchObject({
      eventType: 'VehicleCreated',
      aggregateType: 'Vehicle',
      status: 'PENDING',
    });
  });

  it('enforces uniqueness rules for display ID, registration, and VIN', async () => {
    // Duplicate display ID in same org
    const duplicateDisplay = await request(application.getHttpServer())
      .post('/api/v1/vehicles')
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        displayId: 'V-101',
        registration: 'XY-999ZZ',
        vin: '2T2BK1BA5KC178901',
        type: 'CAR',
        fuelType: 'PETROL',
        model: 'Corolla',
        year: 2022,
        odometerKm: 5000,
      })
      .expect(409);
    expect(duplicateDisplay.body.error.code).toBe('VEHICLE_ALREADY_EXISTS');

    // Duplicate registration in same org
    const duplicateReg = await request(application.getHttpServer())
      .post('/api/v1/vehicles')
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        displayId: 'V-102-DIFF',
        registration: 'AB-123CD',
        vin: '2T2BK1BA5KC178901',
        type: 'CAR',
        fuelType: 'PETROL',
        model: 'Corolla',
        year: 2022,
        odometerKm: 5000,
      })
      .expect(409);
    expect(duplicateReg.body.error.code).toBe('VEHICLE_ALREADY_EXISTS');

    // Duplicate VIN globally (even across orgs)
    const duplicateVin = await request(application.getHttpServer())
      .post('/api/v1/vehicles')
      .set('authorization', `Bearer ${adminTokenB}`)
      .set('x-organization-id', ids.organizationB)
      .send({
        displayId: 'V-B-01',
        registration: 'BB-123BB',
        vin: '1HGBH41JXMN109186',
        type: 'CAR',
        fuelType: 'PETROL',
        model: 'Sedan',
        year: 2022,
        odometerKm: 1000,
      })
      .expect(409);
    expect(duplicateVin.body.error.code).toBe('VEHICLE_ALREADY_EXISTS');
  });

  it('rejects invalid VIN and registration formats', async () => {
    // Invalid VIN (less than 17 chars)
    const badVin = await request(application.getHttpServer())
      .post('/api/v1/vehicles')
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        displayId: 'V-999',
        registration: 'XY-999ZZ',
        vin: 'SHORTVIN',
        type: 'CAR',
        fuelType: 'PETROL',
        model: 'Corolla',
        year: 2022,
        odometerKm: 5000,
      })
      .expect(400);
    expect(badVin.body.error.code).toBe('Bad Request');

    // Invalid registration format
    const badReg = await request(application.getHttpServer())
      .post('/api/v1/vehicles')
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        displayId: 'V-999',
        registration: '!',
        vin: '2T2BK1BA5KC178901',
        type: 'CAR',
        fuelType: 'PETROL',
        model: 'Corolla',
        year: 2022,
        odometerKm: 5000,
      })
      .expect(400);
    expect(badReg.body.error.code).toBe('Bad Request');
  });

  it('updates vehicle metadata and increments version with optimistic concurrency', async () => {
    // Create vehicle
    const created = await request(application.getHttpServer())
      .post('/api/v1/vehicles')
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        displayId: 'V-102',
        registration: 'XY-200ZZ',
        vin: '2T2BK1BA5KC178902',
        type: 'CAR',
        fuelType: 'PETROL',
        model: 'Model 3',
        year: 2021,
        odometerKm: 10000,
      })
      .expect(201);

    const vehicleId = created.body.id;

    // Stale update attempt (version mismatch)
    const staleUpdate = await request(application.getHttpServer())
      .patch(`/api/v1/vehicles/${vehicleId}`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        odometerKm: 12000,
        version: 999,
      })
      .expect(409);
    expect(staleUpdate.body.error.code).toBe('CONCURRENCY_CONFLICT');

    // Valid update with version 1
    const validUpdate = await request(application.getHttpServer())
      .patch(`/api/v1/vehicles/${vehicleId}`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        model: 'Model 3 Long Range',
        odometerKm: 12000,
        notes: 'Updated notes',
        version: 1,
      })
      .expect(200);

    expect(validUpdate.body.version).toBe(2);
    expect(validUpdate.body.model).toBe('Model 3 Long Range');
    expect(validUpdate.body.odometerKm).toBe(12000);
    expect(validUpdate.body.notes).toBe('Updated notes');

    // Verify audit log for update
    const updateAudit = await database.auditLog.findFirst({
      where: { organizationId: ids.organizationA, entityId: vehicleId, action: 'vehicle.updated' },
    });
    expect(updateAudit).not.toBeNull();
    expect(updateAudit?.beforeData).toMatchObject({ version: 1, odometerKm: 10000 });
    expect(updateAudit?.afterData).toMatchObject({ version: 2, odometerKm: 12000 });
  });

  it('activates a vehicle and verifies transition rules', async () => {
    // Create vehicle
    const created = await request(application.getHttpServer())
      .post('/api/v1/vehicles')
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        displayId: 'V-103',
        registration: 'XY-300ZZ',
        vin: '3T2BK1BA5KC178903',
        type: 'BUS',
        fuelType: 'ELECTRIC',
        model: 'City Bus',
        year: 2024,
        odometerKm: 500,
      })
      .expect(201);

    const vehicleId = created.body.id;

    // Stale activation attempt
    const staleActivate = await request(application.getHttpServer())
      .post(`/api/v1/vehicles/${vehicleId}/activate`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ version: 999 })
      .expect(409);
    expect(staleActivate.body.error.code).toBe('CONCURRENCY_CONFLICT');

    // Valid activation with version 1
    await request(application.getHttpServer())
      .post(`/api/v1/vehicles/${vehicleId}/activate`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ version: 1 })
      .expect(204);

    // Verify detail reflects ACTIVE and incremented version
    const detail = await request(application.getHttpServer())
      .get(`/api/v1/vehicles/${vehicleId}`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);

    expect(detail.body.status).toBe('ACTIVE');
    expect(detail.body.version).toBe(2);

    // Activating already ACTIVE vehicle is idempotent or valid
    await request(application.getHttpServer())
      .post(`/api/v1/vehicles/${vehicleId}/activate`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ version: 2 })
      .expect(204);
  });

  it('retires a vehicle with reason and enforces terminal state', async () => {
    // Create vehicle
    const created = await request(application.getHttpServer())
      .post('/api/v1/vehicles')
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        displayId: 'V-104',
        registration: 'XY-400ZZ',
        vin: '4T2BK1BA5KC178904',
        type: 'TRUCK',
        fuelType: 'DIESEL',
        model: 'Heavy Hauler',
        year: 2019,
        odometerKm: 250000,
      })
      .expect(201);

    const vehicleId = created.body.id;

    // Activate first: DRAFT -> ACTIVE
    await request(application.getHttpServer())
      .post(`/api/v1/vehicles/${vehicleId}/activate`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(204);

    // Stale retirement attempt
    const staleRetire = await request(application.getHttpServer())
      .post(`/api/v1/vehicles/${vehicleId}/retire`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ reason: 'Decommissioned', version: 1 })
      .expect(409);
    expect(staleRetire.body.error.code).toBe('CONCURRENCY_CONFLICT');

    // Valid retirement with version 2
    await request(application.getHttpServer())
      .post(`/api/v1/vehicles/${vehicleId}/retire`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ reason: 'End of operational service life', version: 2 })
      .expect(204);

    // Verify status is RETIRED and version is 3
    const detail = await request(application.getHttpServer())
      .get(`/api/v1/vehicles/${vehicleId}`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);

    expect(detail.body.status).toBe('RETIRED');
    expect(detail.body.version).toBe(3);

    // Verify history contains all 3 transitions
    const history = await request(application.getHttpServer())
      .get(`/api/v1/vehicles/${vehicleId}/status-history`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);

    expect(history.body).toHaveLength(3);
    expect(history.body[0].newStatus).toBe('RETIRED');
    expect(history.body[0].reason).toBe('End of operational service life');
    expect(history.body[1].newStatus).toBe('ACTIVE');
    expect(history.body[2].newStatus).toBe('DRAFT');

    // TERMINAL STATE: Cannot reactivate a retired vehicle
    const forbiddenTransition = await request(application.getHttpServer())
      .post(`/api/v1/vehicles/${vehicleId}/activate`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ version: 3 })
      .expect(409);

    expect(forbiddenTransition.body.error.code).toBe('INVALID_VEHICLE_TRANSITION');
  });

  it('allows direct transition from DRAFT to RETIRED', async () => {
    const created = await request(application.getHttpServer())
      .post('/api/v1/vehicles')
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        displayId: 'V-105',
        registration: 'XY-500ZZ',
        vin: '5T2BK1BA5KC178905',
        type: 'CAR',
        fuelType: 'GAS',
        model: 'Prototype Sedan',
        year: 2020,
        odometerKm: 1200,
      })
      .expect(201);

    const vehicleId = created.body.id;

    await request(application.getHttpServer())
      .post(`/api/v1/vehicles/${vehicleId}/retire`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ reason: 'Prototype cancelled', version: 1 })
      .expect(204);

    const detail = await request(application.getHttpServer())
      .get(`/api/v1/vehicles/${vehicleId}`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);

    expect(detail.body.status).toBe('RETIRED');
  });

  it('strictly enforces multi-tenant isolation across all vehicle operations', async () => {
    // Create vehicle in Org B
    const bVehicle = await request(application.getHttpServer())
      .post('/api/v1/vehicles')
      .set('authorization', `Bearer ${adminTokenB}`)
      .set('x-organization-id', ids.organizationB)
      .send({
        displayId: 'V-B-100',
        registration: 'BB-888BB',
        vin: '6T2BK1BA5KC178906',
        type: 'VAN',
        fuelType: 'DIESEL',
        model: 'Transit B',
        year: 2022,
        odometerKm: 40000,
      })
      .expect(201);

    const bVehicleId = bVehicle.body.id;

    // Org A cannot list Org B's vehicle
    const aList = await request(application.getHttpServer())
      .get('/api/v1/vehicles')
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);

    const aVehicleIds = aList.body.map((v: { id: string }) => v.id);
    expect(aVehicleIds).not.toContain(bVehicleId);

    // Org A cannot read Org B's vehicle by ID
    const aGet = await request(application.getHttpServer())
      .get(`/api/v1/vehicles/${bVehicleId}`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(404);
    expect(aGet.body.error.code).toBe('VEHICLE_NOT_FOUND');

    // Org A cannot update Org B's vehicle
    const aUpdate = await request(application.getHttpServer())
      .patch(`/api/v1/vehicles/${bVehicleId}`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ model: 'Hacked Model', version: 1 })
      .expect(404);
    expect(aUpdate.body.error.code).toBe('VEHICLE_NOT_FOUND');

    // Org A cannot activate Org B's vehicle
    const aActivate = await request(application.getHttpServer())
      .post(`/api/v1/vehicles/${bVehicleId}/activate`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ version: 1 })
      .expect(404);
    expect(aActivate.body.error.code).toBe('VEHICLE_NOT_FOUND');

    // Org A cannot retire Org B's vehicle
    const aRetire = await request(application.getHttpServer())
      .post(`/api/v1/vehicles/${bVehicleId}/retire`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ reason: 'Malicious retire', version: 1 })
      .expect(404);
    expect(aRetire.body.error.code).toBe('VEHICLE_NOT_FOUND');

    // Org A cannot read Org B's status history
    const aHistory = await request(application.getHttpServer())
      .get(`/api/v1/vehicles/${bVehicleId}/status-history`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(404);
    expect(aHistory.body.error.code).toBe('VEHICLE_NOT_FOUND');
  });

  it('enforces RBAC permissions for viewer role', async () => {
    // Get existing vehicle in Org A
    const listRes = await request(application.getHttpServer())
      .get('/api/v1/vehicles')
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);

    expect(listRes.body.length).toBeGreaterThan(0);
    const testVehicle = listRes.body[0];

    // Viewer CAN list vehicles (has vehicle.read)
    await request(application.getHttpServer())
      .get('/api/v1/vehicles')
      .set('authorization', `Bearer ${viewerTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);

    // Viewer CAN read vehicle details (has vehicle.read)
    await request(application.getHttpServer())
      .get(`/api/v1/vehicles/${testVehicle.id}`)
      .set('authorization', `Bearer ${viewerTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);

    // Viewer CAN read vehicle history (has vehicle.history.read)
    await request(application.getHttpServer())
      .get(`/api/v1/vehicles/${testVehicle.id}/status-history`)
      .set('authorization', `Bearer ${viewerTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);

    // Viewer CANNOT create vehicles (lacks vehicle.create)
    const createForbidden = await request(application.getHttpServer())
      .post('/api/v1/vehicles')
      .set('authorization', `Bearer ${viewerTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        displayId: 'V-VIEW-FAIL',
        registration: 'XY-600ZZ',
        vin: '7T2BK1BA5KC178907',
        type: 'CAR',
        fuelType: 'PETROL',
        model: 'Viewer Attempt',
        year: 2023,
        odometerKm: 0,
      })
      .expect(403);
    expect(createForbidden.body.error.code).toBe('PERMISSION_DENIED');

    // Viewer CANNOT update vehicles (lacks vehicle.update)
    const updateForbidden = await request(application.getHttpServer())
      .patch(`/api/v1/vehicles/${testVehicle.id}`)
      .set('authorization', `Bearer ${viewerTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ model: 'Viewer Updated', version: testVehicle.version })
      .expect(403);
    expect(updateForbidden.body.error.code).toBe('PERMISSION_DENIED');

    // Viewer CANNOT activate vehicles (lacks vehicle.activate)
    const activateForbidden = await request(application.getHttpServer())
      .post(`/api/v1/vehicles/${testVehicle.id}/activate`)
      .set('authorization', `Bearer ${viewerTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ version: testVehicle.version })
      .expect(403);
    expect(activateForbidden.body.error.code).toBe('PERMISSION_DENIED');

    // Viewer CANNOT retire vehicles (lacks vehicle.retire)
    const retireForbidden = await request(application.getHttpServer())
      .post(`/api/v1/vehicles/${testVehicle.id}/retire`)
      .set('authorization', `Bearer ${viewerTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ reason: 'Viewer attempt', version: testVehicle.version })
      .expect(403);
    expect(retireForbidden.body.error.code).toBe('PERMISSION_DENIED');
  });
});
