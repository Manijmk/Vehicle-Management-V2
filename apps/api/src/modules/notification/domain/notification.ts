export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS';

export type NotificationStatus =
  'PENDING' | 'DELIVERED' | 'PARTIALLY_DELIVERED' | 'FAILED' | 'CANCELLED';

export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';

export type NotificationCategory =
  'CRITICAL_INSPECTION' | 'COMPLIANCE_EXPIRY' | 'MAINTENANCE' | 'INCIDENT' | 'GENERAL';

export type DeliveryAttemptStatus = 'DELIVERED' | 'FAILED' | 'RETRYING' | 'SKIPPED';

export interface NotificationRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly displayId: string;
  readonly category: NotificationCategory;
  readonly type: string;
  readonly priority: NotificationPriority;
  readonly title: string;
  readonly body: string;
  readonly sourceEventId?: string | null;
  readonly sourceAggregateType?: string | null;
  readonly sourceAggregateId?: string | null;
  readonly metadata?: Record<string, unknown> | null;
  readonly createdAt: Date;
}

export interface NotificationRecipientRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly notificationId: string;
  readonly userId: string;
  readonly channels: readonly NotificationChannel[];
  readonly inAppRead: boolean;
  readonly inAppReadAt?: Date | null;
  readonly status: NotificationStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NotificationDeliveryAttemptRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly recipientId: string;
  readonly channel: NotificationChannel;
  readonly attemptNumber: number;
  readonly status: DeliveryAttemptStatus;
  readonly provider: string;
  readonly failureCode?: string | null;
  readonly failureMessage?: string | null;
  readonly attemptedAt: Date;
  readonly deliveredAt?: Date | null;
}

export interface DeriveRecipientStatusParams {
  readonly inAppDelivered: boolean;
  readonly externalAttempts?: readonly {
    readonly channel: 'EMAIL' | 'SMS';
    readonly status: DeliveryAttemptStatus;
  }[];
}

/**
 * Deterministically derives the aggregate status of a notification recipient
 * from its in-app presence and external delivery attempts.
 */
export function deriveRecipientStatus(params: DeriveRecipientStatusParams): NotificationStatus {
  const { inAppDelivered, externalAttempts = [] } = params;

  if (!inAppDelivered && externalAttempts.length === 0) {
    return 'PENDING';
  }

  if (externalAttempts.length === 0) {
    return inAppDelivered ? 'DELIVERED' : 'PENDING';
  }

  const hasRetrying = externalAttempts.some((a) => a.status === 'RETRYING');
  if (hasRetrying) {
    return 'PENDING';
  }

  const allEffectiveDelivered = externalAttempts.every(
    (a) => a.status === 'DELIVERED' || a.status === 'SKIPPED',
  );
  const anyDelivered = externalAttempts.some((a) => a.status === 'DELIVERED');
  const allFailed = externalAttempts.every((a) => a.status === 'FAILED');

  if (allEffectiveDelivered) {
    return 'DELIVERED';
  }

  if (allFailed && !inAppDelivered) {
    return 'FAILED';
  }

  if (anyDelivered || inAppDelivered) {
    return 'PARTIALLY_DELIVERED';
  }

  return 'FAILED';
}
