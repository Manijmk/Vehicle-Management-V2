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
  organizationA: '13000000-0000-4000-8000-000000000001',
  organizationB: '13000000-0000-4000-8000-000000000002',
  adminA: '23000000-0000-4000-8000-000000000001',
  viewerA: '23000000-0000-4000-8000-000000000002',
  adminB: '23000000-0000-4000-8000-000000000003',
  membershipAdminA: '33000000-0000-4000-8000-000000000001',
  membershipViewerA: '33000000-0000-4000-8000-000000000002',
  membershipAdminB: '33000000-0000-4000-8000-000000000003',
  roleAdminA: '43000000-0000-4000-8000-000000000001',
  roleViewerA: '43000000-0000-4000-8000-000000000002',
  roleAdminB: '43000000-0000-4000-8000-000000000003',
  preTripTemplateA: '63000000-0000-4000-8000-000000000001',
  postTripTemplateA: '63000000-0000-4000-8000-000000000002',
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
        name: 'Org A Trips',
        slug: 'org-a-trips',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.organizationB,
        name: 'Org B Trips',
        slug: 'org-b-trips',
        status: PrincipalStatus.ACTIVE,
      },
    ],
  });

  await database.user.createMany({
    data: [
      {
        id: ids.adminA,
        email: 'admin-a-trips@test.local',
        displayName: 'Admin A Trips',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.viewerA,
        email: 'viewer-a-trips@test.local',
        displayName: 'Viewer A Trips',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.adminB,
        email: 'admin-b-trips@test.local',
        displayName: 'Admin B Trips',
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
    const id = `53000000-0000-4000-8000-${String(idx + 1).padStart(12, '0')}`;
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
      { roleId: ids.roleViewerA, permissionId: permMap.get('trip.read')! },
      { roleId: ids.roleViewerA, permissionId: permMap.get('trip.history.read')! },
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

  await database.inspectionTemplate.create({
    data: {
      id: ids.preTripTemplateA,
      organizationId: ids.organizationA,
      name: 'Org A Pre-Trip Safety Checklist',
      type: 'PRE_TRIP',
      status: 'ACTIVE',
      version: 1,
      createdBy: ids.adminA,
      updatedBy: ids.adminA,
    },
  });
  await database.inspectionTemplateItem.create({
    data: {
      templateId: ids.preTripTemplateA,
      organizationId: ids.organizationA,
      category: 'Brakes',
      prompt: 'Service and parking brakes functional',
      severity: 'CRITICAL',
      required: true,
      sortOrder: 1,
    },
  });

  await database.inspectionTemplate.create({
    data: {
      id: ids.postTripTemplateA,
      organizationId: ids.organizationA,
      name: 'Org A Post-Trip Safety Checklist',
      type: 'POST_TRIP',
      status: 'ACTIVE',
      version: 1,
      createdBy: ids.adminA,
      updatedBy: ids.adminA,
    },
  });
  await database.inspectionTemplateItem.create({
    data: {
      templateId: ids.postTripTemplateA,
      organizationId: ids.organizationA,
      category: 'Exterior',
      prompt: 'No new vehicle body damage',
      severity: 'NORMAL',
      required: true,
      sortOrder: 1,
    },
  });
}

describe('Trip Vertical Slice E2E', () => {
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
      'TRUNCATE TABLE inspection_responses, inspections, inspection_template_items, inspection_templates, trip_status_history, trips, vehicle_driver_assignments, driver_status_history, driver_licenses, drivers, vehicle_status_history, vehicles, outbox_events, audit_logs, membership_roles, role_permissions, permissions, roles, organization_memberships, users, organizations RESTART IDENTITY CASCADE',
    );
    await seedFixture(database);

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApiApplication(app, { API_CORS_ORIGINS: ['http://localhost:3000'] });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await database?.$disconnect();
  });

  async function completePreTripInspection(tripId: string, vehicleId: string, passed = true) {
    const templateRes = await request(app.getHttpServer())
      .get(`/api/v1/inspection-templates/${ids.preTripTemplateA}`)
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .set('x-organization-id', ids.organizationA);
    expect(templateRes.status).toBe(200);
    const item = templateRes.body.items[0];

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/inspections')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        templateId: ids.preTripTemplateA,
        type: 'PRE_TRIP',
        vehicleId,
        tripId,
      });
    expect(createRes.status).toBe(201);
    const insp = createRes.body;

    const startRes = await request(app.getHttpServer())
      .post(`/api/v1/inspections/${insp.id}/start`)
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ version: insp.version });
    expect(startRes.status).toBe(200);

    const saveRes = await request(app.getHttpServer())
      .put(`/api/v1/inspections/${insp.id}/responses`)
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        version: startRes.body.version,
        responses: [
          {
            templateItemId: item.id,
            response: passed ? 'PASS' : 'FAIL',
            comment: passed ? 'Brakes good' : 'Brakes failed',
          },
        ],
      });
    expect(saveRes.status).toBe(200);

    const compRes = await request(app.getHttpServer())
      .post(`/api/v1/inspections/${insp.id}/complete`)
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ version: saveRes.body.version });
    expect(compRes.status).toBe(200);
    return compRes.body;
  }

  async function completePostTripInspection(tripId: string, vehicleId: string, passed = true) {
    const templateRes = await request(app.getHttpServer())
      .get(`/api/v1/inspection-templates/${ids.postTripTemplateA}`)
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .set('x-organization-id', ids.organizationA);
    expect(templateRes.status).toBe(200);
    const item = templateRes.body.items[0];

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/inspections')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        templateId: ids.postTripTemplateA,
        type: 'POST_TRIP',
        vehicleId,
        tripId,
      });
    expect(createRes.status).toBe(201);
    const insp = createRes.body;

    const startRes = await request(app.getHttpServer())
      .post(`/api/v1/inspections/${insp.id}/start`)
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ version: insp.version });
    expect(startRes.status).toBe(200);

    const saveRes = await request(app.getHttpServer())
      .put(`/api/v1/inspections/${insp.id}/responses`)
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        version: startRes.body.version,
        responses: [
          {
            templateItemId: item.id,
            response: passed ? 'PASS' : 'FAIL',
            comment: passed ? 'Exterior good' : 'Minor scratches',
          },
        ],
      });
    expect(saveRes.status).toBe(200);

    const compRes = await request(app.getHttpServer())
      .post(`/api/v1/inspections/${insp.id}/complete`)
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ version: saveRes.body.version });
    expect(compRes.status).toBe(200);
    return compRes.body;
  }

  // Helper to create and activate a vehicle
  async function createActiveVehicle(orgId: string, token: string, tag: string, odo = 1000) {
    const safeVinTag = tag
      .toUpperCase()
      .replace(/[^A-HJ-NPR-Z0-9]/g, 'X')
      .padEnd(6, '0')
      .slice(0, 6);
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({
        displayId: `VH-${tag}`,
        registration: `REG-${tag}`,
        vin: `1HGCR2F83HA${safeVinTag}`,
        type: 'CAR',
        fuelType: 'PETROL',
        model: 'Model Trip',
        year: 2024,
        odometerKm: odo,
      });
    expect(createRes.status).toBe(201);
    const vehicle = createRes.body;

    const activateRes = await request(app.getHttpServer())
      .post(`/api/v1/vehicles/${vehicle.id}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({ version: vehicle.version });
    expect(activateRes.status).toBe(204);
    return { ...vehicle, status: 'ACTIVE', version: vehicle.version + 1, odometerKm: odo };
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
        licenseClasses: ['B'],
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

  // Helper to create an active assignment
  async function createActiveAssignment(
    orgId: string,
    token: string,
    vehicleId: string,
    driverId: string,
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({ vehicleId, driverId, notes: 'Assignment for trip testing' });
    expect(res.status).toBe(201);
    return res.body;
  }

  // Helper to create a trip
  async function createTrip(
    orgId: string,
    token: string,
    assignmentId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({
        assignmentId,
        origin: 'Point A',
        destination: 'Point B',
        ...overrides,
      });
    return res;
  }

  interface TestTripResponse {
    id: string;
    displayId: string;
    version: number;
    status: string;
    assignmentId: string;
    vehicleId: string;
    driverId: string;
    origin: string;
    destination: string;
    purpose?: string | null;
    notes?: string | null;
    startOdometerKm?: number | null;
    endOdometerKm?: number | null;
    distanceKm?: number | null;
    actualStartAt?: string | null;
    actualEndAt?: string | null;
    cancelReason?: string | null;
    abortReason?: string | null;
  }

  interface TestAssignmentResponse {
    id: string;
    version: number;
    status: string;
  }

  describe('Full Lifecycle Flow (DRAFT -> READY -> IN_PROGRESS -> COMPLETED)', () => {
    let vehicle: { id: string; version: number };
    let driver: { id: string; version: number };
    let assignment: TestAssignmentResponse;
    let trip: TestTripResponse;

    it('creates active vehicle, driver, and assignment', async () => {
      vehicle = await createActiveVehicle(ids.organizationA, tokenAdminA, 'LC1', 1000);
      driver = await createActiveDriver(ids.organizationA, tokenAdminA, 'LC1');
      assignment = await createActiveAssignment(
        ids.organizationA,
        tokenAdminA,
        vehicle.id,
        driver.id,
      );
      expect(assignment.status).toBe('ACTIVE');
    });

    it('creates a trip in DRAFT status', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          assignmentId: assignment.id,
          origin: 'Central Depot',
          destination: 'Customer Site A',
          purpose: 'Supply Delivery',
          notes: 'Deliver goods to customer',
          plannedStartAt: new Date(Date.now() + 3600000).toISOString(),
          plannedEndAt: new Date(Date.now() + 7200000).toISOString(),
        });

      expect(res.status).toBe(201);
      trip = res.body;
      expect(trip.id).toBeDefined();
      expect(trip.displayId).toMatch(/^TRIP-\d{4}$/);
      expect(trip.status).toBe('DRAFT');
      expect(trip.assignmentId).toBe(assignment.id);
      expect(trip.vehicleId).toBe(vehicle.id);
      expect(trip.driverId).toBe(driver.id);
      expect(trip.origin).toBe('Central Depot');
      expect(trip.destination).toBe('Customer Site A');
      expect(trip.purpose).toBe('Supply Delivery');
    });

    it('updates draft trip details', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/trips/${trip.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: trip.version,
          destination: 'Customer Site B',
          notes: 'Updated customer destination',
        });

      expect(res.status).toBe(200);
      trip = res.body;
      expect(trip.destination).toBe('Customer Site B');
      expect(trip.notes).toBe('Updated customer destination');
      expect(trip.version).toBe(2);
    });

    it('marks trip as READY', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/trips/${trip.id}/ready`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: trip.version,
        });

      expect(res.status).toBe(200);
      trip = res.body;
      expect(trip.status).toBe('READY');
      expect(trip.version).toBe(3);
    });

    it('starts the trip with start odometer after passing pre-trip inspection', async () => {
      // 1. Attempt start without pre-trip inspection -> 409 PRE_TRIP_INSPECTION_REQUIRED
      const noInspRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${trip.id}/start`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: trip.version,
          startOdometerKm: 1000,
        });
      expect(noInspRes.status).toBe(409);
      expect(noInspRes.body.error.code).toBe('PRE_TRIP_INSPECTION_REQUIRED');

      // 2. Perform failing pre-trip inspection -> 409 PRE_TRIP_INSPECTION_FAILED
      await completePreTripInspection(trip.id, vehicle.id, false);
      const failInspRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${trip.id}/start`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: trip.version,
          startOdometerKm: 1000,
        });
      expect(failInspRes.status).toBe(409);
      expect(failInspRes.body.error.code).toBe('PRE_TRIP_INSPECTION_FAILED');

      // 3. Perform passing reinspection -> 200 OK
      await completePreTripInspection(trip.id, vehicle.id, true);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/trips/${trip.id}/start`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: trip.version,
          startOdometerKm: 1000,
        });

      expect(res.status).toBe(200);
      trip = res.body;
      expect(trip.status).toBe('IN_PROGRESS');
      expect(trip.startOdometerKm).toBe(1000);
      expect(trip.actualStartAt).toBeDefined();
    });

    it('reflects current in-progress trip in vehicle, driver, and assignment endpoints', async () => {
      const vTripRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicle.id}/current-trip`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);
      expect(vTripRes.status).toBe(200);
      expect(vTripRes.body.id).toBe(trip.id);

      const dTripRes = await request(app.getHttpServer())
        .get(`/api/v1/drivers/${driver.id}/current-trip`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);
      expect(dTripRes.status).toBe(200);
      expect(dTripRes.body.id).toBe(trip.id);

      const aTripsRes = await request(app.getHttpServer())
        .get(`/api/v1/assignments/${assignment.id}/trips`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);
      expect(aTripsRes.status).toBe(200);
      expect(aTripsRes.body.items).toHaveLength(1);
      expect(aTripsRes.body.items[0].id).toBe(trip.id);
    });

    it('blocks ending assignment while an in-progress trip exists', async () => {
      const endRes = await request(app.getHttpServer())
        .post(`/api/v1/assignments/${assignment.id}/end`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: assignment.version, reason: 'Test end' });

      expect(endRes.status).toBe(409);
      expect(endRes.body.error.code).toBe('ASSIGNMENT_HAS_ACTIVE_TRIP');
    });

    it('completes the trip and atomically updates vehicle odometer after post-trip inspection', async () => {
      // 1. Attempt complete without post-trip inspection -> 409 POST_TRIP_INSPECTION_REQUIRED
      const noPostRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${trip.id}/complete`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: trip.version,
          endOdometerKm: 1150,
        });
      expect(noPostRes.status).toBe(409);
      expect(noPostRes.body.error.code).toBe('POST_TRIP_INSPECTION_REQUIRED');

      // 2. Perform post-trip inspection with defects (FAIL) - should STILL permit trip completion
      await completePostTripInspection(trip.id, vehicle.id, false);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/trips/${trip.id}/complete`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: trip.version,
          endOdometerKm: 1150,
          notes: 'Trip completed safely',
        });

      expect(res.status).toBe(200);
      trip = res.body;
      expect(trip.status).toBe('COMPLETED');
      expect(trip.endOdometerKm).toBe(1150);
      expect(trip.distanceKm).toBe(150);
      expect(trip.actualEndAt).toBeDefined();

      // Verify vehicle odometer was updated to 1150
      const vRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicle.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);
      expect(vRes.status).toBe(200);
      expect(vRes.body.odometerKm).toBe(1150);
    });

    it('clears current in-progress trip from vehicle and driver', async () => {
      const vTripRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicle.id}/current-trip`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);
      expect(vTripRes.status).toBe(200);
      expect(vTripRes.body).toBeNull();

      const dTripRes = await request(app.getHttpServer())
        .get(`/api/v1/drivers/${driver.id}/current-trip`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);
      expect(dTripRes.status).toBe(200);
      expect(dTripRes.body).toBeNull();
    });

    it('now allows ending the assignment', async () => {
      const endRes = await request(app.getHttpServer())
        .post(`/api/v1/assignments/${assignment.id}/end`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: assignment.version, reason: 'Completed' });

      expect(endRes.status).toBe(200);
      expect(endRes.body.status).toBe('ENDED');
    });

    it('returns full chronological status history', async () => {
      const historyRes = await request(app.getHttpServer())
        .get(`/api/v1/trips/${trip.id}/status-history`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);

      expect(historyRes.status).toBe(200);
      const history = historyRes.body;
      expect(history.length).toBeGreaterThanOrEqual(4);
      expect(history[0].toStatus).toBe('DRAFT');
      expect(history[1].toStatus).toBe('READY');
      expect(history[2].toStatus).toBe('IN_PROGRESS');
      expect(history[3].toStatus).toBe('COMPLETED');
    });
  });

  describe('Cancellation Lifecycle Flows', () => {
    it('cancels a trip directly from DRAFT status', async () => {
      const v = await createActiveVehicle(ids.organizationA, tokenAdminA, 'CN1', 2000);
      const d = await createActiveDriver(ids.organizationA, tokenAdminA, 'CN1');
      const a = await createActiveAssignment(ids.organizationA, tokenAdminA, v.id, d.id);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          assignmentId: a.id,
          origin: 'Warehouse A',
          destination: 'Client X',
        });
      expect(createRes.status).toBe(201);
      const draftTrip = createRes.body;

      const cancelRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${draftTrip.id}/cancel`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: draftTrip.version,
          cancelReason: 'Order cancelled by client',
        });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.status).toBe('CANCELLED');
      expect(cancelRes.body.cancelReason).toBe('Order cancelled by client');

      // Vehicle odometer remains untouched
      const vRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${v.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);
      expect(vRes.body.odometerKm).toBe(2000);
    });

    it('cancels a trip from READY status', async () => {
      const v = await createActiveVehicle(ids.organizationA, tokenAdminA, 'CN2', 2000);
      const d = await createActiveDriver(ids.organizationA, tokenAdminA, 'CN2');
      const a = await createActiveAssignment(ids.organizationA, tokenAdminA, v.id, d.id);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          assignmentId: a.id,
          origin: 'Warehouse B',
          destination: 'Client Y',
        });
      const t = createRes.body;

      const readyRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${t.id}/ready`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: t.version });
      expect(readyRes.status).toBe(200);

      const cancelRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${t.id}/cancel`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: readyRes.body.version,
          cancelReason: 'Driver called in sick',
        });
      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.status).toBe('CANCELLED');
      expect(cancelRes.body.cancelReason).toBe('Driver called in sick');
    });

    it('rejects cancelling an already terminal trip', async () => {
      const v = await createActiveVehicle(ids.organizationA, tokenAdminA, 'CN3', 2000);
      const d = await createActiveDriver(ids.organizationA, tokenAdminA, 'CN3');
      const a = await createActiveAssignment(ids.organizationA, tokenAdminA, v.id, d.id);

      const createRes = await createTrip(ids.organizationA, tokenAdminA, a.id);
      expect(createRes.status).toBe(201);
      const t = createRes.body;

      const cancelRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${t.id}/cancel`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: t.version, cancelReason: 'First cancel' });
      expect(cancelRes.status).toBe(200);

      const cancelAgain = await request(app.getHttpServer())
        .post(`/api/v1/trips/${t.id}/cancel`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: cancelRes.body.version, cancelReason: 'Second cancel' });
      expect(cancelAgain.status).toBe(409);
      expect(cancelAgain.body.error.code).toBe('TRIP_ALREADY_TERMINAL');
    });
  });

  describe('Abort Lifecycle Flow (IN_PROGRESS -> ABORTED)', () => {
    it('aborts an in-progress trip, records end odometer and updates vehicle', async () => {
      const v = await createActiveVehicle(ids.organizationA, tokenAdminA, 'AB1', 3000);
      const d = await createActiveDriver(ids.organizationA, tokenAdminA, 'AB1');
      const a = await createActiveAssignment(ids.organizationA, tokenAdminA, v.id, d.id);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ assignmentId: a.id, origin: 'Site 1', destination: 'Site 2' });
      let t = createRes.body;

      const readyRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${t.id}/ready`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: t.version });
      t = readyRes.body;

      await completePreTripInspection(t.id, v.id, true);

      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${t.id}/start`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: t.version, startOdometerKm: 3000 });
      t = startRes.body;

      const abortRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${t.id}/abort`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: t.version,
          endOdometerKm: 3045,
          abortReason: 'Engine temperature warning',
        });

      expect(abortRes.status).toBe(200);
      const abortedTrip = abortRes.body;
      expect(abortedTrip.status).toBe('ABORTED');
      expect(abortedTrip.endOdometerKm).toBe(3045);
      expect(abortedTrip.distanceKm).toBe(45);
      expect(abortedTrip.abortReason).toBe('Engine temperature warning');

      // Vehicle odometer updated to 3045
      const vRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${v.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);
      expect(vRes.body.odometerKm).toBe(3045);

      // Current trip is cleared
      const currRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${v.id}/current-trip`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);
      expect(currRes.body).toBeNull();
    });

    it('rejects aborting a trip that is not in IN_PROGRESS status', async () => {
      const v = await createActiveVehicle(ids.organizationA, tokenAdminA, 'AB2', 3000);
      const d = await createActiveDriver(ids.organizationA, tokenAdminA, 'AB2');
      const a = await createActiveAssignment(ids.organizationA, tokenAdminA, v.id, d.id);

      const createRes = await createTrip(ids.organizationA, tokenAdminA, a.id);
      expect(createRes.status).toBe(201);
      const t = createRes.body;

      const abortRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${t.id}/abort`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: t.version,
          endOdometerKm: 3050,
          abortReason: 'Cannot abort draft',
        });
      expect(abortRes.status).toBe(409);
      expect(abortRes.body.error.code).toBe('INVALID_TRIP_STATUS_TRANSITION');
    });
  });

  describe('Odometer Validation and Progression Rules', () => {
    it('rejects startOdometerKm less than current vehicle odometer', async () => {
      const v = await createActiveVehicle(ids.organizationA, tokenAdminA, 'OD1', 5000);
      const d = await createActiveDriver(ids.organizationA, tokenAdminA, 'OD1');
      const a = await createActiveAssignment(ids.organizationA, tokenAdminA, v.id, d.id);

      const tRes = await createTrip(ids.organizationA, tokenAdminA, a.id);
      expect(tRes.status).toBe(201);
      let t = tRes.body;

      const readyRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${t.id}/ready`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: t.version });
      t = readyRes.body;

      await completePreTripInspection(t.id, v.id, true);

      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${t.id}/start`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: t.version, startOdometerKm: 4900 });

      expect(startRes.status).toBe(400);
      expect(startRes.body.error.code).toBe('INVALID_START_ODOMETER');
    });

    it('rejects endOdometerKm less than startOdometerKm', async () => {
      const v = await createActiveVehicle(ids.organizationA, tokenAdminA, 'OD2', 5000);
      const d = await createActiveDriver(ids.organizationA, tokenAdminA, 'OD2');
      const a = await createActiveAssignment(ids.organizationA, tokenAdminA, v.id, d.id);

      const tRes = await createTrip(ids.organizationA, tokenAdminA, a.id);
      expect(tRes.status).toBe(201);
      let t = tRes.body;

      const readyRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${t.id}/ready`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: t.version });
      t = readyRes.body;

      await completePreTripInspection(t.id, v.id, true);

      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${t.id}/start`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: t.version, startOdometerKm: 5100 });
      t = startRes.body;

      const compRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${t.id}/complete`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: t.version, endOdometerKm: 5050 });

      expect(compRes.status).toBe(400);
      expect(compRes.body.error.code).toBe('INVALID_END_ODOMETER');
    });
  });

  describe('Driver Eligibility and Operational Revalidation', () => {
    it('rejects starting trip if driver is suspended while trip is READY', async () => {
      const v = await createActiveVehicle(ids.organizationA, tokenAdminA, 'DR1', 6000);
      const d = await createActiveDriver(ids.organizationA, tokenAdminA, 'DR1');
      const a = await createActiveAssignment(ids.organizationA, tokenAdminA, v.id, d.id);

      const tRes = await createTrip(ids.organizationA, tokenAdminA, a.id);
      expect(tRes.status).toBe(201);
      let t = tRes.body;

      const readyRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${t.id}/ready`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: t.version });
      t = readyRes.body;

      // Suspend the driver
      const suspRes = await request(app.getHttpServer())
        .post(`/api/v1/drivers/${d.id}/suspend`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: d.version, reason: 'Suspended for test' });
      expect(suspRes.status).toBe(204);

      // Attempt to start trip
      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${t.id}/start`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: t.version, startOdometerKm: 6000 });

      expect(startRes.status).toBe(409);
      expect(startRes.body.error.code).toBe('TRIP_DRIVER_NOT_ACTIVE');
    });

    it('allows completing an already in-progress trip even if driver was suspended during trip', async () => {
      const v = await createActiveVehicle(ids.organizationA, tokenAdminA, 'DR2', 7000);
      const d = await createActiveDriver(ids.organizationA, tokenAdminA, 'DR2');
      const a = await createActiveAssignment(ids.organizationA, tokenAdminA, v.id, d.id);

      const tRes = await createTrip(ids.organizationA, tokenAdminA, a.id);
      expect(tRes.status).toBe(201);
      let t = tRes.body;

      const readyRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${t.id}/ready`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: t.version });
      t = readyRes.body;

      await completePreTripInspection(t.id, v.id, true);

      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${t.id}/start`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: t.version, startOdometerKm: 7000 });
      t = startRes.body;

      // Suspend driver while trip is IN_PROGRESS
      const suspRes = await request(app.getHttpServer())
        .post(`/api/v1/drivers/${d.id}/suspend`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: d.version, reason: 'Suspended during trip' });
      expect(suspRes.status).toBe(204);

      // Complete post-trip inspection
      await completePostTripInspection(t.id, v.id, true);

      // Completing the trip should succeed
      const compRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${t.id}/complete`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: t.version, endOdometerKm: 7100 });
      expect(compRes.status).toBe(200);
      expect(compRes.body.status).toBe('COMPLETED');
    });
  });

  describe('Single In-Progress Trip Enforcement (Partial Unique Indexes)', () => {
    it('blocks starting a second trip for the same vehicle', async () => {
      const v = await createActiveVehicle(ids.organizationA, tokenAdminA, 'UN1', 8000);
      const d1 = await createActiveDriver(ids.organizationA, tokenAdminA, 'UN1A');
      const a1 = await createActiveAssignment(ids.organizationA, tokenAdminA, v.id, d1.id);

      // Create and start trip 1
      const t1Res = await createTrip(ids.organizationA, tokenAdminA, a1.id);
      expect(t1Res.status).toBe(201);
      let t1 = t1Res.body;

      const ready1 = await request(app.getHttpServer())
        .post(`/api/v1/trips/${t1.id}/ready`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: t1.version });
      t1 = ready1.body;

      await completePreTripInspection(t1.id, v.id, true);

      const start1 = await request(app.getHttpServer())
        .post(`/api/v1/trips/${t1.id}/start`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: t1.version, startOdometerKm: 8000 });
      expect(start1.status).toBe(200);

      // Create another trip for the same assignment
      const t2Res = await createTrip(ids.organizationA, tokenAdminA, a1.id);
      expect(t2Res.status).toBe(201);
      let t2 = t2Res.body;

      const ready2 = await request(app.getHttpServer())
        .post(`/api/v1/trips/${t2.id}/ready`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: t2.version });
      t2 = ready2.body;

      await completePreTripInspection(t2.id, v.id, true);

      // Attempt to start trip 2 while trip 1 is IN_PROGRESS
      const start2 = await request(app.getHttpServer())
        .post(`/api/v1/trips/${t2.id}/start`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: t2.version, startOdometerKm: 8000 });

      expect(start2.status).toBe(409);
      expect(start2.body.error.code).toBe('VEHICLE_HAS_IN_PROGRESS_TRIP');
    });
  });

  describe('RBAC Permissions Enforcement', () => {
    let tripForRbac: TestTripResponse;

    beforeAll(async () => {
      const v = await createActiveVehicle(ids.organizationA, tokenAdminA, 'RB1', 9000);
      const d = await createActiveDriver(ids.organizationA, tokenAdminA, 'RB1');
      const a = await createActiveAssignment(ids.organizationA, tokenAdminA, v.id, d.id);

      const res = await createTrip(ids.organizationA, tokenAdminA, a.id);
      expect(res.status).toBe(201);
      tripForRbac = res.body;
    });

    it('allows viewer with trip.read to read trip list and detail', async () => {
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/trips')
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .set('x-organization-id', ids.organizationA);
      expect(listRes.status).toBe(200);

      const detailRes = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripForRbac.id}`)
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .set('x-organization-id', ids.organizationA);
      expect(detailRes.status).toBe(200);

      const histRes = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripForRbac.id}/status-history`)
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .set('x-organization-id', ids.organizationA);
      expect(histRes.status).toBe(200);
    });

    it('forbids viewer without mutation permissions from mutating trip', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ assignmentId: tripForRbac.assignmentId });
      expect(createRes.status).toBe(403);

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripForRbac.id}`)
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: tripForRbac.version, notes: 'unauthorized' });
      expect(updateRes.status).toBe(403);

      const readyRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripForRbac.id}/ready`)
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: tripForRbac.version });
      expect(readyRes.status).toBe(403);

      const cancelRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripForRbac.id}/cancel`)
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: tripForRbac.version, cancelReason: 'no perms' });
      expect(cancelRes.status).toBe(403);
    });
  });

  describe('Multi-Tenant Isolation', () => {
    let tripOrgA: TestTripResponse;

    beforeAll(async () => {
      const v = await createActiveVehicle(ids.organizationA, tokenAdminA, 'TN1', 9500);
      const d = await createActiveDriver(ids.organizationA, tokenAdminA, 'TN1');
      const a = await createActiveAssignment(ids.organizationA, tokenAdminA, v.id, d.id);

      const res = await createTrip(ids.organizationA, tokenAdminA, a.id);
      expect(res.status).toBe(201);
      tripOrgA = res.body;
    });

    it('returns 404 when Org B queries a trip belonging to Org A', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripOrgA.id}`)
        .set('Authorization', `Bearer ${tokenAdminB}`)
        .set('x-organization-id', ids.organizationB);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('TRIP_NOT_FOUND');
    });

    it('returns 404 when Org B attempts to mutate a trip belonging to Org A', async () => {
      const readyRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripOrgA.id}/ready`)
        .set('Authorization', `Bearer ${tokenAdminB}`)
        .set('x-organization-id', ids.organizationB)
        .send({ version: tripOrgA.version });
      expect(readyRes.status).toBe(404);
      expect(readyRes.body.error.code).toBe('TRIP_NOT_FOUND');

      const cancelRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripOrgA.id}/cancel`)
        .set('Authorization', `Bearer ${tokenAdminB}`)
        .set('x-organization-id', ids.organizationB)
        .send({ version: tripOrgA.version, cancelReason: 'Cross-tenant cancel' });
      expect(cancelRes.status).toBe(404);
      expect(cancelRes.body.error.code).toBe('TRIP_NOT_FOUND');
    });

    it('does not list Org A trips in Org B listing', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/trips')
        .set('Authorization', `Bearer ${tokenAdminB}`)
        .set('x-organization-id', ids.organizationB);
      expect(res.status).toBe(200);
      const items = res.body.items as Array<{ id: string }>;
      expect(items.some((t) => t.id === tripOrgA.id)).toBe(false);
    });
  });
});
