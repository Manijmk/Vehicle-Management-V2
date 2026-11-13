import { Module } from '@nestjs/common';
import { loadWorkerConfig } from '@vms/config';
import { createDatabaseClient } from '@vms/database';

import { WorkerService } from './worker.service.js';
import { LoggingEventPublisher } from './outbox/logging-event.publisher.js';
import { OutboxProcessorService } from './outbox/outbox-processor.service.js';
import { PrismaOutboxStore } from './outbox/prisma-outbox.store.js';
import { EVENT_PUBLISHER, OUTBOX_STORE, WORKER_CONFIG, WORKER_DATABASE } from './outbox/tokens.js';
import { DatabaseShutdownService } from './outbox/database-shutdown.service.js';
import {
  LogEmailNotificationProvider,
  LogSmsNotificationProvider,
} from './notifications/log-delivery-providers.js';
import {
  NotificationDeliveryService,
  WORKER_EMAIL_PROVIDER,
  WORKER_SMS_PROVIDER,
} from './notifications/notification-delivery.service.js';
import { NotificationRuleEvaluatorService } from './notifications/notification-rule-evaluator.service.js';
import { ComplianceExpirySchedulerService } from './notifications/compliance-expiry-scheduler.service.js';
import { WebhookDeliveryProcessorService } from './integrations/webhook-delivery-processor.service.js';

@Module({
  providers: [
    WorkerService,
    OutboxProcessorService,
    PrismaOutboxStore,
    LoggingEventPublisher,
    DatabaseShutdownService,
    { provide: WORKER_CONFIG, useFactory: () => loadWorkerConfig() },
    {
      provide: WORKER_DATABASE,
      inject: [WORKER_CONFIG],
      useFactory: (config: ReturnType<typeof loadWorkerConfig>) =>
        createDatabaseClient({ databaseUrl: config.DATABASE_URL }),
    },
    { provide: OUTBOX_STORE, useExisting: PrismaOutboxStore },
    { provide: EVENT_PUBLISHER, useExisting: LoggingEventPublisher },

    // Notification and Automation services
    LogEmailNotificationProvider,
    LogSmsNotificationProvider,
    { provide: WORKER_EMAIL_PROVIDER, useExisting: LogEmailNotificationProvider },
    { provide: WORKER_SMS_PROVIDER, useExisting: LogSmsNotificationProvider },
    NotificationDeliveryService,
    NotificationRuleEvaluatorService,
    ComplianceExpirySchedulerService,
    WebhookDeliveryProcessorService,
  ],
  exports: [
    NotificationDeliveryService,
    NotificationRuleEvaluatorService,
    ComplianceExpirySchedulerService,
    WebhookDeliveryProcessorService,
  ],
})
export class WorkerModule {}
