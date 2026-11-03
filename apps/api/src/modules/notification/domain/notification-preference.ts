import type { NotificationCategory } from './notification.js';

export interface NotificationPreferenceRecord {
  readonly id?: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly category: NotificationCategory;
  readonly inAppEnabled: boolean;
  readonly emailEnabled: boolean;
  readonly smsEnabled: boolean;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export interface ResolvePreferenceParams {
  readonly category: NotificationCategory;
  readonly storedPreference?: NotificationPreferenceRecord | null | undefined;
  readonly userEmail?: string | null | undefined;
  readonly userPhone?: string | null | undefined;
}

export interface ResolvedPreferenceChannels {
  readonly inApp: boolean;
  readonly email: boolean;
  readonly sms: boolean;
  readonly isMandatoryInApp: boolean;
}

/**
 * Checks whether a notification category is a mandatory operational safety notification
 * that must always be delivered in-app.
 */
export function isMandatoryInAppNotification(category: NotificationCategory): boolean {
  return category === 'CRITICAL_INSPECTION' || category === 'INCIDENT';
}

/**
 * Canonical resolver for notification preferences.
 * Safe default evaluation guarantees that a missing preference row never causes
 * notifications to silently disappear.
 */
export function resolveNotificationPreference(
  params: ResolvePreferenceParams,
): ResolvedPreferenceChannels {
  const { category, storedPreference, userEmail } = params;
  const mandatoryInApp = isMandatoryInAppNotification(category);

  const hasEmail =
    userEmail !== undefined ? Boolean(userEmail && userEmail.trim().length > 0) : true;

  if (!storedPreference) {
    return {
      inApp: true,
      email: hasEmail,
      sms: false,
      isMandatoryInApp: mandatoryInApp,
    };
  }

  return {
    inApp: mandatoryInApp ? true : storedPreference.inAppEnabled,
    email: hasEmail ? storedPreference.emailEnabled : false,
    sms: storedPreference.smsEnabled,
    isMandatoryInApp: mandatoryInApp,
  };
}
