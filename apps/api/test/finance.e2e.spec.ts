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
  organizationA: '19000000-0000-4000-8000-000000000001',
  organizationB: '19000000-0000-4000-8000-000000000002',
  adminA: '29000000-0000-4000-8000-000000000001',
  viewerA: '29000000-0000-4000-8000-000000000002',
  adminB: '29000000-0000-4000-8000-000000000003',
  membershipAdminA: '39000000-0000-4000-8000-000000000001',
  membershipViewerA: '39000000-0000-4000-8000-000000000002',
  membershipAdminB: '39000000-0000-4000-8000-000000000003',
  roleAdminA: '49000000-0000-4000-8000-000000000001',
  roleViewerA: '49000000-0000-4000-8000-000000000002',
  roleAdminB: '49000000-0000-4000-8000-000000000003',
  vehicleA: '59000000-0000-4000-8000-000000000001',
  vehicleB: '59000000-0000-4000-8000-000000000002',
  driverA: '69000000-0000-4000-8000-000000000001',
  driverB: '69000000-0000-4000-8000-000000000002',
  assignmentA: '79000000-0000-4000-8000-000000000001',
  tripA: '89000000-0000-4000-8000-000000000001',
  workOrderA: '99000000-0000-4000-8000-000000000001',
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

const sampleReceiptPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

async function cleanFixture(database: PrismaClient) {
  await database.$executeRawUnsafe(
    'TRUNCATE TABLE fuel_transaction_anomalies, fuel_transactions, fuel_import_jobs, expenses, expense_categories, compliance_documents, compliance_document_types, maintenance_work_order_labor, maintenance_work_order_parts, maintenance_work_order_tasks, maintenance_work_orders, vehicle_maintenance_schedules, maintenance_plans, maintenance_requests, maintenance_vendors, inspection_responses, inspections, inspection_template_items, inspection_templates, trip_status_history, trips, vehicle_driver_assignments, driver_status_history, driver_licenses, drivers, vehicle_status_history, vehicles, outbox_events, audit_logs, membership_roles, role_permissions, permissions, roles, organization_memberships, users, organizations RESTART IDENTITY CASCADE',
  );
}

async function seedFixture(database: PrismaClient) {
  await cleanFixture(database);

  // 1. Organizations
  await database.organization.createMany({
    data: [
      {
        id: ids.organizationA,
        name: 'Org A Finance',
        slug: 'org-a-finance',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.organizationB,
        name: 'Org B Finance',
        slug: 'org-b-finance',
        status: PrincipalStatus.ACTIVE,
      },
    ],
  });

  // 2. Users
  await database.user.createMany({
    data: [
      {
        id: ids.adminA,
        email: 'finance.admin.a@example.test',
        displayName: 'Finance Admin A',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.viewerA,
        email: 'finance.viewer.a@example.test',
        displayName: 'Finance Viewer A',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.adminB,
        email: 'finance.admin.b@example.test',
        displayName: 'Finance Admin B',
        status: PrincipalStatus.ACTIVE,
      },
    ],
  });

  // 3. Memberships
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

  // 4. Permissions & Roles
  for (const code of permissionCodes) {
    await database.permission.upsert({
      where: { code },
      create: { code, description: code },
      update: {},
    });
  }

  const allPermissions = await database.permission.findMany();

  // Admin A role
  await database.role.create({
    data: {
      id: ids.roleAdminA,
      organizationId: ids.organizationA,
      name: 'Finance Admin Role',
    },
  });
  await database.rolePermission.createMany({
    data: allPermissions.map((p) => ({
      roleId: ids.roleAdminA,
      permissionId: p.id,
    })),
  });

  // Viewer A role (read only)
  await database.role.create({
    data: {
      id: ids.roleViewerA,
      organizationId: ids.organizationA,
      name: 'Finance Viewer Role',
    },
  });
  const viewerCodes = ['organization.read', 'finance.read', 'fuel.read', 'expense.read'];
  const viewerPerms = allPermissions.filter((p) => viewerCodes.includes(p.code));
  await database.rolePermission.createMany({
    data: viewerPerms.map((p) => ({
      roleId: ids.roleViewerA,
      permissionId: p.id,
    })),
  });

  // Admin B role
  await database.role.create({
    data: {
      id: ids.roleAdminB,
      organizationId: ids.organizationB,
      name: 'Org B Admin Role',
    },
  });
  await database.rolePermission.createMany({
    data: allPermissions.map((p) => ({
      roleId: ids.roleAdminB,
      permissionId: p.id,
    })),
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

  // 5. Vehicles
  await database.vehicle.createMany({
    data: [
      {
        id: ids.vehicleA,
        organizationId: ids.organizationA,
        displayId: 'VEH-9001',
        registration: 'FIN-100',
        vin: 'FINVIN10000000001',
        type: 'VAN',
        fuelType: 'DIESEL',
        model: 'Ford Transit',
        year: 2024,
        odometerKm: 12000,
        status: 'ACTIVE',
      },
      {
        id: ids.vehicleB,
        organizationId: ids.organizationB,
        displayId: 'VEH-9002',
        registration: 'FIN-200',
        vin: 'FINVIN20000000002',
        type: 'TRUCK',
        fuelType: 'DIESEL',
        model: 'Volvo FH',
        year: 2023,
        odometerKm: 45000,
        status: 'ACTIVE',
      },
    ],
  });

  // 6. Drivers
  await database.driver.createMany({
    data: [
      {
        id: ids.driverA,
        organizationId: ids.organizationA,
        displayId: 'DRV-9001',
        employeeNumber: 'EMP-9001',
        firstName: 'Arthur',
        lastName: 'Dent',
        status: 'ACTIVE',
      },
      {
        id: ids.driverB,
        organizationId: ids.organizationB,
        displayId: 'DRV-9002',
        employeeNumber: 'EMP-9002',
        firstName: 'Ford',
        lastName: 'Prefect',
        status: 'ACTIVE',
      },
    ],
  });

  // 7. Assignment & Trip for Org A
  await database.vehicleDriverAssignment.create({
    data: {
      id: ids.assignmentA,
      organizationId: ids.organizationA,
      vehicleId: ids.vehicleA,
      driverId: ids.driverA,
      startedAt: new Date('2026-05-01T08:00:00Z'),
      status: 'ACTIVE',
    },
  });

  await database.trip.create({
    data: {
      id: ids.tripA,
      organizationId: ids.organizationA,
      displayId: 'TRIP-9001',
      assignmentId: ids.assignmentA,
      vehicleId: ids.vehicleA,
      driverId: ids.driverA,
      status: 'IN_PROGRESS',
      origin: 'Warehouse North',
      destination: 'Distribution Hub South',
      startOdometerKm: 12000,
      createdBy: ids.adminA,
      updatedBy: ids.adminA,
    },
  });

  // 8. Maintenance Work Order for Org A
  await database.maintenanceWorkOrder.create({
    data: {
      id: ids.workOrderA,
      organizationId: ids.organizationA,
      displayId: 'WO-9001',
      title: 'Annual brake service',
      vehicleId: ids.vehicleA,
      status: 'COMPLETED',
      description: 'Annual brake pad replacement and fluid top-up',
      createdBy: ids.adminA,
      updatedBy: ids.adminA,
    },
  });
}

describe('Finance Module (Fuel & Expenses) Integration Tests', () => {
  let app: INestApplication;
  let database: PrismaClient;
  let adminTokenA: string;
  let viewerTokenA: string;
  let adminTokenB: string;

  beforeAll(async () => {
    database = createDatabaseClient({ databaseUrl });
    await seedFixture(database);

    const config = loadApiConfig();
    const tokenAdapter = new LocalJwtAuthenticationAdapter(config);

    const [adminAToken, viewerAToken, adminBToken] = await Promise.all([
      tokenAdapter.issueDevelopmentToken(ids.adminA, '1h'),
      tokenAdapter.issueDevelopmentToken(ids.viewerA, '1h'),
      tokenAdapter.issueDevelopmentToken(ids.adminB, '1h'),
    ]);

    adminTokenA = adminAToken;
    viewerTokenA = viewerAToken;
    adminTokenB = adminBToken;

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

  describe('1. Permission-Based Access Control', () => {
    it('rejects unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/fuel')
        .set('x-organization-id', ids.organizationA)
        .expect(401);
    });

    it('rejects viewer attempting to create fuel transaction (lacks fuel.create)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/fuel')
        .set('Authorization', `Bearer ${viewerTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          vehicleId: ids.vehicleA,
          occurredAt: new Date().toISOString(),
          energyType: 'DIESEL',
          quantity: 40,
          unitPrice: 1.5,
          currencyCode: 'USD',
        })
        .expect(403);
    });

    it('rejects viewer attempting to create expense (lacks expense.create)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/expenses')
        .set('Authorization', `Bearer ${viewerTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          categoryId: '00000000-0000-0000-0000-000000000000',
          occurredAt: new Date().toISOString(),
          description: 'Unauthorized expense',
          amount: 50,
          currencyCode: 'USD',
        })
        .expect(403);
    });
  });

  describe('2. Expense Categories Catalog', () => {
    let createdCategoryId: string;

    it('creates an expense category with valid code', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/expense-categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          code: 'BRIDGE_TOLL',
          name: 'Bridge Tolls',
          description: 'Tolls for harbor crossing',
        })
        .expect(201);

      expect(res.body.code).toBe('BRIDGE_TOLL');
      expect(res.body.name).toBe('Bridge Tolls');
      expect(res.body.status).toBe('ACTIVE');
      createdCategoryId = res.body.id;
    });

    it('rejects duplicate category code in same organization', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/expense-categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          code: 'BRIDGE_TOLL',
          name: 'Duplicate Bridge Tolls',
        })
        .expect(409);
    });

    it('lists active expense categories', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/expense-categories')
        .set('Authorization', `Bearer ${viewerTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((c: { code: string }) => c.code === 'BRIDGE_TOLL')).toBe(true);
    });

    it('archives an expense category', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/expense-categories/${createdCategoryId}/archive`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      // Verify category is not listed by default
      const res = await request(app.getHttpServer())
        .get('/api/v1/expense-categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(res.body.some((c: { id: string }) => c.id === createdCategoryId)).toBe(false);

      // But listed when includeArchived=true
      const resAll = await request(app.getHttpServer())
        .get('/api/v1/expense-categories?includeArchived=true')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(resAll.body.some((c: { id: string }) => c.id === createdCategoryId)).toBe(true);
    });
  });

  describe('3. Fuel Transactions Lifecycle & Anomaly Detection', () => {
    let fuelTxId1: string;
    let fuelTxId2: string;

    it('creates manual fuel transaction with trip auto-attribution', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/fuel')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          tripId: ids.tripA,
          occurredAt: '2026-05-10T10:00:00.000Z',
          energyType: 'DIESEL',
          quantity: 50,
          unitPrice: 1.5,
          currencyCode: 'USD',
          odometerKm: 12500,
          stationName: 'Chevron Highway 101',
          referenceNumber: 'REF-FUEL-001',
        })
        .expect(201);

      expect(res.body.displayId).toMatch(/^FUEL-\d+$/);
      expect(res.body.vehicleId).toBe(ids.vehicleA); // auto-attributed from tripA
      expect(res.body.driverId).toBe(ids.driverA); // auto-attributed from tripA
      expect(res.body.totalAmount).toBe(75.0); // 50 * 1.5
      expect(res.body.status).toBe('POSTED');
      expect(res.body.anomalies).toHaveLength(0);

      fuelTxId1 = res.body.id;
    });

    it('detects ODOMETER_REGRESSION and DUPLICATE_REFERENCE anomalies', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/fuel')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          vehicleId: ids.vehicleA,
          occurredAt: '2026-05-11T10:00:00.000Z',
          energyType: 'DIESEL',
          quantity: 40,
          unitPrice: 1.5,
          currencyCode: 'USD',
          odometerKm: 12000, // lower than 12500!
          referenceNumber: 'REF-FUEL-001', // duplicate reference!
        })
        .expect(201);

      expect(res.body.anomalies.length).toBeGreaterThanOrEqual(2);
      const codes = res.body.anomalies.map((a: { code: string }) => a.code);
      expect(codes).toContain('ODOMETER_REGRESSION');
      expect(codes).toContain('DUPLICATE_REFERENCE');

      fuelTxId2 = res.body.id;
    });

    it('attaches receipt and fetches signed download url', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/fuel/${fuelTxId1}/receipt`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .attach('file', sampleReceiptPdf, 'fuel_receipt.pdf')
        .expect(200);

      const urlRes = await request(app.getHttpServer())
        .get(`/api/v1/fuel/${fuelTxId1}/receipt-url`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(urlRes.body.url).toContain('http');
      expect(urlRes.body.fileName).toBe('fuel_receipt.pdf');
    });

    it('voids a fuel transaction with reason', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/fuel/${fuelTxId2}/void`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          reason: 'Test void due to bad odometer regression entry',
        })
        .expect(200);

      expect(res.body.status).toBe('VOIDED');
      expect(res.body.voidReason).toBe('Test void due to bad odometer regression entry');
    });
  });

  describe('4. CSV Fuel Import Preview & Confirmation', () => {
    const csvContent = `date,registration,energy_type,quantity,unit,unit_price,total_amount,currency,odometer,station,reference_number,driver_number
2026-05-12,FIN-100,DIESEL,45,LITER,1.60,72.00,USD,13000,Shell Station,CSV-REF-01,EMP-9001
2026-05-13,UNKNOWN-VEH,DIESEL,50,LITER,1.50,75.00,USD,13500,BP Station,CSV-REF-02,EMP-9001`;

    it('previews CSV fuel import showing matched and unmatched records', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/fuel/import-preview')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ csvContent })
        .expect(200);

      expect(res.body.totalRows).toBe(2);
      expect(res.body.validCount).toBe(1);
      expect(res.body.invalidCount).toBe(1);

      const validRow = res.body.rows.find(
        (r: { registration: string }) => r.registration === 'FIN-100',
      );
      expect(validRow.vehicleMatched).toBe(true);
      expect(validRow.driverMatched).toBe(true);

      const invalidRow = res.body.rows.find(
        (r: { registration: string }) => r.registration === 'UNKNOWN-VEH',
      );
      expect(invalidRow.vehicleMatched).toBe(false);
      expect(invalidRow.errors[0]).toContain('does not exist');
    });

    it('confirms and executes CSV fuel import', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/fuel/import-confirm')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({ csvContent })
        .expect(200);

      expect(res.body.importedCount).toBe(1);
      expect(res.body.failedCount).toBe(1);
      expect(res.body.createdTransactions).toHaveLength(1);
      expect(res.body.createdTransactions[0].source).toBe('CSV_IMPORT');
    });
  });

  describe('5. Expenses Lifecycle & Attributions', () => {
    let activeCategoryId: string;
    let expenseDraftId: string;
    let expensePostedId: string;

    beforeAll(async () => {
      const cat = await database.expenseCategory.create({
        data: {
          id: '89000000-0000-4000-8000-000000000099',
          organizationId: ids.organizationA,
          code: 'GEN_MAINT',
          name: 'General Maintenance',
          status: 'ACTIVE',
          createdBy: ids.adminA,
          updatedBy: ids.adminA,
        },
      });
      activeCategoryId = cat.id;
    });

    it('creates draft expense with work order attribution', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/expenses')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          categoryId: activeCategoryId,
          maintenanceWorkOrderId: ids.workOrderA,
          occurredAt: '2026-05-10T15:00:00.000Z',
          description: 'Payment settlement for brake pads',
          amount: 250.0,
          currencyCode: 'USD',
          vendorName: 'Acme Auto Parts',
          status: 'DRAFT',
        })
        .expect(201);

      expect(res.body.displayId).toMatch(/^EXP-\d+$/);
      expect(res.body.vehicleId).toBe(ids.vehicleA); // auto-attributed from workOrderA
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.amount).toBe(250.0);

      expenseDraftId = res.body.id;
    });

    it('updates draft expense fields', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/expenses/${expenseDraftId}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          amount: 275.5,
          description: 'Revised payment settlement for brake pads and brake fluid',
        })
        .expect(200);

      expect(res.body.amount).toBe(275.5);
      expect(res.body.description).toContain('Revised');
    });

    it('posts draft expense', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/expenses/${expenseDraftId}/post`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(res.body.status).toBe('POSTED');
    });

    it('creates directly posted expense with trip attribution', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/expenses')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          categoryId: activeCategoryId,
          tripId: ids.tripA,
          occurredAt: '2026-05-11T12:00:00.000Z',
          description: 'Overnight truck parking fee',
          amount: 35.0,
          currencyCode: 'USD',
          status: 'POSTED',
        })
        .expect(201);

      expect(res.body.status).toBe('POSTED');
      expect(res.body.tripId).toBe(ids.tripA);
      expect(res.body.vehicleId).toBe(ids.vehicleA); // auto-derived from tripA
      expect(res.body.driverId).toBe(ids.driverA); // auto-derived from tripA

      expensePostedId = res.body.id;
    });

    it('voids posted expense with mandatory reason', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/expenses/${expensePostedId}/void`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .send({
          reason: 'Double-entry reimbursement claimed by driver',
        })
        .expect(200);

      expect(res.body.status).toBe('VOIDED');
      expect(res.body.voidReason).toBe('Double-entry reimbursement claimed by driver');
    });
  });

  describe('6. Multi-Tenant Isolation', () => {
    it('prevents Org B from reading Org A fuel transactions', async () => {
      const fuelA = await database.fuelTransaction.findFirst({
        where: { organizationId: ids.organizationA },
      });
      expect(fuelA).not.toBeNull();

      await request(app.getHttpServer())
        .get(`/api/v1/fuel/${fuelA!.id}`)
        .set('Authorization', `Bearer ${adminTokenB}`)
        .set('x-organization-id', ids.organizationB)
        .expect(404);
    });

    it('prevents Org B from reading Org A expenses', async () => {
      const expA = await database.expense.findFirst({
        where: { organizationId: ids.organizationA },
      });
      expect(expA).not.toBeNull();

      await request(app.getHttpServer())
        .get(`/api/v1/expenses/${expA!.id}`)
        .set('Authorization', `Bearer ${adminTokenB}`)
        .set('x-organization-id', ids.organizationB)
        .expect(404);
    });

    it('prevents Org B from creating fuel transaction referencing Org A vehicle', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/fuel')
        .set('Authorization', `Bearer ${adminTokenB}`)
        .set('x-organization-id', ids.organizationB)
        .send({
          vehicleId: ids.vehicleA, // Vehicle from Org A!
          occurredAt: new Date().toISOString(),
          energyType: 'DIESEL',
          quantity: 40,
          unitPrice: 1.5,
          currencyCode: 'USD',
        })
        .expect(404);
    });
  });

  describe('7. Finance Summaries & Efficiency Metrics', () => {
    it('returns organization-wide finance summary grouped by currency', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/finance/summary')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(res.body.spendByCurrency).toBeInstanceOf(Array);
      expect(res.body.spendByCurrency.length).toBeGreaterThan(0);
      expect(res.body.spendByCurrency[0].currencyCode).toBe('USD');
      expect(res.body.spendByCurrency[0].totalSpend).toBeGreaterThan(0);
      expect(res.body.spendByCategory).toBeInstanceOf(Array);
      expect(res.body.topVehiclesBySpend).toBeInstanceOf(Array);
    });

    it('returns vehicle finance summary and efficiency metrics', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${ids.vehicleA}/finance`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(res.body.vehicleId).toBe(ids.vehicleA);
      expect(res.body.registration).toBe('FIN-100');
      expect(res.body.efficiency).toBeDefined();
      expect(res.body.recentFuelTransactions).toBeInstanceOf(Array);
      expect(res.body.recentExpenses).toBeInstanceOf(Array);
    });

    it('returns trip finance summary', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/trips/${ids.tripA}/finance`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(res.body.tripId).toBe(ids.tripA);
      expect(res.body.spendByCurrency).toBeInstanceOf(Array);
      expect(res.body.fuelTransactions).toBeInstanceOf(Array);
    });
  });
});
