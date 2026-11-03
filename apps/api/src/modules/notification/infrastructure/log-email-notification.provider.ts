import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import type {
  EmailDeliveryRequest,
  EmailDeliveryResult,
  EmailNotificationProvider,
} from '../application/delivery-provider.port.js';

@Injectable()
export class LogEmailNotificationProvider implements EmailNotificationProvider {
  private readonly logger = new Logger(LogEmailNotificationProvider.name);
  private simulatedFailureMode?: 'transient' | 'permanent' | null;

  setSimulatedFailure(mode: 'transient' | 'permanent' | null): void {
    this.simulatedFailureMode = mode;
  }

  async send(request: EmailDeliveryRequest): Promise<EmailDeliveryResult> {
    if (this.simulatedFailureMode === 'transient') {
      this.logger.warn(`Simulating transient email delivery failure for recipient: ${request.to}`);
      return {
        success: false,
        provider: 'log-email-adapter',
        failureCode: 'SIMULATED_TRANSIENT_TIMEOUT',
        failureMessage: 'Temporary provider connection timeout',
        isRetryable: true,
      };
    }

    if (this.simulatedFailureMode === 'permanent') {
      this.logger.warn(`Simulating permanent email delivery failure for recipient: ${request.to}`);
      return {
        success: false,
        provider: 'log-email-adapter',
        failureCode: 'SIMULATED_PERMANENT_REJECTION',
        failureMessage: 'Mailbox does not exist',
        isRetryable: false,
      };
    }

    this.logger.log(
      JSON.stringify({
        channel: 'EMAIL',
        provider: 'log-email-adapter',
        to: request.to,
        subject: request.subject,
        bodyLength: request.body.length,
      }),
    );

    return {
      success: true,
      provider: 'log-email-adapter',
      providerMessageId: `log-email-${randomUUID()}`,
      isRetryable: false,
    };
  }
}
