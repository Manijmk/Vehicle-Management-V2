import { Module } from '@nestjs/common';
import { ComplianceExpirySchedulerService } from './compliance-expiry-scheduler.service.js';
import {
  LogEmailNotificationProvider,
  LogSmsNotificationProvider,
} from './log-delivery-providers.js';
import {
  NotificationDeliveryService,
  WORKER_EMAIL_PROVIDER,
  WORKER_SMS_PROVIDER,
} from './notification-delivery.service.js';
import { NotificationRuleEvaluatorService } from './notification-rule-evaluator.service.js';

@Module({
  providers: [
    LogEmailNotificationProvider,
    LogSmsNotificationProvider,
    {
      provide: WORKER_EMAIL_PROVIDER,
      useExisting: LogEmailNotificationProvider,
    },
    {
      provide: WORKER_SMS_PROVIDER,
      useExisting: LogSmsNotificationProvider,
    },
    NotificationDeliveryService,
    NotificationRuleEvaluatorService,
    ComplianceExpirySchedulerService,
  ],
  exports: [
    NotificationDeliveryService,
    NotificationRuleEvaluatorService,
    ComplianceExpirySchedulerService,
  ],
})
export class NotificationWorkerModule {}
