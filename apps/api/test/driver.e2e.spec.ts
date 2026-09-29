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
        id: `53000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
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

  // Viewer A has read permissions
  const viewerCodes = ['organization.read', 'driver.read', 'driver.history.read'];
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

describe('Driver Vertical Slice API and Persistence', () => {
  let application: INestApplication;
  let database: PrismaClient;
  let adminTokenA: string;
  let viewerTokenA: string;
  let adminTokenB: string;

  beforeAll(async () => {
    database = createDatabaseClient({ databaseUrl });
    await database.$executeRawUnsafe(
      'TRUNCATE TABLE driver_status_history, driver_licenses, drivers, vehicle_status_history, vehicles, outbox_events, audit_logs, membership_roles, role_permissions, permissions, roles, organization_memberships, users, organizations RESTART IDENTITY CASCADE',
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
    await application?.close();
    await database?.$disconnect();
  });

  it('rejects unauthenticated requests to drivers endpoint', async () => {
    const res = await request(application.getHttpServer()).get('/api/v1/drivers').expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects requests without organization header', async () => {
    const res = await request(application.getHttpServer())
      .get('/api/v1/drivers')
      .set('authorization', `Bearer ${adminTokenA}`)
      .expect(403);
    expect(res.body.error.code).toBe('INVALID_TENANT_CONTEXT');
  });

  it('viewer cannot create driver', async () => {
    const res = await request(application.getHttpServer())
      .post('/api/v1/drivers')
      .set('authorization', `Bearer ${viewerTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        firstName: 'Jane',
        lastName: 'Doe',
      })
      .expect(403);
    expect(res.body.error.code).toBe('PERMISSION_DENIED');
  });

  it('creates a driver in DRAFT status with auto-allocated displayId (DRV-1001)', async () => {
    const res = await request(application.getHttpServer())
      .post('/api/v1/drivers')
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice.smith@example.test',
        phone: '+1-555-0101',
        employeeNumber: 'EMP-1001',
      })
      .expect(201);

    expect(res.body.displayId).toBe('DRV-1001');
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.firstName).toBe('Alice');
    expect(res.body.lastName).toBe('Smith');
    expect(res.body.email).toBe('alice.smith@example.test');
    expect(res.body.version).toBe(1);
    expect(res.body.eligible).toBe(false);
    expect(res.body.eligibilityReasons).toContain('DRIVER_NOT_ACTIVE');

    const driverId = res.body.id;

    // Verify status history
    const history = await database.driverStatusHistory.findMany({
      where: { driverId },
    });
    expect(history).toHaveLength(1);
    expect(history[0]?.fromStatus).toBeNull();
    expect(history[0]?.toStatus).toBe('DRAFT');

    // Verify audit log
    const audit = await database.auditLog.findFirst({
      where: { entityId: driverId, action: 'driver.created' },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(ids.adminA);

    // Verify outbox event
    const outbox = await database.outboxEvent.findFirst({
      where: { aggregateId: driverId, eventType: 'DriverCreated' },
    });
    expect(outbox).not.toBeNull();
  });

  it('auto-allocates next DRV-XXXX displayId sequentially', async () => {
    const res = await request(application.getHttpServer())
      .post('/api/v1/drivers')
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        firstName: 'Bob',
        lastName: 'Jones',
        employeeNumber: 'EMP-1002',
      })
      .expect(201);

    expect(res.body.displayId).toBe('DRV-1002');
  });

  it('rejects duplicate employee number within the same organization', async () => {
    const res = await request(application.getHttpServer())
      .post('/api/v1/drivers')
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        firstName: 'Charlie',
        lastName: 'Brown',
        employeeNumber: 'EMP-1001', // Already used by Alice
      })
      .expect(409);

    expect(res.body.error.code).toBe('DRIVER_EMPLOYEE_NUMBER_EXISTS');
  });

  it('manages driver licenses: addition, validation, conflict, and listing', async () => {
    // Create driver
    const driverRes = await request(application.getHttpServer())
      .post('/api/v1/drivers')
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        firstName: 'Diana',
        lastName: 'Prince',
        employeeNumber: 'EMP-1003',
      })
      .expect(201);

    const driverId = driverRes.body.id;

    // Reject inverted date range
    const badRangeRes = await request(application.getHttpServer())
      .post(`/api/v1/drivers/${driverId}/licenses`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        licenseNumber: 'DL-999-001',
        issuingCountry: 'US',
        licenseClasses: ['B'],
        issueDate: '2026-10-01T00:00:00.000Z',
        expiryDate: '2025-10-01T00:00:00.000Z',
      })
      .expect(400);

    expect(badRangeRes.body.error.code).toBe('INVALID_LICENSE_DATE_RANGE');

    // Add valid license
    const licRes = await request(application.getHttpServer())
      .post(`/api/v1/drivers/${driverId}/licenses`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        licenseNumber: 'DL-999-001',
        issuingCountry: 'US',
        issuingRegion: 'CA',
        licenseClasses: ['B', 'C1'],
        issueDate: '2024-01-01T00:00:00.000Z',
        expiryDate: '2029-01-01T00:00:00.000Z',
      })
      .expect(201);

    expect(licRes.body.licenseNumber).toBe('DL-999-001');
    expect(licRes.body.issuingCountry).toBe('US');
    expect(licRes.body.licenseClasses).toEqual(['B', 'C1']);
    expect(licRes.body.version).toBe(1);

    const licenseId = licRes.body.id;

    // Verify outbox event for DriverLicenseAdded
    const licOutbox = await database.outboxEvent.findFirst({
      where: { aggregateId: licenseId, eventType: 'DriverLicenseAdded' },
    });
    expect(licOutbox).not.toBeNull();

    // Reject duplicate license in same org
    const dupRes = await request(application.getHttpServer())
      .post(`/api/v1/drivers/${driverId}/licenses`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        licenseNumber: 'DL-999-001',
        issuingCountry: 'US',
        licenseClasses: ['B'],
        issueDate: '2024-01-01T00:00:00.000Z',
        expiryDate: '2029-01-01T00:00:00.000Z',
      })
      .expect(409);

    expect(dupRes.body.error.code).toBe('DRIVER_LICENSE_EXISTS');

    // Update license with optimistic concurrency
    const staleUpdate = await request(application.getHttpServer())
      .patch(`/api/v1/drivers/${driverId}/licenses/${licenseId}`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        licenseClasses: ['B', 'C1', 'CE'],
        version: 999,
      })
      .expect(409);
    expect(staleUpdate.body.error.code).toBe('CONCURRENCY_CONFLICT');

    const validUpdate = await request(application.getHttpServer())
      .patch(`/api/v1/drivers/${driverId}/licenses/${licenseId}`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        licenseClasses: ['B', 'C1', 'CE'],
        version: 1,
      })
      .expect(200);

    expect(validUpdate.body.version).toBe(2);
    expect(validUpdate.body.licenseClasses).toEqual(['B', 'C1', 'CE']);
  });

  it('enforces license requirement on activation and evaluates eligibility', async () => {
    // Driver with NO licenses cannot be activated
    const driverWithoutLic = await request(application.getHttpServer())
      .post('/api/v1/drivers')
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        firstName: 'Evan',
        lastName: 'Wright',
        employeeNumber: 'EMP-1004',
      })
      .expect(201);

    const driverId = driverWithoutLic.body.id;

    const noLicAct = await request(application.getHttpServer())
      .post(`/api/v1/drivers/${driverId}/activate`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ version: 1 })
      .expect(409);

    expect(noLicAct.body.error.code).toBe('NO_VALID_DRIVER_LICENSE');

    // Add expired license
    await request(application.getHttpServer())
      .post(`/api/v1/drivers/${driverId}/licenses`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        licenseNumber: 'DL-EXP-001',
        issuingCountry: 'US',
        licenseClasses: ['B'],
        issueDate: '2020-01-01T00:00:00.000Z',
        expiryDate: '2022-01-01T00:00:00.000Z',
      })
      .expect(201);

    // Still cannot activate with only expired licenses
    const expLicAct = await request(application.getHttpServer())
      .post(`/api/v1/drivers/${driverId}/activate`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ version: 1 })
      .expect(409);

    expect(expLicAct.body.error.code).toBe('NO_VALID_DRIVER_LICENSE');

    // Add valid license
    await request(application.getHttpServer())
      .post(`/api/v1/drivers/${driverId}/licenses`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        licenseNumber: 'DL-VAL-001',
        issuingCountry: 'US',
        licenseClasses: ['B'],
        issueDate: '2024-01-01T00:00:00.000Z',
        expiryDate: '2030-01-01T00:00:00.000Z',
      })
      .expect(201);

    // Now activation succeeds
    await request(application.getHttpServer())
      .post(`/api/v1/drivers/${driverId}/activate`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ version: 1 })
      .expect(204);

    // Check driver state and derived eligibility
    const getRes = await request(application.getHttpServer())
      .get(`/api/v1/drivers/${driverId}`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);

    expect(getRes.body.status).toBe('ACTIVE');
    expect(getRes.body.version).toBe(2);
    expect(getRes.body.eligible).toBe(true);
    expect(getRes.body.eligibilityReasons).toEqual([]);
  });

  it('manages driver lifecycle: suspend, reactivate, deactivate, and terminal state', async () => {
    // Create and activate driver
    const created = await request(application.getHttpServer())
      .post('/api/v1/drivers')
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ firstName: 'Frank', lastName: 'Castle', employeeNumber: 'EMP-1005' })
      .expect(201);

    const driverId = created.body.id;

    await request(application.getHttpServer())
      .post(`/api/v1/drivers/${driverId}/licenses`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        licenseNumber: 'DL-FC-001',
        issuingCountry: 'US',
        licenseClasses: ['B'],
        issueDate: '2024-01-01T00:00:00.000Z',
        expiryDate: '2030-01-01T00:00:00.000Z',
      })
      .expect(201);

    await request(application.getHttpServer())
      .post(`/api/v1/drivers/${driverId}/activate`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ version: 1 })
      .expect(204);

    // Suspend driver
    await request(application.getHttpServer())
      .post(`/api/v1/drivers/${driverId}/suspend`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ reason: 'Medical leave', version: 2 })
      .expect(204);

    const suspended = await request(application.getHttpServer())
      .get(`/api/v1/drivers/${driverId}`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);

    expect(suspended.body.status).toBe('SUSPENDED');
    expect(suspended.body.version).toBe(3);
    expect(suspended.body.eligible).toBe(false);
    expect(suspended.body.eligibilityReasons).toContain('DRIVER_SUSPENDED');

    // Reactivate driver
    await request(application.getHttpServer())
      .post(`/api/v1/drivers/${driverId}/activate`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ version: 3 })
      .expect(204);

    const reactivated = await request(application.getHttpServer())
      .get(`/api/v1/drivers/${driverId}`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);

    expect(reactivated.body.status).toBe('ACTIVE');
    expect(reactivated.body.version).toBe(4);
    expect(reactivated.body.eligible).toBe(true);

    // Deactivate driver (terminal)
    await request(application.getHttpServer())
      .post(`/api/v1/drivers/${driverId}/deactivate`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ reason: 'Resigned', version: 4 })
      .expect(204);

    const deactivated = await request(application.getHttpServer())
      .get(`/api/v1/drivers/${driverId}`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);

    expect(deactivated.body.status).toBe('INACTIVE');
    expect(deactivated.body.version).toBe(5);
    expect(deactivated.body.eligible).toBe(false);

    // Terminal state: cannot transition from INACTIVE
    const reactivateTerminal = await request(application.getHttpServer())
      .post(`/api/v1/drivers/${driverId}/activate`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ version: 5 })
      .expect(409);

    expect(reactivateTerminal.body.error.code).toBe('INVALID_DRIVER_STATUS_TRANSITION');
  });

  it('updates driver profile with optimistic concurrency', async () => {
    const created = await request(application.getHttpServer())
      .post('/api/v1/drivers')
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ firstName: 'Grace', lastName: 'Hopper', employeeNumber: 'EMP-1006' })
      .expect(201);

    const driverId = created.body.id;

    // Stale version update rejected
    const staleUpdate = await request(application.getHttpServer())
      .patch(`/api/v1/drivers/${driverId}`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ phone: '+1-555-9999', version: 999 })
      .expect(409);

    expect(staleUpdate.body.error.code).toBe('CONCURRENCY_CONFLICT');

    // Valid update
    const validUpdate = await request(application.getHttpServer())
      .patch(`/api/v1/drivers/${driverId}`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ phone: '+1-555-9999', notes: 'Lead programmer', version: 1 })
      .expect(200);

    expect(validUpdate.body.version).toBe(2);
    expect(validUpdate.body.phone).toBe('+1-555-9999');
    expect(validUpdate.body.notes).toBe('Lead programmer');
  });

  it('enforces multi-tenant isolation: Org B cannot access Org A drivers', async () => {
    // Org A driver
    const createdA = await request(application.getHttpServer())
      .post('/api/v1/drivers')
      .set('authorization', `Bearer ${adminTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ firstName: 'Harry', lastName: 'Potter', employeeNumber: 'EMP-7777' })
      .expect(201);

    const driverIdA = createdA.body.id;

    // Org B admin cannot get Org A driver
    const getB = await request(application.getHttpServer())
      .get(`/api/v1/drivers/${driverIdA}`)
      .set('authorization', `Bearer ${adminTokenB}`)
      .set('x-organization-id', ids.organizationB)
      .expect(404);

    expect(getB.body.error.code).toBe('DRIVER_NOT_FOUND');

    // Org B admin cannot update Org A driver
    const updateB = await request(application.getHttpServer())
      .patch(`/api/v1/drivers/${driverIdA}`)
      .set('authorization', `Bearer ${adminTokenB}`)
      .set('x-organization-id', ids.organizationB)
      .send({ firstName: 'Hacked', version: 1 })
      .expect(404);

    expect(updateB.body.error.code).toBe('DRIVER_NOT_FOUND');

    // Org B can create driver with SAME employeeNumber without collision
    const createdB = await request(application.getHttpServer())
      .post('/api/v1/drivers')
      .set('authorization', `Bearer ${adminTokenB}`)
      .set('x-organization-id', ids.organizationB)
      .send({ firstName: 'Harry', lastName: 'B-Potter', employeeNumber: 'EMP-7777' })
      .expect(201);

    expect(createdB.body.employeeNumber).toBe('EMP-7777');
    expect(createdB.body.organizationId).toBe(ids.organizationB);
  });

  it('allows viewer to read driver details and history but forbids mutation', async () => {
    const listRes = await request(application.getHttpServer())
      .get('/api/v1/drivers')
      .set('authorization', `Bearer ${viewerTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);

    expect(Array.isArray(listRes.body.items)).toBe(true);

    const firstDriver = listRes.body.items[0];

    // Viewer can read driver
    const detailRes = await request(application.getHttpServer())
      .get(`/api/v1/drivers/${firstDriver.id}`)
      .set('authorization', `Bearer ${viewerTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);

    expect(detailRes.body.id).toBe(firstDriver.id);

    // Viewer can read status history
    await request(application.getHttpServer())
      .get(`/api/v1/drivers/${firstDriver.id}/status-history`)
      .set('authorization', `Bearer ${viewerTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);

    // Viewer cannot update driver
    await request(application.getHttpServer())
      .patch(`/api/v1/drivers/${firstDriver.id}`)
      .set('authorization', `Bearer ${viewerTokenA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ firstName: 'Unauthorized', version: 1 })
      .expect(403);
  });
});
