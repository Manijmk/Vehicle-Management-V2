import 'dotenv/config';
import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { loadApiConfig } from '@vms/config';
import { startObservability } from '@vms/observability';

import { createApiApplication } from './bootstrap.js';

const logger = new Logger('Bootstrap');

async function bootstrap(): Promise<void> {
  const config = loadApiConfig();
  const observability = startObservability({
    enabled: config.OTEL_ENABLED,
    serviceName: `${config.OTEL_SERVICE_NAME}-api`,
    otlpEndpoint: config.OTEL_EXPORTER_OTLP_ENDPOINT,
  });
  const application = await createApiApplication(config);

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void observability.shutdown();
    });
  }

  await application.listen(config.API_PORT, '0.0.0.0');
  logger.log(`API listening on port ${config.API_PORT}`);
}

bootstrap().catch((error: unknown) => {
  logger.error('API bootstrap failed', error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
