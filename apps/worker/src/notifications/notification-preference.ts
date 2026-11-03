import type { NotificationCategory } from '@vms/database';

export interface NotificationPreferenceRecord {
  readonly id?: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly category: NotificationCategory;
  readonly inAppEnabled: boolean;
  readonly emailEnabled: boolean;
  readonly smsEnabled: boolean;
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

export function isMandatoryInAppNotification(category: NotificationCategory): boolean {
  return category === 'CRITICAL_INSPECTION' || category === 'INCIDENT';
}

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
