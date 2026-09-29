import 'dotenv/config';
import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadWorkerConfig } from '@vms/config';
import { startObservability } from '@vms/observability';

import { WorkerModule } from './worker.module.js';

const logger = new Logger('WorkerBootstrap');

async function bootstrap(): Promise<void> {
  const config = loadWorkerConfig();
  const observability = startObservability({
    enabled: config.OTEL_ENABLED,
    serviceName: `${config.OTEL_SERVICE_NAME}-worker`,
    otlpEndpoint: config.OTEL_EXPORTER_OTLP_ENDPOINT,
  });
  const application = await NestFactory.createApplicationContext(WorkerModule);
  const keepAlive = setInterval(() => undefined, 60_000);
  let shuttingDown = false;

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    clearInterval(keepAlive);
    await application.close();
    await observability.shutdown();
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void shutdown();
    });
  }

  logger.log('Worker started');
}

bootstrap().catch((error: unknown) => {
  logger.error('Worker bootstrap failed', error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
