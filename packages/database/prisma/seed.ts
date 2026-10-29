import 'dotenv/config';

import { createDatabaseClient, MembershipStatus, PrincipalStatus } from '../src/index.js';

export const developmentSeed = {
  organizationId: '10000000-0000-4000-8000-000000000001',
  userId: '20000000-0000-4000-8000-000000000001',
  viewerUserId: '20000000-0000-4000-8000-000000000002',
  membershipId: '30000000-0000-4000-8000-000000000001',
  viewerMembershipId: '30000000-0000-4000-8000-000000000002',
  adminRoleId: '40000000-0000-4000-8000-000000000001',
  viewerRoleId: '40000000-0000-4000-8000-000000000002',
  email: 'dev.admin@example.test',
  viewerEmail: 'dev.viewer@example.test',
} as const;

export const permissionDefinitions = [
  ['organization.read', 'Read organization details'],
  ['organization.update', 'Update organization details'],
  ['user.read', 'Read organization users'],
  ['user.manage', 'Create and manage users'],
  ['membership.read', 'Read organization memberships'],
  ['membership.manage', 'Create and manage memberships'],
  ['role.read', 'Read roles and assigned permissions'],
  ['role.manage', 'Create roles and manage assignments'],
  ['audit.read', 'Read organization audit history'],
  ['vehicle.read', 'Read vehicle records'],
  ['vehicle.create', 'Create new vehicles'],
  ['vehicle.update', 'Update vehicle details'],
  ['vehicle.activate', 'Activate vehicles for operations'],
  ['vehicle.retire', 'Retire vehicles from operations'],
  ['vehicle.history.read', 'Read vehicle lifecycle history'],
  ['driver.read', 'Read driver records and profiles'],
  ['driver.create', 'Create new driver records'],
  ['driver.update', 'Update driver details and contact information'],
  ['driver.activate', 'Activate drivers for operations'],
  ['driver.suspend', 'Suspend drivers from operations'],
  ['driver.deactivate', 'Deactivate drivers permanently'],
  ['driver.license.manage', 'Add, update, and remove driver licenses'],
  ['driver.history.read', 'Read driver lifecycle status history'],
  ['assignment.read', 'Read vehicle-driver assignments'],
  ['assignment.create', 'Create vehicle-driver assignments'],
  ['assignment.end', 'End vehicle-driver assignments'],
  ['trip.read', 'Read trip records'],
  ['trip.create', 'Create new trips'],
  ['trip.update', 'Update draft trips'],
  ['trip.ready', 'Mark trips ready for dispatch'],
  ['trip.start', 'Start trips and record start odometer'],
  ['trip.complete', 'Complete trips and record end odometer'],
  ['trip.cancel', 'Cancel draft or ready trips'],
  ['trip.abort', 'Abort in-progress trips'],
  ['trip.history.read', 'Read trip status history'],
  ['inspection.read', 'Read inspection records'],
  ['inspection.create', 'Create inspections'],
  ['inspection.perform', 'Record checklist responses'],
  ['inspection.complete', 'Complete inspections and record result'],
  ['inspection.cancel', 'Cancel inspections'],
  ['inspection.history.read', 'Read inspection history'],
  ['inspection.template.read', 'Read inspection templates'],
  ['inspection.template.manage', 'Create, update, activate, and archive inspection templates'],
] as const;

async function seed(): Promise<void> {
  const databaseUrl =
    process.env.DATABASE_URL ??
    'postgresql://vehicle_management:local_vehicle_management@localhost:5432/vehicle_management?schema=public';
  const database = createDatabaseClient({ databaseUrl });

  try {
    await database.organization.upsert({
      where: { id: developmentSeed.organizationId },
      update: {},
      create: {
        id: developmentSeed.organizationId,
        name: 'Development Fleet',
        slug: 'development-fleet',
        status: PrincipalStatus.ACTIVE,
      },
    });
    await database.user.upsert({
      where: { id: developmentSeed.userId },
      update: {},
      create: {
        id: developmentSeed.userId,
        email: developmentSeed.email,
        displayName: 'Development Administrator',
        status: PrincipalStatus.ACTIVE,
      },
    });
    await database.organizationMembership.upsert({
      where: { id: developmentSeed.membershipId },
      update: {},
      create: {
        id: developmentSeed.membershipId,
        organizationId: developmentSeed.organizationId,
        userId: developmentSeed.userId,
        status: MembershipStatus.ACTIVE,
      },
    });
    await database.user.upsert({
      where: { id: developmentSeed.viewerUserId },
      update: {},
      create: {
        id: developmentSeed.viewerUserId,
        email: developmentSeed.viewerEmail,
        displayName: 'Development Viewer',
        status: PrincipalStatus.ACTIVE,
      },
    });
    await database.organizationMembership.upsert({
      where: { id: developmentSeed.viewerMembershipId },
      update: {},
      create: {
        id: developmentSeed.viewerMembershipId,
        organizationId: developmentSeed.organizationId,
        userId: developmentSeed.viewerUserId,
        status: MembershipStatus.ACTIVE,
      },
    });

    const permissions = new Map<string, string>();
    for (const [index, [code, description]] of permissionDefinitions.entries()) {
      const id = `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
      const permission = await database.permission.upsert({
        where: { code },
        update: { description },
        create: { id, code, description },
      });
      permissions.set(code, permission.id);
    }

    await database.role.upsert({
      where: { id: developmentSeed.adminRoleId },
      update: {},
      create: {
        id: developmentSeed.adminRoleId,
        organizationId: developmentSeed.organizationId,
        name: 'Organization Admin',
        description: 'All Milestone 1 permissions',
      },
    });
    await database.role.upsert({
      where: { id: developmentSeed.viewerRoleId },
      update: {},
      create: {
        id: developmentSeed.viewerRoleId,
        organizationId: developmentSeed.organizationId,
        name: 'Viewer',
        description: 'Read-only foundational access',
      },
    });

    await database.rolePermission.createMany({
      data: [...permissions.values()].map((permissionId) => ({
        roleId: developmentSeed.adminRoleId,
        permissionId,
      })),
      skipDuplicates: true,
    });
    const viewerCodes = [
      'organization.read',
      'user.read',
      'membership.read',
      'role.read',
      'audit.read',
      'vehicle.read',
      'vehicle.history.read',
      'driver.read',
      'driver.history.read',
      'assignment.read',
      'trip.read',
      'trip.history.read',
      'inspection.read',
      'inspection.history.read',
      'inspection.template.read',
    ];
    await database.rolePermission.createMany({
      data: viewerCodes.map((code) => ({
        roleId: developmentSeed.viewerRoleId,
        permissionId: permissions.get(code)!,
      })),
      skipDuplicates: true,
    });
    await database.membershipRole.upsert({
      where: {
        membershipId_roleId: {
          membershipId: developmentSeed.membershipId,
          roleId: developmentSeed.adminRoleId,
        },
      },
      update: {},
      create: {
        membershipId: developmentSeed.membershipId,
        roleId: developmentSeed.adminRoleId,
        organizationId: developmentSeed.organizationId,
      },
    });
    await database.membershipRole.upsert({
      where: {
        membershipId_roleId: {
          membershipId: developmentSeed.viewerMembershipId,
          roleId: developmentSeed.viewerRoleId,
        },
      },
      update: {},
      create: {
        membershipId: developmentSeed.viewerMembershipId,
        roleId: developmentSeed.viewerRoleId,
        organizationId: developmentSeed.organizationId,
      },
    });

    // Default Seeded Inspection Templates
    const preTripTemplateId = '60000000-0000-4000-8000-000000000001';
    await database.inspectionTemplate.upsert({
      where: { id: preTripTemplateId },
      update: {},
      create: {
        id: preTripTemplateId,
        organizationId: developmentSeed.organizationId,
        name: 'Pre-Trip Safety Checklist',
        description: 'Standard daily pre-trip safety checklist for operational dispatch',
        type: 'PRE_TRIP',
        status: 'ACTIVE',
        version: 1,
        createdBy: developmentSeed.userId,
        updatedBy: developmentSeed.userId,
        items: {
          create: [
            {
              id: '61000000-0000-4000-8000-000000000001',
              category: 'Tires & Wheels',
              prompt: 'Check tire tread depth, condition, and inflation pressure',
              description: 'All tires must have adequate tread and no visible bulges or cuts',
              required: true,
              severity: 'NORMAL',
              sortOrder: 1,
            },
            {
              id: '61000000-0000-4000-8000-000000000002',
              category: 'Lighting',
              prompt: 'Inspect headlamps, turn signals, hazard flashers, and brake lights',
              description: 'Verify illumination and clean lenses',
              required: true,
              severity: 'NORMAL',
              sortOrder: 2,
            },
            {
              id: '61000000-0000-4000-8000-000000000003',
              category: 'Braking System',
              prompt: 'Verify service brake responsiveness and parking brake holding',
              description: 'Safety critical brake verification',
              required: true,
              severity: 'CRITICAL',
              sortOrder: 3,
            },
            {
              id: '61000000-0000-4000-8000-000000000004',
              category: 'Visibility',
              prompt: 'Check windshield, wiper blades, washer fluid, and rear-view mirrors',
              description: 'Clear visibility without cracks obstructing driver view',
              required: true,
              severity: 'NORMAL',
              sortOrder: 4,
            },
            {
              id: '61000000-0000-4000-8000-000000000005',
              category: 'Engine & Fluids',
              prompt: 'Check under vehicle and engine bay for visible fluid leaks',
              description: 'Look for active oil, coolant, or fuel leaks',
              required: true,
              severity: 'NORMAL',
              sortOrder: 5,
            },
          ],
        },
      },
    });

    const postTripTemplateId = '60000000-0000-4000-8000-000000000002';
    await database.inspectionTemplate.upsert({
      where: { id: postTripTemplateId },
      update: {},
      create: {
        id: postTripTemplateId,
        organizationId: developmentSeed.organizationId,
        name: 'Post-Trip Safety Checklist',
        description: 'Standard end-of-trip condition inspection at route completion',
        type: 'POST_TRIP',
        status: 'ACTIVE',
        version: 1,
        createdBy: developmentSeed.userId,
        updatedBy: developmentSeed.userId,
        items: {
          create: [
            {
              id: '62000000-0000-4000-8000-000000000001',
              category: 'Exterior',
              prompt: 'Inspect body panels, bumpers, glass, and doors for new damage',
              description: 'Record any new scratches, dents, or collisions',
              required: true,
              severity: 'NORMAL',
              sortOrder: 1,
            },
            {
              id: '62000000-0000-4000-8000-000000000002',
              category: 'Dashboard',
              prompt:
                'Verify no check engine, ABS, oil, or brake warning indicators are illuminated',
              description: 'Note any illuminated cluster warnings',
              required: true,
              severity: 'NORMAL',
              sortOrder: 2,
            },
            {
              id: '62000000-0000-4000-8000-000000000003',
              category: 'Tires & Wheels',
              prompt: 'Inspect tires for punctures, embedded objects, or pressure loss',
              description: 'Post-route tire condition check',
              required: true,
              severity: 'NORMAL',
              sortOrder: 3,
            },
            {
              id: '62000000-0000-4000-8000-000000000004',
              category: 'Engine & Fluids',
              prompt: 'Inspect vehicle underside for active leaks after operation',
              description: 'Check for hot or fresh coolant/oil drips',
              required: true,
              severity: 'NORMAL',
              sortOrder: 4,
            },
            {
              id: '62000000-0000-4000-8000-000000000005',
              category: 'Mechanical',
              prompt:
                'Report any steering pull, unusual vibration, brake squeal, or transmission issues',
              description: 'Safety critical post-trip mechanical symptom check',
              required: true,
              severity: 'CRITICAL',
              sortOrder: 5,
            },
          ],
        },
      },
    });
  } finally {
    await database.$disconnect();
  }
}

await seed();
