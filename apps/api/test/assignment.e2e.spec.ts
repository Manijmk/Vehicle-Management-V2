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
  organizationA: '12000000-0000-4000-8000-000000000001',
  organizationB: '12000000-0000-4000-8000-000000000002',
  adminA: '22000000-0000-4000-8000-000000000001',
  viewerA: '22000000-0000-4000-8000-000000000002',
  adminB: '22000000-0000-4000-8000-000000000003',
  membershipAdminA: '32000000-0000-4000-8000-000000000001',
  membershipViewerA: '32000000-0000-4000-8000-000000000002',
  membershipAdminB: '32000000-0000-4000-8000-000000000003',
  roleAdminA: '42000000-0000-4000-8000-000000000001',
  roleViewerA: '42000000-0000-4000-8000-000000000002',
  roleAdminB: '42000000-0000-4000-8000-000000000003',
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
      {
        id: ids.organizationA,
        name: 'Org A',
        slug: 'org-a-assignment',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.organizationB,
        name: 'Org B',
        slug: 'org-b-assignment',
        status: PrincipalStatus.ACTIVE,
      },
    ],
  });

  await database.user.createMany({
    data: [
      {
        id: ids.adminA,
        email: 'admin-a-asn@test.local',
        displayName: 'Admin A ASN',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.viewerA,
        email: 'viewer-a-asn@test.local',
        displayName: 'Viewer A ASN',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.adminB,
        email: 'admin-b-asn@test.local',
        displayName: 'Admin B ASN',
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

  for (const [idx, code] of permissionCodes.entries()) {
    const id = `52000000-0000-4000-8000-${String(idx + 1).padStart(12, '0')}`;
    await database.permission.upsert({
      where: { code },
      update: {},
      create: { id, code, description: code },
    });
  }

  const allPerms = await database.permission.findMany();
  const permMap = new Map(allPerms.map((p) => [p.code, p.id]));

  await database.role.createMany({
    data: [
      { id: ids.roleAdminA, organizationId: ids.organizationA, name: 'Admin Role A' },
      { id: ids.roleViewerA, organizationId: ids.organizationA, name: 'Viewer Role A' },
      { id: ids.roleAdminB, organizationId: ids.organizationB, name: 'Admin Role B' },
    ],
  });

  await database.rolePermission.createMany({
    data: [
      ...[...permMap.values()].map((pId) => ({ roleId: ids.roleAdminA, permissionId: pId })),
      ...[...permMap.values()].map((pId) => ({ roleId: ids.roleAdminB, permissionId: pId })),
      { roleId: ids.roleViewerA, permissionId: permMap.get('assignment.read')! },
      { roleId: ids.roleViewerA, permissionId: permMap.get('vehicle.read')! },
      { roleId: ids.roleViewerA, permissionId: permMap.get('driver.read')! },
    ],
    skipDuplicates: true,
  });

  await database.membershipRole.createMany({
    data: [
      {
        membershipId: ids.membershipAdminA,
        roleId: ids.roleAdminA,
        organizationId: ids.organizationA,
      },
      {
        membershipId: ids.membershipViewerA,
        roleId: ids.roleViewerA,
        organizationId: ids.organizationA,
      },
      {
        membershipId: ids.membershipAdminB,
        roleId: ids.roleAdminB,
        organizationId: ids.organizationB,
      },
    ],
  });
}

describe('Vehicle-Driver Assignment E2E', () => {
  let app: INestApplication;
  let database: PrismaClient;
  let authAdapter: LocalJwtAuthenticationAdapter;
  let tokenAdminA: string;
  let tokenViewerA: string;
  let tokenAdminB: string;

  beforeAll(async () => {
    database = createDatabaseClient({ databaseUrl });
    const config = loadApiConfig();
    authAdapter = new LocalJwtAuthenticationAdapter(config);

    tokenAdminA = await authAdapter.issueDevelopmentToken(ids.adminA, '1h');
    tokenViewerA = await authAdapter.issueDevelopmentToken(ids.viewerA, '1h');
    tokenAdminB = await authAdapter.issueDevelopmentToken(ids.adminB, '1h');

    await database.$executeRawUnsafe(
      'TRUNCATE TABLE vehicle_driver_assignments, driver_status_history, driver_licenses, drivers, vehicle_status_history, vehicles, outbox_events, audit_logs, membership_roles, role_permissions, permissions, roles, organization_memberships, users, organizations RESTART IDENTITY CASCADE',
    );
    await seedFixture(database);

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApiApplication(app, { API_CORS_ORIGINS: 'http://localhost:3000' });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await database?.$disconnect();
  });

  // Helper to create and activate a vehicle
  async function createActiveVehicle(orgId: string, token: string, tag: string) {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({
        displayId: `VH-${tag}`,
        registration: `REG-${tag}`,
        vin: `1HGCR2F83HA${tag.padEnd(6, '0').slice(0, 6)}`,
        type: 'CAR',
        fuelType: 'PETROL',
        model: 'Model T',
        year: 2024,
        odometerKm: 1000,
      });
    const vehicle = createRes.body;

    const activateRes = await request(app.getHttpServer())
      .post(`/api/v1/vehicles/${vehicle.id}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({ version: vehicle.version });
    expect(activateRes.status).toBe(204);
    return { ...vehicle, status: 'ACTIVE', version: vehicle.version + 1 };
  }

  // Helper to create an active eligible driver with license
  async function createActiveDriver(orgId: string, token: string, tag: string) {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/drivers')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({
        firstName: `John-${tag}`,
        lastName: `Doe-${tag}`,
        email: `driver-${tag}@test.local`,
      });
    expect(createRes.status).toBe(201);
    const driver = createRes.body;

    const licRes = await request(app.getHttpServer())
      .post(`/api/v1/drivers/${driver.id}/licenses`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({
        licenseNumber: `LIC-${tag}`,
        issuingCountry: 'US',
        issuingRegion: 'CA',
        licenseClasses: ['B', 'C1'],
        issueDate: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
        expiryDate: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      });
    expect(licRes.status).toBe(201);

    const activateRes = await request(app.getHttpServer())
      .post(`/api/v1/drivers/${driver.id}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({ version: driver.version });
    expect(activateRes.status).toBe(204);
    return { ...driver, status: 'ACTIVE', version: driver.version + 1 };
  }

  describe('Full Assignment Lifecycle', () => {
    it('creates an ACTIVE assignment, queries current assignments, and ends it', async () => {
      const vehicle = await createActiveVehicle(ids.organizationA, tokenAdminA, 'LC1');
      const driver = await createActiveDriver(ids.organizationA, tokenAdminA, 'LC1');

      // 1. Create Assignment
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          vehicleId: vehicle.id,
          driverId: driver.id,
          notes: 'Standard weekday shift',
        });

      expect(createRes.status).toBe(201);
      const assignment = createRes.body;
      expect(assignment.status).toBe('ACTIVE');
      expect(assignment.id).toBeDefined();
      expect(assignment.vehicle.id).toBe(vehicle.id);
      expect(assignment.driver.id).toBe(driver.id);
      expect(assignment.driver.eligible).toBe(true);

      // 2. Query Detail
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/assignments/${assignment.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);
      expect(getRes.status).toBe(200);
      expect(getRes.body.id).toBe(assignment.id);

      // 3. Query Vehicle Current Assignment
      const vCurrRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicle.id}/current-assignment`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);
      expect(vCurrRes.status).toBe(200);
      expect(vCurrRes.body.id).toBe(assignment.id);

      // 4. Query Driver Current Assignment
      const dCurrRes = await request(app.getHttpServer())
        .get(`/api/v1/drivers/${driver.id}/current-assignment`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);
      expect(dCurrRes.status).toBe(200);
      expect(dCurrRes.body.id).toBe(assignment.id);

      // 5. End Assignment
      const endRes = await request(app.getHttpServer())
        .post(`/api/v1/assignments/${assignment.id}/end`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: assignment.version,
          reason: 'Shift completed normally',
        });
      expect(endRes.status).toBe(200);
      expect(endRes.body.status).toBe('ENDED');
      expect(endRes.body.endReason).toBe('Shift completed normally');
      expect(endRes.body.endedAt).toBeDefined();

      // 6. Current assignments should now be null
      const vCurrAfter = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicle.id}/current-assignment`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);
      expect(vCurrAfter.body).toBeNull();

      const dCurrAfter = await request(app.getHttpServer())
        .get(`/api/v1/drivers/${driver.id}/current-assignment`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);
      expect(dCurrAfter.body).toBeNull();

      // 7. Assignment history includes ended record
      const vHistRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicle.id}/assignments`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);
      expect(vHistRes.status).toBe(200);
      expect(vHistRes.body.items.some((a: any) => a.id === assignment.id)).toBe(true);

      const dHistRes = await request(app.getHttpServer())
        .get(`/api/v1/drivers/${driver.id}/assignments`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);
      expect(dHistRes.status).toBe(200);
      expect(dHistRes.body.items.some((a: any) => a.id === assignment.id)).toBe(true);
    });
  });

  describe('Cross-Aggregate Lifecycle Guards', () => {
    it('blocks Vehicle retirement when vehicle has an active assignment, succeeds after assignment is ended', async () => {
      const vehicle = await createActiveVehicle(ids.organizationA, tokenAdminA, 'RET1');
      const driver = await createActiveDriver(ids.organizationA, tokenAdminA, 'RET1');

      const assignRes = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ vehicleId: vehicle.id, driverId: driver.id });
      expect(assignRes.status).toBe(201);
      const assignment = assignRes.body;

      // Attempt retirement while active assignment exists
      const retireFail = await request(app.getHttpServer())
        .post(`/api/v1/vehicles/${vehicle.id}/retire`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: vehicle.version, reason: 'Decommission' });

      expect(retireFail.status).toBe(409);
      expect(retireFail.body.error.code).toBe('VEHICLE_HAS_ACTIVE_ASSIGNMENT');

      // End assignment
      const endRes = await request(app.getHttpServer())
        .post(`/api/v1/assignments/${assignment.id}/end`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: assignment.version, reason: 'Unassign for retirement' });
      expect(endRes.status).toBe(200);

      // Now retirement succeeds
      const retireSuccess = await request(app.getHttpServer())
        .post(`/api/v1/vehicles/${vehicle.id}/retire`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: vehicle.version, reason: 'Decommission' });
      expect(retireSuccess.status).toBe(204);

      const vCheck = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicle.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);
      expect(vCheck.body.status).toBe('RETIRED');
    });

    it('blocks Driver terminal deactivation when driver has an active assignment, succeeds after assignment is ended', async () => {
      const vehicle = await createActiveVehicle(ids.organizationA, tokenAdminA, 'DEA1');
      const driver = await createActiveDriver(ids.organizationA, tokenAdminA, 'DEA1');

      const assignRes = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ vehicleId: vehicle.id, driverId: driver.id });
      expect(assignRes.status).toBe(201);
      const assignment = assignRes.body;

      // Attempt terminal deactivation
      const deactFail = await request(app.getHttpServer())
        .post(`/api/v1/drivers/${driver.id}/deactivate`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: driver.version, reason: 'Resignation' });

      expect(deactFail.status).toBe(409);
      expect(deactFail.body.error.code).toBe('DRIVER_HAS_ACTIVE_ASSIGNMENT');

      // Driver suspension is permitted while assigned
      const suspendRes = await request(app.getHttpServer())
        .post(`/api/v1/drivers/${driver.id}/suspend`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: driver.version, reason: 'Administrative review' });
      expect(suspendRes.status).toBe(204);

      const dCheck1 = await request(app.getHttpServer())
        .get(`/api/v1/drivers/${driver.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);
      expect(dCheck1.body.status).toBe('SUSPENDED');

      // Assignment remains active, but driver eligibility becomes false
      const asnCheck = await request(app.getHttpServer())
        .get(`/api/v1/assignments/${assignment.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);
      expect(asnCheck.body.status).toBe('ACTIVE');
      expect(asnCheck.body.driver.eligible).toBe(false);

      // Reactivate driver
      const reactivateRes = await request(app.getHttpServer())
        .post(`/api/v1/drivers/${driver.id}/activate`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: dCheck1.body.version });
      expect(reactivateRes.status).toBe(204);

      const dCheck2 = await request(app.getHttpServer())
        .get(`/api/v1/drivers/${driver.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);
      expect(dCheck2.body.status).toBe('ACTIVE');

      // End assignment
      const endRes = await request(app.getHttpServer())
        .post(`/api/v1/assignments/${assignment.id}/end`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: assignment.version, reason: 'Unassigned' });
      expect(endRes.status).toBe(200);

      // Now terminal deactivation succeeds
      const deactSuccess = await request(app.getHttpServer())
        .post(`/api/v1/drivers/${driver.id}/deactivate`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: dCheck2.body.version, reason: 'Resignation' });
      expect(deactSuccess.status).toBe(204);

      const dCheck3 = await request(app.getHttpServer())
        .get(`/api/v1/drivers/${driver.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);
      expect(dCheck3.body.status).toBe('INACTIVE');
    });
  });

  describe('Single Active Assignment Constraints', () => {
    it('rejects assigning a vehicle that already has an active assignment', async () => {
      const vehicle = await createActiveVehicle(ids.organizationA, tokenAdminA, 'DBL1');
      const driver1 = await createActiveDriver(ids.organizationA, tokenAdminA, 'DBL1A');
      const driver2 = await createActiveDriver(ids.organizationA, tokenAdminA, 'DBL1B');

      const asn1 = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ vehicleId: vehicle.id, driverId: driver1.id });
      expect(asn1.status).toBe(201);

      const asn2 = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ vehicleId: vehicle.id, driverId: driver2.id });
      expect(asn2.status).toBe(409);
      expect(asn2.body.error.code).toBe('VEHICLE_ALREADY_ASSIGNED');
    });

    it('rejects assigning a driver who already has an active assignment', async () => {
      const vehicle1 = await createActiveVehicle(ids.organizationA, tokenAdminA, 'DBL2A');
      const vehicle2 = await createActiveVehicle(ids.organizationA, tokenAdminA, 'DBL2B');
      const driver = await createActiveDriver(ids.organizationA, tokenAdminA, 'DBL2');

      const asn1 = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ vehicleId: vehicle1.id, driverId: driver.id });
      expect(asn1.status).toBe(201);

      const asn2 = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ vehicleId: vehicle2.id, driverId: driver.id });
      expect(asn2.status).toBe(409);
      expect(asn2.body.error.code).toBe('DRIVER_ALREADY_ASSIGNED');
    });
  });

  describe('Optimistic Concurrency', () => {
    it('rejects ending assignment with stale version', async () => {
      const vehicle = await createActiveVehicle(ids.organizationA, tokenAdminA, 'CON1');
      const driver = await createActiveDriver(ids.organizationA, tokenAdminA, 'CON1');

      const asn = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ vehicleId: vehicle.id, driverId: driver.id });
      expect(asn.status).toBe(201);

      const staleEnd = await request(app.getHttpServer())
        .post(`/api/v1/assignments/${asn.body.id}/end`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: 999, reason: 'Stale attempt' });
      expect(staleEnd.status).toBe(409);
      expect(staleEnd.body.error.code).toBe('CONCURRENCY_CONFLICT');
    });
  });

  describe('Multi-Tenant Isolation', () => {
    it('rejects pairing Org A vehicle with Org B driver', async () => {
      const vehicleA = await createActiveVehicle(ids.organizationA, tokenAdminA, 'MTA1');
      const driverB = await createActiveDriver(ids.organizationB, tokenAdminB, 'MTB1');

      const res = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ vehicleId: vehicleA.id, driverId: driverB.id });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('DRIVER_NOT_FOUND');
    });

    it('does not allow Org B to view or end Org A assignments', async () => {
      const vehicleA = await createActiveVehicle(ids.organizationA, tokenAdminA, 'ISO1');
      const driverA = await createActiveDriver(ids.organizationA, tokenAdminA, 'ISO1');

      const asnRes = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ vehicleId: vehicleA.id, driverId: driverA.id });
      expect(asnRes.status).toBe(201);
      const assignmentId = asnRes.body.id;

      // Org B attempts read
      const readRes = await request(app.getHttpServer())
        .get(`/api/v1/assignments/${assignmentId}`)
        .set('Authorization', `Bearer ${tokenAdminB}`)
        .set('x-organization-id', ids.organizationB);
      expect(readRes.status).toBe(404);

      // Org B attempts end
      const endRes = await request(app.getHttpServer())
        .post(`/api/v1/assignments/${assignmentId}/end`)
        .set('Authorization', `Bearer ${tokenAdminB}`)
        .set('x-organization-id', ids.organizationB)
        .send({ version: 1, reason: 'Cross tenant attack' });
      expect(endRes.status).toBe(404);
    });
  });

  describe('Viewer RBAC', () => {
    it('allows Viewer to read assignments but forbids creation and ending', async () => {
      const vehicle = await createActiveVehicle(ids.organizationA, tokenAdminA, 'VWR1');
      const driver = await createActiveDriver(ids.organizationA, tokenAdminA, 'VWR1');

      const createAttempt = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ vehicleId: vehicle.id, driverId: driver.id });
      expect(createAttempt.status).toBe(403);

      // Admin creates it
      const adminCreate = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ vehicleId: vehicle.id, driverId: driver.id });
      expect(adminCreate.status).toBe(201);
      const assignmentId = adminCreate.body.id;

      // Viewer can read
      const viewerRead = await request(app.getHttpServer())
        .get(`/api/v1/assignments/${assignmentId}`)
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .set('x-organization-id', ids.organizationA);
      expect(viewerRead.status).toBe(200);

      // Viewer cannot end
      const viewerEnd = await request(app.getHttpServer())
        .post(`/api/v1/assignments/${assignmentId}/end`)
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: 1, reason: 'Viewer unauthorized end' });
      expect(viewerEnd.status).toBe(403);
    });
  });
});
