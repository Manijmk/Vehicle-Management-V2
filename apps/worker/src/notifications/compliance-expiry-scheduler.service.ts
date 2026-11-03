import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@vms/database';
import { type NotificationChannel, type PrismaClient } from '@vms/database';

import { WORKER_DATABASE } from '../outbox/tokens.js';
import { NotificationDeliveryService } from './notification-delivery.service.js';
import { resolveNotificationPreference } from './notification-preference.js';
import { renderTemplate } from './template-renderer.js';

interface ExpiryWindow {
  readonly key: string;
  readonly maxDays: number;
}

const EXPIRY_WINDOWS: readonly ExpiryWindow[] = [
  { key: 'EXPIRED', maxDays: 0 },
  { key: '1_DAY', maxDays: 1 },
  { key: '7_DAYS', maxDays: 7 },
  { key: '14_DAYS', maxDays: 14 },
  { key: '30_DAYS', maxDays: 30 },
];

@Injectable()
export class ComplianceExpirySchedulerService {
  private readonly logger = new Logger(ComplianceExpirySchedulerService.name);

  constructor(
    @Inject(WORKER_DATABASE)
    private readonly database: PrismaClient,
    @Inject(NotificationDeliveryService)
    private readonly deliveryService: NotificationDeliveryService,
  ) {}

  /**
   * Run an expiry sweep across all active organizations.
   * Uses per-tenant advisory locks and durable deduplication.
   */
  async runExpiryScan(targetOrganizationId?: string): Promise<{
    scannedCount: number;
    notificationsCreated: number;
  }> {
    let orgs: { id: string }[] = [];
    if (targetOrganizationId) {
      orgs = [{ id: targetOrganizationId }];
    } else {
      orgs = await this.database.organization.findMany({
        select: { id: true },
      });
    }

    let totalScanned = 0;
    let totalCreated = 0;

    for (const org of orgs) {
      const result = await this.processOrganizationCompliance(org.id);
      totalScanned += result.scanned;
      totalCreated += result.created;
    }

    return {
      scannedCount: totalScanned,
      notificationsCreated: totalCreated,
    };
  }

  private async processOrganizationCompliance(
    organizationId: string,
  ): Promise<{ scanned: number; created: number }> {
    const deliveriesToRun: {
      recipientId: string;
      channels: NotificationChannel[];
      title: string;
      body: string;
      userEmail?: string | null | undefined;
    }[] = [];

    const result = await this.database.$transaction(async (tx) => {
      // Non-blocking advisory lock for this tenant's compliance scan
      const lockResult = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtext('compliance_expiry:' || ${organizationId})) as locked
      `;

      if (!lockResult[0]?.locked) {
        this.logger.debug(
          `Could not acquire advisory lock for organization ${organizationId}, skipping sweep`,
        );
        return { scanned: 0, created: 0 };
      }

      const now = new Date();
      const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const documents = await tx.complianceDocument.findMany({
        where: {
          organizationId,
          status: 'ACTIVE',
          expiresOn: {
            lte: thirtyDaysAhead,
          },
        },
        include: {
          documentType: {
            select: { code: true, name: true },
          },
        },
      });

      if (documents.length === 0) {
        return { scanned: 0, created: 0 };
      }

      let createdCount = 0;

      // Find template
      const template = await tx.notificationTemplate.findUnique({
        where: {
          organizationId_key: {
            organizationId,
            key: 'COMPLIANCE_DOCUMENT_EXPIRING',
          },
        },
      });

      if (!template || !template.enabled) {
        return { scanned: documents.length, created: 0 };
      }

      // Find active tenant users
      const memberships = await tx.organizationMembership.findMany({
        where: { organizationId, status: 'ACTIVE' },
        include: { user: true },
      });

      if (memberships.length === 0) {
        return { scanned: documents.length, created: 0 };
      }

      const userIds = memberships.map((m) => m.userId);
      const storedPreferences = await tx.notificationPreference.findMany({
        where: {
          organizationId,
          category: 'COMPLIANCE_EXPIRY',
          userId: { in: userIds },
        },
      });

      const prefMap = new Map<string, (typeof storedPreferences)[0]>();
      for (const p of storedPreferences) {
        prefMap.set(p.userId, p);
      }

      const eligibleRecipients: {
        userId: string;
        channels: NotificationChannel[];
        email?: string | null;
      }[] = [];

      for (const m of memberships) {
        const stored = prefMap.get(m.userId);
        const resolved = resolveNotificationPreference({
          category: 'COMPLIANCE_EXPIRY',
          storedPreference: stored,
          userEmail: m.user?.email,
          userPhone: null,
        });

        const channels: NotificationChannel[] = [];
        if (resolved.inApp) channels.push('IN_APP');
        if (resolved.email) channels.push('EMAIL');
        if (resolved.sms) channels.push('SMS');

        if (channels.length > 0) {
          eligibleRecipients.push({
            userId: m.userId,
            channels,
            email: m.user?.email,
          });
        }
      }

      if (eligibleRecipients.length === 0) {
        return { scanned: documents.length, created: 0 };
      }

      for (const doc of documents) {
        if (!doc.expiresOn) continue;

        const diffMs = doc.expiresOn.getTime() - now.getTime();
        const daysRemaining = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

        // Find most specific window (ascending order of maxDays)
        let matchedWindow: ExpiryWindow | null = null;
        for (const w of EXPIRY_WINDOWS) {
          if (daysRemaining <= w.maxDays) {
            matchedWindow = w;
            break;
          }
        }

        if (!matchedWindow) continue;

        // Check deduplication
        const dedup = await tx.automationDeduplication.findUnique({
          where: {
            organizationId_ruleKey_aggregateId_windowKey: {
              organizationId,
              ruleKey: 'COMPLIANCE_EXPIRING',
              aggregateId: doc.id,
              windowKey: matchedWindow.key,
            },
          },
        });

        if (dedup) {
          continue; // Already notified in this window
        }

        // Record deduplication
        await tx.automationDeduplication.create({
          data: {
            organizationId,
            ruleKey: 'COMPLIANCE_EXPIRING',
            aggregateId: doc.id,
            windowKey: matchedWindow.key,
          },
        });

        const templateData = {
          documentId: doc.id,
          documentNumber: doc.documentNumber ?? doc.displayId,
          type: doc.documentType?.name ?? doc.documentType?.code ?? 'Compliance Document',
          daysRemaining: Math.max(daysRemaining, 0),
          expiresAt: doc.expiresOn.toISOString().split('T')[0],
          subjectType: doc.subjectType,
          subjectId: doc.vehicleId ?? doc.driverId ?? '',
        };

        const title = renderTemplate(template.titleTemplate, templateData);
        const body = renderTemplate(template.bodyTemplate, templateData);

        // Allocate NOTIF- displayId
        const existingNotifs = await tx.notification.findMany({
          where: { organizationId },
          select: { displayId: true },
        });
        let maxNum = 1000;
        for (const n of existingNotifs) {
          const m = /^NOTIF-(\d+)$/i.exec(n.displayId);
          if (m && m[1]) {
            const num = parseInt(m[1], 10);
            if (num > maxNum) maxNum = num;
          }
        }
        const displayId = `NOTIF-${maxNum + 1}`;

        const createdNotification = await tx.notification.create({
          data: {
            organizationId,
            displayId,
            category: 'COMPLIANCE_EXPIRY',
            type: 'COMPLIANCE_DOCUMENT_EXPIRING',
            priority: daysRemaining <= 1 ? 'HIGH' : daysRemaining <= 7 ? 'NORMAL' : 'LOW',
            title,
            body,
            sourceAggregateType: 'ComplianceDocument',
            sourceAggregateId: doc.id,
            metadata: templateData as Prisma.InputJsonValue,
            recipients: {
              create: eligibleRecipients.map((r) => ({
                userId: r.userId,
                channels: r.channels,
                inAppRead: false,
                status: 'PENDING',
              })),
            },
          },
          include: {
            recipients: true,
          },
        });

        createdCount++;

        // Collect delivery items to run after transaction commits
        for (const recipient of createdNotification.recipients) {
          const match = eligibleRecipients.find((r) => r.userId === recipient.userId);
          deliveriesToRun.push({
            recipientId: recipient.id,
            channels: recipient.channels as NotificationChannel[],
            title,
            body,
            userEmail: match?.email ?? null,
          });
        }
      }

      return { scanned: documents.length, created: createdCount };
    });

    // Run deliveries post-commit
    for (const d of deliveriesToRun) {
      await this.deliveryService.deliver({
        organizationId,
        recipientId: d.recipientId,
        channels: d.channels,
        title: d.title,
        body: d.body,
        userEmail: d.userEmail,
        userPhone: null,
      });
    }

    return result;
  }
}
