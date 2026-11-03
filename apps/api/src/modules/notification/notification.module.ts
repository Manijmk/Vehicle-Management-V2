import { Module } from '@nestjs/common';

import { NotificationService } from './application/notification.service.js';
import {
  EMAIL_NOTIFICATION_PROVIDER,
  NOTIFICATION_REPOSITORY,
  SMS_NOTIFICATION_PROVIDER,
} from './notification.tokens.js';
import { LogEmailNotificationProvider } from './infrastructure/log-email-notification.provider.js';
import { LogSmsNotificationProvider } from './infrastructure/log-sms-notification.provider.js';
import { PrismaNotificationRepository } from './infrastructure/prisma-notification.repository.js';
import { NotificationController } from './transport/notification.controller.js';
import { NotificationPreferenceController } from './transport/notification-preference.controller.js';
import { NotificationTemplateController } from './transport/notification-template.controller.js';

@Module({
  controllers: [
    NotificationController,
    NotificationPreferenceController,
    NotificationTemplateController,
  ],
  providers: [
    NotificationService,
    {
      provide: NOTIFICATION_REPOSITORY,
      useClass: PrismaNotificationRepository,
    },
    {
      provide: EMAIL_NOTIFICATION_PROVIDER,
      useClass: LogEmailNotificationProvider,
    },
    {
      provide: SMS_NOTIFICATION_PROVIDER,
      useClass: LogSmsNotificationProvider,
    },
  ],
  exports: [
    NotificationService,
    NOTIFICATION_REPOSITORY,
    EMAIL_NOTIFICATION_PROVIDER,
    SMS_NOTIFICATION_PROVIDER,
  ],
})
export class NotificationModule {}
