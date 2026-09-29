import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { WorkerConfig } from '@vms/config';

import type { IntegrationEventPublisher, OutboxStore } from './outbox.types.js';
import { EVENT_PUBLISHER, OUTBOX_STORE, WORKER_CONFIG } from './tokens.js';

@Injectable()
export class OutboxProcessorService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxProcessorService.name);
  private readonly workerId = `worker-${randomUUID()}`;
  private timer?: NodeJS.Timeout;
  private processing = false;

  constructor(
    @Inject(OUTBOX_STORE) private readonly store: OutboxStore,
    @Inject(EVENT_PUBLISHER) private readonly publisher: IntegrationEventPublisher,
    @Inject(WORKER_CONFIG) private readonly config: WorkerConfig,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.processBatch(), this.config.OUTBOX_POLL_INTERVAL_MS);
    void this.processBatch();
  }

  onApplicationShutdown(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  async processBatch(): Promise<number> {
    if (this.processing) return 0;
    this.processing = true;
    try {
      const events = await this.store.claim(
        this.config.OUTBOX_BATCH_SIZE,
        this.workerId,
        this.config.OUTBOX_LOCK_TIMEOUT_MS,
      );
      for (const event of events) {
        try {
          await this.publisher.publish(event);
          await this.store.markPublished(event.id, this.workerId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Outbox event ${event.id} failed: ${message}`);
          await this.store.reschedule(event.id, this.workerId, event.attempts, message);
        }
      }
      return events.length;
    } finally {
      this.processing = false;
    }
  }
}
