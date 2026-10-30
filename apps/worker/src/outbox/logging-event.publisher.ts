import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@vms/database';

import type { ClaimedOutboxEvent, IntegrationEventPublisher } from './outbox.types.js';
import { WORKER_DATABASE } from './tokens.js';

@Injectable()
export class LoggingEventPublisher implements IntegrationEventPublisher {
  private readonly logger = new Logger(LoggingEventPublisher.name);

  constructor(
    @Inject(WORKER_DATABASE)
    private readonly database: PrismaClient,
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
