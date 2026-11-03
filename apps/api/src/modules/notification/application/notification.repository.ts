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

export interface NotificationTemplateRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly key: string;
  readonly category: NotificationCategory;
  readonly titleTemplate: string;
  readonly bodyTemplate: string;
  readonly description?: string | null | undefined;
  readonly enabled: boolean;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UserNotificationItem {
  readonly id: string; // Recipient record ID
  readonly notificationId: string;
  readonly displayId: string;
  readonly category: NotificationCategory;
  readonly type: string;
  readonly priority: NotificationPriority;
  readonly title: string;
  readonly body: string;
  readonly inAppRead: boolean;
  readonly inAppReadAt?: Date | null | undefined;
  readonly status: NotificationStatus;
  readonly sourceEventId?: string | null | undefined;
  readonly sourceAggregateType?: string | null | undefined;
  readonly sourceAggregateId?: string | null | undefined;
  readonly metadata?: Record<string, unknown> | null | undefined;
  readonly createdAt: Date;
}

export interface CreateNotificationParams {
  readonly organizationId: string;
  readonly category: NotificationCategory;
  readonly type: string;
  readonly priority: NotificationPriority;
  readonly title: string;
  readonly body: string;
  readonly sourceEventId?: string | null | undefined;
  readonly sourceAggregateType?: string | null | undefined;
  readonly sourceAggregateId?: string | null | undefined;
  readonly metadata?: Record<string, unknown> | null | undefined;
  readonly recipients: readonly {
    readonly userId: string;
    readonly channels: readonly NotificationChannel[];
  }[];
}

export interface ListNotificationsParams {
  readonly organizationId: string;
  readonly userId: string;
  readonly unreadOnly?: boolean | undefined;
  readonly limit?: number | undefined;
  readonly cursor?: string | undefined;
}

export interface NotificationRepository {
  createNotification(params: CreateNotificationParams): Promise<{
    notification: NotificationRecord;
    recipients: NotificationRecipientRecord[];
  } | null>;

  listNotificationsForUser(params: ListNotificationsParams): Promise<{
    items: UserNotificationItem[];
    nextCursor?: string | undefined;
    totalUnread: number;
  }>;

  getUnreadCount(organizationId: string, userId: string): Promise<number>;

  findRecipientById(
    organizationId: string,
    recipientId: string,
  ): Promise<NotificationRecipientRecord | null>;

  markAsRead(
    organizationId: string,
    userId: string,
    recipientId: string,
  ): Promise<NotificationRecipientRecord>;

  markAllAsRead(organizationId: string, userId: string): Promise<{ count: number }>;

  getPreferencesForUser(
    organizationId: string,
    userId: string,
  ): Promise<NotificationPreferenceRecord[]>;

  upsertPreference(preference: NotificationPreferenceRecord): Promise<NotificationPreferenceRecord>;

  listTemplates(organizationId: string): Promise<NotificationTemplateRecord[]>;

  findTemplateByKey(
    organizationId: string,
    key: string,
  ): Promise<NotificationTemplateRecord | null>;

  updateTemplate(
    organizationId: string,
    key: string,
    data: {
      titleTemplate?: string | undefined;
      bodyTemplate?: string | undefined;
      enabled?: boolean | undefined;
      description?: string | undefined;
    },
  ): Promise<NotificationTemplateRecord>;

  recordDeliveryAttempt(attempt: {
    organizationId: string;
    recipientId: string;
    channel: NotificationChannel;
    attemptNumber: number;
    status: DeliveryAttemptStatus;
    provider: string;
    failureCode?: string | null;
    failureMessage?: string | null;
    deliveredAt?: Date | null;
  }): Promise<void>;

  updateRecipientStatus(
    organizationId: string,
    recipientId: string,
    status: NotificationStatus,
  ): Promise<void>;

  isAutomationDeduplicated(
    organizationId: string,
    ruleKey: string,
    aggregateId: string,
    windowKey: string,
  ): Promise<boolean>;

  recordAutomationDeduplication(
    organizationId: string,
    ruleKey: string,
    aggregateId: string,
    windowKey: string,
  ): Promise<boolean>;
}
