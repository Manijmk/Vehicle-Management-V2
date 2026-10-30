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
  organizationA: '18000000-0000-4000-8000-000000000001',
  organizationB: '18000000-0000-4000-8000-000000000002',
  adminA: '28000000-0000-4000-8000-000000000001',
  viewerA: '28000000-0000-4000-8000-000000000002',
  adminB: '28000000-0000-4000-8000-000000000003',
  membershipAdminA: '38000000-0000-4000-8000-000000000001',
  membershipViewerA: '38000000-0000-4000-8000-000000000002',
  membershipAdminB: '38000000-0000-4000-8000-000000000003',
  roleAdminA: '48000000-0000-4000-8000-000000000001',
  roleViewerA: '48000000-0000-4000-8000-000000000002',
  roleAdminB: '48000000-0000-4000-8000-000000000003',
  preTripTemplateA: '68000000-0000-4000-8000-000000000001',
} as const;

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://vehicle_management:local_vehicle_management@localhost:5432/vehicle_management?schema=public';

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrl,
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'vehicle-management',
  S3_FORCE_PATH_STYLE: 'true',
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY ?? 'vehicle_management',
  S3_SECRET_KEY: process.env.S3_SECRET_KEY ?? 'local_vehicle_management_secret',
  AUTH_LOCAL_SIGNING_KEY: 'integration-signing-key-that-is-at-least-32-characters',
  AUTH_ISSUER: 'integration-test',
  AUTH_AUDIENCE: 'integration-api',
});

// Sample valid file buffers
const validPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const validPngBuffer = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const invalidBuffer = Buffer.from('this is plain text not a pdf or image');

async function seedFixture(database: PrismaClient) {
  await database.organization.createMany({
    data: [
      {
        id: ids.organizationA,
        name: 'Org A Compliance',
        slug: 'org-a-compliance',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.organizationB,
        name: 'Org B Compliance',
        slug: 'org-b-compliance',
        status: PrincipalStatus.ACTIVE,
      },
    ],
  });

  await database.user.createMany({
    data: [
      {
        id: ids.adminA,
        email: 'admin-a-compliance@test.local',
        displayName: 'Admin A Compliance',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.viewerA,
        email: 'viewer-a-compliance@test.local',
        displayName: 'Viewer A Compliance',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.adminB,
        email: 'admin-b-compliance@test.local',
        displayName: 'Admin B Compliance',
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
    const id = `58000000-0000-4000-8000-${String(idx + 1).padStart(12, '0')}`;
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
      {
        id: ids.roleAdminA,
        organizationId: ids.organizationA,
        name: 'Compliance Admin',
        description: 'Admin role for Org A',
      },
      {
        id: ids.roleViewerA,
        organizationId: ids.organizationA,
        name: 'Compliance Viewer',
        description: 'Read-only role for Org A',
      },
      {
        id: ids.roleAdminB,
        organizationId: ids.organizationB,
        name: 'Compliance Admin B',
        description: 'Admin role for Org B',
      },
    ],
  });

  // Role permissions
  await database.rolePermission.createMany({
    data: [
      ...[...permMap.values()].map((pId) => ({ roleId: ids.roleAdminA, permissionId: pId })),
      ...[...permMap.values()].map((pId) => ({ roleId: ids.roleAdminB, permissionId: pId })),
      { roleId: ids.roleViewerA, permissionId: permMap.get('compliance.read')! },
      { roleId: ids.roleViewerA, permissionId: permMap.get('compliance.type.read')! },
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

describe('Compliance and Documents Vertical Slice (e2e)', () => {
  let application: INestApplication;
  let database: PrismaClient;
  let tokens: { adminA: string; viewerA: string; adminB: string };
  let preTripTemplateId: string;
  let preTripTemplateItemId: string;

  beforeAll(async () => {
    database = createDatabaseClient({ databaseUrl });
    await database.$executeRawUnsafe(
      'TRUNCATE TABLE compliance_documents, compliance_document_types, maintenance_work_order_labor, maintenance_work_order_parts, maintenance_work_order_tasks, maintenance_work_orders, vehicle_maintenance_schedules, maintenance_plans, maintenance_requests, maintenance_vendors, inspection_responses, inspections, inspection_template_items, inspection_templates, trip_status_history, trips, vehicle_driver_assignments, driver_status_history, driver_licenses, drivers, vehicle_status_history, vehicles, outbox_events, audit_logs, membership_roles, role_permissions, permissions, roles, organization_memberships, users, organizations RESTART IDENTITY CASCADE',
    );
    await seedFixture(database);

    const config = loadApiConfig();
    const tokenAdapter = new LocalJwtAuthenticationAdapter(config);
    const [adminAToken, viewerAToken, adminBToken] = await Promise.all([
      tokenAdapter.issueDevelopmentToken(ids.adminA, '1h'),
      tokenAdapter.issueDevelopmentToken(ids.viewerA, '1h'),
      tokenAdapter.issueDevelopmentToken(ids.adminB, '1h'),
    ]);

    tokens = {
      adminA: adminAToken,
      viewerA: viewerAToken,
      adminB: adminBToken,
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    application = moduleRef.createNestApplication();
    configureApiApplication(application, { API_CORS_ORIGINS: ['http://localhost:3000'] });
    await application.init();

    const tmplRes = await request(application.getHttpServer())
      .post('/api/v1/inspection-templates')
      .set('authorization', `Bearer ${tokens.adminA}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        name: 'Pre-Trip Inspection',
        type: 'PRE_TRIP',
        items: [
          {
            category: 'Safety',
            prompt: 'Check Brakes',
            required: true,
            severity: 'CRITICAL',
          },
        ],
      });
    preTripTemplateId = tmplRes.body.id;
    preTripTemplateItemId = tmplRes.body.items[0].id;

    await request(application.getHttpServer())
      .post(`/api/v1/inspection-templates/${preTripTemplateId}/activate`)
      .set('authorization', `Bearer ${tokens.adminA}`)
      .set('x-organization-id', ids.organizationA)
      .send({ version: tmplRes.body.version });
  });

  afterAll(async () => {
    await application?.close();
    try {
      await database?.$executeRawUnsafe(
        'TRUNCATE TABLE compliance_documents, compliance_document_types, maintenance_work_order_labor, maintenance_work_order_parts, maintenance_work_order_tasks, maintenance_work_orders, vehicle_maintenance_schedules, maintenance_plans, maintenance_requests, maintenance_vendors, inspection_responses, inspections, inspection_template_items, inspection_templates, trip_status_history, trips, vehicle_driver_assignments, driver_status_history, driver_licenses, drivers, vehicle_status_history, vehicles, outbox_events, audit_logs, membership_roles, role_permissions, permissions, roles, organization_memberships, users, organizations RESTART IDENTITY CASCADE',
      );
    } catch {
      // ignore truncate error on teardown
    }
    await database?.$disconnect();
  });

  describe('Document Types Catalog', () => {
    let createdTypeId: string;

    it('creates a new vehicle compliance document type', async () => {
      const res = await request(application.getHttpServer())
        .post('/api/v1/compliance/document-types')
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          code: 'ROAD_WORTHINESS',
          name: 'Certificate of Roadworthiness',
          description: 'Annual safety certificate',
          subjectType: 'VEHICLE',
          required: true,
          expires: true,
          defaultValidityDays: 365,
          warningDaysBeforeExpiry: 30,
          blocksOperation: true,
        })
        .expect(201);

      expect(res.body).toMatchObject({
        code: 'ROAD_WORTHINESS',
        name: 'Certificate of Roadworthiness',
        subjectType: 'VEHICLE',
        required: true,
        requiresExpiry: true,
        blocksOperation: true,
        status: 'ACTIVE',
        version: 1,
      });

      createdTypeId = res.body.id;
    });

    it('rejects duplicate document type code in the same organization', async () => {
      const res = await request(application.getHttpServer())
        .post('/api/v1/compliance/document-types')
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          code: 'ROAD_WORTHINESS',
          name: 'Duplicate Roadworthiness',
          subjectType: 'VEHICLE',
        })
        .expect(409);

      expect(res.body.error.code).toBe('DOCUMENT_TYPE_CODE_ALREADY_EXISTS');
    });

    it('rejects blocksOperation: true without required: true', async () => {
      const res = await request(application.getHttpServer())
        .post('/api/v1/compliance/document-types')
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          code: 'INVALID_BLOCKING',
          name: 'Invalid Type',
          subjectType: 'VEHICLE',
          required: false,
          blocksOperation: true,
        })
        .expect(400);

      expect(res.body.error.code).toBe('INVALID_POLICY');
    });

    it('updates document type policies', async () => {
      const res = await request(application.getHttpServer())
        .patch(`/api/v1/compliance/document-types/${createdTypeId}`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          name: 'Certificate of Roadworthiness (Updated)',
          warningDaysBeforeExpiry: 45,
          required: false,
          blocksOperation: false,
        })
        .expect(200);

      expect(res.body.name).toBe('Certificate of Roadworthiness (Updated)');
      expect(res.body.warningDaysBeforeExpiry).toBe(45);
      expect(res.body.required).toBe(false);
      expect(res.body.blocksOperation).toBe(false);
      expect(res.body.version).toBe(2);
    });

    it('archives document type and forbids new documents or policy changes', async () => {
      // Create a temporary type to archive
      const created = await request(application.getHttpServer())
        .post('/api/v1/compliance/document-types')
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          code: 'TEMP_ARCHIVE_TYPE',
          name: 'Temporary Type',
          subjectType: 'VEHICLE',
        })
        .expect(201);

      // Archive it
      const res = await request(application.getHttpServer())
        .post(`/api/v1/compliance/document-types/${created.body.id}/archive`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(res.body.status).toBe('ARCHIVED');

      // Attempting to archive again fails with 409
      await request(application.getHttpServer())
        .post(`/api/v1/compliance/document-types/${created.body.id}/archive`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(409);

      // Attempting to patch archived type fails with 409
      await request(application.getHttpServer())
        .patch(`/api/v1/compliance/document-types/${created.body.id}`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ name: 'Changed Name' })
        .expect(409);
    });
  });

  describe('Document Upload, File Validation & Storage', () => {
    let vehicleId: string;
    let docTypeId: string;
    let uploadedDocId: string;

    beforeAll(async () => {
      // Create vehicle
      const vRes = await request(application.getHttpServer())
        .post('/api/v1/vehicles')
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          displayId: 'V-COMPL-01',
          vin: '1HGCR2F83HA000001',
          registration: 'CP-101',
          type: 'VAN',
          fuelType: 'DIESEL',
          model: 'Hilux',
          year: 2023,
          odometerKm: 0,
        });
      expect(vRes.status).toBe(201);
      vehicleId = vRes.body.id;

      // Activate vehicle
      await request(application.getHttpServer())
        .post(`/api/v1/vehicles/${vehicleId}/activate`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA);

      // Create vehicle document type
      const dtRes = await request(application.getHttpServer())
        .post('/api/v1/compliance/document-types')
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          code: 'VEHICLE_FITNESS',
          name: 'Vehicle Fitness Certificate',
          subjectType: 'VEHICLE',
          required: false,
          expires: true,
          warningDaysBeforeExpiry: 30,
          blocksOperation: false,
        });
      docTypeId = dtRes.body.id;
    });

    it('rejects upload with invalid magic bytes (fake PDF content)', async () => {
      const res = await request(application.getHttpServer())
        .post(`/api/v1/vehicles/${vehicleId}/compliance/documents`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .field('documentTypeId', docTypeId)
        .attach('file', invalidBuffer, {
          filename: 'corrupt.pdf',
          contentType: 'application/pdf',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('UNSUPPORTED_DOCUMENT_FILE_TYPE');
    });

    it('successfully uploads valid PDF to object storage and creates ACTIVE document', async () => {
      const issuedOn = new Date();
      const expiresOn = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); // 180 days in future

      const res = await request(application.getHttpServer())
        .post(`/api/v1/vehicles/${vehicleId}/compliance/documents`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .field('documentTypeId', docTypeId)
        .field('documentNumber', 'FIT-99991')
        .field('issuingAuthority', 'Ministry of Transport')
        .field('issuedOn', issuedOn.toISOString().slice(0, 10))
        .field('expiresOn', expiresOn.toISOString().slice(0, 10))
        .field('notes', 'Initial fitness inspection passed')
        .attach('file', validPdfBuffer, {
          filename: 'fitness.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        documentTypeId: docTypeId,
        subjectType: 'VEHICLE',
        vehicleId,
        status: 'ACTIVE',
        documentNumber: 'FIT-99991',
        issuerName: 'Ministry of Transport',
        originalFileName: 'fitness.pdf',
        mimeType: 'application/pdf',
        version: 1,
      });

      expect(res.body.storageETag).toBeDefined();
      uploadedDocId = res.body.id;
    });

    it('rejects uploading a second active document for the same subject and type', async () => {
      const res = await request(application.getHttpServer())
        .post(`/api/v1/vehicles/${vehicleId}/compliance/documents`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .field('documentTypeId', docTypeId)
        .field('documentNumber', 'FIT-99992')
        .attach('file', validPngBuffer, {
          filename: 'fitness2.png',
          contentType: 'image/png',
        })
        .expect(409);

      expect(res.body.error.code).toBe('ACTIVE_DOCUMENT_ALREADY_EXISTS');
    });

    it('generates secure pre-signed download URL and records audit log', async () => {
      const res = await request(application.getHttpServer())
        .get(`/api/v1/compliance/documents/${uploadedDocId}/download-url`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(res.body.downloadUrl).toBeDefined();
      expect(res.body.downloadUrl).toContain('http');
      expect(res.body.expiresInSeconds).toBe(300);
      expect(res.body.fileName).toBe('fitness.pdf');

      // Verify audit record exists
      const audit = await database.auditLog.findFirst({
        where: {
          organizationId: ids.organizationA,
          action: 'compliance.document.download_access_issued',
          entityId: uploadedDocId,
        },
      });
      expect(audit).not.toBeNull();
    });

    it('replaces active document with new file and marks old document as SUPERSEDED', async () => {
      const newExpiresOn = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      const res = await request(application.getHttpServer())
        .post(`/api/v1/compliance/documents/${uploadedDocId}/replace`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .field('documentNumber', 'FIT-99993-RENEWAL')
        .field('expiresOn', newExpiresOn.toISOString().slice(0, 10))
        .field('notes', 'Annual renewal')
        .attach('file', validPdfBuffer, {
          filename: 'fitness_renewal.pdf',
          contentType: 'application/pdf',
        })
        .expect(200);

      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.documentNumber).toBe('FIT-99993-RENEWAL');

      const newDocId = res.body.id;

      // Verify old doc is now SUPERSEDED
      const oldDoc = await database.complianceDocument.findUnique({
        where: { id: uploadedDocId },
      });
      expect(oldDoc?.status).toBe('SUPERSEDED');
      expect(oldDoc?.supersededById).toBe(newDocId);
    });

    it('revokes an active document with mandatory reason', async () => {
      // Find the current active doc
      const activeDoc = await database.complianceDocument.findFirst({
        where: {
          organizationId: ids.organizationA,
          vehicleId,
          status: 'ACTIVE',
        },
      });
      expect(activeDoc).not.toBeNull();

      // Empty reason is rejected
      await request(application.getHttpServer())
        .post(`/api/v1/compliance/documents/${activeDoc!.id}/revoke`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ reason: '' })
        .expect(400);

      // Valid revocation
      const res = await request(application.getHttpServer())
        .post(`/api/v1/compliance/documents/${activeDoc!.id}/revoke`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ reason: 'Failed follow-up emissions re-test' })
        .expect(200);

      expect(res.body.status).toBe('REVOKED');
      expect(res.body.revocationReason).toBe('Failed follow-up emissions re-test');

      // Attempting to revoke again fails with 409
      await request(application.getHttpServer())
        .post(`/api/v1/compliance/documents/${activeDoc!.id}/revoke`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ reason: 'Already revoked' })
        .expect(409);
    });
  });

  describe('Trip Compliance Gates & Operational Blocking', () => {
    let vehicleId: string;
    let driverId: string;
    let assignmentId: string;
    let blockingVehicleDocTypeId: string;
    let blockingDriverDocTypeId: string;

    beforeAll(async () => {
      // 1. Create and activate Vehicle
      const vRes = await request(application.getHttpServer())
        .post('/api/v1/vehicles')
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          displayId: 'V-COMPL-02',
          vin: '1HGCR2F83HA000002',
          registration: 'TP-101',
          type: 'TRUCK',
          fuelType: 'DIESEL',
          model: 'FH16',
          year: 2024,
          odometerKm: 0,
        });
      if (vRes.status !== 201) {
        console.error('vRes error:', vRes.status, vRes.body);
      }
      expect(vRes.status).toBe(201);
      vehicleId = vRes.body.id;

      const vActRes = await request(application.getHttpServer())
        .post(`/api/v1/vehicles/${vehicleId}/activate`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA);
      expect([200, 204]).toContain(vActRes.status);

      // 2. Create and activate Driver with valid driver license
      const dRes = await request(application.getHttpServer())
        .post('/api/v1/drivers')
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          firstName: 'John',
          lastName: 'Driver',
          email: 'john.driver@test.local',
          phone: '+15550100',
        });
      expect(dRes.status).toBe(201);
      driverId = dRes.body.id;

      const licenseExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const licRes = await request(application.getHttpServer())
        .post(`/api/v1/drivers/${driverId}/licenses`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          licenseNumber: 'DL-COMPL-101',
          issuingCountry: 'US',
          issuingRegion: 'CA',
          licenseClasses: ['B', 'C1'],
          issueDate: new Date().toISOString(),
          expiryDate: licenseExpiry.toISOString(),
        });
      expect(licRes.status).toBe(201);

      const dActRes = await request(application.getHttpServer())
        .post(`/api/v1/drivers/${driverId}/activate`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA);
      expect([200, 204]).toContain(dActRes.status);

      // 3. Assign Vehicle to Driver
      const aRes = await request(application.getHttpServer())
        .post('/api/v1/assignments')
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          vehicleId,
          driverId,
          notes: 'Assignment for compliance testing',
        });
      if (aRes.status !== 201) {
        console.error('aRes error:', aRes.status, aRes.body);
      }
      expect(aRes.status).toBe(201);
      assignmentId = aRes.body.id;

      // 4. Create mandatory blocking document types
      const dtV = await request(application.getHttpServer())
        .post('/api/v1/compliance/document-types')
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          code: 'COMMERCIAL_REGISTRATION',
          name: 'Commercial Vehicle Registration',
          subjectType: 'VEHICLE',
          required: true,
          expires: true,
          warningDaysBeforeExpiry: 30,
          blocksOperation: true,
        });
      if (dtV.status !== 201) {
        console.error('dtV error:', dtV.status, dtV.body);
      }
      expect(dtV.status).toBe(201);
      blockingVehicleDocTypeId = dtV.body.id;

      const dtD = await request(application.getHttpServer())
        .post('/api/v1/compliance/document-types')
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          code: 'MEDICAL_FITNESS',
          name: 'Driver Medical Fitness',
          subjectType: 'DRIVER',
          required: true,
          expires: true,
          warningDaysBeforeExpiry: 15,
          blocksOperation: true,
        });
      if (dtD.status !== 201) {
        console.error('dtD error:', dtD.status, dtD.body);
      }
      expect(dtD.status).toBe(201);
      blockingDriverDocTypeId = dtD.body.id;
    });

    it('blocks Trip READY when vehicle is missing required blocking compliance document', async () => {
      // Create a trip in DRAFT
      const tripRes = await request(application.getHttpServer())
        .post('/api/v1/trips')
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          assignmentId,
          origin: 'Warehouse A',
          destination: 'Warehouse B',
        })
        .expect(201);

      const tripId = tripRes.body.id;

      // Attempt mark trip READY -> blocked by VEHICLE_COMPLIANCE_BLOCKED
      const readyRes = await request(application.getHttpServer())
        .post(`/api/v1/trips/${tripId}/ready`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(409);

      expect(readyRes.body.error.code).toBe('VEHICLE_COMPLIANCE_BLOCKED');
      expect(readyRes.body.error.message).toContain('missing required');
    });

    it('unblocks Trip READY once valid vehicle document is uploaded, but blocks on driver doc', async () => {
      // 1. Upload valid vehicle document
      const expiresOn = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
      await request(application.getHttpServer())
        .post(`/api/v1/vehicles/${vehicleId}/compliance/documents`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .field('documentTypeId', blockingVehicleDocTypeId)
        .field('documentNumber', 'REG-VALID-1')
        .field('expiresOn', expiresOn.toISOString().slice(0, 10))
        .attach('file', validPdfBuffer, {
          filename: 'reg.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      // 2. Trip query
      const trip = await database.trip.findFirst({
        where: { organizationId: ids.organizationA, vehicleId, status: 'DRAFT' },
      });

      // 3. Attempt mark trip READY -> now blocked by DRIVER_COMPLIANCE_BLOCKED
      const readyRes = await request(application.getHttpServer())
        .post(`/api/v1/trips/${trip!.id}/ready`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA);

      expect(readyRes.status).toBe(409);

      expect(readyRes.body.error.code).toBe('DRIVER_COMPLIANCE_BLOCKED');
      expect(readyRes.body.error.message).toContain('Driver is operationally blocked');
    });

    it('allows Trip READY and START when both vehicle and driver have valid compliance documents', async () => {
      // 1. Upload valid driver document
      const driverDocExpires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      await request(application.getHttpServer())
        .post(`/api/v1/drivers/${driverId}/compliance/documents`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .field('documentTypeId', blockingDriverDocTypeId)
        .field('documentNumber', 'MED-VALID-1')
        .field('expiresOn', driverDocExpires.toISOString().slice(0, 10))
        .attach('file', validPdfBuffer, {
          filename: 'medical.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      const trip = await database.trip.findFirst({
        where: { organizationId: ids.organizationA, vehicleId, status: 'DRAFT' },
      });

      // 2. Mark READY succeeds
      const readyRes = await request(application.getHttpServer())
        .post(`/api/v1/trips/${trip!.id}/ready`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(readyRes.body.status).toBe('READY');

      // 3. Complete Pre-Trip Inspection
      const inspRes = await request(application.getHttpServer())
        .post('/api/v1/inspections')
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          templateId: preTripTemplateId,
          type: 'PRE_TRIP',
          vehicleId,
          tripId: trip!.id,
        })
        .expect(201);

      const inspId = inspRes.body.id;
      const itemId = preTripTemplateItemId;

      const startInspRes = await request(application.getHttpServer())
        .post(`/api/v1/inspections/${inspId}/start`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: inspRes.body.version })
        .expect(200);

      const saveInspRes = await request(application.getHttpServer())
        .put(`/api/v1/inspections/${inspId}/responses`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: startInspRes.body.version,
          responses: [{ templateItemId: itemId, response: 'PASS', comment: 'All clear' }],
        })
        .expect(200);

      await request(application.getHttpServer())
        .post(`/api/v1/inspections/${inspId}/complete`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: saveInspRes.body.version })
        .expect(200);

      // 4. Start trip succeeds
      const startRes = await request(application.getHttpServer())
        .post(`/api/v1/trips/${trip!.id}/start`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ version: readyRes.body.version, startOdometerKm: 5000 })
        .expect(200);

      expect(startRes.body.status).toBe('IN_PROGRESS');

      // 5. In-progress trip terminates without compliance gating
      const abortRes = await request(application.getHttpServer())
        .post(`/api/v1/trips/${trip!.id}/abort`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          version: startRes.body.version,
          endOdometerKm: 5200,
          abortReason: 'Operational cancellation',
        })
        .expect(200);

      expect(abortRes.body.status).toBe('ABORTED');
    });

    it('document EXPIRING_SOON produces WARNING overall state but does not operationally block trip', async () => {
      // Create vehicle
      const vRes = await request(application.getHttpServer())
        .post('/api/v1/vehicles')
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          displayId: 'V-COMPL-03',
          vin: '1HGCR2F83HA000003',
          registration: 'WN-101',
          type: 'TRUCK',
          fuelType: 'DIESEL',
          model: 'R500',
          year: 2023,
          odometerKm: 0,
        });
      expect(vRes.status).toBe(201);
      const warnVehicleId = vRes.body.id;
      await request(application.getHttpServer())
        .post(`/api/v1/vehicles/${warnVehicleId}/activate`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA);

      // Upload doc expiring in 5 days (warning window is 30 days)
      const expiringDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      await request(application.getHttpServer())
        .post(`/api/v1/vehicles/${warnVehicleId}/compliance/documents`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .field('documentTypeId', blockingVehicleDocTypeId)
        .field('documentNumber', 'EXPIRING-SOON-1')
        .field('expiresOn', expiringDate.toISOString().slice(0, 10))
        .attach('file', validPdfBuffer, {
          filename: 'expiring.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      // Evaluate vehicle compliance
      const evalRes = await request(application.getHttpServer())
        .get(`/api/v1/vehicles/${warnVehicleId}/compliance`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(evalRes.body.evaluation.overallState).toBe('WARNING');
      expect(evalRes.body.evaluation.operationallyBlocked).toBe(false);
      const req = evalRes.body.evaluation.requirements.find(
        (r: { documentTypeId: string }) => r.documentTypeId === blockingVehicleDocTypeId,
      );
      expect(req).toBeDefined();
      expect(req.derivedState).toBe('EXPIRING_SOON');
    });
  });

  describe('Fleet Summary & Exceptions', () => {
    it('returns fleet overview counters and exceptions list', async () => {
      const summaryRes = await request(application.getHttpServer())
        .get('/api/v1/compliance/summary')
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(summaryRes.body).toMatchObject({
        nonCompliantVehicles: expect.any(Number),
        nonCompliantDrivers: expect.any(Number),
        blockedVehicles: expect.any(Number),
        blockedDrivers: expect.any(Number),
        expiringDocuments: expect.any(Number),
      });

      const exceptionsRes = await request(application.getHttpServer())
        .get('/api/v1/compliance/exceptions')
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(exceptionsRes.body.items).toBeDefined();
      expect(Array.isArray(exceptionsRes.body.items)).toBe(true);
      expect(exceptionsRes.body.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Tenant Isolation & RBAC', () => {
    let orgADocTypeId: string;
    let orgADocId: string;
    let isolationVehicleId: string;

    beforeAll(async () => {
      const tRes = await request(application.getHttpServer())
        .post('/api/v1/compliance/document-types')
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          code: 'ORG_A_DOC_TYPE',
          name: 'Org A Specific Document Type',
          subjectType: 'VEHICLE',
        });
      orgADocTypeId = tRes.body.id;

      const vRes = await request(application.getHttpServer())
        .post('/api/v1/vehicles')
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          displayId: 'V-COMPL-04',
          vin: '1HGCR2F83HA000099',
          registration: 'IS-101',
          type: 'CAR',
          fuelType: 'PETROL',
          model: 'Corolla',
          year: 2024,
          odometerKm: 0,
        });
      expect(vRes.status).toBe(201);
      isolationVehicleId = vRes.body.id;

      await request(application.getHttpServer())
        .post(`/api/v1/vehicles/${isolationVehicleId}/activate`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA);

      const dRes = await request(application.getHttpServer())
        .post(`/api/v1/vehicles/${isolationVehicleId}/compliance/documents`)
        .set('authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.organizationA)
        .field('documentTypeId', orgADocTypeId)
        .field('documentNumber', 'ISOLATION-001')
        .attach('file', validPdfBuffer, {
          filename: 'doc.pdf',
          contentType: 'application/pdf',
        });
      orgADocId = dRes.body.id;
    });

    it('prevents Org B from reading Org A document type', async () => {
      await request(application.getHttpServer())
        .get(`/api/v1/compliance/document-types/${orgADocTypeId}`)
        .set('authorization', `Bearer ${tokens.adminB}`)
        .set('x-organization-id', ids.organizationB)
        .expect(404);
    });

    it('prevents Org B from reading or downloading Org A compliance document', async () => {
      await request(application.getHttpServer())
        .get(`/api/v1/compliance/documents/${orgADocId}`)
        .set('authorization', `Bearer ${tokens.adminB}`)
        .set('x-organization-id', ids.organizationB)
        .expect(404);

      await request(application.getHttpServer())
        .get(`/api/v1/compliance/documents/${orgADocId}/download-url`)
        .set('authorization', `Bearer ${tokens.adminB}`)
        .set('x-organization-id', ids.organizationB)
        .expect(404);
    });

    it('enforces RBAC: Viewer can read metadata but cannot upload, replace, revoke, or download', async () => {
      // 1. Viewer can read document types
      await request(application.getHttpServer())
        .get('/api/v1/compliance/document-types')
        .set('authorization', `Bearer ${tokens.viewerA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      // 2. Viewer cannot create document type (403)
      await request(application.getHttpServer())
        .post('/api/v1/compliance/document-types')
        .set('authorization', `Bearer ${tokens.viewerA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          code: 'FORBIDDEN_TYPE',
          name: 'Forbidden',
          subjectType: 'VEHICLE',
        })
        .expect(403);

      // 3. Viewer cannot upload document (403)
      await request(application.getHttpServer())
        .post(`/api/v1/vehicles/${isolationVehicleId}/compliance/documents`)
        .set('authorization', `Bearer ${tokens.viewerA}`)
        .set('x-organization-id', ids.organizationA)
        .field('documentTypeId', orgADocTypeId)
        .attach('file', validPdfBuffer, { filename: 'viewer.pdf', contentType: 'application/pdf' })
        .expect(403);

      // 4. Viewer cannot replace document (403)
      await request(application.getHttpServer())
        .post(`/api/v1/compliance/documents/${orgADocId}/replace`)
        .set('authorization', `Bearer ${tokens.viewerA}`)
        .set('x-organization-id', ids.organizationA)
        .attach('file', validPdfBuffer, { filename: 'replace.pdf', contentType: 'application/pdf' })
        .expect(403);

      // 5. Viewer cannot revoke document (403)
      await request(application.getHttpServer())
        .post(`/api/v1/compliance/documents/${orgADocId}/revoke`)
        .set('authorization', `Bearer ${tokens.viewerA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ reason: 'Unauthorized revoke' })
        .expect(403);

      // 6. Viewer cannot download file (403)
      await request(application.getHttpServer())
        .get(`/api/v1/compliance/documents/${orgADocId}/download-url`)
        .set('authorization', `Bearer ${tokens.viewerA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(403);
    });
  });
});
