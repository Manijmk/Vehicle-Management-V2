import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@vms/database';

import { DATABASE } from '../../../common/tokens.js';
import { ApplicationError } from '../../foundation/domain/errors.js';
import type {
  LatestPreTripInspectionSummary,
  TripInspectionGate,
} from '../../trip/application/trip-inspection-gate.port.js';
import type {
  InspectionItemSeverity,
  InspectionTemplateStatus,
  InspectionType,
} from '../domain/inspection-template.js';
import {
  assertInspectionCreation,
  assertInspectionTransition,
  evaluateInspectionResponses,
  type InspectionResponseResult,
  type InspectionResult,
  type InspectionStatus,
} from '../domain/inspection.js';
import type {
  CancelInspectionInput,
  CompleteInspectionInput,
  CreateInspectionInput,
  InspectionDetail,
  InspectionRepository,
  InspectionResponseDetail,
  ListInspectionsFilter,
  PaginatedInspections,
  SaveInspectionResponsesInput,
  StartInspectionInput,
} from '../application/inspection.repository.js';
import type { InspectionMutationMetadata } from '../application/inspection-template.repository.js';

type Transaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function normalizeOptionalText(value?: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

@Injectable()
export class PrismaInspectionRepository implements InspectionRepository, TripInspectionGate {
  constructor(
    @Inject(DATABASE)
    private readonly database: PrismaClient,
  ) {}

  private async allocateDisplayId(tx: Transaction, organizationId: string): Promise<string> {
    const existing = await tx.inspection.findMany({
      where: { organizationId },
      select: { displayId: true },
    });
    let maxNumber = 1000;
    for (const insp of existing) {
      const match = /^INSP-(\d+)$/i.exec(insp.displayId);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (num > maxNumber) maxNumber = num;
      }
    }
    return `INSP-${maxNumber + 1}`;
  }

  private mapInspection(raw: {
    id: string;
    organizationId: string;
    displayId: string;
    templateId: string;
    template: {
      id: string;
      name: string;
      type: string;
      version: number;
    };
    type: string;
    vehicleId: string;
    vehicle: {
      id: string;
      displayId: string;
      registration: string;
      model: string;
      type: string;
      odometerKm: number;
      status: string;
    };
    driverId: string | null;
    driver: {
      id: string;
      displayId: string;
      firstName: string;
      lastName: string;
      status: string;
    } | null;
    assignmentId: string | null;
    tripId: string | null;
    trip: {
      id: string;
      displayId: string;
      status: string;
      origin: string;
      destination: string;
    } | null;
    status: string;
    result: string | null;
    hasCriticalFailure: boolean;
    startedAt: Date | null;
    completedAt: Date | null;
    cancelledAt: Date | null;
    cancelReason: string | null;
    performedBy: string | null;
    notes: string | null;
    version: number;
    responses?: Array<{
      id: string;
      templateItemId: string;
      response: string;
      comment: string | null;
      createdAt: Date;
      updatedAt: Date;
      templateItem?: {
        id: string;
        category: string;
        prompt: string;
        description: string | null;
        required: boolean;
        severity: string;
        sortOrder: number;
      };
    }>;
    createdAt: Date;
    updatedAt: Date;
  }): InspectionDetail {
    const responses: InspectionResponseDetail[] = (raw.responses ?? []).map((r) => ({
      id: r.id,
      templateItemId: r.templateItemId,
      category: r.templateItem?.category ?? '',
      prompt: r.templateItem?.prompt ?? '',
      description: r.templateItem?.description ?? null,
      required: r.templateItem?.required ?? true,
      severity: (r.templateItem?.severity ?? 'NORMAL') as InspectionItemSeverity,
      sortOrder: r.templateItem?.sortOrder ?? 0,
      response: r.response as InspectionResponseResult,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    return {
      id: raw.id,
      organizationId: raw.organizationId,
      displayId: raw.displayId,
      templateId: raw.templateId,
      template: {
        id: raw.template.id,
        name: raw.template.name,
        type: raw.template.type as InspectionType,
        version: raw.template.version,
      },
      type: raw.type as InspectionType,
      vehicleId: raw.vehicleId,
      vehicle: {
        id: raw.vehicle.id,
        displayId: raw.vehicle.displayId,
        registration: raw.vehicle.registration,
        model: raw.vehicle.model,
        type: raw.vehicle.type,
        odometerKm: raw.vehicle.odometerKm,
        status: raw.vehicle.status,
      },
      driverId: raw.driverId,
      driver: raw.driver
        ? {
            id: raw.driver.id,
            displayId: raw.driver.displayId,
            firstName: raw.driver.firstName,
            lastName: raw.driver.lastName,
            status: raw.driver.status,
          }
        : null,
      assignmentId: raw.assignmentId,
      tripId: raw.tripId,
      trip: raw.trip
        ? {
            id: raw.trip.id,
            displayId: raw.trip.displayId,
            status: raw.trip.status,
            origin: raw.trip.origin,
            destination: raw.trip.destination,
          }
        : null,
      status: raw.status as InspectionStatus,
      result: raw.result ? (raw.result as InspectionResult) : null,
      hasCriticalFailure: raw.hasCriticalFailure,
      startedAt: raw.startedAt ? raw.startedAt.toISOString() : null,
      completedAt: raw.completedAt ? raw.completedAt.toISOString() : null,
      cancelledAt: raw.cancelledAt ? raw.cancelledAt.toISOString() : null,
      cancelReason: raw.cancelReason,
      performedBy: raw.performedBy,
      notes: raw.notes,
      version: raw.version,
      responses,
      createdAt: raw.createdAt.toISOString(),
      updatedAt: raw.updatedAt.toISOString(),
    };
  }

  private async recordAuditAndOutbox(
    tx: Transaction,
    organizationId: string,
    action: string,
    eventType: string,
    entityId: string,
    before: unknown | null,
    after: unknown | null,
    metadata: InspectionMutationMetadata,
    payloadData: Record<string, unknown>,
  ): Promise<void> {
    const occurredAt = new Date();
    const eventId = randomUUID();

    await tx.auditLog.create({
      data: {
        organizationId,
        action,
        entityType: 'Inspection',
        entityId,
        ...(before === null ? {} : { beforeData: json(before) }),
        ...(after === null ? {} : { afterData: json(after) }),
        actorId: metadata.actorId,
        requestId: metadata.requestId,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    });

    await tx.outboxEvent.create({
      data: {
        id: eventId,
        organizationId,
        eventType,
        aggregateType: 'Inspection',
        aggregateId: entityId,
        occurredAt,
        payload: json({
          eventId,
          occurredAt: occurredAt.toISOString(),
          actorId: metadata.actorId,
          requestId: metadata.requestId,
          ...payloadData,
        }),
      },
    });
  }

  async createInspection(input: CreateInspectionInput): Promise<InspectionDetail> {
    const notes = normalizeOptionalText(input.notes);

    return this.database.$transaction(async (tx) => {
      const template = await tx.inspectionTemplate.findFirst({
        where: { id: input.templateId, organizationId: input.organizationId },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });

      if (!template) {
        throw new ApplicationError(
          'INSPECTION_TEMPLATE_NOT_FOUND',
          'Inspection template was not found in this organization',
        );
      }

      let vehicleId = input.vehicleId;
      let driverId: string | null = null;
      let assignmentId: string | null = null;
      let tripRecord: {
        id: string;
        status: string;
        vehicleId: string;
        driverId: string;
        assignmentId: string;
      } | null = null;

      if (input.tripId) {
        const trip = await tx.trip.findFirst({
          where: { id: input.tripId, organizationId: input.organizationId },
        });

        if (!trip) {
          throw new ApplicationError('TRIP_NOT_FOUND', 'Trip was not found in this organization');
        }

        tripRecord = {
          id: trip.id,
          status: trip.status,
          vehicleId: trip.vehicleId,
          driverId: trip.driverId,
          assignmentId: trip.assignmentId,
        };

        vehicleId = trip.vehicleId;
        driverId = trip.driverId;
        assignmentId = trip.assignmentId;
      }

      if (!vehicleId) {
        throw new ApplicationError(
          'INSPECTION_ITEM_INVALID',
          'Vehicle must be specified for standalone inspection',
        );
      }

      const vehicle = await tx.vehicle.findFirst({
        where: { id: vehicleId, organizationId: input.organizationId },
      });

      if (!vehicle) {
        throw new ApplicationError(
          'VEHICLE_NOT_FOUND',
          'Vehicle was not found in this organization',
        );
      }

      assertInspectionCreation({
        type: input.type,
        templateType: template.type as InspectionType,
        templateStatus: template.status as InspectionTemplateStatus,
        trip: tripRecord,
        vehicle: { id: vehicle.id, status: vehicle.status },
        driverId,
        assignmentId,
      });

      const displayId = await this.allocateDisplayId(tx, input.organizationId);

      const created = await tx.inspection.create({
        data: {
          organizationId: input.organizationId,
          displayId,
          templateId: template.id,
          type: input.type,
          vehicleId: vehicle.id,
          driverId,
          assignmentId,
          tripId: input.tripId ?? null,
          status: 'DRAFT',
          notes,
          createdBy: input.metadata.actorId,
          updatedBy: input.metadata.actorId,
        },
        include: {
          template: true,
          vehicle: true,
          driver: true,
          trip: true,
          responses: {
            include: { templateItem: true },
          },
        },
      });

      const mapped = this.mapInspection(created);

      await this.recordAuditAndOutbox(
        tx,
        input.organizationId,
        'inspection.created',
        'InspectionCreated',
        created.id,
        null,
        mapped,
        input.metadata,
        {
          inspectionId: created.id,
          displayId: created.displayId,
          type: created.type,
          vehicleId: created.vehicleId,
          driverId: created.driverId,
          tripId: created.tripId,
          status: 'DRAFT',
        },
      );

      return mapped;
    });
  }

  async getInspection(organizationId: string, inspectionId: string): Promise<InspectionDetail> {
    const inspection = await this.database.inspection.findFirst({
      where: { id: inspectionId, organizationId },
      include: {
        template: {
          include: {
            items: { orderBy: { sortOrder: 'asc' } },
          },
        },
        vehicle: true,
        driver: true,
        trip: true,
        responses: {
          include: { templateItem: true },
          orderBy: { templateItem: { sortOrder: 'asc' } },
        },
      },
    });

    if (!inspection) {
      throw new ApplicationError(
        'INSPECTION_NOT_FOUND',
        'Inspection was not found in this organization',
      );
    }

    return this.mapInspection(inspection);
  }

  async listInspections(
    organizationId: string,
    filter?: ListInspectionsFilter | undefined,
  ): Promise<PaginatedInspections> {
    const limit = Math.min(Math.max(filter?.limit ?? 50, 1), 100);
    const offset = Math.max(filter?.offset ?? 0, 0);

    const where: Prisma.InspectionWhereInput = {
      organizationId,
      ...(filter?.type ? { type: filter.type } : {}),
      ...(filter?.status ? { status: filter.status } : {}),
      ...(filter?.result ? { result: filter.result } : {}),
      ...(filter?.vehicleId ? { vehicleId: filter.vehicleId } : {}),
      ...(filter?.driverId ? { driverId: filter.driverId } : {}),
      ...(filter?.tripId ? { tripId: filter.tripId } : {}),
      ...(filter?.hasCriticalFailure !== undefined
        ? { hasCriticalFailure: filter.hasCriticalFailure }
        : {}),
      ...(filter?.search
        ? {
            OR: [
              { displayId: { contains: filter.search.trim(), mode: 'insensitive' } },
              {
                vehicle: { registration: { contains: filter.search.trim(), mode: 'insensitive' } },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.database.inspection.findMany({
        where,
        include: {
          template: true,
          vehicle: true,
          driver: true,
          trip: true,
          responses: {
            include: { templateItem: true },
            orderBy: { templateItem: { sortOrder: 'asc' } },
          },
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: offset,
        take: limit,
      }),
      this.database.inspection.count({ where }),
    ]);

    return {
      items: items.map((i) => this.mapInspection(i)),
      total,
      limit,
      offset,
    };
  }

  async startInspection(input: StartInspectionInput): Promise<InspectionDetail> {
    return this.database.$transaction(async (tx) => {
      const existing = await tx.inspection.findFirst({
        where: { id: input.inspectionId, organizationId: input.organizationId },
        include: {
          template: true,
          vehicle: true,
          driver: true,
          trip: true,
          responses: { include: { templateItem: true } },
        },
      });

      if (!existing) {
        throw new ApplicationError(
          'INSPECTION_NOT_FOUND',
          'Inspection was not found in this organization',
        );
      }

      assertInspectionTransition(existing.status as InspectionStatus, 'IN_PROGRESS');

      const startedAt = new Date();

      const updateResult = await tx.inspection.updateMany({
        where: {
          id: input.inspectionId,
          organizationId: input.organizationId,
          version: input.version,
        },
        data: {
          status: 'IN_PROGRESS',
          startedAt,
          performedBy: input.metadata.actorId,
          updatedBy: input.metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationError(
          'CONCURRENCY_CONFLICT',
          'Inspection was modified by another request',
        );
      }

      const updated = await tx.inspection.findFirstOrThrow({
        where: { id: input.inspectionId, organizationId: input.organizationId },
        include: {
          template: true,
          vehicle: true,
          driver: true,
          trip: true,
          responses: {
            include: { templateItem: true },
            orderBy: { templateItem: { sortOrder: 'asc' } },
          },
        },
      });

      const beforeMapped = this.mapInspection(existing);
      const afterMapped = this.mapInspection(updated);

      await this.recordAuditAndOutbox(
        tx,
        input.organizationId,
        'inspection.started',
        'InspectionStarted',
        updated.id,
        beforeMapped,
        afterMapped,
        input.metadata,
        {
          inspectionId: updated.id,
          displayId: updated.displayId,
          type: updated.type,
          vehicleId: updated.vehicleId,
          driverId: updated.driverId,
          tripId: updated.tripId,
          status: 'IN_PROGRESS',
          startedAt: startedAt.toISOString(),
        },
      );

      return afterMapped;
    });
  }

  async saveResponses(input: SaveInspectionResponsesInput): Promise<InspectionDetail> {
    return this.database.$transaction(async (tx) => {
      const existing = await tx.inspection.findFirst({
        where: { id: input.inspectionId, organizationId: input.organizationId },
        include: {
          template: { include: { items: true } },
          vehicle: true,
          driver: true,
          trip: true,
          responses: { include: { templateItem: true } },
        },
      });

      if (!existing) {
        throw new ApplicationError(
          'INSPECTION_NOT_FOUND',
          'Inspection was not found in this organization',
        );
      }

      if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
        throw new ApplicationError(
          'INSPECTION_ALREADY_TERMINAL',
          `Cannot save responses on terminal inspection with status ${existing.status}`,
        );
      }

      const itemMap = new Map(existing.template.items.map((i) => [i.id, i]));
      for (const r of input.responses) {
        if (!itemMap.has(r.templateItemId)) {
          throw new ApplicationError(
            'INSPECTION_ITEM_NOT_FOUND',
            `Response references item ${r.templateItemId} which does not belong to template`,
          );
        }
      }

      // Upsert submitted responses
      for (const r of input.responses) {
        await tx.inspectionResponse.upsert({
          where: {
            organizationId_inspectionId_templateItemId: {
              organizationId: input.organizationId,
              inspectionId: input.inspectionId,
              templateItemId: r.templateItemId,
            },
          },
          update: {
            response: r.response,
            comment: normalizeOptionalText(r.comment),
          },
          create: {
            organizationId: input.organizationId,
            inspectionId: input.inspectionId,
            templateItemId: r.templateItemId,
            response: r.response,
            comment: normalizeOptionalText(r.comment),
          },
        });
      }

      const updateResult = await tx.inspection.updateMany({
        where: {
          id: input.inspectionId,
          organizationId: input.organizationId,
          version: input.version,
        },
        data: {
          updatedBy: input.metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationError(
          'CONCURRENCY_CONFLICT',
          'Inspection was modified by another request',
        );
      }

      const updated = await tx.inspection.findFirstOrThrow({
        where: { id: input.inspectionId, organizationId: input.organizationId },
        include: {
          template: true,
          vehicle: true,
          driver: true,
          trip: true,
          responses: {
            include: { templateItem: true },
            orderBy: { templateItem: { sortOrder: 'asc' } },
          },
        },
      });

      const beforeMapped = this.mapInspection(existing);
      const afterMapped = this.mapInspection(updated);

      await tx.auditLog.create({
        data: {
          organizationId: input.organizationId,
          action: 'inspection.responses_updated',
          entityType: 'Inspection',
          entityId: updated.id,
          beforeData: json({ responsesCount: beforeMapped.responses.length }),
          afterData: json({ responsesCount: afterMapped.responses.length }),
          actorId: input.metadata.actorId,
          requestId: input.metadata.requestId,
          ipAddress: input.metadata.ipAddress,
          userAgent: input.metadata.userAgent,
        },
      });

      return afterMapped;
    });
  }

  async completeInspection(input: CompleteInspectionInput): Promise<InspectionDetail> {
    return this.database.$transaction(async (tx) => {
      const existing = await tx.inspection.findFirst({
        where: { id: input.inspectionId, organizationId: input.organizationId },
        include: {
          template: { include: { items: true } },
          vehicle: true,
          driver: true,
          trip: true,
          responses: { include: { templateItem: true } },
        },
      });

      if (!existing) {
        throw new ApplicationError(
          'INSPECTION_NOT_FOUND',
          'Inspection was not found in this organization',
        );
      }

      assertInspectionTransition(existing.status as InspectionStatus, 'COMPLETED');

      const evaluation = evaluateInspectionResponses(
        existing.template.items.map((i) => ({
          id: i.id,
          required: i.required,
          severity: i.severity as InspectionItemSeverity,
        })),
        existing.responses.map((r) => ({
          templateItemId: r.templateItemId,
          response: r.response as InspectionResponseResult,
          comment: r.comment,
        })),
      );

      const completedAt = new Date();

      const updateResult = await tx.inspection.updateMany({
        where: {
          id: input.inspectionId,
          organizationId: input.organizationId,
          version: input.version,
        },
        data: {
          status: 'COMPLETED',
          result: evaluation.result,
          hasCriticalFailure: evaluation.hasCriticalFailure,
          completedAt,
          updatedBy: input.metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationError(
          'CONCURRENCY_CONFLICT',
          'Inspection was modified by another request',
        );
      }

      const updated = await tx.inspection.findFirstOrThrow({
        where: { id: input.inspectionId, organizationId: input.organizationId },
        include: {
          template: true,
          vehicle: true,
          driver: true,
          trip: true,
          responses: {
            include: { templateItem: true },
            orderBy: { templateItem: { sortOrder: 'asc' } },
          },
        },
      });

      const beforeMapped = this.mapInspection(existing);
      const afterMapped = this.mapInspection(updated);

      // Record audit
      await tx.auditLog.create({
        data: {
          organizationId: input.organizationId,
          action: 'inspection.completed',
          entityType: 'Inspection',
          entityId: updated.id,
          beforeData: json(beforeMapped),
          afterData: json({
            result: evaluation.result,
            hasCriticalFailure: evaluation.hasCriticalFailure,
            completedAt: completedAt.toISOString(),
          }),
          actorId: input.metadata.actorId,
          requestId: input.metadata.requestId,
          ipAddress: input.metadata.ipAddress,
          userAgent: input.metadata.userAgent,
        },
      });

      const occurredAt = new Date();
      const basePayload = {
        inspectionId: updated.id,
        displayId: updated.displayId,
        type: updated.type,
        vehicleId: updated.vehicleId,
        driverId: updated.driverId,
        tripId: updated.tripId,
        result: evaluation.result,
        hasCriticalFailure: evaluation.hasCriticalFailure,
        occurredAt: occurredAt.toISOString(),
      };

      // Always emit InspectionCompleted
      await tx.outboxEvent.create({
        data: {
          id: randomUUID(),
          organizationId: input.organizationId,
          eventType: 'InspectionCompleted',
          aggregateType: 'Inspection',
          aggregateId: updated.id,
          occurredAt,
          payload: json({
            eventId: randomUUID(),
            actorId: input.metadata.actorId,
            requestId: input.metadata.requestId,
            ...basePayload,
          }),
        },
      });

      // If failed, emit InspectionFailed
      if (evaluation.result === 'FAIL') {
        await tx.outboxEvent.create({
          data: {
            id: randomUUID(),
            organizationId: input.organizationId,
            eventType: 'InspectionFailed',
            aggregateType: 'Inspection',
            aggregateId: updated.id,
            occurredAt,
            payload: json({
              eventId: randomUUID(),
              actorId: input.metadata.actorId,
              requestId: input.metadata.requestId,
              ...basePayload,
            }),
          },
        });
      }

      // If critical failure, emit InspectionCriticalFailureDetected
      if (evaluation.hasCriticalFailure) {
        await tx.outboxEvent.create({
          data: {
            id: randomUUID(),
            organizationId: input.organizationId,
            eventType: 'InspectionCriticalFailureDetected',
            aggregateType: 'Inspection',
            aggregateId: updated.id,
            occurredAt,
            payload: json({
              eventId: randomUUID(),
              actorId: input.metadata.actorId,
              requestId: input.metadata.requestId,
              ...basePayload,
            }),
          },
        });
      }

      return afterMapped;
    });
  }

  async cancelInspection(input: CancelInspectionInput): Promise<InspectionDetail> {
    const cancelReason = input.cancelReason.trim();
    if (!cancelReason || cancelReason.length > 500) {
      throw new ApplicationError(
        'INSPECTION_ITEM_INVALID',
        'Cancellation reason must be non-empty and at most 500 characters',
      );
    }

    return this.database.$transaction(async (tx) => {
      const existing = await tx.inspection.findFirst({
        where: { id: input.inspectionId, organizationId: input.organizationId },
        include: {
          template: true,
          vehicle: true,
          driver: true,
          trip: true,
          responses: { include: { templateItem: true } },
        },
      });

      if (!existing) {
        throw new ApplicationError(
          'INSPECTION_NOT_FOUND',
          'Inspection was not found in this organization',
        );
      }

      assertInspectionTransition(existing.status as InspectionStatus, 'CANCELLED');

      const cancelledAt = new Date();

      const updateResult = await tx.inspection.updateMany({
        where: {
          id: input.inspectionId,
          organizationId: input.organizationId,
          version: input.version,
        },
        data: {
          status: 'CANCELLED',
          cancelReason,
          cancelledAt,
          updatedBy: input.metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationError(
          'CONCURRENCY_CONFLICT',
          'Inspection was modified by another request',
        );
      }

      const updated = await tx.inspection.findFirstOrThrow({
        where: { id: input.inspectionId, organizationId: input.organizationId },
        include: {
          template: true,
          vehicle: true,
          driver: true,
          trip: true,
          responses: {
            include: { templateItem: true },
            orderBy: { templateItem: { sortOrder: 'asc' } },
          },
        },
      });

      const beforeMapped = this.mapInspection(existing);
      const afterMapped = this.mapInspection(updated);

      await this.recordAuditAndOutbox(
        tx,
        input.organizationId,
        'inspection.cancelled',
        'InspectionCancelled',
        updated.id,
        beforeMapped,
        afterMapped,
        input.metadata,
        {
          inspectionId: updated.id,
          displayId: updated.displayId,
          type: updated.type,
          vehicleId: updated.vehicleId,
          driverId: updated.driverId,
          tripId: updated.tripId,
          status: 'CANCELLED',
          cancelReason,
          cancelledAt: cancelledAt.toISOString(),
        },
      );

      return afterMapped;
    });
  }

  async getInspectionsForVehicle(
    organizationId: string,
    vehicleId: string,
    limit?: number | undefined,
    offset?: number | undefined,
  ): Promise<PaginatedInspections> {
    return this.listInspections(organizationId, { vehicleId, limit, offset });
  }

  async getInspectionsForTrip(
    organizationId: string,
    tripId: string,
    limit?: number | undefined,
    offset?: number | undefined,
  ): Promise<PaginatedInspections> {
    return this.listInspections(organizationId, { tripId, limit, offset });
  }

  async getInspectionsForDriver(
    organizationId: string,
    driverId: string,
    limit?: number | undefined,
    offset?: number | undefined,
  ): Promise<PaginatedInspections> {
    return this.listInspections(organizationId, { driverId, limit, offset });
  }

  // TripInspectionGate Implementation
  async getLatestPreTripInspection(
    organizationId: string,
    tripId: string,
  ): Promise<LatestPreTripInspectionSummary | null> {
    const inspection = await this.database.inspection.findFirst({
      where: {
        organizationId,
        tripId,
        type: 'PRE_TRIP',
        status: 'COMPLETED',
      },
      orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        status: true,
        result: true,
        completedAt: true,
      },
    });

    if (!inspection) return null;

    return {
      id: inspection.id,
      status: inspection.status,
      result: inspection.result,
      completedAt: inspection.completedAt,
    };
  }

  async hasCompletedPostTripInspection(organizationId: string, tripId: string): Promise<boolean> {
    const inspection = await this.database.inspection.findFirst({
      where: {
        organizationId,
        tripId,
        type: 'POST_TRIP',
        status: 'COMPLETED',
      },
      select: { id: true },
    });

    return inspection !== null;
  }
}
