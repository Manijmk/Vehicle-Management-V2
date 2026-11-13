import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@vms/database';

import type { ClaimedOutboxEvent, IntegrationEventPublisher } from './outbox.types.js';
import { WORKER_DATABASE } from './tokens.js';
import type { NotificationRuleEvaluatorService } from '../notifications/notification-rule-evaluator.service.js';

@Injectable()
export class LoggingEventPublisher implements IntegrationEventPublisher {
  private readonly logger = new Logger(LoggingEventPublisher.name);

  constructor(
    @Inject(WORKER_DATABASE)
    private readonly database: PrismaClient,
    @Optional()
    private readonly notificationEvaluator?: NotificationRuleEvaluatorService,
  ) {}

  async publish(event: ClaimedOutboxEvent): Promise<void> {
    this.logger.log(
      JSON.stringify({
        eventId: event.id,
        eventType: event.eventType,
        organizationId: event.organizationId,
        deliveryAttempt: event.attempts,
      }),
    );

    if (event.eventType === 'InspectionCriticalFailureDetected') {
      await this.handleInspectionCriticalFailure(event);
    }

    if (this.notificationEvaluator) {
      await this.notificationEvaluator.handleEvent(event);
    }

    await this.enqueueWebhookDeliveries(event);
  }

  private async enqueueWebhookDeliveries(event: ClaimedOutboxEvent): Promise<void> {
    try {
      const subscriptions = await this.database.webhookSubscription.findMany({
        where: {
          organizationId: event.organizationId,
          status: 'ACTIVE',
          connection: {
            status: 'ACTIVE',
          },
        },
      });

      const matching = subscriptions.filter(
        (sub) => sub.eventTypes.includes('*') || sub.eventTypes.includes(event.eventType),
      );

      for (const sub of matching) {
        const existing = await this.database.webhookDelivery.findUnique({
          where: {
            organizationId_subscriptionId_sourceEventId: {
              organizationId: event.organizationId,
              subscriptionId: sub.id,
              sourceEventId: event.id,
            },
          },
        });

        if (!existing) {
          const envelope = {
            eventId: event.id,
            eventType: event.eventType,
            eventVersion: '1.0',
            occurredAt: event.occurredAt.toISOString(),
            resourceType: event.aggregateType,
            resourceId: event.aggregateId,
            data: (event.payload && typeof event.payload === 'object'
              ? event.payload
              : {}) as Record<string, unknown>,
          };

          await this.database.webhookDelivery.create({
            data: {
              organizationId: event.organizationId,
              subscriptionId: sub.id,
              sourceEventId: event.id,
              eventType: event.eventType,
              payload: envelope as Prisma.InputJsonValue,
              deliveryStatus: 'PENDING',
              attempts: 0,
              nextAttemptAt: new Date(),
            },
          });
        }
      }
    } catch (err: unknown) {
      this.logger.warn(
        `Failed to enqueue webhook deliveries for event ${event.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async handleInspectionCriticalFailure(event: ClaimedOutboxEvent): Promise<void> {
    const payload = event.payload as Record<string, unknown> | null;
    if (!payload || typeof payload !== 'object') {
      return;
    }

    const inspectionId = payload.inspectionId as string | undefined;
    if (!inspectionId) {
      return;
    }

    // Idempotency check: see if a maintenance request already exists for this inspection
    const existing = await this.database.maintenanceRequest.findFirst({
      where: {
        organizationId: event.organizationId,
        sourceInspectionId: inspectionId,
      },
    });

    if (existing) {
      return; // Already processed idempotently
    }

    // Lookup inspection in the same tenant to derive vehicle
    const inspection = await this.database.inspection.findFirst({
      where: {
        id: inspectionId,
        organizationId: event.organizationId,
      },
    });

    if (!inspection) {
      return; // Inspection not found in tenant
    }

    // Allocate MR displayId
    const existingRequests = await this.database.maintenanceRequest.findMany({
      where: { organizationId: event.organizationId },
      select: { displayId: true },
    });
    let maxNum = 1000;
    for (const r of existingRequests) {
      const match = /^MR-(\d+)$/i.exec(r.displayId);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    const displayId = `MR-${maxNum + 1}`;

    try {
      await this.database.maintenanceRequest.create({
        data: {
          organizationId: event.organizationId,
          displayId,
          vehicleId: inspection.vehicleId,
          sourceType: 'INSPECTION',
          sourceInspectionId: inspection.id,
          title: `Critical Defect: Inspection ${inspection.displayId}`,
          description: `Critical safety defect automatically flagged during inspection ${inspection.displayId}. Vehicle operationally blocked until resolved.`,
          priority: 'CRITICAL',
          blocksOperation: true,
          status: 'OPEN',
          version: 1,
          createdBy: inspection.createdBy,
          updatedBy: inspection.createdBy,
        },
      });
    } catch (err: unknown) {
      // Prisma unique constraint violation code is P2002
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
        return; // Idempotently handled by unique constraint
      }
      throw err;
    }
  }
}
