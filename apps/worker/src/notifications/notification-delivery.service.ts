import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  DeliveryAttemptStatus,
  NotificationChannel,
  NotificationStatus,
  PrismaClient,
} from '@vms/database';

import { WORKER_DATABASE } from '../outbox/tokens.js';
import type {
  EmailNotificationProvider,
  SmsNotificationProvider,
} from './delivery-provider.port.js';

export const WORKER_EMAIL_PROVIDER = Symbol('WORKER_EMAIL_PROVIDER');
export const WORKER_SMS_PROVIDER = Symbol('WORKER_SMS_PROVIDER');

export interface DeliverRecipientParams {
  readonly organizationId: string;
  readonly recipientId: string;
  readonly channels: readonly NotificationChannel[];
  readonly title: string;
  readonly body: string;
  readonly userEmail?: string | null | undefined;
  readonly userPhone?: string | null | undefined;
}

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    @Inject(WORKER_DATABASE)
    private readonly database: PrismaClient,
    @Inject(WORKER_EMAIL_PROVIDER)
    private readonly emailProvider: EmailNotificationProvider,
    @Inject(WORKER_SMS_PROVIDER)
    private readonly smsProvider: SmsNotificationProvider,
  ) {}

  async deliver(params: DeliverRecipientParams): Promise<void> {
    const { organizationId, recipientId, channels, title, body, userEmail, userPhone } = params;

    let hasExternalFailure = false;
    let hasExternalRetrying = false;

    // Email channel
    if (channels.includes('EMAIL')) {
      if (!userEmail || userEmail.trim().length === 0) {
        await this.recordAttempt({
          organizationId,
          recipientId,
          channel: 'EMAIL',
          attemptNumber: 1,
          status: 'SKIPPED',
          provider: 'log-email',
          failureCode: 'NO_EMAIL',
          failureMessage: 'Recipient has no registered email address',
        });
      } else {
        const result = await this.emailProvider.sendEmail({
          to: userEmail,
          subject: title,
          body,
          recipientId,
        });

        if (result.success) {
          await this.recordAttempt({
            organizationId,
            recipientId,
            channel: 'EMAIL',
            attemptNumber: 1,
            status: 'DELIVERED',
            provider: result.provider,
            deliveredAt: new Date(),
          });
        } else {
          const isTransient = result.error?.isTransient ?? false;
          if (isTransient) {
            hasExternalRetrying = true;
          } else {
            hasExternalFailure = true;
          }
          await this.recordAttempt({
            organizationId,
            recipientId,
            channel: 'EMAIL',
            attemptNumber: 1,
            status: isTransient ? 'RETRYING' : 'FAILED',
            provider: result.provider,
            failureCode: result.error?.code ?? 'DELIVERY_ERROR',
            failureMessage: result.error?.message ?? 'Unknown delivery error',
          });
        }
      }
    }

    // SMS channel
    if (channels.includes('SMS')) {
      if (!userPhone || userPhone.trim().length === 0) {
        // Acknowledged SMS limitation: User model does not possess a phone field.
        await this.recordAttempt({
          organizationId,
          recipientId,
          channel: 'SMS',
          attemptNumber: 1,
          status: 'SKIPPED',
          provider: 'log-sms',
          failureCode: 'NO_PHONE_NUMBER',
          failureMessage: 'User model does not have a registered telephone number',
        });
      } else {
        const result = await this.smsProvider.sendSms({
          to: userPhone,
          message: `${title}: ${body}`,
          recipientId,
        });

        if (result.success) {
          await this.recordAttempt({
            organizationId,
            recipientId,
            channel: 'SMS',
            attemptNumber: 1,
            status: 'DELIVERED',
            provider: result.provider,
            deliveredAt: new Date(),
          });
        } else {
          const isTransient = result.error?.isTransient ?? false;
          if (isTransient) {
            hasExternalRetrying = true;
          } else {
            hasExternalFailure = true;
          }
          await this.recordAttempt({
            organizationId,
            recipientId,
            channel: 'SMS',
            attemptNumber: 1,
            status: isTransient ? 'RETRYING' : 'FAILED',
            provider: result.provider,
            failureCode: result.error?.code ?? 'DELIVERY_ERROR',
            failureMessage: result.error?.message ?? 'Unknown delivery error',
          });
        }
      }
    }

    // Determine derived recipient status
    let recipientStatus: NotificationStatus = 'DELIVERED';
    if (hasExternalRetrying) {
      recipientStatus = 'PENDING';
    } else if (hasExternalFailure) {
      recipientStatus = channels.includes('IN_APP') ? 'PARTIALLY_DELIVERED' : 'FAILED';
    }

    await this.database.notificationRecipient.update({
      where: {
        id_organizationId: {
          id: recipientId,
          organizationId,
        },
      },
      data: {
        status: recipientStatus,
        updatedAt: new Date(),
      },
    });
  }

  private async recordAttempt(data: {
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
    try {
      await this.database.notificationDeliveryAttempt.create({
        data: {
          organizationId: data.organizationId,
          recipientId: data.recipientId,
          channel: data.channel,
          attemptNumber: data.attemptNumber,
          status: data.status,
          provider: data.provider,
          failureCode: data.failureCode ?? null,
          failureMessage: data.failureMessage ?? null,
          deliveredAt: data.deliveredAt ?? null,
        },
      });
    } catch (err: unknown) {
      this.logger.warn(`Failed to record delivery attempt: ${String(err)}`);
    }
  }
}
