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
  organizationA: '15000000-0000-4000-8000-000000000001',
  organizationB: '15000000-0000-4000-8000-000000000002',
  adminA: '25000000-0000-4000-8000-000000000001',
  viewerA: '25000000-0000-4000-8000-000000000002',
  adminB: '25000000-0000-4000-8000-000000000003',
  membershipAdminA: '35000000-0000-4000-8000-000000000001',
  membershipViewerA: '35000000-0000-4000-8000-000000000002',
  membershipAdminB: '35000000-0000-4000-8000-000000000003',
  roleAdminA: '45000000-0000-4000-8000-000000000001',
  roleViewerA: '45000000-0000-4000-8000-000000000002',
  roleAdminB: '45000000-0000-4000-8000-000000000003',
  preTripTemplateA: '65000000-0000-4000-8000-000000000001',
  postTripTemplateA: '65000000-0000-4000-8000-000000000002',
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
        name: 'Org A Maintenance',
        slug: 'org-a-maintenance',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.organizationB,
        name: 'Org B Maintenance',
        slug: 'org-b-maintenance',
        status: PrincipalStatus.ACTIVE,
      },
    ],
  });

  await database.user.createMany({
    data: [
      {
        id: ids.adminA,
        email: 'admin-a-maintenance@test.local',
        displayName: 'Admin A Maintenance',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.viewerA,
        email: 'viewer-a-maintenance@test.local',
        displayName: 'Viewer A Maintenance',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.adminB,
        email: 'admin-b-maintenance@test.local',
        displayName: 'Admin B Maintenance',
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
    const id = `55000000-0000-4000-8000-${String(idx + 1).padStart(12, '0')}`;
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
      { roleId: ids.roleViewerA, permissionId: permMap.get('maintenance.read')! },
      { roleId: ids.roleViewerA, permissionId: permMap.get('maintenance.plan.read')! },
      { roleId: ids.roleViewerA, permissionId: permMap.get('maintenance.vendor.read')! },
      { roleId: ids.roleViewerA, permissionId: permMap.get('vehicle.read')! },
      { roleId: ids.roleViewerA, permissionId: permMap.get('driver.read')! },
      { roleId: ids.roleViewerA, permissionId: permMap.get('trip.read')! },
      { roleId: ids.roleViewerA, permissionId: permMap.get('inspection.read')! },
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

describe('Maintenance Vertical Slice E2E', () => {
  type EntityRecord = {
    id: string;
    version: number;
    displayId?: string;
    [key: string]: unknown;
  };

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
      'TRUNCATE TABLE maintenance_work_order_labor, maintenance_work_order_parts, maintenance_work_order_tasks, maintenance_work_orders, vehicle_maintenance_schedules, maintenance_plans, maintenance_requests, maintenance_vendors, inspection_responses, inspections, inspection_template_items, inspection_templates, trip_status_history, trips, vehicle_driver_assignments, driver_status_history, driver_licenses, drivers, vehicle_status_history, vehicles, outbox_events, audit_logs, membership_roles, role_permissions, permissions, roles, organization_memberships, users, organizations RESTART IDENTITY CASCADE',
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

  async function createVehicle(orgId: string, token: string, tag: string, odo = 1000) {
    const safeVinTag = tag
      .toUpperCase()
      .replace(/[^A-HJ-NPR-Z0-9]/g, 'X')
      .padEnd(6, '0')
      .slice(0, 6);
    const res = await request(app.getHttpServer())
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({
        displayId: `VH-${tag}`,
        registration: `REG-${tag}`,
        vin: `1HGCR2F83HA${safeVinTag}`,
        type: 'CAR',
        fuelType: 'PETROL',
        model: 'Model Maint',
        year: 2024,
        odometerKm: odo,
      });
    expect(res.status).toBe(201);
    const vehicle = res.body;

    const actRes = await request(app.getHttpServer())
      .post(`/api/v1/vehicles/${vehicle.id}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({ version: vehicle.version });
    expect(actRes.status).toBe(204);

    return { ...vehicle, status: 'ACTIVE', version: vehicle.version + 1 };
  }

  async function createDriver(orgId: string, token: string, tag: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/drivers')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({
        firstName: 'John',
        lastName: `Driver-${tag}`,
        email: `driver-${tag}@test.local`,
      });
    expect(res.status).toBe(201);
    const driver = res.body;

    const licRes = await request(app.getHttpServer())
      .post(`/api/v1/drivers/${driver.id}/licenses`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({
        licenseNumber: `DL-${tag}`,
        issuingCountry: 'US',
        issuingRegion: 'CA',
        licenseClasses: ['B', 'C1'],
        issueDate: '2024-01-01T00:00:00.000Z',
        expiryDate: '2029-01-01T00:00:00.000Z',
      });
    expect(licRes.status).toBe(201);

    const actRes = await request(app.getHttpServer())
      .post(`/api/v1/drivers/${driver.id}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({ version: driver.version });
    expect(actRes.status).toBe(204);

    return { ...driver, status: 'ACTIVE', version: driver.version + 1 };
  }

  async function createAssignment(
    orgId: string,
    token: string,
    vehicleId: string,
    driverId: string,
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({ vehicleId, driverId });
    expect(res.status).toBe(201);
    return res.body;
  }

  describe('1. Maintenance Vendors', () => {
    let createdVendor: EntityRecord;

    it('creates a maintenance vendor and allocates display ID', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/maintenance/vendors')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          name: 'Apex Auto Care',
          contactName: 'Bob Miller',
          phone: '+1-555-0199',
          email: 'service@apexautocare.local',
          notes: 'Primary fleet mechanic',
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        name: 'Apex Auto Care',
        displayId: expect.stringMatching(/^VND-\d+$/),
        status: 'ACTIVE',
      });
      createdVendor = res.body;
    });

    it('lists maintenance vendors', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/maintenance/vendors')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe(createdVendor.id);
    });

    it('updates vendor contact information and status', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/maintenance/vendors/${createdVendor.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: createdVendor.version,
          phone: '+1-555-9999',
          status: 'INACTIVE',
        });

      expect(res.status).toBe(200);
      expect(res.body.phone).toBe('+1-555-9999');
      expect(res.body.status).toBe('INACTIVE');
      createdVendor = res.body;

      // Re-activate for subsequent tests
      const reactivateRes = await request(app.getHttpServer())
        .patch(`/api/v1/maintenance/vendors/${createdVendor.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: createdVendor.version, status: 'ACTIVE' });
      expect(reactivateRes.status).toBe(200);
      createdVendor = reactivateRes.body;
    });

    it('enforces tenant isolation on vendor retrieval', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/maintenance/vendors/${createdVendor.id}`)
        .set('Authorization', `Bearer ${tokenAdminB}`)
        .set('x-organization-id', ids.organizationB);

      expect(res.status).toBe(404);
    });

    it('enforces RBAC: viewer cannot create vendors', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/maintenance/vendors')
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ name: 'Unauthorized Vendor' });

      expect(res.status).toBe(403);
    });
  });

  describe('2. Maintenance Requests', () => {
    let vehicleA: EntityRecord;
    let manualRequest: EntityRecord;

    beforeAll(async () => {
      vehicleA = await createVehicle(ids.organizationA, tokenAdminA, 'MREQ01', 5000);
    });

    it('creates a manual maintenance request with operation blocking flag', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/maintenance/requests')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          vehicleId: vehicleA.id,
          title: 'Brake pedal soft',
          description: 'Brake fluid level low and pedal feels spongy',
          priority: 'HIGH',
          blocksOperation: true,
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        displayId: expect.stringMatching(/^MR-\d+$/),
        vehicleId: vehicleA.id,
        sourceType: 'MANUAL',
        priority: 'HIGH',
        blocksOperation: true,
        status: 'OPEN',
      });
      manualRequest = res.body;
    });

    it('lists maintenance requests with filters', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/maintenance/requests?vehicleId=${vehicleA.id}&status=OPEN`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe(manualRequest.id);
    });

    it('cancels a maintenance request', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/maintenance/requests/${manualRequest.id}/cancel`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: manualRequest.version,
          cancelReason: 'False alarm after visual inspection',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');
    });

    it('creates a maintenance request from an inspection and prevents duplicates', async () => {
      // 1. Create inspection template and failed inspection
      const tmplRes = await request(app.getHttpServer())
        .post('/api/v1/inspection-templates')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          name: 'Daily Inspection',
          type: 'SAFETY',
          items: [
            {
              category: 'Engine',
              prompt: 'Check engine light',
              severity: 'NORMAL',
              required: true,
              sortOrder: 1,
            },
          ],
        });
      expect(tmplRes.status).toBe(201);
      const tmpl = tmplRes.body;

      await request(app.getHttpServer())
        .post(`/api/v1/inspection-templates/${tmpl.id}/activate`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: tmpl.version });

      const inspRes = await request(app.getHttpServer())
        .post('/api/v1/inspections')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          templateId: tmpl.id,
          vehicleId: vehicleA.id,
          type: 'SAFETY',
        });
      expect(inspRes.status).toBe(201);
      const insp = inspRes.body;

      // Fail inspection
      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/inspections/${insp.id}/start`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: insp.version });
      expect(startRes.status).toBe(200);

      const respRes = await request(app.getHttpServer())
        .put(`/api/v1/inspections/${insp.id}/responses`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: startRes.body.version,
          responses: [
            {
              templateItemId: tmpl.items[0].id,
              response: 'FAIL',
              comment: 'Check engine light illuminated',
            },
          ],
        });
      expect(respRes.status).toBe(200);

      const compRes = await request(app.getHttpServer())
        .post(`/api/v1/inspections/${insp.id}/complete`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: respRes.body.version });
      expect(compRes.status).toBe(200);
      expect(compRes.body.result).toBe('FAIL');

      // 2. Request creation from inspection endpoint
      const mrRes = await request(app.getHttpServer())
        .post(`/api/v1/inspections/${insp.id}/maintenance-request`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          title: 'Engine Diagnostic Required',
          description: 'CEL on during pre-trip inspection',
          priority: 'NORMAL',
          blocksOperation: false,
        });

      expect(mrRes.status).toBe(201);
      expect(mrRes.body.sourceType).toBe('INSPECTION');
      expect(mrRes.body.sourceInspectionId).toBe(insp.id);

      // 3. Second call returns 409 DUPLICATE_MAINTENANCE_REQUEST
      const secondCallRes = await request(app.getHttpServer())
        .post(`/api/v1/inspections/${insp.id}/maintenance-request`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ title: 'Duplicate' });

      expect(secondCallRes.status).toBe(409);
      expect(secondCallRes.body.error.code).toBe('DUPLICATE_MAINTENANCE_REQUEST');
    });

    it('enforces tenant isolation on requests', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/maintenance/requests/${manualRequest.id}`)
        .set('Authorization', `Bearer ${tokenAdminB}`)
        .set('x-organization-id', ids.organizationB);

      expect(res.status).toBe(404);
    });
  });

  describe('3. Maintenance Plans & Vehicle Schedules', () => {
    let vehicleB: EntityRecord;
    let plan: EntityRecord;
    let scheduleId: string;

    beforeAll(async () => {
      vehicleB = await createVehicle(ids.organizationA, tokenAdminA, 'MPLAN01', 10000);
    });

    it('creates a preventive maintenance plan in DRAFT status', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/maintenance/plans')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          name: '10,000 km Oil & Filter Service',
          description: 'Full synthetic oil change and multi-point inspection',
          intervalDays: 180,
          intervalOdometerKm: 10000,
          defaultPriority: 'NORMAL',
          blocksOperationWhenDue: true,
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        displayId: expect.stringMatching(/^MP-\d+$/),
        name: '10,000 km Oil & Filter Service',
        status: 'DRAFT',
        intervalDays: 180,
        intervalOdometerKm: 10000,
      });
      plan = res.body;
    });

    it('activates the maintenance plan and enforces immutability', async () => {
      const actRes = await request(app.getHttpServer())
        .post(`/api/v1/maintenance/plans/${plan.id}/activate`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: plan.version });

      expect(actRes.status).toBe(200);
      expect(actRes.body.status).toBe('ACTIVE');
      plan = actRes.body;

      // Attempting to mutate activated plan is rejected
      const mutRes = await request(app.getHttpServer())
        .patch(`/api/v1/maintenance/plans/${plan.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: plan.version, name: 'Changed Name' });

      expect(mutRes.status).toBe(409);
      expect(mutRes.body.error.code).toBe('MAINTENANCE_PLAN_IMMUTABLE');
    });

    it('assigns plan to vehicle schedule and calculates next due thresholds', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/vehicles/${vehicleB.id}/maintenance-schedules`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ maintenancePlanId: plan.id });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        vehicleId: vehicleB.id,
        maintenancePlanId: plan.id,
        nextDueOdometerKm: 20000, // 10000 odo + 10000 interval
      });
      expect(res.body.nextDueAt).not.toBeNull();
      scheduleId = res.body.id;
    });

    it('rejects duplicate assignment of the same plan to the same vehicle', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/vehicles/${vehicleB.id}/maintenance-schedules`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ maintenancePlanId: plan.id });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('MAINTENANCE_SCHEDULE_ALREADY_EXISTS');
    });

    it('lists vehicle maintenance schedules with derived due status', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleB.id}/maintenance-schedules`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toMatchObject({
        id: scheduleId,
        dueState: 'UPCOMING',
      });
    });

    it('creates a work order directly from the schedule', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/maintenance/schedules/${scheduleId}/work-orders`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: 1 });

      expect(res.status).toBe(201);
      expect(res.body.maintenanceScheduleId).toBe(scheduleId);
      expect(res.body.status).toBe('OPEN');
      expect(res.body.vehicleId).toBe(vehicleB.id);
      expect(res.body.blocksOperation).toBe(plan.blocksOperationWhenDue);
    });

    it('rejects creating a second active work order for the same schedule', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/maintenance/schedules/${scheduleId}/work-orders`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: 1 });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SCHEDULE_ALREADY_HAS_ACTIVE_WORK_ORDER');
    });

    it('completing a schedule work order resets lastCompletedAt, lastCompletedOdometerKm, and recomputes nextDueAt and nextDueOdometerKm', async () => {
      const listWo = await request(app.getHttpServer())
        .get(`/api/v1/maintenance/work-orders?vehicleId=${vehicleB.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);

      const wo = listWo.body.items.find(
        (w: EntityRecord) => w.maintenanceScheduleId === scheduleId && w.status === 'OPEN',
      );
      expect(wo).toBeDefined();

      await request(app.getHttpServer())
        .post(`/api/v1/maintenance/work-orders/${wo.id}/tasks`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ description: 'Filter replacement' });

      const woDetail = await request(app.getHttpServer())
        .get(`/api/v1/maintenance/work-orders/${wo.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);
      const tasks = woDetail.body.tasks as Array<{ id: string }>;
      const task = tasks[0];
      expect(task).toBeDefined();
      const taskId = task!.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/maintenance/work-orders/${wo.id}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ status: 'COMPLETED' });

      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/maintenance/work-orders/${wo.id}/start`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: woDetail.body.version });
      expect(startRes.status).toBe(200);

      const completeRes = await request(app.getHttpServer())
        .post(`/api/v1/maintenance/work-orders/${wo.id}/complete`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: startRes.body.version,
          completionNotes: 'Major service done',
          odometerAtCompletion: 15000,
        });
      expect(completeRes.status).toBe(200);

      const schedRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleB.id}/maintenance-schedules`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);

      const updatedSched = (schedRes.body.items as EntityRecord[]).find(
        (s: EntityRecord) => s.id === scheduleId,
      );
      expect(updatedSched).toBeDefined();
      expect(updatedSched?.lastCompletedOdometerKm).toBe(15000);
      expect(updatedSched?.lastCompletedAt).not.toBeNull();
      expect(updatedSched?.nextDueOdometerKm).toBe(25000);
      expect(updatedSched?.nextDueAt).not.toBeNull();
      expect(updatedSched?.dueState).toBe('UPCOMING');
    });

    it('cancelling a schedule work order does NOT reset schedule thresholds', async () => {
      const woRes = await request(app.getHttpServer())
        .post(`/api/v1/maintenance/schedules/${scheduleId}/work-orders`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: 1 });
      expect(woRes.status).toBe(201);

      const cancelRes = await request(app.getHttpServer())
        .post(`/api/v1/maintenance/work-orders/${woRes.body.id}/cancel`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: woRes.body.version, cancelReason: 'Parts unavailable' });
      expect(cancelRes.status).toBe(200);

      const schedRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleB.id}/maintenance-schedules`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);

      const updatedSched = (schedRes.body.items as EntityRecord[]).find(
        (s: EntityRecord) => s.id === scheduleId,
      );
      expect(updatedSched?.lastCompletedOdometerKm).toBe(15000);
      expect(updatedSched?.nextDueOdometerKm).toBe(25000);
    });
  });

  describe('4. Maintenance Work Orders Lifecycle, Tasks, Parts, Labor & Costs', () => {
    let vehicleC: EntityRecord;
    let vendor: EntityRecord;
    let workOrder: EntityRecord;
    let taskId: string;

    beforeAll(async () => {
      vehicleC = await createVehicle(ids.organizationA, tokenAdminA, 'MWO01', 30000);
      const vRes = await request(app.getHttpServer())
        .post('/api/v1/maintenance/vendors')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ name: 'Fleet Fix Garage' });
      vendor = vRes.body;
    });

    it('creates a draft work order and transitions through OPEN and IN_PROGRESS', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/maintenance/work-orders')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          vehicleId: vehicleC.id,
          vendorId: vendor.id,
          title: '30k km Major Service',
          description: 'Timing belt check and spark plugs replacement',
          priority: 'NORMAL',
          blocksOperation: false,
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        displayId: expect.stringMatching(/^MWO-\d+$/),
        status: 'DRAFT',
        vehicleId: vehicleC.id,
        vendorId: vendor.id,
      });
      workOrder = res.body;

      // Open work order
      const openRes = await request(app.getHttpServer())
        .post(`/api/v1/maintenance/work-orders/${workOrder.id}/open`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: workOrder.version });

      expect(openRes.status).toBe(200);
      expect(openRes.body.status).toBe('OPEN');
      expect(openRes.body.openedAt).not.toBeNull();
      workOrder = openRes.body;

      // Start work order
      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/maintenance/work-orders/${workOrder.id}/start`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: workOrder.version });

      expect(startRes.status).toBe(200);
      expect(startRes.body.status).toBe('IN_PROGRESS');
      expect(startRes.body.startedAt).not.toBeNull();
      workOrder = startRes.body;
    });

    it('manages tasks, parts, and labor with derived cost totals', async () => {
      // 1. Add Task
      const taskRes = await request(app.getHttpServer())
        .post(`/api/v1/maintenance/work-orders/${workOrder.id}/tasks`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ description: 'Replace spark plugs' });

      expect(taskRes.status).toBe(201);
      expect(taskRes.body.status).toBe('PENDING');
      taskId = taskRes.body.id;

      // 2. Add Part ($25.00 * 4 = $100.00)
      const partRes = await request(app.getHttpServer())
        .post(`/api/v1/maintenance/work-orders/${workOrder.id}/parts`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          partNumber: 'SP-100',
          description: 'Iridium Spark Plug',
          quantity: 4,
          unitCost: 2500, // 25.00 in cents
        });

      expect(partRes.status).toBe(201);
      expect(partRes.body.totalCost).toBe(10000); // 100.00

      // 3. Add Labor (1.5 hours * $80/hr = $120.00)
      const laborRes = await request(app.getHttpServer())
        .post(`/api/v1/maintenance/work-orders/${workOrder.id}/labor`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          description: 'Ignition system service',
          technicianName: 'Bob',
          hours: 1.5,
          hourlyRate: 8000, // 80.00 in cents
        });

      expect(laborRes.status).toBe(201);
      expect(laborRes.body.totalCost).toBe(12000); // 120.00

      // 4. Verify Work Order detail contains accurate totals
      const detailRes = await request(app.getHttpServer())
        .get(`/api/v1/maintenance/work-orders/${workOrder.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body).toMatchObject({
        partsTotal: 10000,
        laborTotal: 12000,
        totalCost: 22000, // $220.00
      });
      workOrder = detailRes.body;
    });

    it('requires all tasks to be completed/skipped before work order completion', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/maintenance/work-orders/${workOrder.id}/complete`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: workOrder.version,
          odometerAtCompletion: 30050,
          completionNotes: 'All service completed successfully',
        });

      expect(res.status).toBe(409); // Task still pending
      expect(res.body.error.code).toBe('WORK_ORDER_TASKS_INCOMPLETE');
    });

    it('rejects odometer regression on completion', async () => {
      // Complete the task first
      const taskUpdate = await request(app.getHttpServer())
        .patch(`/api/v1/maintenance/work-orders/${workOrder.id}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ status: 'COMPLETED' });
      expect(taskUpdate.status).toBe(200);

      // Attempt complete with odometer < vehicle current (30000)
      const res = await request(app.getHttpServer())
        .post(`/api/v1/maintenance/work-orders/${workOrder.id}/complete`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: workOrder.version,
          odometerAtCompletion: 29000, // Regression!
          completionNotes: 'Should fail',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('WORK_ORDER_ODOMETER_INVALID');
    });

    it('completes work order, updates vehicle odometer, and marks work order immutable', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/maintenance/work-orders/${workOrder.id}/complete`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: workOrder.version,
          odometerAtCompletion: 30100,
          completionNotes: 'Tested and verified',
        });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'COMPLETED',
        odometerAtCompletion: 30100,
        completionNotes: 'Tested and verified',
      });
      workOrder = res.body;

      // Verify vehicle odometer was updated
      const vRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleC.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);

      expect(vRes.body.odometerKm).toBe(30100);

      // Verify work order is now immutable
      const failTask = await request(app.getHttpServer())
        .post(`/api/v1/maintenance/work-orders/${workOrder.id}/tasks`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ description: 'Late task' });

      expect(failTask.status).toBe(409);
      expect(failTask.body.error.code).toBe('WORK_ORDER_ALREADY_TERMINAL');
    });

    it('converts a maintenance request into a work order', async () => {
      // 1. Create a request
      const reqRes = await request(app.getHttpServer())
        .post('/api/v1/maintenance/requests')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          vehicleId: vehicleC.id,
          title: 'Wiper blades worn',
          priority: 'LOW',
          blocksOperation: false,
        });
      const mReq = reqRes.body;

      // 2. Convert to work order
      const convRes = await request(app.getHttpServer())
        .post(`/api/v1/maintenance/requests/${mReq.id}/convert-to-work-order`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: mReq.version,
          vendorId: vendor.id,
          title: 'Replace wiper blades',
        });

      expect(convRes.status).toBe(201);
      const mwo = convRes.body.workOrder;
      expect(mwo.maintenanceRequestId).toBe(mReq.id);

      // 3. Verify request is now CONVERTED and links work order
      const reqCheck = await request(app.getHttpServer())
        .get(`/api/v1/maintenance/requests/${mReq.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);

      expect(reqCheck.body.status).toBe('CONVERTED');
      expect(reqCheck.body.convertedWorkOrderId).toBe(mwo.id);
    });
  });

  describe('5. Trip Maintenance Gate & Operational Availability', () => {
    let vehicleD: EntityRecord;
    let driverD: EntityRecord;
    let assignmentD: EntityRecord;
    let tripD: EntityRecord;
    let blockingRequest: EntityRecord;

    beforeAll(async () => {
      vehicleD = await createVehicle(ids.organizationA, tokenAdminA, 'GATE01', 50000);
      driverD = await createDriver(ids.organizationA, tokenAdminA, 'GATE01');
      assignmentD = await createAssignment(ids.organizationA, tokenAdminA, vehicleD.id, driverD.id);

      // Create trip in DRAFT
      const tRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          assignmentId: assignmentD.id,
          origin: 'Warehouse Alpha',
          destination: 'Client Site Beta',
        });
      tripD = tRes.body;
    });

    it('blocks trip ready transition when vehicle has active blocking maintenance request', async () => {
      // 1. Create blocking maintenance request
      const reqRes = await request(app.getHttpServer())
        .post('/api/v1/maintenance/requests')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          vehicleId: vehicleD.id,
          title: 'Steering rack failure',
          priority: 'CRITICAL',
          blocksOperation: true,
        });
      expect(reqRes.status).toBe(201);
      blockingRequest = reqRes.body;

      // 2. Operational check endpoint returns false
      const availRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleD.id}/maintenance`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);

      expect(availRes.status).toBe(200);
      expect(availRes.body.isOperationallyBlocked).toBe(true);
      expect(availRes.body.openRequests).toHaveLength(1);

      // 3. Trip markReady fails with 409 VEHICLE_BLOCKED_BY_MAINTENANCE
      const readyRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripD.id}/ready`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: tripD.version });

      expect(readyRes.status).toBe(409);
      expect(readyRes.body.error.code).toBe('VEHICLE_BLOCKED_BY_MAINTENANCE');
    });

    it('allows trip ready and start once blocking maintenance is resolved', async () => {
      // 1. Cancel the blocking request
      await request(app.getHttpServer())
        .post(`/api/v1/maintenance/requests/${blockingRequest.id}/cancel`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: blockingRequest.version,
          cancelReason: 'Inspected and repaired',
        });

      // 2. Operational check is now true
      const availRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleD.id}/maintenance`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA);

      expect(availRes.status).toBe(200);
      expect(availRes.body.isOperationallyBlocked).toBe(false);

      // 3. Trip markReady succeeds
      const readyRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripD.id}/ready`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: tripD.version });

      expect(readyRes.status).toBe(200);
      expect(readyRes.body.status).toBe('READY');
      tripD = readyRes.body;
    });
  });

  describe('6. Outbox Events & Audit Trail Verification', () => {
    it('verifies outbox events and audit logs were persisted for maintenance lifecycle', async () => {
      const outboxEvents = await database.outboxEvent.findMany({
        where: { organizationId: ids.organizationA },
        select: { eventType: true },
      });
      const types = new Set(outboxEvents.map((e) => e.eventType));

      expect(types.has('MaintenanceRequestCreated')).toBe(true);
      expect(types.has('MaintenanceRequestCancelled')).toBe(true);
      expect(types.has('WorkOrderCreated')).toBe(true);
      expect(types.has('WorkOrderStarted')).toBe(true);
      expect(types.has('WorkOrderCompleted')).toBe(true);

      const auditLogs = await database.auditLog.findMany({
        where: { organizationId: ids.organizationA },
        select: { action: true },
      });
      const actions = new Set(auditLogs.map((a) => a.action));

      expect(actions.has('maintenance.vendor.created')).toBe(true);
      expect(actions.has('maintenance.request.created')).toBe(true);
      expect(actions.has('maintenance.plan.created')).toBe(true);
      expect(actions.has('maintenance.work-order.created')).toBe(true);
      expect(actions.has('maintenance.work-order.completed')).toBe(true);
    });
  });
});
