import { Inject, Injectable } from '@nestjs/common';

import {
  NotificationPreferenceInvalidError,
  NotificationTemplateRenderError,
} from '../domain/notification-errors.js';
import type { NotificationCategory, NotificationRecipientRecord } from '../domain/notification.js';
import {
  isMandatoryInAppNotification,
  type NotificationPreferenceRecord,
  resolveNotificationPreference,
} from '../domain/notification-preference.js';
import { extractPlaceholders } from '../domain/template-renderer.js';
import { NOTIFICATION_REPOSITORY } from '../notification.tokens.js';
import type {
  ListNotificationsParams,
  NotificationRepository,
  NotificationTemplateRecord,
  UserNotificationItem,
} from './notification.repository.js';

export const ALL_NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  'CRITICAL_INSPECTION',
  'COMPLIANCE_EXPIRY',
  'MAINTENANCE',
  'INCIDENT',
  'GENERAL',
] as const;

@Injectable()
export class NotificationService {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly repository: NotificationRepository,
  ) {}

  async listUserNotifications(params: ListNotificationsParams): Promise<{
    items: UserNotificationItem[];
    nextCursor?: string | undefined;
    totalUnread: number;
  }> {
    return this.repository.listNotificationsForUser(params);
  }

  async getUnreadCount(organizationId: string, userId: string): Promise<number> {
    return this.repository.getUnreadCount(organizationId, userId);
  }

  async markAsRead(
    organizationId: string,
    userId: string,
    recipientId: string,
  ): Promise<NotificationRecipientRecord> {
    return this.repository.markAsRead(organizationId, userId, recipientId);
  }

  async markAllAsRead(organizationId: string, userId: string): Promise<{ count: number }> {
    return this.repository.markAllAsRead(organizationId, userId);
  }

  async getUserPreferences(
    organizationId: string,
    userId: string,
    userEmail?: string | null,
    userPhone?: string | null,
  ): Promise<
    {
      category: NotificationCategory;
      inAppEnabled: boolean;
      emailEnabled: boolean;
      smsEnabled: boolean;
      isMandatoryInApp: boolean;
    }[]
  > {
    const stored = await this.repository.getPreferencesForUser(organizationId, userId);
    const storedMap = new Map(stored.map((p) => [p.category, p]));

    return ALL_NOTIFICATION_CATEGORIES.map((category) => {
      const pref = storedMap.get(category);
      const resolved = resolveNotificationPreference({
        category,
        storedPreference: pref,
        userEmail,
        userPhone,
      });

      return {
        category,
        inAppEnabled: resolved.inApp,
        emailEnabled: resolved.email,
        smsEnabled: resolved.sms,
        isMandatoryInApp: resolved.isMandatoryInApp,
      };
    });
  }

  async updateUserPreference(
    organizationId: string,
    userId: string,
    data: {
      category: NotificationCategory;
      inAppEnabled: boolean;
      emailEnabled: boolean;
      smsEnabled: boolean;
    },
  ): Promise<NotificationPreferenceRecord> {
    if (isMandatoryInAppNotification(data.category) && data.inAppEnabled === false) {
      throw new NotificationPreferenceInvalidError(
        'Mandatory operational notifications cannot be disabled in-app',
      );
    }

    return this.repository.upsertPreference({
      organizationId,
      userId,
      category: data.category,
      inAppEnabled: data.inAppEnabled,
      emailEnabled: data.emailEnabled,
      smsEnabled: data.smsEnabled,
    });
  }

  async listTemplates(organizationId: string): Promise<
    (NotificationTemplateRecord & {
      placeholders: string[];
    })[]
  > {
    const templates = await this.repository.listTemplates(organizationId);
    return templates.map((t) => ({
      ...t,
      placeholders: Array.from(
        new Set([...extractPlaceholders(t.titleTemplate), ...extractPlaceholders(t.bodyTemplate)]),
      ),
    }));
  }

  async updateTemplate(
    organizationId: string,
    key: string,
    data: {
      titleTemplate?: string | undefined;
      bodyTemplate?: string | undefined;
      enabled?: boolean | undefined;
      description?: string | undefined;
    },
  ): Promise<NotificationTemplateRecord> {
    if (data.titleTemplate !== undefined && data.titleTemplate.trim().length === 0) {
      throw new NotificationTemplateRenderError('Title template cannot be empty');
    }
    if (data.bodyTemplate !== undefined && data.bodyTemplate.trim().length === 0) {
      throw new NotificationTemplateRenderError('Body template cannot be empty');
    }

    return this.repository.updateTemplate(organizationId, key, data);
  }
}
