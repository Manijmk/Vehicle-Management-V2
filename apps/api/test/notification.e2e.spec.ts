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
  orgA: 'a1000000-0000-4000-8000-000000000001',
  orgB: 'a1000000-0000-4000-8000-000000000002',
  adminA: 'b1000000-0000-4000-8000-000000000001',
  viewerA: 'b1000000-0000-4000-8000-000000000002',
  userA2: 'b1000000-0000-4000-8000-000000000003',
  adminB: 'b1000000-0000-4000-8000-000000000004',
  membershipAdminA: 'c1000000-0000-4000-8000-000000000001',
  membershipViewerA: 'c1000000-0000-4000-8000-000000000002',
  membershipUserA2: 'c1000000-0000-4000-8000-000000000003',
  membershipAdminB: 'c1000000-0000-4000-8000-000000000004',
  roleAdminA: 'd1000000-0000-4000-8000-000000000001',
  roleViewerA: 'd1000000-0000-4000-8000-000000000002',
  roleAdminB: 'd1000000-0000-4000-8000-000000000003',
  notif1: 'e1000000-0000-4000-8000-000000000001',
  notif2: 'e1000000-0000-4000-8000-000000000002',
  recip1AdminA: 'f1000000-0000-4000-8000-000000000001',
  recip2AdminA: 'f1000000-0000-4000-8000-000000000002',
  recip1UserA2: 'f1000000-0000-4000-8000-000000000003',
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

async function cleanAll(database: PrismaClient) {
  await database.notificationDeliveryAttempt.deleteMany({
    where: { organizationId: { in: [ids.orgA, ids.orgB] } },
  });
  await database.notificationRecipient.deleteMany({
    where: { organizationId: { in: [ids.orgA, ids.orgB] } },
  });
  await database.notification.deleteMany({
    where: { organizationId: { in: [ids.orgA, ids.orgB] } },
  });
  await database.notificationPreference.deleteMany({
    where: { organizationId: { in: [ids.orgA, ids.orgB] } },
  });
  await database.notificationTemplate.deleteMany({
    where: { organizationId: { in: [ids.orgA, ids.orgB] } },
  });
  await database.automationDeduplication.deleteMany({
    where: { organizationId: { in: [ids.orgA, ids.orgB] } },
  });
  await database.membershipRole.deleteMany({
    where: { organizationId: { in: [ids.orgA, ids.orgB] } },
  });
  await database.rolePermission.deleteMany({
    where: { roleId: { in: [ids.roleAdminA, ids.roleViewerA, ids.roleAdminB] } },
  });
  await database.role.deleteMany({ where: { organizationId: { in: [ids.orgA, ids.orgB] } } });
  await database.organizationMembership.deleteMany({
    where: { organizationId: { in: [ids.orgA, ids.orgB] } },
  });
  await database.user.deleteMany({
    where: { id: { in: [ids.adminA, ids.viewerA, ids.userA2, ids.adminB] } },
  });
  await database.organization.deleteMany({ where: { id: { in: [ids.orgA, ids.orgB] } } });
}

async function seedFixture(database: PrismaClient) {
  // Organizations
  await database.organization.createMany({
    data: [
      {
        id: ids.orgA,
        name: 'Org A Notifications',
        slug: 'org-a-notifs',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.orgB,
        name: 'Org B Notifications',
        slug: 'org-b-notifs',
        status: PrincipalStatus.ACTIVE,
      },
    ],
  });

  // Users
  await database.user.createMany({
    data: [
      {
        id: ids.adminA,
        email: 'admin-a-notif@test.local',
        displayName: 'Admin A Notif',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.viewerA,
        email: 'viewer-a-notif@test.local',
        displayName: 'Viewer A Notif',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.userA2,
        email: 'user-a2-notif@test.local',
        displayName: 'User A2 Notif',
        status: PrincipalStatus.ACTIVE,
      },
      {
        id: ids.adminB,
        email: 'admin-b-notif@test.local',
        displayName: 'Admin B Notif',
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
        id: ids.membershipUserA2,
        organizationId: ids.orgA,
        userId: ids.userA2,
        status: MembershipStatus.ACTIVE,
      },
      {
        id: ids.membershipAdminB,
        organizationId: ids.orgB,
        userId: ids.adminB,
        status: MembershipStatus.ACTIVE,
      },
    ],
  });

  // Permissions
  for (const [idx, code] of permissionCodes.entries()) {
    const id = `a9000000-0000-4000-9000-${String(idx + 1).padStart(12, '0')}`;
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
        name: 'Notification Admin A',
        description: 'Admin role',
      },
      {
        id: ids.roleViewerA,
        organizationId: ids.orgA,
        name: 'Notification Viewer A',
        description: 'Viewer role',
      },
      {
        id: ids.roleAdminB,
        organizationId: ids.orgB,
        name: 'Notification Admin B',
        description: 'Admin role B',
      },
    ],
  });

  // Role permissions
  await database.rolePermission.createMany({
    data: [
      ...[...permMap.values()].map((pId) => ({ roleId: ids.roleAdminA, permissionId: pId })),
      ...[...permMap.values()].map((pId) => ({ roleId: ids.roleAdminB, permissionId: pId })),
      { roleId: ids.roleViewerA, permissionId: permMap.get('notification.read')! },
      { roleId: ids.roleViewerA, permissionId: permMap.get('notification.preference.update')! },
      { roleId: ids.roleViewerA, permissionId: permMap.get('notification.template.read')! },
      // Note: roleViewerA does NOT get notification.template.manage
    ],
    skipDuplicates: true,
  });

  await database.membershipRole.createMany({
    data: [
      { membershipId: ids.membershipAdminA, roleId: ids.roleAdminA, organizationId: ids.orgA },
      { membershipId: ids.membershipViewerA, roleId: ids.roleViewerA, organizationId: ids.orgA },
      { membershipId: ids.membershipUserA2, roleId: ids.roleViewerA, organizationId: ids.orgA },
      { membershipId: ids.membershipAdminB, roleId: ids.roleAdminB, organizationId: ids.orgB },
    ],
  });

  // Notification templates
  await database.notificationTemplate.createMany({
    data: [
      {
        organizationId: ids.orgA,
        key: 'INCIDENT_CRITICAL_REPORTED',
        category: 'INCIDENT',
        titleTemplate: 'Critical Incident: {{displayId}}',
        bodyTemplate: 'Critical incident: {{description}}',
        enabled: true,
      },
      {
        organizationId: ids.orgA,
        key: 'INSPECTION_CRITICAL_FAILURE',
        category: 'CRITICAL_INSPECTION',
        titleTemplate: 'Inspection Failed: {{displayId}}',
        bodyTemplate: 'Critical inspection defect on {{vehicleId}}',
        enabled: true,
      },
    ],
  });

  // Seed sample notifications and recipients in Org A
  await database.notification.create({
    data: {
      id: ids.notif1,
      organizationId: ids.orgA,
      displayId: 'NOTIF-1001',
      category: 'INCIDENT',
      type: 'INCIDENT_CRITICAL_REPORTED',
      priority: 'HIGH',
      title: 'Critical Incident: INC-1001',
      body: 'Engine caught fire',
      recipients: {
        create: [
          {
            id: ids.recip1AdminA,
            userId: ids.adminA,
            channels: ['IN_APP', 'EMAIL'],
            inAppRead: false,
            status: 'DELIVERED',
          },
          {
            id: ids.recip1UserA2,
            userId: ids.userA2,
            channels: ['IN_APP'],
            inAppRead: false,
            status: 'DELIVERED',
          },
        ],
      },
    },
  });

  await database.notification.create({
    data: {
      id: ids.notif2,
      organizationId: ids.orgA,
      displayId: 'NOTIF-1002',
      category: 'CRITICAL_INSPECTION',
      type: 'INSPECTION_CRITICAL_FAILURE',
      priority: 'HIGH',
      title: 'Inspection Failed: INSP-1001',
      body: 'Brakes completely failed',
      recipients: {
        create: [
          {
            id: ids.recip2AdminA,
            userId: ids.adminA,
            channels: ['IN_APP'],
            inAppRead: true,
            inAppReadAt: new Date(),
            status: 'DELIVERED',
          },
        ],
      },
    },
  });
}

describe('Milestone 11: Notifications and Automation (e2e)', () => {
  let app: INestApplication;
  let database: PrismaClient;
  let tokens: {
    adminA: string;
    viewerA: string;
    userA2: string;
    adminB: string;
  };

  beforeAll(async () => {
    database = createDatabaseClient({ databaseUrl });
    await cleanAll(database);

    await seedFixture(database);

    const config = loadApiConfig();
    const tokenAdapter = new LocalJwtAuthenticationAdapter(config);
    const [adminAToken, viewerAToken, userA2Token, adminBToken] = await Promise.all([
      tokenAdapter.issueDevelopmentToken(ids.adminA, '1h'),
      tokenAdapter.issueDevelopmentToken(ids.viewerA, '1h'),
      tokenAdapter.issueDevelopmentToken(ids.userA2, '1h'),
      tokenAdapter.issueDevelopmentToken(ids.adminB, '1h'),
    ]);

    tokens = {
      adminA: adminAToken,
      viewerA: viewerAToken,
      userA2: userA2Token,
      adminB: adminBToken,
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
    await cleanAll(database);
    await database.$disconnect();
  });

  describe('In-App Notification Feed', () => {
    it('lists all notifications for the authenticated user', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .expect(200);

      expect(res.body.items).toBeInstanceOf(Array);
      expect(res.body.items.length).toBe(2);
      expect(res.body.totalUnread).toBe(1);
    });

    it('filters notifications by unreadOnly=true', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications?unreadOnly=true')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .expect(200);

      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].inAppRead).toBe(false);
      expect(res.body.items[0].id).toBe(ids.recip1AdminA);
    });

    it('returns the unread notification count badge value', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .expect(200);

      expect(res.body.unreadCount).toBe(1);
    });

    it('marks an individual notification as read', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${ids.recip1AdminA}/read`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .expect(200);

      expect(res.body.inAppRead).toBe(true);
      expect(res.body.inAppReadAt).toBeDefined();

      // Verify unread count decremented to 0
      const countRes = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .expect(200);

      expect(countRes.body.unreadCount).toBe(0);
    });

    it('marks all notifications as read for authenticated user', async () => {
      // User A2 currently has 1 unread notification (recip1UserA2)
      const beforeRes = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${tokens.userA2}`)
        .set('x-organization-id', ids.orgA)
        .expect(200);

      expect(beforeRes.body.unreadCount).toBe(1);

      const res = await request(app.getHttpServer())
        .post('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${tokens.userA2}`)
        .set('x-organization-id', ids.orgA)
        .expect(200);

      expect(res.body.count).toBe(1);

      const afterRes = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${tokens.userA2}`)
        .set('x-organization-id', ids.orgA)
        .expect(200);

      expect(afterRes.body.unreadCount).toBe(0);
    });
  });

  describe('Isolation and Authorization', () => {
    it('isolates notification feed between organizations', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${tokens.adminB}`)
        .set('x-organization-id', ids.orgB)
        .expect(200);

      expect(res.body.items.length).toBe(0);
      expect(res.body.totalUnread).toBe(0);
    });

    it('prevents cross-tenant marking as read', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${ids.recip1AdminA}/read`)
        .set('Authorization', `Bearer ${tokens.adminB}`)
        .set('x-organization-id', ids.orgB)
        .expect(404);
    });

    it('prevents cross-user marking as read within same organization', async () => {
      // Admin A trying to mark recip1UserA2
      await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${ids.recip1UserA2}/read`)
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .expect(404);
    });
  });

  describe('Notification Preferences', () => {
    it('returns default preferences across all categories when no rows stored', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notification-preferences')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .expect(200);

      expect(res.body.items).toBeInstanceOf(Array);
      expect(res.body.items.length).toBe(5);

      const incidentPref = res.body.items.find(
        (i: { category: string; isMandatoryInApp: boolean; inAppEnabled: boolean }) =>
          i.category === 'INCIDENT',
      );
      expect(incidentPref).toBeDefined();
      expect(incidentPref.isMandatoryInApp).toBe(true);
      expect(incidentPref.inAppEnabled).toBe(true);
    });

    it('updates user notification preference for a category', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/notification-preferences')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          category: 'MAINTENANCE',
          inAppEnabled: true,
          emailEnabled: false,
          smsEnabled: false,
        })
        .expect(200);

      expect(res.body.category).toBe('MAINTENANCE');
      expect(res.body.emailEnabled).toBe(false);
    });

    it('rejects disabling inApp for mandatory operational safety categories', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/notification-preferences')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          category: 'CRITICAL_INSPECTION',
          inAppEnabled: false,
          emailEnabled: true,
          smsEnabled: false,
        })
        .expect(400);

      expect(res.body.error?.message).toContain(
        'Mandatory operational notifications cannot be disabled in-app',
      );
    });
  });

  describe('Notification Templates', () => {
    it('lists templates for tenant', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notification-templates')
        .set('Authorization', `Bearer ${tokens.viewerA}`)
        .set('x-organization-id', ids.orgA)
        .expect(200);

      expect(res.body.items).toBeInstanceOf(Array);
      expect(res.body.items.length).toBeGreaterThanOrEqual(2);
      const incTemplate = res.body.items.find(
        (t: { key: string; placeholders: string[] }) => t.key === 'INCIDENT_CRITICAL_REPORTED',
      );
      expect(incTemplate).toBeDefined();
      expect(incTemplate.placeholders).toContain('displayId');
    });

    it('allows admin to update a template', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/notification-templates/INCIDENT_CRITICAL_REPORTED')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          titleTemplate: 'Updated Critical: {{displayId}}',
          description: 'Updated description by admin',
        })
        .expect(200);

      expect(res.body.titleTemplate).toBe('Updated Critical: {{displayId}}');
      expect(res.body.version).toBe(2);
    });

    it('forbids viewer without template.manage permission from updating template', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/notification-templates/INCIDENT_CRITICAL_REPORTED')
        .set('Authorization', `Bearer ${tokens.viewerA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          titleTemplate: 'Hacked Title',
        })
        .expect(403);
    });

    it('rejects updating with blank template string', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/notification-templates/INCIDENT_CRITICAL_REPORTED')
        .set('Authorization', `Bearer ${tokens.adminA}`)
        .set('x-organization-id', ids.orgA)
        .send({
          titleTemplate: '   ',
        })
        .expect(400);
    });
  });
});
