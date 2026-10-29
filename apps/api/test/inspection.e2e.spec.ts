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
  organizationA: '14000000-0000-4000-8000-000000000001',
  organizationB: '14000000-0000-4000-8000-000000000002',
  adminA: '24000000-0000-4000-8000-000000000001',
  viewerA: '24000000-0000-4000-8000-000000000002',
  adminB: '24000000-0000-4000-8000-000000000003',
  membershipAdminA: '34000000-0000-4000-8000-000000000001',
  membershipViewerA: '34000000-0000-4000-8000-000000000002',
  membershipAdminB: '34000000-0000-4000-8000-000000000003',
  roleAdminA: '44000000-0000-4000-8000-000000000001',
  roleViewerA: '44000000-0000-4000-8000-000000000002',
  roleAdminB: '44000000-0000-4000-8000-000000000003',
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
        name: 'Org A Inspections',
        slug: 'org-a-inspections',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.organizationB,
        name: 'Org B Inspections',
        slug: 'org-b-inspections',
        status: PrincipalStatus.ACTIVE,
      },
    ],
  });

  await database.user.createMany({
    data: [
      {
        id: ids.adminA,
        email: 'admin-a-inspections@test.local',
        displayName: 'Admin A Inspections',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.viewerA,
        email: 'viewer-a-inspections@test.local',
        displayName: 'Viewer A Inspections',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.adminB,
        email: 'admin-b-inspections@test.local',
        displayName: 'Admin B Inspections',
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
    const id = `54000000-0000-4000-8000-${String(idx + 1).padStart(12, '0')}`;
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
      { roleId: ids.roleViewerA, permissionId: permMap.get('inspection.read')! },
      { roleId: ids.roleViewerA, permissionId: permMap.get('inspection.template.read')! },
      { roleId: ids.roleViewerA, permissionId: permMap.get('inspection.history.read')! },
      { roleId: ids.roleViewerA, permissionId: permMap.get('vehicle.read')! },
      { roleId: ids.roleViewerA, permissionId: permMap.get('driver.read')! },
      { roleId: ids.roleViewerA, permissionId: permMap.get('trip.read')! },
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

describe('Inspection Vertical Slice E2E', () => {
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

  async function createVehicle(orgId: string, token: string, tag: string) {
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
        model: 'Model Insp',
        year: 2024,
        odometerKm: 1000,
      });
    expect(res.status).toBe(201);
    await request(app.getHttpServer())
      .post(`/api/v1/vehicles/${res.body.id}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({ version: res.body.version });
    return res.body;
  }

  describe('Inspection Template Lifecycle & Immutability', () => {
    let templateId: string;
    let templateVersion: number;

    it('creates an inspection template in DRAFT status', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inspection-templates')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          name: 'Annual Fleet Inspection',
          description: 'Comprehensive annual mechanical inspection',
          type: 'PERIODIC',
          items: [
            {
              category: 'Tires',
              prompt: 'Tire tread depth at or above legal limit',
              severity: 'CRITICAL',
              required: true,
              sortOrder: 1,
            },
            {
              category: 'Interior',
              prompt: 'Horn operational and audible',
              severity: 'NORMAL',
              required: true,
              sortOrder: 2,
            },
          ],
        });

      expect(res.status).toBe(201);
      const body = res.body;
      expect(body.id).toBeDefined();
      expect(body.name).toBe('Annual Fleet Inspection');
      expect(body.type).toBe('PERIODIC');
      expect(body.status).toBe('DRAFT');
      expect(body.version).toBe(1);
      expect(body.items).toHaveLength(2);

      templateId = body.id;
      templateVersion = body.version;
    });

    it('updates a DRAFT inspection template details and items', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/inspection-templates/${templateId}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: templateVersion,
          name: 'Annual Fleet Inspection v2',
          items: [
            {
              category: 'Tires',
              prompt: 'Tire tread depth at or above legal limit',
              severity: 'CRITICAL',
              required: true,
              sortOrder: 1,
            },
            {
              category: 'Interior',
              prompt: 'Horn operational and audible',
              severity: 'NORMAL',
              required: false,
              sortOrder: 2,
            },
            {
              category: 'Lights',
              prompt: 'Headlights and high beams functional',
              severity: 'CRITICAL',
              required: true,
              sortOrder: 3,
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Annual Fleet Inspection v2');
      expect(res.body.items).toHaveLength(3);
      expect(res.body.version).toBe(templateVersion + 1);
      templateVersion = res.body.version;
    });

    it('activates the inspection template (DRAFT -> ACTIVE)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/inspection-templates/${templateId}/activate`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: templateVersion });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.version).toBe(templateVersion + 1);
      templateVersion = res.body.version;
    });

    it('enforces immutability: rejects modifications to ACTIVE template', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/inspection-templates/${templateId}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: templateVersion,
          name: 'Should not allow edit',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INSPECTION_TEMPLATE_IMMUTABLE');
    });

    it('archives the inspection template (ACTIVE -> ARCHIVED)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/inspection-templates/${templateId}/archive`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: templateVersion });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ARCHIVED');
      expect(res.body.version).toBe(templateVersion + 1);
      templateVersion = res.body.version;
    });

    it('enforces immutability: rejects modifications to ARCHIVED template', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/inspection-templates/${templateId}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: templateVersion,
          name: 'Should not allow edit archived',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INSPECTION_TEMPLATE_IMMUTABLE');
    });

    it('rejects activating an already ARCHIVED template', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/inspection-templates/${templateId}/activate`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: templateVersion });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_INSPECTION_TRANSITION');
    });
  });

  describe('Inspection Lifecycle, Response Evaluation & Critical Failure Detection', () => {
    let vehicleA: { id: string };
    let activeTemplateId: string;
    let templateItems: Array<{ id: string; category: string; prompt: string; severity: string }>;

    beforeAll(async () => {
      vehicleA = await createVehicle(ids.organizationA, tokenAdminA, 'INSP1');

      // Create and activate an inspection template
      const res = await request(app.getHttpServer())
        .post('/api/v1/inspection-templates')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          name: 'Walkaround Safety Check',
          type: 'SAFETY',
          items: [
            {
              category: 'Brakes',
              prompt: 'Brake lines and pads undamaged',
              severity: 'CRITICAL',
              required: true,
              sortOrder: 1,
            },
            {
              category: 'Fluids',
              prompt: 'Windshield washer fluid filled',
              severity: 'NORMAL',
              required: true,
              sortOrder: 2,
            },
          ],
        });
      expect(res.status).toBe(201);
      activeTemplateId = res.body.id;
      templateItems = res.body.items;

      await request(app.getHttpServer())
        .post(`/api/v1/inspection-templates/${activeTemplateId}/activate`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: res.body.version });
    });

    it('rejects creating inspection against a DRAFT template', async () => {
      const draftRes = await request(app.getHttpServer())
        .post('/api/v1/inspection-templates')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          name: 'Draft Only Template',
          type: 'CUSTOM',
          items: [
            {
              category: 'General',
              prompt: 'General item',
              severity: 'NORMAL',
              required: true,
              sortOrder: 1,
            },
          ],
        });
      expect(draftRes.status).toBe(201);

      const inspRes = await request(app.getHttpServer())
        .post('/api/v1/inspections')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          templateId: draftRes.body.id,
          type: 'CUSTOM',
          vehicleId: vehicleA.id,
        });

      expect(inspRes.status).toBe(409);
      expect(inspRes.body.error.code).toBe('INSPECTION_TEMPLATE_NOT_ACTIVE');
    });

    it('creates inspection in DRAFT, transitions to IN_PROGRESS, saves all PASS -> derives overall PASS', async () => {
      // 1. Create DRAFT inspection
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/inspections')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          templateId: activeTemplateId,
          type: 'SAFETY',
          vehicleId: vehicleA.id,
          notes: 'Routine pre-shift check',
        });

      expect(createRes.status).toBe(201);
      let insp = createRes.body;
      expect(insp.status).toBe('DRAFT');
      expect(insp.displayId).toMatch(/^INSP-\d{4}$/);
      expect(insp.result).toBeNull();

      // 2. Start inspection -> IN_PROGRESS
      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/inspections/${insp.id}/start`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: insp.version });

      expect(startRes.status).toBe(200);
      insp = startRes.body;
      expect(insp.status).toBe('IN_PROGRESS');
      expect(insp.startedAt).toBeDefined();

      // 3. Save all PASS responses
      const saveRes = await request(app.getHttpServer())
        .put(`/api/v1/inspections/${insp.id}/responses`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: insp.version,
          responses: templateItems.map((item) => ({
            templateItemId: item.id,
            response: 'PASS',
            comment: 'Checked and confirmed',
          })),
        });

      expect(saveRes.status).toBe(200);
      insp = saveRes.body;
      expect(insp.responses).toHaveLength(2);

      // 4. Complete inspection -> COMPLETED with PASS
      const compRes = await request(app.getHttpServer())
        .post(`/api/v1/inspections/${insp.id}/complete`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: insp.version });

      expect(compRes.status).toBe(200);
      insp = compRes.body;
      expect(insp.status).toBe('COMPLETED');
      expect(insp.result).toBe('PASS');
      expect(insp.hasCriticalFailure).toBe(false);
      expect(insp.completedAt).toBeDefined();
    });

    it('derives overall FAIL without critical failure when non-critical item fails', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/inspections')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          templateId: activeTemplateId,
          type: 'SAFETY',
          vehicleId: vehicleA.id,
        });

      let insp = createRes.body;
      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/inspections/${insp.id}/start`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: insp.version });
      insp = startRes.body;

      // Critical item passes, NORMAL item fails
      const saveRes = await request(app.getHttpServer())
        .put(`/api/v1/inspections/${insp.id}/responses`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: insp.version,
          responses: [
            {
              templateItemId: templateItems[0]!.id, // CRITICAL
              response: 'PASS',
            },
            {
              templateItemId: templateItems[1]!.id, // NORMAL
              response: 'FAIL',
              comment: 'Washer fluid empty',
            },
          ],
        });
      insp = saveRes.body;

      const compRes = await request(app.getHttpServer())
        .post(`/api/v1/inspections/${insp.id}/complete`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: insp.version });

      expect(compRes.status).toBe(200);
      insp = compRes.body;
      expect(insp.status).toBe('COMPLETED');
      expect(insp.result).toBe('FAIL');
      expect(insp.hasCriticalFailure).toBe(false);
    });

    it('derives overall FAIL with hasCriticalFailure=true when CRITICAL item fails', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/inspections')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          templateId: activeTemplateId,
          type: 'SAFETY',
          vehicleId: vehicleA.id,
        });

      let insp = createRes.body;
      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/inspections/${insp.id}/start`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: insp.version });
      insp = startRes.body;

      // CRITICAL item fails!
      const saveRes = await request(app.getHttpServer())
        .put(`/api/v1/inspections/${insp.id}/responses`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: insp.version,
          responses: [
            {
              templateItemId: templateItems[0]!.id, // CRITICAL
              response: 'FAIL',
              comment: 'Brake fluid leak observed',
            },
            {
              templateItemId: templateItems[1]!.id, // NORMAL
              response: 'PASS',
            },
          ],
        });
      insp = saveRes.body;

      const compRes = await request(app.getHttpServer())
        .post(`/api/v1/inspections/${insp.id}/complete`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: insp.version });

      expect(compRes.status).toBe(200);
      insp = compRes.body;
      expect(insp.status).toBe('COMPLETED');
      expect(insp.result).toBe('FAIL');
      expect(insp.hasCriticalFailure).toBe(true);
    });

    it('rejects completing an inspection when required responses are missing', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/inspections')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          templateId: activeTemplateId,
          type: 'SAFETY',
          vehicleId: vehicleA.id,
        });

      let insp = createRes.body;
      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/inspections/${insp.id}/start`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: insp.version });
      insp = startRes.body;

      // Only respond to 1 out of 2 required items
      const saveRes = await request(app.getHttpServer())
        .put(`/api/v1/inspections/${insp.id}/responses`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: insp.version,
          responses: [
            {
              templateItemId: templateItems[0]!.id,
              response: 'PASS',
            },
          ],
        });
      insp = saveRes.body;

      const compRes = await request(app.getHttpServer())
        .post(`/api/v1/inspections/${insp.id}/complete`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: insp.version });

      expect(compRes.status).toBe(400);
      expect(compRes.body.error.code).toBe('INSPECTION_REQUIRED_RESPONSES_MISSING');
    });

    it('cancels an inspection with reason and preserves terminal state', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/inspections')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          templateId: activeTemplateId,
          type: 'SAFETY',
          vehicleId: vehicleA.id,
        });

      const insp = createRes.body;

      const cancelRes = await request(app.getHttpServer())
        .post(`/api/v1/inspections/${insp.id}/cancel`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: insp.version,
          cancelReason: 'Vehicle dispatched for emergency before inspection could begin',
        });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.status).toBe('CANCELLED');
      expect(cancelRes.body.cancelReason).toBe(
        'Vehicle dispatched for emergency before inspection could begin',
      );

      // Attempting to cancel again fails with 409
      const cancelAgain = await request(app.getHttpServer())
        .post(`/api/v1/inspections/${insp.id}/cancel`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: cancelRes.body.version,
          cancelReason: 'Cancelled again',
        });

      expect(cancelAgain.status).toBe(409);
      expect(cancelAgain.body.error.code).toBe('INSPECTION_ALREADY_TERMINAL');
    });
  });

  describe('Multi-Tenant Isolation & Security', () => {
    let templateAId: string;
    let inspectionAId: string;
    let vehicleA: { id: string };

    beforeAll(async () => {
      vehicleA = await createVehicle(ids.organizationA, tokenAdminA, 'SEC1');

      const tmplRes = await request(app.getHttpServer())
        .post('/api/v1/inspection-templates')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          name: 'Org A Template',
          type: 'SAFETY',
          items: [
            {
              category: 'General',
              prompt: 'Security prompt',
              severity: 'NORMAL',
              required: true,
              sortOrder: 1,
            },
          ],
        });
      templateAId = tmplRes.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/inspection-templates/${templateAId}/activate`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: tmplRes.body.version });

      const inspRes = await request(app.getHttpServer())
        .post('/api/v1/inspections')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          templateId: templateAId,
          type: 'SAFETY',
          vehicleId: vehicleA.id,
        });
      inspectionAId = inspRes.body.id;
    });

    it('returns 404 when Org B queries Org A template', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/inspection-templates/${templateAId}`)
        .set('Authorization', `Bearer ${tokenAdminB}`)
        .set('x-organization-id', ids.organizationB);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('INSPECTION_TEMPLATE_NOT_FOUND');
    });

    it('returns 404 when Org B queries Org A inspection', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/inspections/${inspectionAId}`)
        .set('Authorization', `Bearer ${tokenAdminB}`)
        .set('x-organization-id', ids.organizationB);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('INSPECTION_NOT_FOUND');
    });

    it('returns 404 when Org B attempts to start Org A inspection', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/inspections/${inspectionAId}/start`)
        .set('Authorization', `Bearer ${tokenAdminB}`)
        .set('x-organization-id', ids.organizationB)
        .send({ version: 1 });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('INSPECTION_NOT_FOUND');
    });

    it('does not list Org A templates or inspections in Org B listings', async () => {
      const tmplList = await request(app.getHttpServer())
        .get('/api/v1/inspection-templates')
        .set('Authorization', `Bearer ${tokenAdminB}`)
        .set('x-organization-id', ids.organizationB);

      expect(tmplList.status).toBe(200);
      expect(tmplList.body.items.some((t: { id: string }) => t.id === templateAId)).toBe(false);

      const inspList = await request(app.getHttpServer())
        .get('/api/v1/inspections')
        .set('Authorization', `Bearer ${tokenAdminB}`)
        .set('x-organization-id', ids.organizationB);

      expect(inspList.status).toBe(200);
      expect(inspList.body.items.some((i: { id: string }) => i.id === inspectionAId)).toBe(false);
    });
  });

  describe('RBAC Permissions Enforcement', () => {
    let vehicleA: { id: string };
    let activeTemplateId: string;
    let inspectionId: string;

    beforeAll(async () => {
      vehicleA = await createVehicle(ids.organizationA, tokenAdminA, 'RBAC1');

      const tmplRes = await request(app.getHttpServer())
        .post('/api/v1/inspection-templates')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          name: 'RBAC Template',
          type: 'SAFETY',
          items: [
            {
              category: 'General',
              prompt: 'RBAC test prompt',
              severity: 'NORMAL',
              required: true,
              sortOrder: 1,
            },
          ],
        });
      activeTemplateId = tmplRes.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/inspection-templates/${activeTemplateId}/activate`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: tmplRes.body.version });

      const inspRes = await request(app.getHttpServer())
        .post('/api/v1/inspections')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          templateId: activeTemplateId,
          type: 'SAFETY',
          vehicleId: vehicleA.id,
        });
      inspectionId = inspRes.body.id;
    });

    it('allows viewer with inspection.read and inspection.template.read to read lists and details', async () => {
      const tmplList = await request(app.getHttpServer())
        .get('/api/v1/inspection-templates')
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .set('x-organization-id', ids.organizationA);
      expect(tmplList.status).toBe(200);

      const tmplDetail = await request(app.getHttpServer())
        .get(`/api/v1/inspection-templates/${activeTemplateId}`)
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .set('x-organization-id', ids.organizationA);
      expect(tmplDetail.status).toBe(200);

      const inspList = await request(app.getHttpServer())
        .get('/api/v1/inspections')
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .set('x-organization-id', ids.organizationA);
      expect(inspList.status).toBe(200);

      const inspDetail = await request(app.getHttpServer())
        .get(`/api/v1/inspections/${inspectionId}`)
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .set('x-organization-id', ids.organizationA);
      expect(inspDetail.status).toBe(200);
    });

    it('forbids viewer from creating inspection templates', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inspection-templates')
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          name: 'Forbidden Template',
          type: 'SAFETY',
          items: [{ category: 'C', prompt: 'P', severity: 'NORMAL', required: true, sortOrder: 1 }],
        });

      expect(res.status).toBe(403);
    });

    it('forbids viewer from creating or starting inspections', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/inspections')
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          templateId: activeTemplateId,
          type: 'SAFETY',
          vehicleId: vehicleA.id,
        });
      expect(createRes.status).toBe(403);

      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/inspections/${inspectionId}/start`)
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: 1 });
      expect(startRes.status).toBe(403);
    });
  });

  describe('Optimistic Concurrency & Audit/Outbox Verification', () => {
    let vehicleA: { id: string };
    let templateId: string;

    beforeAll(async () => {
      vehicleA = await createVehicle(ids.organizationA, tokenAdminA, 'OCC1');

      const tmplRes = await request(app.getHttpServer())
        .post('/api/v1/inspection-templates')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          name: 'OCC Template',
          type: 'SAFETY',
          items: [
            {
              category: 'General',
              prompt: 'OCC prompt',
              severity: 'NORMAL',
              required: true,
              sortOrder: 1,
            },
          ],
        });
      templateId = tmplRes.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/inspection-templates/${templateId}/activate`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: tmplRes.body.version });
    });

    it('rejects version mismatch on inspection transition with CONCURRENCY_CONFLICT (409)', async () => {
      const inspRes = await request(app.getHttpServer())
        .post('/api/v1/inspections')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          templateId,
          type: 'SAFETY',
          vehicleId: vehicleA.id,
        });
      const insp = inspRes.body;

      // Stale version
      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/inspections/${insp.id}/start`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: 999 });

      expect(startRes.status).toBe(409);
      expect(startRes.body.error.code).toBe('CONCURRENCY_CONFLICT');
    });

    it('persists outbox events and immutable audit logs on inspection lifecycle changes', async () => {
      const inspRes = await request(app.getHttpServer())
        .post('/api/v1/inspections')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          templateId,
          type: 'SAFETY',
          vehicleId: vehicleA.id,
        });
      const insp = inspRes.body;

      // Check InspectionCreated outbox event
      const createdOutbox = await database.outboxEvent.findFirst({
        where: {
          aggregateId: insp.id,
          eventType: 'InspectionCreated',
        },
      });
      expect(createdOutbox).toBeDefined();
      expect(createdOutbox?.organizationId).toBe(ids.organizationA);

      // Check audit log
      const auditLog = await database.auditLog.findFirst({
        where: {
          organizationId: ids.organizationA,
          action: 'inspection.created',
          entityId: insp.id,
        },
      });
      expect(auditLog).toBeDefined();
    });
  });
});
