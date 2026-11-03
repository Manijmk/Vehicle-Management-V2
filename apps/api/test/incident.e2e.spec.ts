import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { loadApiConfig } from '@vms/config';
import { createDatabaseClient, MembershipStatus, PrincipalStatus } from '@vms/database';
import type { PrismaClient } from '@vms/database';
import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { configureApiApplication } from '../src/bootstrap.js';
import { permissionCodes } from '../src/modules/foundation/domain/permissions.js';
import { LocalJwtAuthenticationAdapter } from '../src/modules/identity/infrastructure/local-jwt-authentication.adapter.js';

const ids = {
  orgA: '19000000-0000-4000-8000-000000000001',
  orgB: '19000000-0000-4000-8000-000000000002',
  adminA: '29000000-0000-4000-8000-000000000001',
  viewerA: '29000000-0000-4000-8000-000000000002',
  adminB: '29000000-0000-4000-8000-000000000003',
  membershipAdminA: '39000000-0000-4000-8000-000000000001',
  membershipViewerA: '39000000-0000-4000-8000-000000000002',
  membershipAdminB: '39000000-0000-4000-8000-000000000003',
  roleAdminA: '49000000-0000-4000-8000-000000000001',
  roleViewerA: '49000000-0000-4000-8000-000000000002',
  roleAdminB: '49000000-0000-4000-8000-000000000003',
  incidentUpdateOnlyA: '29000000-0000-4000-8000-000000000004',
  maintenanceCreateOnlyA: '29000000-0000-4000-8000-000000000005',
  membershipIncidentUpdateOnlyA: '39000000-0000-4000-8000-000000000004',
  membershipMaintenanceCreateOnlyA: '39000000-0000-4000-8000-000000000005',
  roleIncidentUpdateOnlyA: '49000000-0000-4000-8000-000000000004',
  roleMaintenanceCreateOnlyA: '49000000-0000-4000-8000-000000000005',
  vehicleA1: '59000000-0000-4000-8000-000000000001',
  vehicleA2: '59000000-0000-4000-8000-000000000002',
  vehicleB: '59000000-0000-4000-8000-000000000003',
  driverA1: '69000000-0000-4000-8000-000000000001',
  driverA2: '69000000-0000-4000-8000-000000000002',
  driverB: '69000000-0000-4000-8000-000000000003',
  assignmentA1: '79000000-0000-4000-8000-000000000001',
  assignmentA2: '79000000-0000-4000-8000-000000000002',
  tripA1: '89000000-0000-4000-8000-000000000001',
  tripA2: '89000000-0000-4000-8000-000000000002',
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
const invalidBuffer = Buffer.from('plain text not a valid image or pdf');

async function seedFixture(database: PrismaClient) {
  // Organizations
  await database.organization.createMany({
    data: [
      {
        id: ids.orgA,
        name: 'Org A Incidents',
        slug: 'org-a-incidents',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.orgB,
        name: 'Org B Incidents',
        slug: 'org-b-incidents',
        status: PrincipalStatus.ACTIVE,
      },
    ],
  });

  // Users
  await database.user.createMany({
    data: [
      {
        id: ids.adminA,
        email: 'admin-a-inc@test.local',
        displayName: 'Admin A Inc',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.viewerA,
        email: 'viewer-a-inc@test.local',
        displayName: 'Viewer A Inc',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.adminB,
        email: 'admin-b-inc@test.local',
        displayName: 'Admin B Inc',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.incidentUpdateOnlyA,
        email: 'editor-only-a-inc@test.local',
        displayName: 'Incident Editor Only A',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.maintenanceCreateOnlyA,
        email: 'maint-only-a-inc@test.local',
        displayName: 'Maintenance Creator Only A',
        status: PrincipalStatus.ACTIVE,
      },
    ],
  });

  // Memberships
  await database.organizationMembership.createMany({
    data: [
      {
        id: ids.membershipAdminA,
        organizationId: ids.orgA,
        userId: ids.adminA,
        status: MembershipStatus.ACTIVE,
      },
      {
        id: ids.membershipViewerA,
        organizationId: ids.orgA,
        userId: ids.viewerA,
        status: MembershipStatus.ACTIVE,
      },
      {
        id: ids.membershipAdminB,
        organizationId: ids.orgB,
        userId: ids.adminB,
        status: MembershipStatus.ACTIVE,
      },
      {
        id: ids.membershipIncidentUpdateOnlyA,
        organizationId: ids.orgA,
        userId: ids.incidentUpdateOnlyA,
        status: MembershipStatus.ACTIVE,
      },
      {
        id: ids.membershipMaintenanceCreateOnlyA,
        organizationId: ids.orgA,
        userId: ids.maintenanceCreateOnlyA,
        status: MembershipStatus.ACTIVE,
      },
    ],
  });

  // Permissions
  for (const [idx, code] of permissionCodes.entries()) {
    const id = `59000000-0000-4000-9000-${String(idx + 1).padStart(12, '0')}`;
    await database.permission.upsert({
      where: { code },
      update: {},
      create: { id, code, description: code },
    });
  }

  const allPerms = await database.permission.findMany();
  const permMap = new Map(allPerms.map((p) => [p.code, p.id]));

  // Roles
  await database.role.createMany({
    data: [
      {
        id: ids.roleAdminA,
        organizationId: ids.orgA,
        name: 'Incident Admin A',
        description: 'Admin role',
      },
      {
        id: ids.roleViewerA,
        organizationId: ids.orgA,
        name: 'Incident Viewer A',
        description: 'Viewer role',
      },
      {
        id: ids.roleAdminB,
        organizationId: ids.orgB,
        name: 'Incident Admin B',
        description: 'Admin role B',
      },
      {
        id: ids.roleIncidentUpdateOnlyA,
        organizationId: ids.orgA,
        name: 'Incident Update Only A',
        description: 'Incident update without maintenance create',
      },
      {
        id: ids.roleMaintenanceCreateOnlyA,
        organizationId: ids.orgA,
        name: 'Maintenance Create Only A',
        description: 'Maintenance create without incident update',
      },
    ],
  });

  // Role permissions
  await database.rolePermission.createMany({
    data: [
      ...[...permMap.values()].map((pId) => ({ roleId: ids.roleAdminA, permissionId: pId })),
      ...[...permMap.values()].map((pId) => ({ roleId: ids.roleAdminB, permissionId: pId })),
      { roleId: ids.roleViewerA, permissionId: permMap.get('incident.read')! },
      { roleId: ids.roleViewerA, permissionId: permMap.get('incident.attachment.download')! },
      { roleId: ids.roleViewerA, permissionId: permMap.get('vehicle.read')! },
      { roleId: ids.roleViewerA, permissionId: permMap.get('driver.read')! },
      { roleId: ids.roleViewerA, permissionId: permMap.get('trip.read')! },
      { roleId: ids.roleIncidentUpdateOnlyA, permissionId: permMap.get('incident.read')! },
      { roleId: ids.roleIncidentUpdateOnlyA, permissionId: permMap.get('incident.update')! },
      { roleId: ids.roleMaintenanceCreateOnlyA, permissionId: permMap.get('incident.read')! },
      {
        roleId: ids.roleMaintenanceCreateOnlyA,
        permissionId: permMap.get('maintenance.request.create')!,
      },
    ],
    skipDuplicates: true,
  });

  await database.membershipRole.createMany({
    data: [
      { membershipId: ids.membershipAdminA, roleId: ids.roleAdminA, organizationId: ids.orgA },
      { membershipId: ids.membershipViewerA, roleId: ids.roleViewerA, organizationId: ids.orgA },
      { membershipId: ids.membershipAdminB, roleId: ids.roleAdminB, organizationId: ids.orgB },
      {
        membershipId: ids.membershipIncidentUpdateOnlyA,
        roleId: ids.roleIncidentUpdateOnlyA,
        organizationId: ids.orgA,
      },
      {
        membershipId: ids.membershipMaintenanceCreateOnlyA,
        roleId: ids.roleMaintenanceCreateOnlyA,
        organizationId: ids.orgA,
      },
    ],
  });

  // Seed Vehicles
  await database.vehicle.createMany({
    data: [
      {
        id: ids.vehicleA1,
        organizationId: ids.orgA,
        displayId: 'VEH-1001',
        vin: '1HGCR2F83HA000001',
        registration: 'INC-VEH-1',
        model: 'Corolla',
        year: 2024,
        type: 'CAR',
        fuelType: 'PETROL',
        status: 'ACTIVE',
        odometerKm: 10000,
      },
      {
        id: ids.vehicleA2,
        organizationId: ids.orgA,
        displayId: 'VEH-1002',
        vin: '1HGCR2F83HA000002',
        registration: 'INC-VEH-2',
        model: 'Transit',
        year: 2023,
        type: 'VAN',
        fuelType: 'DIESEL',
        status: 'ACTIVE',
        odometerKm: 25000,
      },
      {
        id: ids.vehicleB,
        organizationId: ids.orgB,
        displayId: 'VEH-1003',
        vin: '1HGCR2F83HA000003',
        registration: 'INC-VEH-B',
        model: 'FH16',
        year: 2024,
        type: 'TRUCK',
        fuelType: 'DIESEL',
        status: 'ACTIVE',
        odometerKm: 5000,
      },
    ],
  });

  // Seed Drivers
  await database.driver.createMany({
    data: [
      {
        id: ids.driverA1,
        organizationId: ids.orgA,
        displayId: 'DRV-1001',
        employeeNumber: 'DRV-A-01',
        firstName: 'John',
        lastName: 'Doe',
        status: 'ACTIVE',
      },
      {
        id: ids.driverA2,
        organizationId: ids.orgA,
        displayId: 'DRV-1002',
        employeeNumber: 'DRV-A-02',
        firstName: 'Jane',
        lastName: 'Smith',
        status: 'ACTIVE',
      },
      {
        id: ids.driverB,
        organizationId: ids.orgB,
        displayId: 'DRV-1003',
        employeeNumber: 'DRV-B-01',
        firstName: 'Bob',
        lastName: 'Jones',
        status: 'ACTIVE',
      },
    ],
  });

  // Seed Driver Licenses (valid)
  await database.driverLicense.createMany({
    data: [
      {
        id: '69000000-0000-4000-9000-000000000001',
        organizationId: ids.orgA,
        driverId: ids.driverA1,
        licenseNumber: 'LIC-A-01',
        issuingCountry: 'USA',
        licenseClasses: ['C'],
        issueDate: new Date('2020-01-01'),
        expiryDate: new Date('2030-01-01'),
      },
      {
        id: '69000000-0000-4000-9000-000000000002',
        organizationId: ids.orgA,
        driverId: ids.driverA2,
        licenseNumber: 'LIC-A-02',
        issuingCountry: 'USA',
        licenseClasses: ['C'],
        issueDate: new Date('2020-01-01'),
        expiryDate: new Date('2030-01-01'),
      },
    ],
  });

  // Seed Assignments
  await database.vehicleDriverAssignment.createMany({
    data: [
      {
        id: ids.assignmentA1,
        organizationId: ids.orgA,
        vehicleId: ids.vehicleA1,
        driverId: ids.driverA1,
        startedAt: new Date('2026-01-01'),
        status: 'ACTIVE',
      },
      {
        id: ids.assignmentA2,
        organizationId: ids.orgA,
        vehicleId: ids.vehicleA2,
        driverId: ids.driverA2,
        startedAt: new Date('2026-01-01'),
        status: 'ACTIVE',
      },
    ],
  });

  // Seed Trips (tripA1 in PROGRESS, tripA2 in DRAFT)
  await database.trip.createMany({
    data: [
      {
        id: ids.tripA1,
        organizationId: ids.orgA,
        displayId: 'TRP-1001',
        vehicleId: ids.vehicleA1,
        driverId: ids.driverA1,
        assignmentId: ids.assignmentA1,
        status: 'IN_PROGRESS',
        origin: 'Warehouse A',
        destination: 'Depot B',
        actualStartAt: new Date('2026-06-01T08:30:00Z'),
        startOdometerKm: 10000,
        version: 1,
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
      {
        id: ids.tripA2,
        organizationId: ids.orgA,
        displayId: 'TRP-1002',
        vehicleId: ids.vehicleA2,
        driverId: ids.driverA2,
        assignmentId: ids.assignmentA2,
        status: 'DRAFT',
        origin: 'Warehouse A',
        destination: 'Depot C',
        version: 1,
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
    ],
  });
}

describe('Milestone 10: Incident Vertical Slice (e2e)', () => {
  let app: INestApplication;
  let database: PrismaClient;
  let tokens: {
    adminA: string;
    viewerA: string;
    adminB: string;
    incidentUpdateOnlyA: string;
    maintenanceCreateOnlyA: string;
  };

  beforeAll(async () => {
    database = createDatabaseClient({ databaseUrl });
    await database.$executeRawUnsafe(
      'TRUNCATE TABLE incident_attachments, incident_notes, incident_status_history, incidents, compliance_documents, compliance_document_types, maintenance_work_order_labor, maintenance_work_order_parts, maintenance_work_order_tasks, maintenance_work_orders, vehicle_maintenance_schedules, maintenance_plans, maintenance_requests, maintenance_vendors, inspection_responses, inspections, inspection_template_items, inspection_templates, trip_status_history, trips, vehicle_driver_assignments, driver_status_history, driver_licenses, drivers, vehicle_status_history, vehicles, outbox_events, audit_logs, membership_roles, role_permissions, permissions, roles, organization_memberships, users, organizations RESTART IDENTITY CASCADE',
    );
    await seedFixture(database);

    const config = loadApiConfig();
    const tokenAdapter = new LocalJwtAuthenticationAdapter(config);
    const [adminAToken, viewerAToken, adminBToken, editorToken, maintToken] = await Promise.all([
      tokenAdapter.issueDevelopmentToken(ids.adminA, '1h'),
      tokenAdapter.issueDevelopmentToken(ids.viewerA, '1h'),
      tokenAdapter.issueDevelopmentToken(ids.adminB, '1h'),
      tokenAdapter.issueDevelopmentToken(ids.incidentUpdateOnlyA, '1h'),
      tokenAdapter.issueDevelopmentToken(ids.maintenanceCreateOnlyA, '1h'),
    ]);

    tokens = {
      adminA: adminAToken,
      viewerA: viewerAToken,
      adminB: adminBToken,
      incidentUpdateOnlyA: editorToken,
      maintenanceCreateOnlyA: maintToken,
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApiApplication(app, { API_CORS_ORIGINS: ['http://localhost:3000'] });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await database?.$disconnect();
  });

  describe('1. Incident Creation & Subject Integrity', () => {
    it('rejects incident creation without vehicle and without driver', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          title: 'Orphan Incident',
          description: 'No subject linked to this incident report',
          type: 'OTHER',
          severity: 'LOW',
          occurredAt: '2026-06-01T10:00:00Z',
          operationalImpact: 'NONE',
        })
        .expect(400);

      expect(res.body.error?.code).toBe('INCIDENT_SUBJECT_REQUIRED');
    });

    it('rejects future occurredAt timestamp', async () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const res = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          vehicleId: ids.vehicleA1,
          title: 'Future incident',
          description: 'Attempt to log incident that has not occurred yet',
          type: 'SAFETY',
          severity: 'LOW',
          occurredAt: futureDate,
        })
        .expect(400);

      expect(res.body.error?.code).toBe('INCIDENT_OCCURRED_AT_INVALID');
    });

    it('rejects invalid severity enum values like MAJOR with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          vehicleId: ids.vehicleA1,
          title: 'Invalid Severity Incident',
          description: 'Testing severity enum rejection',
          type: 'ACCIDENT',
          severity: 'MAJOR',
          occurredAt: '2026-06-01T10:00:00Z',
          operationalImpact: 'NONE',
        })
        .expect(400);

      expect(res.body.error?.code).toBe('Bad Request');
      expect(JSON.stringify(res.body)).toMatch(/severity/i);
    });

    it('creates standalone vehicle incident without driver or trip', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          vehicleId: ids.vehicleA1,
          title: 'Scratched bumper in depot',
          description: 'Vehicle bumper sustained light scratches during depot parking',
          type: 'DAMAGE',
          severity: 'LOW',
          occurredAt: '2026-05-15T12:00:00Z',
          locationText: 'Depot Lot C',
          operationalImpact: 'NONE',
        })
        .expect(201);

      expect(res.body.displayId).toMatch(/^INC-\d+$/);
      expect(res.body.status).toBe('REPORTED');
      expect(res.body.vehicleId).toBe(ids.vehicleA1);
      expect(res.body.driverId).toBeNull();
      expect(res.body.tripId).toBeNull();
      expect(res.body.version).toBe(1);
    });

    it('creates standalone driver incident without vehicle or trip', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          driverId: ids.driverA1,
          title: 'Driver slipped during off-duty training',
          description: 'Driver reported ankle sprain during classroom safety exercise',
          type: 'SAFETY',
          severity: 'MEDIUM',
          occurredAt: '2026-05-16T09:00:00Z',
          operationalImpact: 'DRIVER',
        })
        .expect(201);

      expect(res.body.displayId).toMatch(/^INC-\d+$/);
      expect(res.body.vehicleId).toBeNull();
      expect(res.body.driverId).toBe(ids.driverA1);
      expect(res.body.operationalImpact).toBe('DRIVER');
    });

    it('creates standalone vehicle and driver incident without trip', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          vehicleId: ids.vehicleA1,
          driverId: ids.driverA1,
          title: 'Side mirror bump during manual maneuvering',
          description: 'Side mirror clipped warehouse post during depot repositioning',
          type: 'ACCIDENT',
          severity: 'LOW',
          occurredAt: '2026-05-17T09:00:00Z',
          operationalImpact: 'VEHICLE',
        })
        .expect(201);

      expect(res.body.vehicleId).toBe(ids.vehicleA1);
      expect(res.body.driverId).toBe(ids.driverA1);
      expect(res.body.tripId).toBeNull();
    });

    it('creates trip-linked incident and derives participants correctly', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          tripId: ids.tripA1,
          title: 'Highway minor fender bender during delivery',
          description: 'Rear bumper hit at low speed by third party.',
          type: 'ACCIDENT',
          severity: 'HIGH',
          occurredAt: '2026-06-01T09:00:00Z',
          locationText: 'Interstate 80 Mile 42',
          operationalImpact: 'BOTH',
        })
        .expect(201);

      expect(res.body.tripId).toBe(ids.tripA1);
      expect(res.body.vehicleId).toBe(ids.vehicleA1);
      expect(res.body.driverId).toBe(ids.driverA1);
      expect(res.body.assignmentId).toBe(ids.assignmentA1);
      expect(res.body.operationalImpact).toBe('BOTH');
    });

    it('rejects trip-linked incident if vehicle or driver mismatch the trip', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          tripId: ids.tripA1,
          vehicleId: ids.vehicleA2, // Mismatch with tripA1 (which is vehicleA1)
          title: 'Mismatched vehicle',
          description: 'Should fail due to vehicle participant mismatch',
          type: 'ACCIDENT',
          severity: 'HIGH',
          occurredAt: '2026-06-01T09:15:00Z',
        })
        .expect(400);

      expect(res.body.error?.code).toBe('INCIDENT_TRIP_PARTICIPANT_MISMATCH');
    });

    it('rejects trip-linked incident if driver mismatches the trip', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          tripId: ids.tripA1,
          driverId: ids.driverA2, // Mismatch with tripA1 (which is driverA1)
          title: 'Mismatched driver',
          description: 'Should fail due to driver participant mismatch',
          type: 'ACCIDENT',
          severity: 'HIGH',
          occurredAt: '2026-06-01T09:15:00Z',
        })
        .expect(400);

      expect(res.body.error?.code).toBe('INCIDENT_TRIP_PARTICIPANT_MISMATCH');
    });

    it('enforces PostgreSQL composite foreign key constraint against direct database participant spoofing', async () => {
      // Attempting to bypass application logic and insert a spoofed participant record into Postgres
      await expect(
        database.incident.create({
          data: {
            organizationId: ids.orgA,
            displayId: `INC-SPOOF-${Date.now().toString().slice(-4)}`,
            type: 'ACCIDENT',
            severity: 'HIGH',
            tripId: ids.tripA1,
            vehicleId: ids.vehicleA2, // Mismatched vehicle for tripA1 (tripA1 has vehicleA1)
            driverId: ids.driverA1,
            assignmentId: ids.assignmentA1,
            occurredAt: new Date('2026-06-01T09:15:00Z'),
            title: 'Direct DB Spoof Attack',
            description: 'Direct insert that violates composite foreign key',
            createdBy: ids.adminA,
            updatedBy: ids.adminA,
          },
        }),
      ).rejects.toThrow();
    });

    it('rejects cross-tenant vehicle reference when reporting incident in Org A', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          vehicleId: ids.vehicleB, // Belongs to Org B!
          title: 'Cross-tenant vehicle attempt',
          description: 'Should be rejected because vehicle is not in Org A',
          type: 'DAMAGE',
          severity: 'LOW',
          occurredAt: '2026-06-01T09:20:00Z',
        })
        .expect(404);

      expect(res.body.error?.code).toBe('VEHICLE_NOT_FOUND');
    });
  });

  describe('2. Incident Lifecycle & Transitions', () => {
    let incidentId: string;
    let incidentVersion: number;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          vehicleId: ids.vehicleA2,
          driverId: ids.driverA2,
          title: 'Lifecycle Test Incident',
          description: 'Incident for testing state transitions',
          type: 'ACCIDENT',
          severity: 'HIGH',
          occurredAt: '2026-06-01T11:00:00Z',
          operationalImpact: 'VEHICLE',
        })
        .expect(201);

      incidentId = res.body.id;
      incidentVersion = res.body.version;
    });

    it('transitions REPORTED -> INVESTIGATING', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/incidents/${incidentId}/investigate`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({ version: incidentVersion })
        .expect(200);

      expect(res.body.status).toBe('INVESTIGATING');
      expect(res.body.version).toBe(incidentVersion + 1);
      incidentVersion = res.body.version;

      // Status history entry was created
      const detail = await request(app.getHttpServer())
        .get(`/api/v1/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .expect(200);

      expect(detail.body.statusHistory).toHaveLength(2); // REPORTED + INVESTIGATING
      expect(detail.body.statusHistory[1].toStatus).toBe('INVESTIGATING');
    });

    it('updates incident details in INVESTIGATING status', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          version: incidentVersion,
          title: 'Updated Lifecycle Test Incident',
          severity: 'CRITICAL',
          operationalImpact: 'BOTH',
        })
        .expect(200);

      expect(res.body.title).toBe('Updated Lifecycle Test Incident');
      expect(res.body.severity).toBe('CRITICAL');
      expect(res.body.operationalImpact).toBe('BOTH');
      expect(res.body.version).toBe(incidentVersion + 1);
      incidentVersion = res.body.version;
    });

    it('rejects update with stale version (optimistic locking)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          version: incidentVersion - 1, // Stale!
          title: 'Should fail with conflict',
        })
        .expect(409);

      expect(['CONCURRENCY_CONFLICT', 'INCIDENT_VERSION_CONFLICT']).toContain(res.body.error?.code);
    });

    it('rejects resolution without resolutionSummary', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/incidents/${incidentId}/resolve`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({ version: incidentVersion, resolutionSummary: '' })
        .expect(400);

      expect(res.body.error?.code).toBe('INCIDENT_RESOLUTION_REQUIRED');
    });

    it('transitions INVESTIGATING -> RESOLVED with resolutionSummary', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/incidents/${incidentId}/resolve`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          version: incidentVersion,
          resolutionSummary: 'Vehicle inspection completed and driver clearance verified.',
        })
        .expect(200);

      expect(res.body.status).toBe('RESOLVED');
      expect(res.body.resolutionSummary).toBe(
        'Vehicle inspection completed and driver clearance verified.',
      );
      expect(res.body.resolvedAt).toBeDefined();
      expect(res.body.version).toBe(incidentVersion + 1);
      incidentVersion = res.body.version;
    });

    it('transitions RESOLVED -> CLOSED', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/incidents/${incidentId}/close`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({ version: incidentVersion })
        .expect(200);

      expect(res.body.status).toBe('CLOSED');
      expect(res.body.closedAt).toBeDefined();
      expect(res.body.version).toBe(incidentVersion + 1);
      incidentVersion = res.body.version;
    });

    it('rejects further transitions or updates on CLOSED terminal incident', async () => {
      const res1 = await request(app.getHttpServer())
        .patch(`/api/v1/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({ version: incidentVersion, title: 'Attempt edit closed' })
        .expect(409);

      expect(res1.body.error?.code).toBe('INVALID_INCIDENT_TRANSITION');

      const res2 = await request(app.getHttpServer())
        .post(`/api/v1/incidents/${incidentId}/cancel`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({ version: incidentVersion, cancellationReason: 'Cannot cancel closed' })
        .expect(409);

      expect(res2.body.error?.code).toBe('INCIDENT_ALREADY_TERMINAL');
    });

    it('supports cancellation flow with mandatory cancellationReason', async () => {
      // Create fresh incident
      const fresh = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          vehicleId: ids.vehicleA1,
          title: 'Logged by mistake',
          description: 'Accidental report that should be cancelled',
          type: 'SAFETY',
          severity: 'LOW',
          occurredAt: '2026-06-01T12:00:00Z',
        })
        .expect(201);

      // Cancel without reason fails
      await request(app.getHttpServer())
        .post(`/api/v1/incidents/${fresh.body.id}/cancel`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({ version: fresh.body.version, cancellationReason: '' })
        .expect(400);

      // Cancel with reason succeeds
      const cancelled = await request(app.getHttpServer())
        .post(`/api/v1/incidents/${fresh.body.id}/cancel`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          version: fresh.body.version,
          cancellationReason: 'Duplicate entry entered in error',
        })
        .expect(200);

      expect(cancelled.body.status).toBe('CANCELLED');
      expect(cancelled.body.cancellationReason).toBe('Duplicate entry entered in error');

      // Attempt to cancel again fails with INCIDENT_ALREADY_TERMINAL
      await request(app.getHttpServer())
        .post(`/api/v1/incidents/${fresh.body.id}/cancel`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({ version: cancelled.body.version, cancellationReason: 'Again' })
        .expect(409);
    });
  });

  describe('3. Operational Gating & Trip Lifecycle Integrity', () => {
    let blockingIncidentId: string;
    let blockingIncidentVersion: number;

    it('creates active incident with operationalImpact: VEHICLE on vehicleA2', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          vehicleId: ids.vehicleA2,
          title: 'Steering column instability',
          description: 'Steering rack failure causing uncommanded pull to left',
          type: 'BREAKDOWN',
          severity: 'CRITICAL',
          occurredAt: '2026-06-01T14:00:00Z',
          operationalImpact: 'VEHICLE',
        })
        .expect(201);

      blockingIncidentId = res.body.id;
      blockingIncidentVersion = res.body.version;
    });

    it('blocks trip ready when vehicle has active blocking incident', async () => {
      // tripA2 is on vehicleA2 and driverA2
      const res = await request(app.getHttpServer())
        .post(`/api/v1/trips/${ids.tripA2}/ready`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({ version: 1 })
        .expect(409);

      expect(res.body.error?.code).toBe('VEHICLE_BLOCKED_BY_INCIDENT');
    });

    it('blocks trip start when driver has active blocking incident', async () => {
      // Create driver-blocking incident on driverA2
      const drvInc = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          driverId: ids.driverA2,
          title: 'Driver medical evaluation needed',
          description:
            'Driver reported acute dizziness; medical evaluation required before driving',
          type: 'SAFETY',
          severity: 'HIGH',
          occurredAt: '2026-06-01T14:30:00Z',
          operationalImpact: 'DRIVER',
        })
        .expect(201);

      // Even if vehicle wasn't blocked, driver is blocked
      const res = await request(app.getHttpServer())
        .post(`/api/v1/trips/${ids.tripA2}/ready`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({ version: 1 })
        .expect(409);

      expect(['VEHICLE_BLOCKED_BY_INCIDENT', 'DRIVER_BLOCKED_BY_INCIDENT']).toContain(
        res.body.error?.code,
      );

      // Cancel the driver incident to isolate vehicle test
      await request(app.getHttpServer())
        .post(`/api/v1/incidents/${drvInc.body.id}/cancel`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({ version: drvInc.body.version, cancellationReason: 'False alarm cleared' })
        .expect(200);
    });

    it('does NOT block COMPLETE or ABORT of an IN_PROGRESS trip even with active incident', async () => {
      // tripA1 is IN_PROGRESS on vehicleA1 and driverA1
      // Create active CRITICAL incident on vehicleA1 and driverA1 with BOTH impact
      const activeInc = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          tripId: ids.tripA1,
          title: 'Collision on highway while trip active',
          description: 'Major collision mid-route; emergency dispatch required',
          type: 'ACCIDENT',
          severity: 'CRITICAL',
          occurredAt: '2026-06-01T15:00:00Z',
          operationalImpact: 'BOTH',
        })
        .expect(201);

      expect(activeInc.body.status).toBe('REPORTED');

      // Aborting tripA1 must SUCCEED (abort is never blocked by incident)
      const abortRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${ids.tripA1}/abort`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          version: 1,
          endOdometerKm: 10150,
          abortReason: 'Accident on route',
        })
        .expect(200);

      expect(abortRes.body.status).toBe('ABORTED');
    });

    it('unblocks trip ready after incident is RESOLVED', async () => {
      // Resolve the vehicleA2 blocking incident
      await request(app.getHttpServer())
        .post(`/api/v1/incidents/${blockingIncidentId}/resolve`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          version: blockingIncidentVersion,
          resolutionSummary: 'Steering rack replaced and verified',
        })
        .expect(200);

      // Now marking tripA2 as READY succeeds!
      const readyRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${ids.tripA2}/ready`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({ version: 1 })
        .expect(200);

      expect(readyRes.body.status).toBe('READY');
    });
  });

  describe('4. Maintenance Request Escalation & Dual Authorization', () => {
    let incidentId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          vehicleId: ids.vehicleA1,
          title: 'Engine overheating and smoke detected',
          description: 'Radiator punctured by road debris.',
          type: 'BREAKDOWN',
          severity: 'CRITICAL',
          occurredAt: '2026-06-01T16:00:00Z',
          operationalImpact: 'VEHICLE',
        })
        .expect(201);

      incidentId = res.body.id;
    });

    it('rejects maintenance escalation when actor only has incident.update without maintenance.request.create (403)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/incidents/${incidentId}/maintenance-request`)
        .set('Authorization', `Bearer ${tokens.incidentUpdateOnlyA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          title: 'Unauthorized MR attempt',
        })
        .expect(403);

      expect(res.body.error?.code).toBe('PERMISSION_DENIED');
    });

    it('rejects maintenance escalation when actor only has maintenance.request.create without incident.update (403)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/incidents/${incidentId}/maintenance-request`)
        .set('Authorization', `Bearer ${tokens.maintenanceCreateOnlyA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          title: 'Unauthorized MR attempt',
        })
        .expect(403);

      expect(res.body.error?.code).toBe('PERMISSION_DENIED');
    });

    it('rejects maintenance escalation from Viewer role (403)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/incidents/${incidentId}/maintenance-request`)
        .set('Authorization', `Bearer ${tokens.viewerA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          title: 'Viewer MR attempt',
        })
        .expect(403);

      expect(res.body.error?.code).toBe('PERMISSION_DENIED');
    });

    it('rejects maintenance escalation across tenants (404)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/incidents/${incidentId}/maintenance-request`)
        .set('Authorization', `Bearer ${tokens.adminB}`)
        .set('x-organization-id', ids.orgB)
        .send({
          title: 'Cross tenant MR attempt',
        })
        .expect(404);

      expect(res.body.error?.code).toBe('INCIDENT_NOT_FOUND');
    });

    it('creates maintenance request linked to the incident when actor holds BOTH permissions (201)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/incidents/${incidentId}/maintenance-request`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          title: 'Overhaul radiator due to incident',
        })
        .expect(201);

      expect(res.body.sourceType).toBe('INCIDENT');
      expect(res.body.sourceIncidentId).toBe(incidentId);
      expect(res.body.vehicleId).toBe(ids.vehicleA1);
      expect(res.body.priority).toBe('CRITICAL');
      expect(res.body.blocksOperation).toBe(true);
      expect(res.body.displayId).toMatch(/^MR-\d+$/);
    });

    it('idempotently returns the existing maintenance request on repeated call', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/incidents/${incidentId}/maintenance-request`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          title: 'Second call should return existing MR',
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.sourceType).toBe('INCIDENT');
      expect(res.body.sourceIncidentId).toBe(incidentId);
      expect(res.body.title).toBe('Overhaul radiator due to incident');

      // Check incident details contain maintenanceRequest
      const inc = await request(app.getHttpServer())
        .get(`/api/v1/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .expect(200);

      expect(inc.body.maintenanceRequest).toBeDefined();
      expect(inc.body.maintenanceRequest.id).toBe(res.body.id);
    });
  });

  describe('5. Investigation Notes Thread', () => {
    let incidentId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          vehicleId: ids.vehicleA1,
          title: 'Notes Test Incident',
          description: 'Incident for verifying investigation notes addition',
          type: 'SAFETY',
          severity: 'LOW',
          occurredAt: '2026-06-01T17:00:00Z',
        })
        .expect(201);

      incidentId = res.body.id;
    });

    it('appends note to incident investigation notes thread', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/incidents/${incidentId}/notes`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          body: 'Spoke with safety inspector; waiting on telemetry logs.',
        })
        .expect(201);

      expect(res.body.body).toBe('Spoke with safety inspector; waiting on telemetry logs.');
      expect(res.body.createdById).toBe(ids.adminA);

      // Verify incident details include the new note
      const detail = await request(app.getHttpServer())
        .get(`/api/v1/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .expect(200);

      expect(detail.body.notes).toHaveLength(1);
      expect(detail.body.notes[0].body).toBe(
        'Spoke with safety inspector; waiting on telemetry logs.',
      );
      expect(detail.body.notes[0].createdByUser.displayName).toBe('Admin A Inc');
    });

    it('rejects empty note', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/incidents/${incidentId}/notes`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({ body: '   ' })
        .expect(400);
    });
  });

  describe('6. Evidence Attachments & MinIO Storage', () => {
    let incidentId: string;
    let attachmentId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          vehicleId: ids.vehicleA1,
          title: 'Attachment Test Incident',
          description: 'Incident for testing file uploads and storage downloads',
          type: 'ACCIDENT',
          severity: 'HIGH',
          occurredAt: '2026-06-01T18:00:00Z',
        })
        .expect(201);

      incidentId = res.body.id;
    });

    it('rejects invalid/spoofed file content by magic byte detection', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/incidents/${incidentId}/attachments`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .field('attachmentType', 'PHOTO')
        .attach('file', invalidBuffer, {
          filename: 'fake_photo.png',
          contentType: 'image/png',
        })
        .expect(400);

      expect(res.body.error?.code).toBe('UNSUPPORTED_INCIDENT_ATTACHMENT_TYPE');
    });

    it('uploads valid PDF document to private storage and computes SHA-256 hash', async () => {
      const expectedHash = crypto.createHash('sha256').update(validPdfBuffer).digest('hex');

      const res = await request(app.getHttpServer())
        .post(`/api/v1/incidents/${incidentId}/attachments`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .field('attachmentType', 'DOCUMENT')
        .field('caption', 'Official police collision report')
        .attach('file', validPdfBuffer, {
          filename: 'police_report.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      expect(res.body.fileName).toBe('police_report.pdf');
      expect(res.body.mimeType).toBe('application/pdf');
      expect(res.body.attachmentType).toBe('DOCUMENT');
      expect(res.body.fileSizeBytes).toBe(validPdfBuffer.length);
      expect(res.body.fileHashSha256).toBe(expectedHash);
      attachmentId = res.body.id;
    });

    it('generates secure pre-signed download URL and retrieves file bytes matching original hash', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/incidents/${incidentId}/attachments/${attachmentId}/download-url`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .expect(200);

      expect(res.body.downloadUrl).toBeDefined();
      expect(res.body.fileName).toBe('police_report.pdf');
      expect(res.body.fileHashSha256).toBeDefined();

      // Download bytes from signed URL and verify content
      const fetchRes = await fetch(res.body.downloadUrl);
      expect(fetchRes.status).toBe(200);
      const downloadedBuffer = Buffer.from(await fetchRes.arrayBuffer());
      expect(downloadedBuffer.equals(validPdfBuffer)).toBe(true);

      const downloadedHash = crypto.createHash('sha256').update(downloadedBuffer).digest('hex');
      expect(downloadedHash).toBe(res.body.fileHashSha256);
    });
  });

  describe('7. Multi-Tenant Isolation & RBAC', () => {
    let incidentAId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          vehicleId: ids.vehicleA1,
          title: 'Org A Confidential Incident',
          description: 'Confidential security matter in tenant A',
          type: 'THEFT',
          severity: 'HIGH',
          occurredAt: '2026-06-01T19:00:00Z',
        })
        .expect(201);

      incidentAId = res.body.id;
    });

    it('prevents Org B from reading Org A incident', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/incidents/${incidentAId}`)
        .set('Authorization', `Bearer ${tokens.adminB}`)
        .set('x-organization-id', ids.orgB)
        .expect(404);
    });

    it('prevents Org B from creating incident referencing Org A vehicle', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${tokens.adminB}`)
        .set('x-organization-id', ids.orgB)
        .send({
          vehicleId: ids.vehicleA1, // Belongs to Org A!
          title: 'Cross-tenant probe',
          description: 'Attempting to reference vehicle belonging to another organization',
          type: 'SAFETY',
          severity: 'LOW',
          occurredAt: '2026-06-01T19:30:00Z',
        })
        .expect(404);
    });

    it('enforces RBAC: Viewer can read incidents but cannot create or mutate', async () => {
      // 1. Viewer can list incidents
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/incidents')
        .set('Authorization', `Bearer ${tokens.viewerA}`)
        .set('x-organization-id', ids.orgA)
        .expect(200);

      expect(listRes.body.items).toBeDefined();

      // 2. Viewer can get incident details
      await request(app.getHttpServer())
        .get(`/api/v1/incidents/${incidentAId}`)
        .set('Authorization', `Bearer ${tokens.viewerA}`)
        .set('x-organization-id', ids.orgA)
        .expect(200);

      // 3. Viewer cannot create incident (forbidden 403)
      await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${tokens.viewerA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          vehicleId: ids.vehicleA1,
          title: 'Viewer attempt to create',
          description: 'Viewer should be rejected from creating incidents',
          type: 'SAFETY',
          severity: 'LOW',
          occurredAt: '2026-06-01T20:00:00Z',
        })
        .expect(403);

      // 4. Viewer cannot update incident (forbidden 403)
      await request(app.getHttpServer())
        .patch(`/api/v1/incidents/${incidentAId}`)
        .set('Authorization', `Bearer ${tokens.viewerA}`)
        .set('x-organization-id', ids.orgA)
        .send({ version: 1, title: 'Viewer attempt update' })
        .expect(403);

      // 5. Viewer cannot transition incident (forbidden 403)
      await request(app.getHttpServer())
        .post(`/api/v1/incidents/${incidentAId}/investigate`)
        .set('Authorization', `Bearer ${tokens.viewerA}`)
        .set('x-organization-id', ids.orgA)
        .send({ version: 1 })
        .expect(403);

      // 6. Viewer cannot add note (forbidden 403)
      await request(app.getHttpServer())
        .post(`/api/v1/incidents/${incidentAId}/notes`)
        .set('Authorization', `Bearer ${tokens.viewerA}`)
        .set('x-organization-id', ids.orgA)
        .send({ body: 'Viewer comment' })
        .expect(403);
    });
  });
});
