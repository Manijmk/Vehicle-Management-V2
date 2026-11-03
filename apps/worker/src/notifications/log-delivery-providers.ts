import { Injectable, Logger } from '@nestjs/common';
import type {
  EmailDeliveryRequest,
  EmailDeliveryResult,
  EmailNotificationProvider,
  SmsDeliveryRequest,
  SmsDeliveryResult,
  SmsNotificationProvider,
} from './delivery-provider.port.js';

@Injectable()
export class LogEmailNotificationProvider implements EmailNotificationProvider {
  private readonly logger = new Logger(LogEmailNotificationProvider.name);

  async sendEmail(request: EmailDeliveryRequest): Promise<EmailDeliveryResult> {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(request.to)) {
      return {
        success: false,
        provider: 'log-email',
        error: {
          code: 'INVALID_EMAIL_ADDRESS',
          message: `Destination email address '${request.to}' is invalid`,
          isTransient: false,
        },
      };
    }

    if (request.to.endsWith('@simulate-failure.test')) {
      return {
        success: false,
        provider: 'log-email',
        error: {
          code: 'SIMULATED_DELIVERY_FAILURE',
          message: 'Transient simulated network delivery error',
          isTransient: true,
        },
      };
    }

    this.logger.log(
      `[MOCK EMAIL DELIVERED] To: ${request.to} | Subject: ${request.subject} | Notification: ${request.notificationId ?? 'N/A'}`,
    );

    return {
      success: true,
      messageId: `mock-email-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      provider: 'log-email',
    };
  }
}

@Injectable()
export class LogSmsNotificationProvider implements SmsNotificationProvider {
  private readonly logger = new Logger(LogSmsNotificationProvider.name);

  async sendSms(request: SmsDeliveryRequest): Promise<SmsDeliveryResult> {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(request.to.replaceAll(/[\s\-()]/g, ''))) {
      return {
        success: false,
        provider: 'log-sms',
        error: {
          code: 'INVALID_PHONE_NUMBER',
          message: `Phone number '${request.to}' is not a valid E.164 number`,
          isTransient: false,
        },
      };
    }

    this.logger.log(
      `[MOCK SMS DELIVERED] To: ${request.to} | Notification: ${request.notificationId ?? 'N/A'} | Text: ${request.message.substring(0, 40)}...`,
    );

    return {
      success: true,
      messageId: `mock-sms-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      provider: 'log-sms',
    };
  }
}
