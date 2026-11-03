import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@vms/database';
import {
  type NotificationCategory,
  type NotificationChannel,
  type NotificationPriority,
  type PrismaClient,
} from '@vms/database';

import type { ClaimedOutboxEvent } from '../outbox/outbox.types.js';
import { WORKER_DATABASE } from '../outbox/tokens.js';
import { NotificationDeliveryService } from './notification-delivery.service.js';
import { resolveNotificationPreference } from './notification-preference.js';
import { renderTemplate } from './template-renderer.js';

interface RuleMatch {
  readonly templateKey: string;
  readonly category: NotificationCategory;
  readonly priority: NotificationPriority;
  readonly type: string;
}

@Injectable()
export class NotificationRuleEvaluatorService {
  private readonly logger = new Logger(NotificationRuleEvaluatorService.name);

  constructor(
    @Inject(WORKER_DATABASE)
    private readonly database: PrismaClient,
    @Inject(NotificationDeliveryService)
    private readonly deliveryService: NotificationDeliveryService,
  ) {}

  async handleEvent(event: ClaimedOutboxEvent): Promise<void> {
    const match = this.matchEventToRule(event);
    if (!match) {
      return;
    }

    const payload = (
      event.payload && typeof event.payload === 'object' ? event.payload : {}
    ) as Record<string, unknown>;

    // Idempotency pre-check
    const existing = await this.database.notification.findFirst({
      where: {
        organizationId: event.organizationId,
        sourceEventId: event.id,
        type: match.type,
      },
    });
    if (existing) {
      this.logger.debug(
        `Notification already created for event ${event.id} and type ${match.type}`,
      );
      return;
    }

    // Load active notification template
    const template = await this.database.notificationTemplate.findUnique({
      where: {
        organizationId_key: {
          organizationId: event.organizationId,
          key: match.templateKey,
        },
      },
    });

    if (!template || !template.enabled) {
      this.logger.debug(
        `Template ${match.templateKey} not found or disabled in tenant ${event.organizationId}`,
      );
      return;
    }

    // Resolve active memberships
    const memberships = await this.database.organizationMembership.findMany({
      where: {
        organizationId: event.organizationId,
        status: 'ACTIVE',
      },
      include: {
        user: true,
      },
    });

    if (memberships.length === 0) {
      return;
    }

    const userIds = memberships.map((m) => m.userId);
    const storedPreferences = await this.database.notificationPreference.findMany({
      where: {
        organizationId: event.organizationId,
        category: match.category,
        userId: { in: userIds },
      },
    });

    const prefMap = new Map<string, (typeof storedPreferences)[0]>();
    for (const p of storedPreferences) {
      prefMap.set(p.userId, p);
    }

    const recipientsToCreate: {
      userId: string;
      channels: NotificationChannel[];
      email?: string | null;
    }[] = [];

    for (const membership of memberships) {
      const stored = prefMap.get(membership.userId);
      const user = membership.user;
      const channelsConfig = resolveNotificationPreference({
        category: match.category,
        storedPreference: stored,
        userEmail: user?.email,
        userPhone: null,
      });

      const enabledChannels: NotificationChannel[] = [];
      if (channelsConfig.inApp) enabledChannels.push('IN_APP');
      if (channelsConfig.email) enabledChannels.push('EMAIL');
      if (channelsConfig.sms) enabledChannels.push('SMS');

      if (enabledChannels.length > 0) {
        recipientsToCreate.push({
          userId: membership.userId,
          channels: enabledChannels,
          email: user?.email,
        });
      }
    }

    if (recipientsToCreate.length === 0) {
      return;
    }

    const title = renderTemplate(template.titleTemplate, payload);
    const body = renderTemplate(template.bodyTemplate, payload);

    try {
      const created = await this.database.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('notification:' || ${event.organizationId}))`;

        const existingNotifs = await tx.notification.findMany({
          where: { organizationId: event.organizationId },
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

        return tx.notification.create({
          data: {
            organizationId: event.organizationId,
            displayId,
            category: match.category,
            type: match.type,
            priority: match.priority,
            title,
            body,
            sourceEventId: event.id,
            sourceAggregateType: event.aggregateType,
            sourceAggregateId: event.aggregateId,
            metadata: payload as Prisma.InputJsonValue,
            recipients: {
              create: recipientsToCreate.map((r) => ({
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
      });

      // Deliver via external providers for each recipient
      for (const recipient of created.recipients) {
        const matchingTarget = recipientsToCreate.find((r) => r.userId === recipient.userId);
        await this.deliveryService.deliver({
          organizationId: event.organizationId,
          recipientId: recipient.id,
          channels: recipient.channels as NotificationChannel[],
          title,
          body,
          userEmail: matchingTarget?.email,
          userPhone: null,
        });
      }
    } catch (err: unknown) {
      // Prisma P2002: unique constraint violation if event was processed concurrently
      if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002') {
        this.logger.debug(`Idempotent notification hit on unique constraint for event ${event.id}`);
        return;
      }
      this.logger.error(`Failed to create notification for event ${event.id}: ${String(err)}`);
      throw err;
    }
  }

  private matchEventToRule(event: ClaimedOutboxEvent): RuleMatch | null {
    const payload = (
      event.payload && typeof event.payload === 'object' ? event.payload : {}
    ) as Record<string, unknown>;

    switch (event.eventType) {
      case 'IncidentReported': {
        const severity = String(payload.severity ?? '').toUpperCase();
        if (severity === 'CRITICAL') {
          return {
            templateKey: 'INCIDENT_CRITICAL_REPORTED',
            category: 'INCIDENT',
            priority: 'HIGH',
            type: 'INCIDENT_CRITICAL_REPORTED',
          };
        }
        return null;
      }

      case 'InspectionCriticalFailureDetected': {
        return {
          templateKey: 'INSPECTION_CRITICAL_FAILURE',
          category: 'CRITICAL_INSPECTION',
          priority: 'HIGH',
          type: 'INSPECTION_CRITICAL_FAILURE',
        };
      }

      case 'WorkOrderCreated': {
        return {
          templateKey: 'MAINTENANCE_WORK_ORDER_CREATED',
          category: 'MAINTENANCE',
          priority: 'NORMAL',
          type: 'MAINTENANCE_WORK_ORDER_CREATED',
        };
      }

      case 'WorkOrderCompleted': {
        return {
          templateKey: 'MAINTENANCE_WORK_ORDER_COMPLETED',
          category: 'MAINTENANCE',
          priority: 'LOW',
          type: 'MAINTENANCE_WORK_ORDER_COMPLETED',
        };
      }

      default:
        return null;
    }
  }
}
