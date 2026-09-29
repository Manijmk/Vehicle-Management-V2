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
  admin: '21000000-0000-4000-8000-000000000001',
  viewer: '21000000-0000-4000-8000-000000000002',
  suspended: '21000000-0000-4000-8000-000000000003',
  manager: '21000000-0000-4000-8000-000000000004',
  membershipAdminA: '31000000-0000-4000-8000-000000000001',
  membershipViewerA: '31000000-0000-4000-8000-000000000002',
  membershipSuspendedA: '31000000-0000-4000-8000-000000000003',
  membershipManagerA: '31000000-0000-4000-8000-000000000004',
  roleAdminA: '41000000-0000-4000-8000-000000000001',
  roleViewerA: '41000000-0000-4000-8000-000000000002',
  roleAdminB: '41000000-0000-4000-8000-000000000003',
  roleManagerA: '41000000-0000-4000-8000-000000000004',
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

describe('identity and organization foundation HTTP boundary', () => {
  let application: INestApplication;
  let database: PrismaClient;
  let adminToken: string;
  let viewerToken: string;
  let suspendedToken: string;
  let managerToken: string;

  beforeAll(async () => {
    database = createDatabaseClient({ databaseUrl });
    await database.$executeRawUnsafe(
      'TRUNCATE TABLE outbox_events, audit_logs, membership_roles, role_permissions, permissions, roles, organization_memberships, users, organizations RESTART IDENTITY CASCADE',
    );
    await seedFixture(database);

    const authentication = new LocalJwtAuthenticationAdapter(loadApiConfig());
    [adminToken, viewerToken, suspendedToken, managerToken] = await Promise.all([
      authentication.issueDevelopmentToken(ids.admin),
      authentication.issueDevelopmentToken(ids.viewer),
      authentication.issueDevelopmentToken(ids.suspended),
      authentication.issueDevelopmentToken(ids.manager),
    ]);

    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    application = module.createNestApplication();
    configureApiApplication(application, { API_CORS_ORIGINS: ['http://localhost:3000'] });
    await application.init();
  }, 60_000);

  afterAll(async () => {
    await application.close();
    await database.$disconnect();
  });

  it('rejects an unauthenticated request', async () => {
    const response = await request(application.getHttpServer())
      .get('/api/v1/organizations')
      .expect(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('authenticates a principal, resolves its tenant, and exposes effective permissions', async () => {
    const organizations = await request(application.getHttpServer())
      .get('/api/v1/organizations')
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(organizations.body).toEqual([expect.objectContaining({ id: ids.organizationA })]);

    const me = await request(application.getHttpServer())
      .get('/api/v1/me')
      .set('authorization', `Bearer ${adminToken}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);
    expect(me.body).toMatchObject({
      user: { id: ids.admin },
      organization: { id: ids.organizationA },
      membership: { id: ids.membershipAdminA },
    });
    expect(me.body.permissions).toContain('membership.manage');
  });

  it('prevents route/header IDOR and tenant selection without active membership', async () => {
    await request(application.getHttpServer())
      .get(`/api/v1/organizations/${ids.organizationB}`)
      .set('authorization', `Bearer ${adminToken}`)
      .set('x-organization-id', ids.organizationA)
      .expect(403);
    const response = await request(application.getHttpServer())
      .get(`/api/v1/organizations/${ids.organizationB}`)
      .set('authorization', `Bearer ${adminToken}`)
      .set('x-organization-id', ids.organizationB)
      .expect(403);
    expect(response.body.error.code).toBe('INVALID_TENANT_CONTEXT');
  });

  it('scopes permissions to the active organization and rejects inactive membership', async () => {
    await request(application.getHttpServer())
      .patch(`/api/v1/organizations/${ids.organizationA}`)
      .set('authorization', `Bearer ${viewerToken}`)
      .set('x-organization-id', ids.organizationA)
      .send({ name: 'Escalated', version: 1 })
      .expect(403);
    const response = await request(application.getHttpServer())
      .get('/api/v1/me')
      .set('authorization', `Bearer ${suspendedToken}`)
      .set('x-organization-id', ids.organizationA)
      .expect(403);
    expect(response.body.error.code).toBe('INACTIVE_MEMBERSHIP');
  });

  it('blocks cross-tenant role assignment and membership access', async () => {
    await request(application.getHttpServer())
      .post(
        `/api/v1/organizations/${ids.organizationA}/members/${ids.membershipViewerA}/roles/${ids.roleAdminB}`,
      )
      .set('authorization', `Bearer ${adminToken}`)
      .set('x-organization-id', ids.organizationA)
      .expect(404);
    await request(application.getHttpServer())
      .patch(
        `/api/v1/organizations/${ids.organizationA}/members/31000000-0000-4000-8000-999999999999`,
      )
      .set('authorization', `Bearer ${adminToken}`)
      .set('x-organization-id', ids.organizationA)
      .send({ status: 'REVOKED', version: 1 })
      .expect(404);
  });

  it('prevents managers from granting permissions they do not possess', async () => {
    const response = await request(application.getHttpServer())
      .post(`/api/v1/organizations/${ids.organizationA}/members`)
      .set('authorization', `Bearer ${managerToken}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        email: 'escalation@example.test',
        displayName: 'Escalation Attempt',
        roleIds: [ids.roleAdminA],
      })
      .expect(409);
    expect(response.body.error.code).toBe('INVALID_ROLE_ASSIGNMENT');
    expect(
      await database.user.findUnique({ where: { email: 'escalation@example.test' } }),
    ).toBeNull();
  });

  it('commits membership state, immutable audit, and outbox event atomically', async () => {
    const response = await request(application.getHttpServer())
      .post(`/api/v1/organizations/${ids.organizationA}/members`)
      .set('authorization', `Bearer ${adminToken}`)
      .set('x-organization-id', ids.organizationA)
      .set('x-request-id', 'create-member-e2e')
      .send({
        email: 'NEW.MEMBER@example.test',
        displayName: 'New Member',
        status: 'ACTIVE',
        roleIds: [ids.roleViewerA],
      })
      .expect(201);
    expect(response.body.user.email).toBe('new.member@example.test');
    const [audit, event] = await Promise.all([
      database.auditLog.findFirst({
        where: { organizationId: ids.organizationA, entityId: response.body.id as string },
      }),
      database.outboxEvent.findFirst({
        where: { organizationId: ids.organizationA, aggregateId: response.body.id as string },
      }),
    ]);
    expect(audit).toMatchObject({ action: 'membership.created', requestId: 'create-member-e2e' });
    expect(event).toMatchObject({ eventType: 'MembershipCreated', status: 'PENDING' });
    await expect(
      database.auditLog.update({ where: { id: audit!.id }, data: { action: 'tampered' } }),
    ).rejects.toBeDefined();
  });

  it('rolls back user and outbox writes when role validation fails', async () => {
    const beforeEvents = await database.outboxEvent.count();
    await request(application.getHttpServer())
      .post(`/api/v1/organizations/${ids.organizationA}/members`)
      .set('authorization', `Bearer ${adminToken}`)
      .set('x-organization-id', ids.organizationA)
      .send({
        email: 'rollback@example.test',
        displayName: 'Rollback User',
        roleIds: [ids.roleAdminB],
      })
      .expect(409);
    expect(
      await database.user.findUnique({ where: { email: 'rollback@example.test' } }),
    ).toBeNull();
    expect(await database.outboxEvent.count()).toBe(beforeEvents);
  });

  it('enforces optimistic concurrency and tenant-scoped audit reads', async () => {
    await request(application.getHttpServer())
      .patch(`/api/v1/organizations/${ids.organizationA}`)
      .set('authorization', `Bearer ${adminToken}`)
      .set('x-organization-id', ids.organizationA)
      .send({ name: 'Fleet A Updated', version: 1 })
      .expect(200);
    const conflict = await request(application.getHttpServer())
      .patch(`/api/v1/organizations/${ids.organizationA}`)
      .set('authorization', `Bearer ${adminToken}`)
      .set('x-organization-id', ids.organizationA)
      .send({ name: 'Stale Update', version: 1 })
      .expect(409);
    expect(conflict.body.error.code).toBe('CONCURRENCY_CONFLICT');
    const audit = await request(application.getHttpServer())
      .get(`/api/v1/organizations/${ids.organizationA}/audit-logs`)
      .set('authorization', `Bearer ${adminToken}`)
      .set('x-organization-id', ids.organizationA)
      .expect(200);
    expect(
      audit.body.every(
        (entry: { organizationId: string }) => entry.organizationId === ids.organizationA,
      ),
    ).toBe(true);
  });
});

async function seedFixture(database: PrismaClient): Promise<void> {
  await database.organization.createMany({
    data: [
      { id: ids.organizationA, name: 'Fleet A', slug: 'fleet-a', status: PrincipalStatus.ACTIVE },
      { id: ids.organizationB, name: 'Fleet B', slug: 'fleet-b', status: PrincipalStatus.ACTIVE },
    ],
  });
  await database.user.createMany({
    data: [
      {
        id: ids.admin,
        email: 'admin-a@example.test',
        displayName: 'Admin A',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.viewer,
        email: 'viewer-a@example.test',
        displayName: 'Viewer A',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.suspended,
        email: 'suspended-a@example.test',
        displayName: 'Suspended A',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.manager,
        email: 'manager-a@example.test',
        displayName: 'Limited Manager A',
        status: PrincipalStatus.ACTIVE,
      },
    ],
  });
  await database.organizationMembership.createMany({
    data: [
      {
        id: ids.membershipAdminA,
        organizationId: ids.organizationA,
        userId: ids.admin,
        status: MembershipStatus.ACTIVE,
      },
      {
        id: ids.membershipViewerA,
        organizationId: ids.organizationA,
        userId: ids.viewer,
        status: MembershipStatus.ACTIVE,
      },
      {
        id: ids.membershipSuspendedA,
        organizationId: ids.organizationA,
        userId: ids.suspended,
        status: MembershipStatus.SUSPENDED,
      },
      {
        id: ids.membershipManagerA,
        organizationId: ids.organizationA,
        userId: ids.manager,
        status: MembershipStatus.ACTIVE,
      },
    ],
  });
  for (const [index, code] of permissionCodes.entries()) {
    await database.permission.create({
      data: {
        id: `51000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        code,
        description: code,
      },
    });
  }
  await database.role.createMany({
    data: [
      { id: ids.roleAdminA, organizationId: ids.organizationA, name: 'Admin A' },
      { id: ids.roleViewerA, organizationId: ids.organizationA, name: 'Viewer A' },
      { id: ids.roleAdminB, organizationId: ids.organizationB, name: 'Admin B' },
      { id: ids.roleManagerA, organizationId: ids.organizationA, name: 'Limited Manager A' },
    ],
  });
  const permissions = await database.permission.findMany();
  await database.rolePermission.createMany({
    data: [
      ...permissions.map((permission) => ({ roleId: ids.roleAdminA, permissionId: permission.id })),
      ...permissions
        .filter((permission) =>
          ['organization.read', 'membership.read', 'role.read', 'audit.read'].includes(
            permission.code,
          ),
        )
        .map((permission) => ({ roleId: ids.roleViewerA, permissionId: permission.id })),
      ...permissions.map((permission) => ({ roleId: ids.roleAdminB, permissionId: permission.id })),
      ...permissions
        .filter((permission) =>
          [
            'user.manage',
            'membership.manage',
            'membership.read',
            'role.manage',
            'role.read',
          ].includes(permission.code),
        )
        .map((permission) => ({ roleId: ids.roleManagerA, permissionId: permission.id })),
    ],
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
        organizationId: ids.organizationA,
        membershipId: ids.membershipManagerA,
        roleId: ids.roleManagerA,
      },
    ],
  });
}
