export interface ClaimedOutboxEvent {
  readonly id: string;
  readonly organizationId: string;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly payload: unknown;
  readonly occurredAt: Date;
  readonly attempts: number;
}

export interface IntegrationEventPublisher {
  publish(event: ClaimedOutboxEvent): Promise<void>;
}

export interface OutboxStore {
  claim(batchSize: number, workerId: string, lockTimeoutMs: number): Promise<ClaimedOutboxEvent[]>;
  markPublished(eventId: string, workerId: string): Promise<void>;
  reschedule(eventId: string, workerId: string, attempts: number, error: string): Promise<void>;
}
