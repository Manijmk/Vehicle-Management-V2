import { Module } from '@nestjs/common';
import { loadWorkerConfig } from '@vms/config';
import { createDatabaseClient } from '@vms/database';

import { WorkerService } from './worker.service.js';
import { LoggingEventPublisher } from './outbox/logging-event.publisher.js';
import { OutboxProcessorService } from './outbox/outbox-processor.service.js';
import { PrismaOutboxStore } from './outbox/prisma-outbox.store.js';
import { EVENT_PUBLISHER, OUTBOX_STORE, WORKER_CONFIG, WORKER_DATABASE } from './outbox/tokens.js';
import { DatabaseShutdownService } from './outbox/database-shutdown.service.js';

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
  ],
})
export class WorkerModule {}
