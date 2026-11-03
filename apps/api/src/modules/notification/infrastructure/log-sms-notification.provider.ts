import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import type {
  SmsDeliveryRequest,
  SmsDeliveryResult,
  SmsNotificationProvider,
} from '../application/delivery-provider.port.js';

@Injectable()
export class LogSmsNotificationProvider implements SmsNotificationProvider {
  private readonly logger = new Logger(LogSmsNotificationProvider.name);
  private simulatedFailureMode?: 'transient' | 'permanent' | null;

  setSimulatedFailure(mode: 'transient' | 'permanent' | null): void {
    this.simulatedFailureMode = mode;
  }

  async send(request: SmsDeliveryRequest): Promise<SmsDeliveryResult> {
    if (!request.to || request.to.trim().length === 0) {
      return {
        success: false,
        provider: 'log-sms-adapter',
        failureCode: 'MISSING_PHONE_NUMBER',
        failureMessage: 'Recipient does not have a registered phone number',
        isRetryable: false,
      };
    }

    if (this.simulatedFailureMode === 'transient') {
      this.logger.warn(`Simulating transient SMS failure for: ${request.to}`);
      return {
        success: false,
        provider: 'log-sms-adapter',
        failureCode: 'GATEWAY_TIMEOUT',
        failureMessage: 'SMS gateway temporary 504 error',
        isRetryable: true,
      };
    }

    if (this.simulatedFailureMode === 'permanent') {
      this.logger.warn(`Simulating permanent SMS failure for: ${request.to}`);
      return {
        success: false,
        provider: 'log-sms-adapter',
        failureCode: 'INVALID_DESTINATION',
        failureMessage: 'Destination number is unallocated or invalid',
        isRetryable: false,
      };
    }

    this.logger.log(
      JSON.stringify({
        channel: 'SMS',
        provider: 'log-sms-adapter',
        to: request.to,
        bodyLength: request.body.length,
      }),
    );

    return {
      success: true,
      provider: 'log-sms-adapter',
      providerMessageId: `log-sms-${randomUUID()}`,
      isRetryable: false,
    };
  }
}
