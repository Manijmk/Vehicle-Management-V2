import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { loadApiConfig } from '@vms/config';
import {
  ComplianceDocumentStatus,
  ComplianceSubjectType,
  createDatabaseClient,
  ExpenseCategoryStatus,
  ExpenseStatus,
  FuelAnomalyCode,
  FuelAnomalySeverity,
  FuelQuantityUnit,
  FuelTransactionSource,
  FuelTransactionStatus,
  FuelType,
  IncidentOperationalImpact,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  MaintenancePriority,
  MaintenanceRequestSource,
  MaintenanceRequestStatus,
  MaintenanceWorkOrderStatus,
  MembershipStatus,
  PrincipalStatus,
  TelemetryDeviceCredentialStatus,
  TelemetryDeviceStatus,
  TelemetryPositionStatus,
  TelemetrySource,
  TripStatus,
  VehicleStatus,
  VehicleType,
} from '@vms/database';
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
  vehicleA1: '58000000-0000-4000-8000-000000000001',
  vehicleA2: '58000000-0000-4000-8000-000000000002',
  vehicleB1: '58000000-0000-4000-8000-000000000003',
  driverA1: '68000000-0000-4000-8000-000000000001',
  driverA2: '68000000-0000-4000-8000-000000000002',
  driverB1: '68000000-0000-4000-8000-000000000003',
  assignmentA1: '79000000-0000-4000-8000-000000000001',
  assignmentA2: '79000000-0000-4000-8000-000000000002',
  assignmentB1: '79000000-0000-4000-8000-000000000003',
  tripA1: '78000000-0000-4000-8000-000000000001',
  tripA2: '78000000-0000-4000-8000-000000000002',
  tripA3: '78000000-0000-4000-8000-000000000003',
  tripB1: '78000000-0000-4000-8000-000000000004',
  deviceA1: '88000000-0000-4000-8000-000000000001',
  deviceA2: '88000000-0000-4000-8000-000000000002',
  deviceB1: '88000000-0000-4000-8000-000000000003',
  expCategoryA1: '98000000-0000-4000-8000-000000000001',
  expCategoryA2: '98000000-0000-4000-8000-000000000002',
  expCategoryB1: '98000000-0000-4000-8000-000000000003',
  userFuelOnly: '28000000-0000-4000-8000-000000000091',
  userExpenseOnly: '28000000-0000-4000-8000-000000000092',
  userDualFinance: '28000000-0000-4000-8000-000000000093',
  membershipFuelOnly: '38000000-0000-4000-8000-000000000091',
  membershipExpenseOnly: '38000000-0000-4000-8000-000000000092',
  membershipDualFinance: '38000000-0000-4000-8000-000000000093',
  roleFuelOnly: '48000000-0000-4000-8000-000000000091',
  roleExpenseOnly: '48000000-0000-4000-8000-000000000092',
  roleDualFinance: '48000000-0000-4000-8000-000000000093',
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

async function cleanFixture(database: PrismaClient) {
  await database.$executeRawUnsafe(
    'TRUNCATE TABLE telemetry_current_positions, telemetry_positions, telemetry_device_credentials, telemetry_device_vehicle_assignments, telemetry_devices, incident_notes, incident_attachments, incident_status_history, incidents, fuel_transaction_anomalies, fuel_transactions, fuel_import_jobs, expenses, expense_categories, compliance_documents, compliance_document_types, maintenance_work_order_labor, maintenance_work_order_parts, maintenance_work_order_tasks, maintenance_work_orders, vehicle_maintenance_schedules, maintenance_plans, maintenance_requests, maintenance_vendors, inspection_responses, inspections, inspection_template_items, inspection_templates, trip_status_history, trips, vehicle_driver_assignments, driver_status_history, driver_licenses, drivers, vehicle_status_history, vehicles, audit_logs, outbox_events, membership_roles, role_permissions, permissions, roles, organization_memberships, users, organizations RESTART IDENTITY CASCADE',
  );
}

async function seedFixture(database: PrismaClient) {
  await cleanFixture(database);

  // 1. Organizations
  await database.organization.createMany({
    data: [
      {
        id: ids.organizationA,
        name: 'Org A Reports',
        slug: 'org-a-reports',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.organizationB,
        name: 'Org B Reports',
        slug: 'org-b-reports',
        status: PrincipalStatus.ACTIVE,
      },
    ],
  });

  // 2. Users
  await database.user.createMany({
    data: [
      {
        id: ids.adminA,
        email: 'report-admin-a@test.local',
        displayName: 'Admin A',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.viewerA,
        email: 'report-viewer-a@test.local',
        displayName: 'Viewer A',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.adminB,
        email: 'report-admin-b@test.local',
        displayName: 'Admin B',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.userFuelOnly,
        email: 'report-fuel-only@test.local',
        displayName: 'Fuel Only User',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.userExpenseOnly,
        email: 'report-expense-only@test.local',
        displayName: 'Expense Only User',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.userDualFinance,
        email: 'report-dual-finance@test.local',
        displayName: 'Dual Finance User',
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
      {
        id: ids.membershipFuelOnly,
        organizationId: ids.organizationA,
        userId: ids.userFuelOnly,
        status: MembershipStatus.ACTIVE,
      },
      {
        id: ids.membershipExpenseOnly,
        organizationId: ids.organizationA,
        userId: ids.userExpenseOnly,
        status: MembershipStatus.ACTIVE,
      },
      {
        id: ids.membershipDualFinance,
        organizationId: ids.organizationA,
        userId: ids.userDualFinance,
        status: MembershipStatus.ACTIVE,
      },
    ],
  });

  // 4. Permissions
  for (const [index, code] of permissionCodes.entries()) {
    await database.permission.upsert({
      where: { code },
      update: {},
      create: {
        id: `58300000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        code,
        description: code,
      },
    });
  }

  // 5. Roles
  await database.role.createMany({
    data: [
      { id: ids.roleAdminA, organizationId: ids.organizationA, name: 'Admin A Role' },
      { id: ids.roleViewerA, organizationId: ids.organizationA, name: 'Viewer A Role' },
      { id: ids.roleAdminB, organizationId: ids.organizationB, name: 'Admin B Role' },
      { id: ids.roleFuelOnly, organizationId: ids.organizationA, name: 'Fuel Only Role' },
      { id: ids.roleExpenseOnly, organizationId: ids.organizationA, name: 'Expense Only Role' },
      { id: ids.roleDualFinance, organizationId: ids.organizationA, name: 'Dual Finance Role' },
    ],
  });

  const allPermissions = await database.permission.findMany();

  // Admin A has all permissions (including report.read and report.export)
  await database.rolePermission.createMany({
    data: allPermissions.map((p) => ({ roleId: ids.roleAdminA, permissionId: p.id })),
  });

  // Viewer A has report.read ONLY (no report.export, no domain permissions)
  const reportReadPerm = allPermissions.find((p) => p.code === 'report.read');
  if (reportReadPerm) {
    await database.rolePermission.create({
      data: { roleId: ids.roleViewerA, permissionId: reportReadPerm.id },
    });
  }

  // Fuel Only: report.read + fuel.read
  const fuelReadPerm = allPermissions.find((p) => p.code === 'fuel.read');
  if (reportReadPerm && fuelReadPerm) {
    await database.rolePermission.createMany({
      data: [
        { roleId: ids.roleFuelOnly, permissionId: reportReadPerm.id },
        { roleId: ids.roleFuelOnly, permissionId: fuelReadPerm.id },
      ],
    });
  }

  // Expense Only: report.read + expense.read
  const expenseReadPerm = allPermissions.find((p) => p.code === 'expense.read');
  if (reportReadPerm && expenseReadPerm) {
    await database.rolePermission.createMany({
      data: [
        { roleId: ids.roleExpenseOnly, permissionId: reportReadPerm.id },
        { roleId: ids.roleExpenseOnly, permissionId: expenseReadPerm.id },
      ],
    });
  }

  // Dual Finance: report.read + fuel.read + expense.read
  if (reportReadPerm && fuelReadPerm && expenseReadPerm) {
    await database.rolePermission.createMany({
      data: [
        { roleId: ids.roleDualFinance, permissionId: reportReadPerm.id },
        { roleId: ids.roleDualFinance, permissionId: fuelReadPerm.id },
        { roleId: ids.roleDualFinance, permissionId: expenseReadPerm.id },
      ],
    });
  }

  // Admin B has all permissions
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
      {
        organizationId: ids.organizationA,
        membershipId: ids.membershipFuelOnly,
        roleId: ids.roleFuelOnly,
      },
      {
        organizationId: ids.organizationA,
        membershipId: ids.membershipExpenseOnly,
        roleId: ids.roleExpenseOnly,
      },
      {
        organizationId: ids.organizationA,
        membershipId: ids.membershipDualFinance,
        roleId: ids.roleDualFinance,
      },
    ],
  });

  // 6. Vehicles
  await database.vehicle.createMany({
    data: [
      {
        id: ids.vehicleA1,
        organizationId: ids.organizationA,
        displayId: 'VH-RPT-001',
        registration: 'RPT-001',
        vin: '1HGCR2F83HA000001',
        model: 'Toyota Prius',
        year: 2023,
        odometerKm: 25000,
        type: VehicleType.CAR,
        status: VehicleStatus.ACTIVE,
        fuelType: FuelType.HYBRID,
      },
      {
        id: ids.vehicleA2,
        organizationId: ids.organizationA,
        displayId: 'VH-RPT-002',
        registration: 'RPT-002',
        vin: '1HGCR2F83HA000002',
        model: 'Ford Transit',
        year: 2022,
        odometerKm: 60000,
        type: VehicleType.VAN,
        status: VehicleStatus.ACTIVE,
        fuelType: FuelType.DIESEL,
      },
      {
        id: ids.vehicleB1,
        organizationId: ids.organizationB,
        displayId: 'VH-RPT-B01',
        registration: 'RPT-B01',
        vin: '1HGCR2F83HA000003',
        model: 'Isuzu D-Max',
        year: 2021,
        odometerKm: 80000,
        type: VehicleType.TRUCK,
        status: VehicleStatus.ACTIVE,
        fuelType: FuelType.DIESEL,
      },
    ],
  });

  // 7. Drivers
  await database.driver.createMany({
    data: [
      {
        id: ids.driverA1,
        organizationId: ids.organizationA,
        displayId: 'DRV-RPT-001',
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice@rpt.local',
        phone: '+15550001',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.driverA2,
        organizationId: ids.organizationA,
        displayId: 'DRV-RPT-002',
        firstName: 'Bob',
        lastName: 'Jones',
        email: 'bob@rpt.local',
        phone: '+15550002',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.driverB1,
        organizationId: ids.organizationB,
        displayId: 'DRV-RPT-B01',
        firstName: 'Charlie',
        lastName: 'Brown',
        email: 'charlie@rpt.local',
        phone: '+15550003',
        status: PrincipalStatus.ACTIVE,
      },
    ],
  });

  // 7b. Assignments
  await database.vehicleDriverAssignment.createMany({
    data: [
      {
        id: ids.assignmentA1,
        organizationId: ids.organizationA,
        vehicleId: ids.vehicleA1,
        driverId: ids.driverA1,
        status: 'ACTIVE',
        startedAt: new Date('2026-11-01T00:00:00Z'),
      },
      {
        id: ids.assignmentA2,
        organizationId: ids.organizationA,
        vehicleId: ids.vehicleA2,
        driverId: ids.driverA2,
        status: 'ACTIVE',
        startedAt: new Date('2026-11-01T00:00:00Z'),
      },
      {
        id: ids.assignmentB1,
        organizationId: ids.organizationB,
        vehicleId: ids.vehicleB1,
        driverId: ids.driverB1,
        status: 'ACTIVE',
        startedAt: new Date('2026-11-01T00:00:00Z'),
      },
    ],
  });

  // 8. Trips (Window of reference: 2026-11-01T00:00:00Z to 2026-11-10T00:00:00Z)
  await database.trip.createMany({
    data: [
      {
        id: ids.tripA1,
        organizationId: ids.organizationA,
        displayId: 'TRP-RPT-001',
        assignmentId: ids.assignmentA1,
        vehicleId: ids.vehicleA1,
        driverId: ids.driverA1,
        status: TripStatus.COMPLETED,
        origin: 'Warehouse A',
        destination: 'Hub 1',
        plannedStartAt: new Date('2026-11-02T08:00:00Z'),
        actualStartAt: new Date('2026-11-02T08:00:00Z'),
        actualEndAt: new Date('2026-11-02T12:00:00Z'), // 4 hours = 14400s
        startOdometerKm: 24500,
        endOdometerKm: 24700, // 200 km
        distanceKm: 200,
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
      {
        id: ids.tripA2,
        organizationId: ids.organizationA,
        displayId: 'TRP-RPT-002',
        assignmentId: ids.assignmentA1,
        vehicleId: ids.vehicleA1,
        driverId: ids.driverA1,
        status: TripStatus.COMPLETED,
        origin: 'Warehouse A',
        destination: 'Hub 2',
        plannedStartAt: new Date('2026-11-04T09:00:00Z'),
        actualStartAt: new Date('2026-11-04T09:00:00Z'),
        actualEndAt: new Date('2026-11-04T15:00:00Z'), // 6 hours = 21600s
        startOdometerKm: 24700,
        endOdometerKm: 25000, // 300 km
        distanceKm: 300,
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
      {
        id: ids.tripA3,
        organizationId: ids.organizationA,
        displayId: 'TRP-RPT-003',
        assignmentId: ids.assignmentA2,
        vehicleId: ids.vehicleA2,
        driverId: ids.driverA2,
        status: TripStatus.CANCELLED,
        origin: 'Depot',
        destination: 'Client',
        plannedStartAt: new Date('2026-11-05T10:00:00Z'),
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
      {
        id: ids.tripB1,
        organizationId: ids.organizationB,
        displayId: 'TRP-RPT-B01',
        assignmentId: ids.assignmentB1,
        vehicleId: ids.vehicleB1,
        driverId: ids.driverB1,
        status: TripStatus.COMPLETED,
        origin: 'Depot B',
        destination: 'Hub B',
        plannedStartAt: new Date('2026-11-03T08:00:00Z'),
        actualStartAt: new Date('2026-11-03T08:00:00Z'),
        actualEndAt: new Date('2026-11-03T18:00:00Z'),
        startOdometerKm: 79500,
        endOdometerKm: 80000, // 500 km
        distanceKm: 500,
        createdBy: ids.adminB,
        updatedBy: ids.adminB,
      },
    ],
  });

  // 9. Fuel Transactions (POSTED vs VOIDED, multi-currency USD & JPY, quantity units)
  await database.fuelTransaction.createMany({
    data: [
      {
        id: 'a8000000-0000-4000-8000-000000000001',
        organizationId: ids.organizationA,
        displayId: 'FT-RPT-001',
        vehicleId: ids.vehicleA1,
        status: FuelTransactionStatus.POSTED,
        occurredAt: new Date('2026-11-02T12:30:00Z'),
        energyType: FuelType.HYBRID,
        quantity: 45.0,
        quantityUnit: FuelQuantityUnit.LITER,
        currencyCode: 'USD',
        unitPrice: 3.5,
        totalAmount: 157.5,
        source: FuelTransactionSource.MANUAL,
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
      {
        id: 'a8000000-0000-4000-8000-000000000002',
        organizationId: ids.organizationA,
        displayId: 'FT-RPT-002',
        vehicleId: ids.vehicleA2,
        status: FuelTransactionStatus.POSTED,
        occurredAt: new Date('2026-11-04T16:00:00Z'),
        energyType: FuelType.DIESEL,
        quantity: 60.0,
        quantityUnit: FuelQuantityUnit.LITER,
        currencyCode: 'USD',
        unitPrice: 4.0,
        totalAmount: 240.0,
        source: FuelTransactionSource.MANUAL,
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
      {
        id: 'a8000000-0000-4000-8000-000000000003',
        organizationId: ids.organizationA,
        displayId: 'FT-RPT-003',
        vehicleId: ids.vehicleA1,
        status: FuelTransactionStatus.VOIDED, // should be excluded!
        occurredAt: new Date('2026-11-03T10:00:00Z'),
        energyType: FuelType.HYBRID,
        quantity: 30.0,
        quantityUnit: FuelQuantityUnit.LITER,
        currencyCode: 'USD',
        unitPrice: 3.5,
        totalAmount: 105.0,
        source: FuelTransactionSource.MANUAL,
        voidReason: 'Duplicate entry',
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
      {
        id: 'a8000000-0000-4000-8000-000000000004',
        organizationId: ids.organizationB,
        displayId: 'FT-RPT-B01',
        vehicleId: ids.vehicleB1,
        status: FuelTransactionStatus.POSTED,
        occurredAt: new Date('2026-11-03T18:30:00Z'),
        energyType: FuelType.DIESEL,
        quantity: 100.0,
        quantityUnit: FuelQuantityUnit.LITER,
        currencyCode: 'USD',
        unitPrice: 4.0,
        totalAmount: 400.0,
        source: FuelTransactionSource.MANUAL,
        createdBy: ids.adminB,
        updatedBy: ids.adminB,
      },
      {
        id: 'a8000000-0000-4000-8000-000000000005',
        organizationId: ids.organizationA,
        displayId: 'FT-RPT-005',
        vehicleId: ids.vehicleA1,
        status: FuelTransactionStatus.POSTED,
        occurredAt: new Date('2026-11-05T12:00:00Z'),
        energyType: FuelType.ELECTRIC,
        quantity: 120.0,
        quantityUnit: FuelQuantityUnit.KWH,
        currencyCode: 'USD',
        unitPrice: 0.3,
        totalAmount: 36.0,
        source: FuelTransactionSource.MANUAL,
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
      {
        id: 'a8000000-0000-4000-8000-000000000006',
        organizationId: ids.organizationA,
        displayId: 'FT-RPT-006',
        vehicleId: ids.vehicleA2,
        status: FuelTransactionStatus.POSTED,
        occurredAt: new Date('2026-11-06T14:00:00Z'),
        energyType: FuelType.GAS,
        quantity: 30.0,
        quantityUnit: FuelQuantityUnit.KG,
        currencyCode: 'USD',
        unitPrice: 3.0,
        totalAmount: 90.0,
        source: FuelTransactionSource.MANUAL,
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
      {
        id: 'a8000000-0000-4000-8000-000000000007',
        organizationId: ids.organizationA,
        displayId: 'FT-RPT-007',
        vehicleId: ids.vehicleA1,
        status: FuelTransactionStatus.POSTED,
        occurredAt: new Date('2026-11-07T16:00:00Z'),
        energyType: FuelType.PETROL,
        quantity: 50.0,
        quantityUnit: FuelQuantityUnit.GALLON,
        currencyCode: 'USD',
        unitPrice: 3.5,
        totalAmount: 175.0,
        source: FuelTransactionSource.MANUAL,
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
    ],
  });

  await database.fuelTransactionAnomaly.createMany({
    data: [
      {
        id: 'b8000000-0000-4000-8000-000000000001',
        organizationId: ids.organizationA,
        fuelTransactionId: 'a8000000-0000-4000-8000-000000000001',
        code: FuelAnomalyCode.ODOMETER_REGRESSION,
        severity: FuelAnomalySeverity.WARNING,
        description: 'Odometer regression detected against previous fill',
      },
      {
        id: 'b8000000-0000-4000-8000-000000000002',
        organizationId: ids.organizationA,
        fuelTransactionId: 'a8000000-0000-4000-8000-000000000001',
        code: FuelAnomalyCode.DUPLICATE_REFERENCE,
        severity: FuelAnomalySeverity.CRITICAL,
        description: 'Duplicate vendor receipt reference',
      },
      {
        id: 'b8000000-0000-4000-8000-000000000003',
        organizationId: ids.organizationA,
        fuelTransactionId: 'a8000000-0000-4000-8000-000000000002',
        code: FuelAnomalyCode.UNUSUAL_UNIT_PRICE,
        severity: FuelAnomalySeverity.INFO,
        description: 'Unit price deviates from historical average',
      },
    ],
  });

  // 10. Expenses & Categories
  await database.expenseCategory.createMany({
    data: [
      {
        id: ids.expCategoryA1,
        organizationId: ids.organizationA,
        code: 'TOLLS',
        name: 'Tolls',
        status: ExpenseCategoryStatus.ACTIVE,
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
      {
        id: ids.expCategoryA2,
        organizationId: ids.organizationA,
        code: 'PARKING',
        name: 'Parking',
        status: ExpenseCategoryStatus.ACTIVE,
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
      {
        id: ids.expCategoryB1,
        organizationId: ids.organizationB,
        code: 'INSURANCE',
        name: 'Insurance',
        status: ExpenseCategoryStatus.ACTIVE,
        createdBy: ids.adminB,
        updatedBy: ids.adminB,
      },
    ],
  });

  await database.expense.createMany({
    data: [
      {
        id: 'b8000000-0000-4000-8000-000000000001',
        organizationId: ids.organizationA,
        displayId: 'EXP-RPT-001',
        vehicleId: ids.vehicleA1,
        categoryId: ids.expCategoryA1,
        status: ExpenseStatus.POSTED,
        occurredAt: new Date('2026-11-02T13:00:00Z'),
        description: 'Toll fee',
        currencyCode: 'USD',
        amount: 25.0,
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
      {
        id: 'b8000000-0000-4000-8000-000000000002',
        organizationId: ids.organizationA,
        displayId: 'EXP-RPT-002',
        vehicleId: ids.vehicleA2,
        categoryId: ids.expCategoryA2,
        status: ExpenseStatus.POSTED,
        occurredAt: new Date('2026-11-04T17:00:00Z'),
        description: 'Parking fee',
        currencyCode: 'JPY', // Segregated currency!
        amount: 3000,
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
      {
        id: 'b8000000-0000-4000-8000-000000000003',
        organizationId: ids.organizationA,
        displayId: 'EXP-RPT-003',
        vehicleId: ids.vehicleA1,
        categoryId: ids.expCategoryA1,
        status: ExpenseStatus.VOIDED, // should be excluded!
        occurredAt: new Date('2026-11-03T11:00:00Z'),
        description: 'Voided toll',
        currencyCode: 'USD',
        amount: 50.0,
        voidReason: 'Voided duplicate toll',
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
      {
        id: 'b8000000-0000-4000-8000-000000000004',
        organizationId: ids.organizationB,
        displayId: 'EXP-RPT-B01',
        vehicleId: ids.vehicleB1,
        categoryId: ids.expCategoryB1,
        status: ExpenseStatus.POSTED,
        occurredAt: new Date('2026-11-03T19:00:00Z'),
        description: 'Insurance payment',
        currencyCode: 'USD',
        amount: 500.0,
        createdBy: ids.adminB,
        updatedBy: ids.adminB,
      },
    ],
  });

  // 11. Maintenance Requests and Work Orders
  await database.maintenanceRequest.createMany({
    data: [
      {
        id: 'c8000000-0000-4000-8000-000000000001',
        organizationId: ids.organizationA,
        displayId: 'MR-RPT-001',
        vehicleId: ids.vehicleA2,
        sourceType: MaintenanceRequestSource.MANUAL,
        priority: MaintenancePriority.HIGH,
        status: MaintenanceRequestStatus.OPEN,
        blocksOperation: true,
        title: 'Brake pads worn',
        description: 'Brakes squealing loudly',
        createdAt: new Date('2026-11-05T08:00:00Z'),
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
      {
        id: 'c8000000-0000-4000-8000-000000000002',
        organizationId: ids.organizationA,
        displayId: 'MR-RPT-002',
        vehicleId: ids.vehicleA1,
        sourceType: MaintenanceRequestSource.MANUAL,
        priority: MaintenancePriority.LOW,
        status: MaintenanceRequestStatus.OPEN,
        blocksOperation: false,
        title: 'Wiper fluid low',
        description: 'Low fluid level',
        createdAt: new Date('2026-11-06T09:00:00Z'),
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
    ],
  });

  await database.maintenanceWorkOrder.createMany({
    data: [
      {
        id: 'c8000000-0000-4000-8000-000000000003',
        organizationId: ids.organizationA,
        displayId: 'WO-RPT-001',
        title: 'Brake replacement',
        vehicleId: ids.vehicleA2,
        status: MaintenanceWorkOrderStatus.COMPLETED,
        openedAt: new Date('2026-11-03T08:00:00Z'),
        completedAt: new Date('2026-11-03T16:00:00Z'), // 8 hours cycle time
        createdAt: new Date('2026-11-03T08:00:00Z'),
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
      {
        id: 'c8000000-0000-4000-8000-000000000004',
        organizationId: ids.organizationA,
        displayId: 'WO-RPT-002',
        title: 'Fluid check',
        vehicleId: ids.vehicleA1,
        status: MaintenanceWorkOrderStatus.IN_PROGRESS,
        openedAt: new Date('2026-11-06T10:00:00Z'),
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
    ],
  });

  await database.maintenanceWorkOrderPart.createMany({
    data: [
      {
        id: 'c8000000-0000-4000-8000-000000000005',
        organizationId: ids.organizationA,
        workOrderId: 'c8000000-0000-4000-8000-000000000003',
        description: 'Brake Pads Set',
        quantity: 1,
        unitCost: 150.0,
        totalCost: 150.0,
      },
    ],
  });

  await database.maintenanceWorkOrderLabor.createMany({
    data: [
      {
        id: 'c8000000-0000-4000-8000-000000000006',
        organizationId: ids.organizationA,
        workOrderId: 'c8000000-0000-4000-8000-000000000003',
        description: 'Brake Installation Labor',
        hours: 2,
        hourlyRate: 100.0,
        totalCost: 200.0,
      },
    ],
  });

  // 12. Incidents
  await database.incident.createMany({
    data: [
      {
        id: 'd8000000-0000-4000-8000-000000000001',
        organizationId: ids.organizationA,
        displayId: 'INC-RPT-001',
        vehicleId: ids.vehicleA1,
        title: 'Minor scratch in parking lot',
        description: 'Scratch on rear bumper',
        type: IncidentType.ACCIDENT,
        severity: IncidentSeverity.LOW,
        status: IncidentStatus.RESOLVED,
        operationalImpact: IncidentOperationalImpact.NONE,
        occurredAt: new Date('2026-11-02T14:00:00Z'),
        resolvedAt: new Date('2026-11-02T18:00:00Z'), // 4 hours to resolve
        resolutionSummary: 'Bumper scratch repaired and buffed out',
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
      {
        id: 'd8000000-0000-4000-8000-000000000002',
        organizationId: ids.organizationA,
        displayId: 'INC-RPT-002',
        vehicleId: ids.vehicleA2,
        title: 'Flat tire on highway',
        description: 'Front left tire punctured',
        type: IncidentType.BREAKDOWN,
        severity: IncidentSeverity.MEDIUM,
        status: IncidentStatus.REPORTED,
        operationalImpact: IncidentOperationalImpact.VEHICLE,
        occurredAt: new Date('2026-11-04T11:00:00Z'),
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
      {
        id: 'd8000000-0000-4000-8000-000000000003',
        organizationId: ids.organizationA,
        displayId: 'INC-RPT-003',
        driverId: ids.driverA1,
        title: 'Speeding citation',
        description: 'Traffic violation issued',
        type: IncidentType.VIOLATION,
        severity: IncidentSeverity.HIGH,
        status: IncidentStatus.INVESTIGATING,
        operationalImpact: IncidentOperationalImpact.DRIVER,
        occurredAt: new Date('2026-11-05T09:00:00Z'),
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
      {
        id: 'd8000000-0000-4000-8000-000000000004',
        organizationId: ids.organizationA,
        displayId: 'INC-RPT-004',
        vehicleId: ids.vehicleA1,
        driverId: ids.driverA1,
        title: 'Collision in loading dock',
        description: 'Severe fender and radiator damage',
        type: IncidentType.DAMAGE,
        severity: IncidentSeverity.CRITICAL,
        status: IncidentStatus.CLOSED,
        operationalImpact: IncidentOperationalImpact.BOTH,
        occurredAt: new Date('2026-11-03T08:00:00Z'),
        resolvedAt: new Date('2026-11-03T16:00:00Z'),
        closedAt: new Date('2026-11-03T20:00:00Z'),
        resolutionSummary: 'Radiator repaired, bumper replaced',
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
      {
        id: 'd8000000-0000-4000-8000-000000000005',
        organizationId: ids.organizationA,
        displayId: 'INC-RPT-005',
        vehicleId: ids.vehicleA2,
        title: 'Stolen equipment falsely reported',
        description: 'False alarm investigation',
        type: IncidentType.THEFT,
        severity: IncidentSeverity.HIGH,
        status: IncidentStatus.CANCELLED,
        cancelReason: 'False alarm confirmed',
        operationalImpact: IncidentOperationalImpact.NONE,
        occurredAt: new Date('2026-11-06T10:00:00Z'),
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
      {
        id: 'd8000000-0000-4000-8000-000000000006',
        organizationId: ids.organizationA,
        displayId: 'INC-RPT-006',
        vehicleId: ids.vehicleA1,
        title: 'Loose wheel nut caught during check',
        description: 'Safety inspection finding',
        type: IncidentType.SAFETY,
        severity: IncidentSeverity.MEDIUM,
        status: IncidentStatus.RESOLVED,
        operationalImpact: IncidentOperationalImpact.VEHICLE,
        occurredAt: new Date('2026-11-07T12:00:00Z'),
        resolvedAt: new Date('2026-11-07T14:00:00Z'),
        resolutionSummary: 'Torqued to specification',
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
      {
        id: 'd8000000-0000-4000-8000-000000000007',
        organizationId: ids.organizationA,
        displayId: 'INC-RPT-007',
        vehicleId: ids.vehicleA1,
        title: 'Customer complaint about delayed arrival',
        description: 'Operational delay notice',
        type: IncidentType.OTHER,
        severity: IncidentSeverity.LOW,
        status: IncidentStatus.REPORTED,
        operationalImpact: IncidentOperationalImpact.NONE,
        occurredAt: new Date('2026-11-08T15:00:00Z'),
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
    ],
  });

  // 13. Telemetry Devices & Positions
  await database.telemetryDevice.createMany({
    data: [
      {
        id: ids.deviceA1,
        organizationId: ids.organizationA,
        displayId: 'DEV-RPT-001',
        name: 'Teltonika Tracker 1',
        identifier: 'DEV-RPT-001',
        status: TelemetryDeviceStatus.ACTIVE,
      },
      {
        id: ids.deviceA2,
        organizationId: ids.organizationA,
        displayId: 'DEV-RPT-002',
        name: 'Teltonika Tracker 2',
        identifier: 'DEV-RPT-002',
        status: TelemetryDeviceStatus.INACTIVE,
      },
      {
        id: '88000000-0000-4000-8000-000000000099',
        organizationId: ids.organizationA,
        displayId: 'DEV-RPT-003',
        name: 'Teltonika Tracker 3',
        identifier: 'DEV-RPT-003',
        status: TelemetryDeviceStatus.SUSPENDED,
      },
      {
        id: ids.deviceB1,
        organizationId: ids.organizationB,
        displayId: 'DEV-RPT-B01',
        name: 'Teltonika Tracker B',
        identifier: 'DEV-RPT-B01',
        status: TelemetryDeviceStatus.ACTIVE,
      },
    ],
  });

  await database.telemetryDeviceVehicleAssignment.createMany({
    data: [
      {
        id: 'e8000000-0000-4000-8000-000000000001',
        organizationId: ids.organizationA,
        deviceId: ids.deviceA1,
        vehicleId: ids.vehicleA1,
        assignedAt: new Date('2026-11-01T00:00:00Z'),
        assignedBy: ids.adminA,
      },
    ],
  });

  // Historical positions for deviceA1
  await database.telemetryPosition.createMany({
    data: [
      {
        id: 'f8000000-0000-4000-8000-000000000001',
        organizationId: ids.organizationA,
        deviceId: ids.deviceA1,
        vehicleId: ids.vehicleA1,
        tripId: ids.tripA1,
        latitude: 37.7749,
        longitude: -122.4194,
        altitudeM: 15,
        speedKmh: 40.0,
        heading: 180,
        capturedAt: new Date('2026-11-02T08:30:00Z'),
        receivedAt: new Date('2026-11-02T08:30:01Z'),
        source: TelemetrySource.DEVICE,
        status: TelemetryPositionStatus.VALID,
      },
      {
        id: 'f8000000-0000-4000-8000-000000000002',
        organizationId: ids.organizationA,
        deviceId: ids.deviceA1,
        vehicleId: ids.vehicleA1,
        tripId: ids.tripA1,
        latitude: 37.775,
        longitude: -122.4195,
        altitudeM: 15,
        speedKmh: 42.0,
        heading: 180,
        capturedAt: new Date('2026-11-02T08:31:00Z'),
        receivedAt: new Date('2026-11-02T08:31:01Z'),
        source: TelemetrySource.DEVICE,
        status: TelemetryPositionStatus.VALID,
      },
      {
        id: 'f8000000-0000-4000-8000-000000000003',
        organizationId: ids.organizationA,
        deviceId: ids.deviceA2,
        vehicleId: ids.vehicleA2,
        latitude: 37.7749,
        longitude: -122.4194,
        altitudeM: 15,
        speedKmh: 35.0,
        heading: 90,
        capturedAt: new Date(Date.now() - 15 * 60 * 1000),
        receivedAt: new Date(),
        source: TelemetrySource.DEVICE,
        status: TelemetryPositionStatus.VALID,
      },
    ],
  });

  // Current position for deviceA1 (fresh, captured 1 min ago <= 2m)
  await database.telemetryCurrentPosition.create({
    data: {
      organizationId: ids.organizationA,
      vehicleId: ids.vehicleA1,
      deviceId: ids.deviceA1,
      positionId: 'f8000000-0000-4000-8000-000000000002',
      latitude: 37.775,
      longitude: -122.4195,
      speedKmh: 42.0,
      heading: 180,
      capturedAt: new Date(Date.now() - 1 * 60 * 1000), // 1 minute ago -> FRESH (<=2m)
      receivedAt: new Date(),
      source: TelemetrySource.DEVICE,
      status: TelemetryPositionStatus.VALID,
    },
  });

  // Current position for vehicleA2 (stale, captured 15 min ago: >2m and <=60m)
  await database.telemetryCurrentPosition.create({
    data: {
      organizationId: ids.organizationA,
      vehicleId: ids.vehicleA2,
      deviceId: ids.deviceA2,
      positionId: 'f8000000-0000-4000-8000-000000000003',
      latitude: 37.7749,
      longitude: -122.4194,
      speedKmh: 35.0,
      heading: 90,
      capturedAt: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago -> STALE
      receivedAt: new Date(),
      source: TelemetrySource.DEVICE,
      status: TelemetryPositionStatus.VALID,
    },
  });

  // Device credential in REVOKED status (must NOT be counted as a device)
  await database.telemetryDeviceCredential.create({
    data: {
      id: '99000000-0000-4000-8000-000000000001',
      organizationId: ids.organizationA,
      deviceId: ids.deviceA1,
      keyPrefix: 'vms_revk',
      secretHash: 'hashed-secret-value-1234567890',
      status: TelemetryDeviceCredentialStatus.REVOKED,
      createdAt: new Date(),
    },
  });

  // 14. Compliance Documents & Types
  await database.complianceDocumentType.createMany({
    data: [
      {
        id: '11000000-0000-4000-8000-000000000001',
        organizationId: ids.organizationA,
        name: 'Vehicle Registration',
        code: 'VEH_REG',
        subjectType: ComplianceSubjectType.VEHICLE,
        required: true,
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
      {
        id: '11000000-0000-4000-8000-000000000002',
        organizationId: ids.organizationA,
        name: 'Annual Inspection',
        code: 'ANNUAL_INSP',
        subjectType: ComplianceSubjectType.VEHICLE,
        required: true,
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
    ],
  });

  await database.complianceDocument.createMany({
    data: [
      {
        id: '12000000-0000-4000-8000-000000000001',
        organizationId: ids.organizationA,
        displayId: 'DOC-RPT-001',
        documentTypeId: '11000000-0000-4000-8000-000000000001',
        subjectType: ComplianceSubjectType.VEHICLE,
        vehicleId: ids.vehicleA1,
        status: ComplianceDocumentStatus.ACTIVE,
        expiresOn: new Date('2027-11-01T00:00:00Z'), // Far in future -> Compliant
        documentNumber: 'DOC-REG-001',
        objectKey: 'compliance/reg-001.pdf',
        originalFileName: 'reg-001.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
      {
        id: '12000000-0000-4000-8000-000000000002',
        organizationId: ids.organizationA,
        displayId: 'DOC-RPT-002',
        documentTypeId: '11000000-0000-4000-8000-000000000002',
        subjectType: ComplianceSubjectType.VEHICLE,
        vehicleId: ids.vehicleA2,
        status: ComplianceDocumentStatus.ACTIVE,
        expiresOn: new Date('2026-10-01T00:00:00Z'), // Past -> Expired / Non-compliant
        documentNumber: 'DOC-INSP-001',
        objectKey: 'compliance/insp-001.pdf',
        originalFileName: 'insp-001.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        createdBy: ids.adminA,
        updatedBy: ids.adminA,
      },
    ],
  });
}

describe('Reporting & Analytics E2E', () => {
  let app: INestApplication;
  let database: PrismaClient;
  let authAdapter: LocalJwtAuthenticationAdapter;
  let tokenAdminA: string;
  let tokenViewerA: string;
  let tokenAdminB: string;
  let tokenFuelOnly: string;
  let tokenExpenseOnly: string;
  let tokenDualFinance: string;

  beforeAll(async () => {
    database = createDatabaseClient({ databaseUrl });
    await seedFixture(database);

    const config = loadApiConfig();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApiApplication(app, config);
    await app.init();

    authAdapter = new LocalJwtAuthenticationAdapter(config);
    [tokenAdminA, tokenViewerA, tokenAdminB, tokenFuelOnly, tokenExpenseOnly, tokenDualFinance] =
      await Promise.all([
        authAdapter.issueDevelopmentToken(ids.adminA),
        authAdapter.issueDevelopmentToken(ids.viewerA),
        authAdapter.issueDevelopmentToken(ids.adminB),
        authAdapter.issueDevelopmentToken(ids.userFuelOnly),
        authAdapter.issueDevelopmentToken(ids.userExpenseOnly),
        authAdapter.issueDevelopmentToken(ids.userDualFinance),
      ]);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (database) {
      await database.$disconnect();
    }
  });

  describe('Fleet Overview Report', () => {
    it('returns fleet overview metrics for Org A within date window', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/fleet-overview?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(res.body).toHaveProperty('metadata');
      expect(res.body.metadata.timezone).toBe('UTC');
      expect(res.body.kpis.totalVehicles).toBe(2);
      expect(res.body.kpis.activeVehicles).toBe(2);
      expect(res.body.kpis.draftVehicles).toBe(0);
      expect(res.body.kpis.retiredVehicles).toBe(0);
      expect(res.body.kpis.completedTripsInPeriod).toBe(2);
      expect(res.body.kpis.totalTripDistanceKmInPeriod).toBe(500); // 200 + 300
    });

    it('redacts sensitive source domain metrics on Fleet Overview when caller lacks domain permissions', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/fleet-overview?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z')
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(res.body.kpis.totalVehicles).toBe(2);
      expect(res.body.kpis.activeVehicles).toBe(2);
      expect(res.body.kpis.draftVehicles).toBe(0);
      expect(res.body.kpis.retiredVehicles).toBe(0);
      // Domain-sensitive operational metrics must be null for user with report.read only
      expect(res.body.kpis.blockingMaintenanceCount).toBeNull();
      expect(res.body.kpis.blockingComplianceCount).toBeNull();
      expect(res.body.kpis.blockingIncidentCount).toBeNull();
      expect(res.body.kpis.freshTelemetryVehicles).toBeNull();
      expect(res.body.kpis.completedTripsInPeriod).toBeNull();
      expect(res.body.kpis.totalTripDistanceKmInPeriod).toBeNull();
    });

    it('enforces tenant isolation — Org B has distinct fleet metrics', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/fleet-overview?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z')
        .set('Authorization', `Bearer ${tokenAdminB}`)
        .set('x-organization-id', ids.organizationB)
        .expect(200);

      expect(res.body.kpis.totalVehicles).toBe(1);
      expect(res.body.kpis.activeVehicles).toBe(1);
      expect(res.body.kpis.completedTripsInPeriod).toBe(1);
      expect(res.body.kpis.totalTripDistanceKmInPeriod).toBe(500);
    });
  });

  describe('Vehicle Utilization Report', () => {
    it('calculates vehicle trip utilization and clipped durations correctly', async () => {
      const res = await request(app.getHttpServer())
        .get(
          '/api/v1/reports/vehicle-utilization?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z',
        )
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);

      const v1 = res.body.items.find((v: { vehicleId: string }) => v.vehicleId === ids.vehicleA1);
      expect(v1).toBeDefined();
      expect(v1.completedTripCount).toBe(2);
      expect(v1.totalDistanceKm).toBe(500);
      expect(v1.activeDurationSeconds).toBe(36000); // 14400 + 21600 = 36000s (10 hours)
      expect(v1.tripTimeUtilizationPercent).toBeGreaterThan(0);
    });

    it('denies access if user lacks trip.read permission', async () => {
      await request(app.getHttpServer())
        .get(
          '/api/v1/reports/vehicle-utilization?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z',
        )
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(403);
    });
  });

  describe('Trip Analytics Report', () => {
    it('returns trip analytics with explicit terminal completion rate denominator', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/trips?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(res.body.counts.totalTrips).toBe(3);
      expect(res.body.counts.completedCount).toBe(2);
      expect(res.body.counts.cancelledCount).toBe(1);
      // Terminal = 2 completed + 1 cancelled = 3. Completion rate = 2/3 * 100 = 66.67%
      expect(res.body.rates.completionRatePercent).toBe(66.67);
      expect(res.body.rates.cancellationRatePercent).toBe(33.33);
      expect(res.body.metrics.totalDistanceKm).toBe(500);
      expect(res.body.timeSeries.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Fuel & Energy Analytics Report', () => {
    it('includes POSTED transactions, excludes VOIDED, and segregates fuel units', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/fuel?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      // Spends by currency
      const usdSpend = res.body.spendsByCurrency.find(
        (s: { currencyCode: string }) => s.currencyCode === 'USD',
      );
      expect(usdSpend).toBeDefined();
      expect(usdSpend.totalSpend).toBe(698.5); // 157.5 + 240 + 36 + 90 + 175
      expect(usdSpend.transactionCount).toBe(5); // VOIDED excluded

      // Quantities strictly segregated by quantity_unit (LITER, KWH, KG, GALLON)
      const literQty = res.body.quantitiesByUnit.find(
        (q: { quantityUnit: string }) => q.quantityUnit === 'LITER',
      );
      expect(literQty).toBeDefined();
      expect(literQty.totalQuantity).toBe(105); // 45 + 60

      const kwhQty = res.body.quantitiesByUnit.find(
        (q: { quantityUnit: string }) => q.quantityUnit === 'KWH',
      );
      expect(kwhQty).toBeDefined();
      expect(kwhQty.totalQuantity).toBe(120);

      const kgQty = res.body.quantitiesByUnit.find(
        (q: { quantityUnit: string }) => q.quantityUnit === 'KG',
      );
      expect(kgQty).toBeDefined();
      expect(kgQty.totalQuantity).toBe(30);

      const gallonQty = res.body.quantitiesByUnit.find(
        (q: { quantityUnit: string }) => q.quantityUnit === 'GALLON',
      );
      expect(gallonQty).toBeDefined();
      expect(gallonQty.totalQuantity).toBe(50);

      // Anomalies by authoritative code
      expect(res.body.anomalies.length).toBe(3);
      const odoAnomaly = res.body.anomalies.find(
        (a: { anomalyCode: string }) => a.anomalyCode === 'ODOMETER_REGRESSION',
      );
      expect(odoAnomaly).toBeDefined();
      expect(odoAnomaly.count).toBe(1);

      // Anomalies by persisted severity (INFO, WARNING, CRITICAL)
      expect(res.body.anomaliesBySeverity.length).toBe(3);
      const critSeverity = res.body.anomaliesBySeverity.find(
        (s: { severity: string }) => s.severity === 'CRITICAL',
      );
      expect(critSeverity).toBeDefined();
      expect(critSeverity.count).toBe(1);
    });
  });

  describe('Cost Analytics Report (Zero FX Conversion)', () => {
    it('partitions USD and JPY spend with zero cross-currency conversion and computes cost/km', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/costs?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(res.body.summariesByCurrency).toBeDefined();
      const usdSummary = res.body.summariesByCurrency.find(
        (s: { currencyCode: string }) => s.currencyCode === 'USD',
      );
      const jpySummary = res.body.summariesByCurrency.find(
        (s: { currencyCode: string }) => s.currencyCode === 'JPY',
      );

      expect(usdSummary).toBeDefined();
      expect(jpySummary).toBeDefined();

      // USD: Fuel 698.5 + Expense 25 = 723.5
      expect(usdSummary.totalFuelAmount).toBe(698.5);
      expect(usdSummary.totalExpenseAmount).toBe(25);
      expect(usdSummary.totalCost).toBe(723.5);

      // JPY: Fuel 0 + Expense 3000 = 3000
      expect(jpySummary.totalFuelAmount).toBe(0);
      expect(jpySummary.totalExpenseAmount).toBe(3000);
      expect(jpySummary.totalCost).toBe(3000);

      // Authoritative trip distance is 500 km
      expect(usdSummary.authoritativeDistanceKm).toBe(500);
      // Cost/km for USD: 723.5 / 500 = 1.447 -> 1.45
      expect(usdSummary.costPerKm).toBe(1.45);
    });

    it('enforces precise Finance permission matrix across Fuel, Costs, and Dashboard', async () => {
      // 1. report.read only (Viewer A):
      // - Fuel report: 403 Forbidden
      await request(app.getHttpServer())
        .get('/api/v1/reports/fuel?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z')
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(403);

      // - Cost report: 403 Forbidden
      await request(app.getHttpServer())
        .get('/api/v1/reports/costs?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z')
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(403);

      // - Dashboard cost widget: redacted (null)
      const viewerDash = await request(app.getHttpServer())
        .get('/api/v1/reports/dashboard?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z')
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);
      expect(viewerDash.body.costsSummary).toBeNull();

      // 2. report.read + fuel.read (Fuel Only User):
      // - Fuel report: allowed (200 OK)
      await request(app.getHttpServer())
        .get('/api/v1/reports/fuel?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z')
        .set('Authorization', `Bearer ${tokenFuelOnly}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      // - Cost report: protected (403 Forbidden, lacks expense.read)
      await request(app.getHttpServer())
        .get('/api/v1/reports/costs?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z')
        .set('Authorization', `Bearer ${tokenFuelOnly}`)
        .set('x-organization-id', ids.organizationA)
        .expect(403);

      // - Dashboard cost widget: redacted (null)
      const fuelOnlyDash = await request(app.getHttpServer())
        .get('/api/v1/reports/dashboard?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z')
        .set('Authorization', `Bearer ${tokenFuelOnly}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);
      expect(fuelOnlyDash.body.costsSummary).toBeNull();

      // 3. report.read + expense.read (Expense Only User):
      // - Fuel report: 403 Forbidden (no fuel data without fuel.read)
      await request(app.getHttpServer())
        .get('/api/v1/reports/fuel?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z')
        .set('Authorization', `Bearer ${tokenExpenseOnly}`)
        .set('x-organization-id', ids.organizationA)
        .expect(403);

      // - Cost report: 403 Forbidden (lacks fuel.read)
      await request(app.getHttpServer())
        .get('/api/v1/reports/costs?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z')
        .set('Authorization', `Bearer ${tokenExpenseOnly}`)
        .set('x-organization-id', ids.organizationA)
        .expect(403);

      // - Dashboard cost widget: redacted (null)
      const expenseOnlyDash = await request(app.getHttpServer())
        .get('/api/v1/reports/dashboard?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z')
        .set('Authorization', `Bearer ${tokenExpenseOnly}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);
      expect(expenseOnlyDash.body.costsSummary).toBeNull();

      // 4. report.read + fuel.read + expense.read (Dual Finance User):
      // - Fuel report: 200 OK
      await request(app.getHttpServer())
        .get('/api/v1/reports/fuel?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z')
        .set('Authorization', `Bearer ${tokenDualFinance}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      // - Cost report: 200 OK (Full combined costs report allowed)
      const costRes = await request(app.getHttpServer())
        .get('/api/v1/reports/costs?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z')
        .set('Authorization', `Bearer ${tokenDualFinance}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);
      expect(costRes.body.summariesByCurrency).toBeDefined();

      // - Dashboard cost widget: populated!
      const dualDash = await request(app.getHttpServer())
        .get('/api/v1/reports/dashboard?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z')
        .set('Authorization', `Bearer ${tokenDualFinance}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);
      expect(dualDash.body.costsSummary).not.toBeNull();
    });
  });

  describe('Maintenance Analytics Report', () => {
    it('returns open blocking requests, work orders, cycle times, and operational costs', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/maintenance?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(res.body.requests.totalOpenRequests).toBe(2);
      expect(res.body.requests.blockingRequestsCount).toBe(1);
      expect(res.body.workOrders.completedInPeriodCount).toBe(1);
      expect(res.body.workOrders.averageCycleTimeHours).toBe(8); // (16:00 - 08:00) = 8 hours
      expect(res.body.workOrders.operationalTotals.totalPartCostOperational).toBe(150);
      expect(res.body.workOrders.operationalTotals.totalLaborCostOperational).toBe(200);
      expect(res.body.workOrders.operationalTotals.totalWorkOrderOperationalCost).toBe(350);
    });
  });

  describe('Compliance Analytics Report', () => {
    it('returns current compliance status and expiring documents', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/compliance?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(res.body.documents.totalActiveDocuments).toBe(2);
      expect(res.body.documents.expiredCount).toBe(1);
      expect(res.body.vehicleCompliance).toBeDefined();
    });
  });

  describe('Incident Analytics Report', () => {
    it('returns incident type distribution, severity, operational impact, and MTTR', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/incidents?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(res.body.counts.totalIncidents).toBe(7);
      expect(res.body.counts.unresolvedCount).toBe(3); // Incidents 2 (REPORTED), 3 (INVESTIGATING), 7 (REPORTED)
      expect(res.body.counts.unresolvedBlockingCount).toBe(2); // Incidents 2 (VEHICLE) + 3 (DRIVER)

      // Verify every actual IncidentType is present
      const types = res.body.distributionByType.map((d: { type: string }) => d.type);
      expect(types).toEqual(
        expect.arrayContaining([
          'ACCIDENT',
          'BREAKDOWN',
          'VIOLATION',
          'DAMAGE',
          'THEFT',
          'SAFETY',
          'OTHER',
        ]),
      );

      // Verify every actual IncidentOperationalImpact is present
      const impacts = res.body.distributionByOperationalImpact.map(
        (i: { operationalImpact: string }) => i.operationalImpact,
      );
      expect(impacts).toEqual(expect.arrayContaining(['NONE', 'VEHICLE', 'DRIVER', 'BOTH']));
      const noneImpact = res.body.distributionByOperationalImpact.find(
        (i: { operationalImpact: string }) => i.operationalImpact === 'NONE',
      );
      expect(noneImpact?.count).toBe(3);
      const vehicleImpact = res.body.distributionByOperationalImpact.find(
        (i: { operationalImpact: string }) => i.operationalImpact === 'VEHICLE',
      );
      expect(vehicleImpact?.count).toBe(2);

      // Verify every actual IncidentSeverity is present
      const severities = res.body.distributionBySeverity.map(
        (s: { severity: string }) => s.severity,
      );
      expect(severities).toEqual(expect.arrayContaining(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']));

      // Verify every actual IncidentStatus is present
      const statuses = res.body.distributionByStatus.map((s: { status: string }) => s.status);
      expect(statuses).toEqual(
        expect.arrayContaining(['REPORTED', 'INVESTIGATING', 'RESOLVED', 'CLOSED', 'CANCELLED']),
      );

      expect(res.body.resolutionDuration.resolvedCount).toBe(3);
      expect(res.body.resolutionDuration.closedCount).toBe(1);
    });
  });

  describe('Telemetry Analytics Report', () => {
    it('returns device health, freshness, and ingestion metrics', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/telemetry?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      // Total devices = 3 (ACTIVE, INACTIVE, SUSPENDED). REVOKED credential is NOT a device.
      expect(res.body.devices.totalDevices).toBe(3);
      expect(res.body.devices.activeDevices).toBe(1);
      expect(res.body.devices.inactiveDevices).toBe(1);
      expect(res.body.devices.suspendedDevices).toBe(1);

      // Freshness: vehicleA1 captured 1m ago (<=2m) -> FRESH, vehicleA2 captured 15m ago (>2m, <=60m) -> STALE
      expect(res.body.vehicleFreshness.freshCount).toBe(1);
      expect(res.body.vehicleFreshness.staleCount).toBe(1);
      expect(res.body.ingestion.totalPositionsIngested).toBe(2);
    });
  });

  describe('Executive Dashboard Report', () => {
    it('aggregates operational headline KPIs across domains', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/dashboard?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(res.body.fleetOverview.totalVehicles).toBe(2);
      expect(res.body.fleetOverview.activeVehicles).toBe(2);
      expect(res.body.tripsSummary.totalTrips).toBe(3);
      expect(res.body.tripsSummary.completedCount).toBe(2);
      expect(res.body.tripsSummary.totalDistanceKm).toBe(500);
      expect(res.body.costsSummary.length).toBe(2);
      expect(res.body.maintenanceAlerts.blockingRequestsCount).toBe(1);
      expect(res.body.incidentAlerts.unresolvedCount).toBe(3);
      expect(res.body.incidentAlerts.unresolvedBlockingCount).toBe(2);
    });

    it('returns null for unauthorized widgets on Executive Dashboard when caller lacks domain permissions', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/dashboard?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z')
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(res.body.fleetOverview.totalVehicles).toBe(2);
      // Unauthorized domain widgets must be null
      expect(res.body.tripsSummary).toBeNull();
      expect(res.body.costsSummary).toBeNull();
      expect(res.body.maintenanceAlerts).toBeNull();
      expect(res.body.complianceAlerts).toBeNull();
      expect(res.body.incidentAlerts).toBeNull();
      expect(res.body.telemetryStatus).toBeNull();
    });
  });

  describe('Export & Audit', () => {
    it('denies export if user lacks report.export permission', async () => {
      await request(app.getHttpServer())
        .get(
          '/api/v1/reports/trips/export?format=csv&from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z',
        )
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(403);
    });

    it('exports CSV with formula injection protection and creates audit log', async () => {
      const res = await request(app.getHttpServer())
        .get(
          '/api/v1/reports/trips/export?format=csv&from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z',
        )
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain(
        'attachment; filename="trips-2026-11-01-to-2026-11-10.csv"',
      );
      expect(res.text).toContain('"Bucket Date","Total Trips","Completed Trips"');

      // Verify audit log record
      const auditLog = await database.auditLog.findFirst({
        where: {
          organizationId: ids.organizationA,
          action: 'REPORT_EXPORTED',
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditLog).toBeDefined();
      expect(auditLog?.actorId).toBe(ids.adminA);
      const meta = auditLog?.afterData as { reportKey: string; format: string };
      expect(meta.reportKey).toBe('trips');
      expect(meta.format).toBe('csv');
    });

    it('exports PDF summary with valid %PDF-1.4 header', async () => {
      const res = await request(app.getHttpServer())
        .get(
          '/api/v1/reports/fleet-overview/export?format=pdf&from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z',
        )
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain(
        'attachment; filename="fleet-overview-2026-11-01-to-2026-11-10.pdf"',
      );
      const buffer = res.body as Buffer;
      expect(buffer.toString('utf-8', 0, 8)).toBe('%PDF-1.4');
    });

    it('validates date range parameters (rejects from > to)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reports/fleet-overview?from=2026-11-10T00:00:00Z&to=2026-11-01T00:00:00Z')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(400);
    });

    it('validates date range limit (rejects range > 366 days)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reports/fleet-overview?from=2025-01-01T00:00:00Z&to=2026-02-01T00:00:00Z')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(400);
    });

    it('rejects unsupported export format', async () => {
      await request(app.getHttpServer())
        .get(
          '/api/v1/reports/fleet-overview/export?format=xlsx&from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z',
        )
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(400);
    });

    it('rejects export for non-existent reportKey with 404', async () => {
      await request(app.getHttpServer())
        .get(
          '/api/v1/reports/non-existent-report/export?format=csv&from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z',
        )
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(404);
    });

    it('rejects export when caller has report.export but lacks source-domain read permission', async () => {
      const exporterUserId = '28000000-0000-4000-8000-000000000099';
      const exporterRoleId = '48000000-0000-4000-8000-000000000099';
      const exporterMembershipId = '38000000-0000-4000-8000-000000000099';

      await database.user.create({
        data: {
          id: exporterUserId,
          email: 'exporter-no-finance@test.local',
          displayName: 'Exporter No Finance',
          status: PrincipalStatus.ACTIVE,
        },
      });
      await database.organizationMembership.create({
        data: {
          id: exporterMembershipId,
          organizationId: ids.organizationA,
          userId: exporterUserId,
          status: MembershipStatus.ACTIVE,
        },
      });
      await database.role.create({
        data: {
          id: exporterRoleId,
          organizationId: ids.organizationA,
          name: 'Exporter Only Role',
        },
      });
      const exportPerms = await database.permission.findMany({
        where: { code: { in: ['report.read', 'report.export'] } },
      });
      await database.rolePermission.createMany({
        data: exportPerms.map((p) => ({ roleId: exporterRoleId, permissionId: p.id })),
      });
      await database.membershipRole.create({
        data: {
          organizationId: ids.organizationA,
          membershipId: exporterMembershipId,
          roleId: exporterRoleId,
        },
      });

      const tokenExporter = await authAdapter.issueDevelopmentToken(exporterUserId);

      const res = await request(app.getHttpServer())
        .get(
          '/api/v1/reports/costs/export?format=csv&from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z',
        )
        .set('Authorization', `Bearer ${tokenExporter}`)
        .set('x-organization-id', ids.organizationA)
        .expect(403);

      expect(res.body.error.message).toContain('finance.read');

      // Fuel export also rejected without fuel.read
      const fuelExportRes = await request(app.getHttpServer())
        .get(
          '/api/v1/reports/fuel/export?format=csv&from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z',
        )
        .set('Authorization', `Bearer ${tokenExporter}`)
        .set('x-organization-id', ids.organizationA)
        .expect(403);

      expect(fuelExportRes.body.error.message).toContain('fuel.read');
    });

    it('rejects export when caller has report.export and source permission but lacks report.read', async () => {
      const exportOnlyUserId = '28000000-0000-4000-8000-000000000098';
      const exportOnlyRoleId = '48000000-0000-4000-8000-000000000098';
      const exportOnlyMembershipId = '38000000-0000-4000-8000-000000000098';

      await database.user.create({
        data: {
          id: exportOnlyUserId,
          email: 'export-no-read@test.local',
          displayName: 'Export No Read',
          status: PrincipalStatus.ACTIVE,
        },
      });
      await database.organizationMembership.create({
        data: {
          id: exportOnlyMembershipId,
          organizationId: ids.organizationA,
          userId: exportOnlyUserId,
          status: MembershipStatus.ACTIVE,
        },
      });
      await database.role.create({
        data: {
          id: exportOnlyRoleId,
          organizationId: ids.organizationA,
          name: 'Export Without Read Role',
        },
      });
      const perms = await database.permission.findMany({
        where: { code: { in: ['report.export', 'finance.read'] } },
      });
      await database.rolePermission.createMany({
        data: perms.map((p) => ({ roleId: exportOnlyRoleId, permissionId: p.id })),
      });
      await database.membershipRole.create({
        data: {
          organizationId: ids.organizationA,
          membershipId: exportOnlyMembershipId,
          roleId: exportOnlyRoleId,
        },
      });

      const tokenNoRead = await authAdapter.issueDevelopmentToken(exportOnlyUserId);

      const res = await request(app.getHttpServer())
        .get(
          '/api/v1/reports/costs/export?format=csv&from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z',
        )
        .set('Authorization', `Bearer ${tokenNoRead}`)
        .set('x-organization-id', ids.organizationA)
        .expect(403);

      expect(res.body.error.code).toBe('PERMISSION_DENIED');
    });

    it('allows viewing report but rejects export when caller has report.read and source permission but lacks report.export', async () => {
      const readOnlyUserId = '28000000-0000-4000-8000-000000000097';
      const readOnlyRoleId = '48000000-0000-4000-8000-000000000097';
      const readOnlyMembershipId = '38000000-0000-4000-8000-000000000097';

      await database.user.create({
        data: {
          id: readOnlyUserId,
          email: 'read-no-export@test.local',
          displayName: 'Read No Export',
          status: PrincipalStatus.ACTIVE,
        },
      });
      await database.organizationMembership.create({
        data: {
          id: readOnlyMembershipId,
          organizationId: ids.organizationA,
          userId: readOnlyUserId,
          status: MembershipStatus.ACTIVE,
        },
      });
      await database.role.create({
        data: {
          id: readOnlyRoleId,
          organizationId: ids.organizationA,
          name: 'Read Without Export Role',
        },
      });
      const perms = await database.permission.findMany({
        where: { code: { in: ['report.read', 'finance.read'] } },
      });
      await database.rolePermission.createMany({
        data: perms.map((p) => ({ roleId: readOnlyRoleId, permissionId: p.id })),
      });
      await database.membershipRole.create({
        data: {
          organizationId: ids.organizationA,
          membershipId: readOnlyMembershipId,
          roleId: readOnlyRoleId,
        },
      });

      const tokenNoExport = await authAdapter.issueDevelopmentToken(readOnlyUserId);

      // Interactive report view succeeds
      await request(app.getHttpServer())
        .get('/api/v1/reports/costs?from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z')
        .set('Authorization', `Bearer ${tokenNoExport}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      // Export attempt is denied
      const res = await request(app.getHttpServer())
        .get(
          '/api/v1/reports/costs/export?format=csv&from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z',
        )
        .set('Authorization', `Bearer ${tokenNoExport}`)
        .set('x-organization-id', ids.organizationA)
        .expect(403);

      expect(res.body.error.code).toBe('PERMISSION_DENIED');
    });

    it('exports permission-redacted dashboard CSV where unauthorized sections are masked as —', async () => {
      // User with report.read and report.export only (no finance.read, no maintenance.read, etc.)
      const minimalExporterUserId = '28000000-0000-4000-8000-000000000096';
      const minimalExporterRoleId = '48000000-0000-4000-8000-000000000096';
      const minimalExporterMembershipId = '38000000-0000-4000-8000-000000000096';

      await database.user.create({
        data: {
          id: minimalExporterUserId,
          email: 'minimal-exporter@test.local',
          displayName: 'Minimal Exporter',
          status: PrincipalStatus.ACTIVE,
        },
      });
      await database.organizationMembership.create({
        data: {
          id: minimalExporterMembershipId,
          organizationId: ids.organizationA,
          userId: minimalExporterUserId,
          status: MembershipStatus.ACTIVE,
        },
      });
      await database.role.create({
        data: {
          id: minimalExporterRoleId,
          organizationId: ids.organizationA,
          name: 'Minimal Exporter Role',
        },
      });
      const perms = await database.permission.findMany({
        where: { code: { in: ['report.read', 'report.export'] } },
      });
      await database.rolePermission.createMany({
        data: perms.map((p) => ({ roleId: minimalExporterRoleId, permissionId: p.id })),
      });
      await database.membershipRole.create({
        data: {
          organizationId: ids.organizationA,
          membershipId: minimalExporterMembershipId,
          roleId: minimalExporterRoleId,
        },
      });

      const tokenMinimal = await authAdapter.issueDevelopmentToken(minimalExporterUserId);

      const res = await request(app.getHttpServer())
        .get(
          '/api/v1/reports/dashboard/export?format=csv&from=2026-11-01T00:00:00Z&to=2026-11-10T00:00:00Z',
        )
        .set('Authorization', `Bearer ${tokenMinimal}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/csv');
      const csv = res.text;
      // Fleet overview core counts are present
      expect(csv).toContain('"Total Vehicles",2');
      // Sensitive sections without source permissions are redacted
      expect(csv).toContain('"Completed Trips (Period)","—"');
      expect(csv).toContain('"Blocking Maintenance Requests","—"');
      expect(csv).toContain('"Unresolved Incidents","—"');
    });

    it('uses canonical trailing 30-day default reporting window when from and to are omitted', async () => {
      const now = Date.now();

      // Dashboard
      const dashRes = await request(app.getHttpServer())
        .get('/api/v1/reports/dashboard')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(dashRes.body.metadata.timezone).toBe('UTC');
      const dashTo = new Date(dashRes.body.metadata.to).getTime();
      const dashFrom = new Date(dashRes.body.metadata.from).getTime();
      expect(Math.abs(dashTo - now)).toBeLessThan(5000);
      const dashDurationDays = Math.round((dashTo - dashFrom) / (24 * 3600 * 1000));
      expect(dashDurationDays).toBe(30);

      // Vehicle Utilization
      const utilRes = await request(app.getHttpServer())
        .get('/api/v1/reports/vehicle-utilization')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(utilRes.body.metadata.timezone).toBe('UTC');
      const utilTo = new Date(utilRes.body.metadata.to).getTime();
      const utilFrom = new Date(utilRes.body.metadata.from).getTime();
      expect(Math.round((utilTo - utilFrom) / (24 * 3600 * 1000))).toBe(30);

      // Costs
      const costsRes = await request(app.getHttpServer())
        .get('/api/v1/reports/costs')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .set('x-organization-id', ids.organizationA)
        .expect(200);

      expect(costsRes.body.metadata.timezone).toBe('UTC');
      const costsTo = new Date(costsRes.body.metadata.to).getTime();
      const costsFrom = new Date(costsRes.body.metadata.from).getTime();
      expect(Math.round((costsTo - costsFrom) / (24 * 3600 * 1000))).toBe(30);
    });
  });
});
