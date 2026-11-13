import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module.js';
import { TelemetryModule } from '../telemetry/telemetry.module.js';
import { IntegrationService } from './application/integration.service.js';
import {
  INTEGRATION_REPOSITORY,
  INTEGRATION_SECRET_PORT,
  WEBHOOK_TRANSPORT_PORT,
} from './integration.tokens.js';
import { AesIntegrationSecretAdapter } from './infrastructure/aes-integration-secret.adapter.js';
import { HttpWebhookTransportAdapter } from './infrastructure/http-webhook-transport.adapter.js';
import { IntegrationMetricsService } from './infrastructure/integration-metrics.service.js';
import { PrismaIntegrationRepository } from './infrastructure/prisma-integration.repository.js';
import { IntegrationController } from './transport/integration.controller.js';
import { TelematicsWebhookController } from './transport/telematics-webhook.controller.js';

@Module({
  imports: [TelemetryModule, FinanceModule],
  controllers: [IntegrationController, TelematicsWebhookController],
  providers: [
    IntegrationService,
    IntegrationMetricsService,
    {
      provide: INTEGRATION_REPOSITORY,
      useClass: PrismaIntegrationRepository,
    },
    {
      provide: INTEGRATION_SECRET_PORT,
      useClass: AesIntegrationSecretAdapter,
    },
    {
      provide: WEBHOOK_TRANSPORT_PORT,
      useClass: HttpWebhookTransportAdapter,
    },
  ],
  exports: [
    IntegrationService,
    IntegrationMetricsService,
    INTEGRATION_REPOSITORY,
    INTEGRATION_SECRET_PORT,
    WEBHOOK_TRANSPORT_PORT,
  ],
})
export class IntegrationModule {}
