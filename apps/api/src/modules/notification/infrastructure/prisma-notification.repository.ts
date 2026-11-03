import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@vms/database';

import { DATABASE } from '../../../common/tokens.js';
import {
  NotificationNotFoundError,
  NotificationTemplateNotFoundError,
} from '../domain/notification-errors.js';
import type {
  CreateNotificationParams,
  ListNotificationsParams,
  NotificationRepository,
  NotificationTemplateRecord,
  UserNotificationItem,
} from '../application/notification.repository.js';
import type {
  DeliveryAttemptStatus,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  NotificationRecipientRecord,
  NotificationRecord,
  NotificationStatus,
} from '../domain/notification.js';
import type { NotificationPreferenceRecord } from '../domain/notification-preference.js';

@Injectable()
export class PrismaNotificationRepository implements NotificationRepository {
  constructor(
    @Inject(DATABASE)
    private readonly database: PrismaClient,
  ) {}

  async createNotification(params: CreateNotificationParams): Promise<{
    notification: NotificationRecord;
    recipients: NotificationRecipientRecord[];
  } | null> {
    const {
      organizationId,
      category,
      type,
      priority,
      title,
      body,
      sourceEventId,
      sourceAggregateType,
      sourceAggregateId,
      metadata,
      recipients,
    } = params;

    // Idempotency check if sourceEventId is provided
    if (sourceEventId) {
      const existing = await this.database.notification.findFirst({
        where: {
          organizationId,
          sourceEventId,
          type,
        },
        include: {
          recipients: true,
        },
      });

      if (existing) {
        return {
          notification: this.mapNotification(existing),
          recipients: existing.recipients.map((r) => this.mapRecipient(r)),
        };
      }
    }

    // Allocate display ID
    const existingNotifs = await this.database.notification.findMany({
      where: { organizationId },
      select: { displayId: true },
    });

    let maxNum = 1000;
    for (const n of existingNotifs) {
      const match = /^NOTIF-(\d+)$/i.exec(n.displayId);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    const displayId = `NOTIF-${maxNum + 1}`;

    try {
      const created = await this.database.notification.create({
        data: {
          organizationId,
          displayId,
          category,
          type,
          priority,
          title,
          body,
          sourceEventId: sourceEventId ?? null,
          sourceAggregateType: sourceAggregateType ?? null,
          sourceAggregateId: sourceAggregateId ?? null,
          metadata: metadata ? (metadata as Prisma.InputJsonValue) : Prisma.DbNull,
          recipients: {
            create: recipients.map((r) => ({
              userId: r.userId,
              channels: [...r.channels],
              inAppRead: false,
              status: 'PENDING',
            })),
          },
        },
        include: {
          recipients: true,
        },
      });

      return {
        notification: this.mapNotification(created),
        recipients: created.recipients.map((r) => this.mapRecipient(r)),
      };
    } catch (error: unknown) {
      // Prisma P2002 unique constraint code
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        if (sourceEventId) {
          const fallback = await this.database.notification.findFirst({
            where: { organizationId, sourceEventId, type },
            include: { recipients: true },
          });
          if (fallback) {
            return {
              notification: this.mapNotification(fallback),
              recipients: fallback.recipients.map((r) => this.mapRecipient(r)),
            };
          }
        }
      }
      throw error;
    }
  }

  async listNotificationsForUser(params: ListNotificationsParams): Promise<{
    items: UserNotificationItem[];
    nextCursor?: string;
    totalUnread: number;
  }> {
    const { organizationId, userId, unreadOnly = false, limit = 20, cursor } = params;
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const where: Prisma.NotificationRecipientWhereInput = {
      organizationId,
      userId,
      ...(unreadOnly ? { inAppRead: false } : {}),
    };

    const [recipients, totalUnread] = await Promise.all([
      this.database.notificationRecipient.findMany({
        where,
        include: {
          notification: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: safeLimit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      this.database.notificationRecipient.count({
        where: {
          organizationId,
          userId,
          inAppRead: false,
        },
      }),
    ]);

    const hasNext = recipients.length > safeLimit;
    const records = hasNext ? recipients.slice(0, safeLimit) : recipients;
    const nextCursor = hasNext && records.length > 0 ? records[records.length - 1]?.id : undefined;

    const items: UserNotificationItem[] = records.map((r) => ({
      id: r.id,
      notificationId: r.notification.id,
      displayId: r.notification.displayId,
      category: r.notification.category as NotificationCategory,
      type: r.notification.type,
      priority: r.notification.priority as NotificationPriority,
      title: r.notification.title,
      body: r.notification.body,
      inAppRead: r.inAppRead,
      inAppReadAt: r.inAppReadAt,
      status: r.status as NotificationStatus,
      sourceEventId: r.notification.sourceEventId,
      sourceAggregateType: r.notification.sourceAggregateType,
      sourceAggregateId: r.notification.sourceAggregateId,
      metadata: r.notification.metadata as Record<string, unknown> | null,
      createdAt: r.createdAt,
    }));

    return {
      items,
      totalUnread,
      ...(nextCursor ? { nextCursor } : {}),
    };
  }

  async getUnreadCount(organizationId: string, userId: string): Promise<number> {
    return this.database.notificationRecipient.count({
      where: {
        organizationId,
        userId,
        inAppRead: false,
      },
    });
  }

  async findRecipientById(
    organizationId: string,
    recipientId: string,
  ): Promise<NotificationRecipientRecord | null> {
    const row = await this.database.notificationRecipient.findFirst({
      where: { id: recipientId, organizationId },
    });
    return row ? this.mapRecipient(row) : null;
  }

  async markAsRead(
    organizationId: string,
    userId: string,
    recipientId: string,
  ): Promise<NotificationRecipientRecord> {
    const existing = await this.database.notificationRecipient.findFirst({
      where: { id: recipientId, organizationId },
    });

    if (!existing || existing.userId !== userId) {
      throw new NotificationNotFoundError(recipientId);
    }

    if (existing.inAppRead) {
      return this.mapRecipient(existing);
    }

    const updated = await this.database.notificationRecipient.update({
      where: { id: recipientId },
      data: {
        inAppRead: true,
        inAppReadAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return this.mapRecipient(updated);
  }

  async markAllAsRead(organizationId: string, userId: string): Promise<{ count: number }> {
    const res = await this.database.notificationRecipient.updateMany({
      where: {
        organizationId,
        userId,
        inAppRead: false,
      },
      data: {
        inAppRead: true,
        inAppReadAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return { count: res.count };
  }

  async getPreferencesForUser(
    organizationId: string,
    userId: string,
  ): Promise<NotificationPreferenceRecord[]> {
    const rows = await this.database.notificationPreference.findMany({
      where: { organizationId, userId },
      orderBy: { category: 'asc' },
    });

    return rows.map((p) => ({
      id: p.id,
      organizationId: p.organizationId,
      userId: p.userId,
      category: p.category as NotificationCategory,
      inAppEnabled: p.inAppEnabled,
      emailEnabled: p.emailEnabled,
      smsEnabled: p.smsEnabled,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }

  async upsertPreference(
    preference: NotificationPreferenceRecord,
  ): Promise<NotificationPreferenceRecord> {
    const row = await this.database.notificationPreference.upsert({
      where: {
        organizationId_userId_category: {
          organizationId: preference.organizationId,
          userId: preference.userId,
          category: preference.category,
        },
      },
      update: {
        inAppEnabled: preference.inAppEnabled,
        emailEnabled: preference.emailEnabled,
        smsEnabled: preference.smsEnabled,
        updatedAt: new Date(),
      },
      create: {
        organizationId: preference.organizationId,
        userId: preference.userId,
        category: preference.category,
        inAppEnabled: preference.inAppEnabled,
        emailEnabled: preference.emailEnabled,
        smsEnabled: preference.smsEnabled,
      },
    });

    return {
      id: row.id,
      organizationId: row.organizationId,
      userId: row.userId,
      category: row.category as NotificationCategory,
      inAppEnabled: row.inAppEnabled,
      emailEnabled: row.emailEnabled,
      smsEnabled: row.smsEnabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async listTemplates(organizationId: string): Promise<NotificationTemplateRecord[]> {
    const rows = await this.database.notificationTemplate.findMany({
      where: { organizationId },
      orderBy: { key: 'asc' },
    });

    return rows.map((t) => this.mapTemplate(t));
  }

  async findTemplateByKey(
    organizationId: string,
    key: string,
  ): Promise<NotificationTemplateRecord | null> {
    const row = await this.database.notificationTemplate.findUnique({
      where: {
        organizationId_key: { organizationId, key },
      },
    });

    return row ? this.mapTemplate(row) : null;
  }

  async updateTemplate(
    organizationId: string,
    key: string,
    data: {
      titleTemplate?: string;
      bodyTemplate?: string;
      enabled?: boolean;
      description?: string;
    },
  ): Promise<NotificationTemplateRecord> {
    const existing = await this.database.notificationTemplate.findUnique({
      where: { organizationId_key: { organizationId, key } },
    });

    if (!existing) {
      throw new NotificationTemplateNotFoundError(key);
    }

    const updated = await this.database.notificationTemplate.update({
      where: { organizationId_key: { organizationId, key } },
      data: {
        ...(data.titleTemplate !== undefined ? { titleTemplate: data.titleTemplate } : {}),
        ...(data.bodyTemplate !== undefined ? { bodyTemplate: data.bodyTemplate } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        version: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    return this.mapTemplate(updated);
  }

  async recordDeliveryAttempt(attempt: {
    organizationId: string;
    recipientId: string;
    channel: NotificationChannel;
    attemptNumber: number;
    status: DeliveryAttemptStatus;
    provider: string;
    failureCode?: string | null;
    failureMessage?: string | null;
    deliveredAt?: Date | null;
  }): Promise<void> {
    await this.database.notificationDeliveryAttempt.create({
      data: {
        organizationId: attempt.organizationId,
        recipientId: attempt.recipientId,
        channel: attempt.channel,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        provider: attempt.provider,
        failureCode: attempt.failureCode ?? null,
        failureMessage: attempt.failureMessage ?? null,
        deliveredAt: attempt.deliveredAt ?? null,
      },
    });
  }

  async updateRecipientStatus(
    organizationId: string,
    recipientId: string,
    status: NotificationStatus,
  ): Promise<void> {
    await this.database.notificationRecipient.update({
      where: { id_organizationId: { id: recipientId, organizationId } },
      data: { status, updatedAt: new Date() },
    });
  }

  async isAutomationDeduplicated(
    organizationId: string,
    ruleKey: string,
    aggregateId: string,
    windowKey: string,
  ): Promise<boolean> {
    const found = await this.database.automationDeduplication.findUnique({
      where: {
        organizationId_ruleKey_aggregateId_windowKey: {
          organizationId,
          ruleKey,
          aggregateId,
          windowKey,
        },
      },
    });
    return Boolean(found);
  }

  async recordAutomationDeduplication(
    organizationId: string,
    ruleKey: string,
    aggregateId: string,
    windowKey: string,
  ): Promise<boolean> {
    try {
      await this.database.automationDeduplication.create({
        data: {
          organizationId,
          ruleKey,
          aggregateId,
          windowKey,
        },
      });
      return true;
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        return false;
      }
      throw error;
    }
  }

  private mapNotification(row: {
    id: string;
    organizationId: string;
    displayId: string;
    category: string;
    type: string;
    priority: string;
    title: string;
    body: string;
    sourceEventId: string | null;
    sourceAggregateType: string | null;
    sourceAggregateId: string | null;
    metadata: unknown;
    createdAt: Date;
  }): NotificationRecord {
    return {
      id: row.id,
      organizationId: row.organizationId,
      displayId: row.displayId,
      category: row.category as NotificationCategory,
      type: row.type,
      priority: row.priority as NotificationPriority,
      title: row.title,
      body: row.body,
      sourceEventId: row.sourceEventId,
      sourceAggregateType: row.sourceAggregateType,
      sourceAggregateId: row.sourceAggregateId,
      metadata: row.metadata as Record<string, unknown> | null,
      createdAt: row.createdAt,
    };
  }

  private mapRecipient(row: {
    id: string;
    organizationId: string;
    notificationId: string;
    userId: string;
    channels: string[];
    inAppRead: boolean;
    inAppReadAt: Date | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }): NotificationRecipientRecord {
    return {
      id: row.id,
      organizationId: row.organizationId,
      notificationId: row.notificationId,
      userId: row.userId,
      channels: row.channels as NotificationChannel[],
      inAppRead: row.inAppRead,
      inAppReadAt: row.inAppReadAt,
      status: row.status as NotificationStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapTemplate(row: {
    id: string;
    organizationId: string;
    key: string;
    category: string;
    titleTemplate: string;
    bodyTemplate: string;
    description: string | null;
    enabled: boolean;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }): NotificationTemplateRecord {
    return {
      id: row.id,
      organizationId: row.organizationId,
      key: row.key,
      category: row.category as NotificationCategory,
      titleTemplate: row.titleTemplate,
      bodyTemplate: row.bodyTemplate,
      description: row.description,
      enabled: row.enabled,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
