import { Injectable, Logger } from '@nestjs/common';

import type { ClaimedOutboxEvent, IntegrationEventPublisher } from './outbox.types.js';

@Injectable()
export class LoggingEventPublisher implements IntegrationEventPublisher {
  private readonly logger = new Logger(LoggingEventPublisher.name);

  publish(event: ClaimedOutboxEvent): Promise<void> {
    this.logger.log(
      JSON.stringify({
        eventId: event.id,
        eventType: event.eventType,
        organizationId: event.organizationId,
        deliveryAttempt: event.attempts,
      }),
    );
    return Promise.resolve();
  }
}
