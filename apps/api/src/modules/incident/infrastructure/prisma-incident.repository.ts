import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@vms/database';

import { DATABASE } from '../../../common/tokens.js';
import { ApplicationError } from '../../foundation/domain/errors.js';
import {
  assertAllowedIncidentTransition,
  validateOperationalImpactConsistency,
  validateTripParticipantsMatch,
  type IncidentAttachmentType,
  type IncidentOperationalImpact,
  type IncidentSeverity,
  type IncidentStatus,
  type IncidentType,
} from '../domain/incident.js';
import { IncidentNotFoundError, IncidentVersionConflictError } from '../domain/incident-errors.js';
import type {
  AddNoteInput,
  CancelIncidentInput,
  CloseIncidentInput,
  IncidentDetail,
  IncidentMutationMetadata,
  IncidentRepository,
  ListIncidentsFilter,
  PaginatedIncidents,
  ReportIncidentInput,
  ResolveIncidentInput,
  StartInvestigationInput,
  UpdateIncidentInput,
  UploadAttachmentInput,
} from '../application/incident.repository.js';
import type { IncidentNoteEntry } from '../domain/incident-note.js';
import type { IncidentAttachmentEntry } from '../domain/incident-attachment.js';

type Transaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class PrismaIncidentRepository implements IncidentRepository {
  constructor(@Inject(DATABASE) private readonly database: PrismaClient) {}

  private async allocateDisplayId(tx: Transaction, organizationId: string): Promise<string> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('incident:' || ${organizationId}))`;
    const existing = await tx.incident.findMany({
      where: { organizationId },
      select: { displayId: true },
    });

    let maxNumber = 1000;
    for (const item of existing) {
      const match = /^INC-(\d+)$/i.exec(item.displayId);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (num > maxNumber) {
          maxNumber = num;
        }
      }
    }
    return `INC-${maxNumber + 1}`;
  }

  private async recordAuditAndOutbox(
    tx: Transaction,
    organizationId: string,
    action: string,
    eventType: string,
    aggregateId: string,
    before: unknown | null,
    after: unknown | null,
    metadata: IncidentMutationMetadata,
    payloadData: Record<string, unknown>,
  ): Promise<void> {
    const occurredAt = new Date();
    const eventId = randomUUID();

    await tx.auditLog.create({
      data: {
        organizationId,
        actorId: metadata.actorId,
        action,
        entityType: 'Incident',
        entityId: aggregateId,
        beforeData: before ? json(before) : Prisma.JsonNull,
        afterData: after ? json(after) : Prisma.JsonNull,
        requestId: metadata.requestId ?? 'unknown',
        ipAddress: metadata.ipAddress ?? null,
        userAgent: metadata.userAgent ?? null,
        createdAt: occurredAt,
      },
    });

    await tx.outboxEvent.create({
      data: {
        id: eventId,
        organizationId,
        eventType,
        aggregateType: 'Incident',
        aggregateId,
        payload: json(payloadData),
        occurredAt,
        status: 'PENDING',
        attempts: 0,
        availableAt: occurredAt,
      },
    });
  }

  private async recordAuditOnly(
    tx: Transaction,
    organizationId: string,
    action: string,
    aggregateId: string,
    before: unknown | null,
    after: unknown | null,
    metadata: IncidentMutationMetadata,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        organizationId,
        actorId: metadata.actorId,
        action,
        entityType: 'Incident',
        entityId: aggregateId,
        beforeData: before ? json(before) : Prisma.JsonNull,
        afterData: after ? json(after) : Prisma.JsonNull,
        requestId: metadata.requestId ?? 'unknown',
        ipAddress: metadata.ipAddress ?? null,
        userAgent: metadata.userAgent ?? null,
        createdAt: new Date(),
      },
    });
  }

  async createIncident(input: ReportIncidentInput): Promise<IncidentDetail> {
    return this.database.$transaction(async (tx) => {
      let finalVehicleId = input.vehicleId ?? null;
      let finalDriverId = input.driverId ?? null;
      let finalTripId = input.tripId ?? null;
      let finalAssignmentId = input.assignmentId ?? null;

      if (input.tripId) {
        const trip = await tx.trip.findFirst({
          where: { id: input.tripId, organizationId: input.organizationId },
        });
        if (!trip) {
          throw new ApplicationError('TRIP_NOT_FOUND', 'Trip was not found in this organization');
        }

        validateTripParticipantsMatch(
          {
            vehicleId: trip.vehicleId,
            driverId: trip.driverId,
            assignmentId: trip.assignmentId,
          },
          { vehicleId: input.vehicleId, driverId: input.driverId },
        );

        finalTripId = trip.id;
        finalVehicleId = trip.vehicleId;
        finalDriverId = trip.driverId;
        finalAssignmentId = trip.assignmentId;
      } else {
        if (finalVehicleId) {
          const vehicle = await tx.vehicle.findFirst({
            where: { id: finalVehicleId, organizationId: input.organizationId },
          });
          if (!vehicle) {
            throw new ApplicationError(
              'VEHICLE_NOT_FOUND',
              'Vehicle was not found in this organization',
            );
          }
        }
        if (finalDriverId) {
          const driver = await tx.driver.findFirst({
            where: { id: finalDriverId, organizationId: input.organizationId },
          });
          if (!driver) {
            throw new ApplicationError(
              'DRIVER_NOT_FOUND',
              'Driver was not found in this organization',
            );
          }
        }
      }

      validateOperationalImpactConsistency(input.operationalImpact, finalVehicleId, finalDriverId);

      const displayId = await this.allocateDisplayId(tx, input.organizationId);

      const created = await tx.incident.create({
        data: {
          organizationId: input.organizationId,
          displayId,
          type: input.type,
          severity: input.severity,
          status: 'REPORTED',
          vehicleId: finalVehicleId,
          driverId: finalDriverId,
          tripId: finalTripId,
          assignmentId: finalAssignmentId,
          occurredAt: input.occurredAt,
          title: input.title.trim(),
          description: input.description.trim(),
          locationText: input.locationText?.trim() || null,
          operationalImpact: input.operationalImpact,
          version: 1,
          createdBy: input.metadata.actorId,
          updatedBy: input.metadata.actorId,
        },
        include: {
          vehicle: true,
          driver: true,
          trip: true,
          assignment: true,
          maintenanceRequests: true,
        },
      });

      await tx.incidentStatusHistory.create({
        data: {
          organizationId: input.organizationId,
          incidentId: created.id,
          fromStatus: null,
          toStatus: 'REPORTED',
          reason: 'Initial incident report',
          actorId: input.metadata.actorId,
          requestId: input.metadata.requestId ?? null,
        },
      });

      const mapped = this.mapIncident(created);

      await this.recordAuditAndOutbox(
        tx,
        input.organizationId,
        'incident.reported',
        'IncidentReported',
        created.id,
        null,
        mapped,
        input.metadata,
        {
          eventId: randomUUID(),
          organizationId: created.organizationId,
          incidentId: created.id,
          displayId: created.displayId,
          type: created.type,
          severity: created.severity,
          status: created.status,
          vehicleId: created.vehicleId,
          driverId: created.driverId,
          tripId: created.tripId,
          operationalImpact: created.operationalImpact,
          occurredAt: created.occurredAt.toISOString(),
        },
      );

      return mapped;
    });
  }

  async findIncidentById(id: string, organizationId: string): Promise<IncidentDetail | null> {
    const raw = await this.database.incident.findFirst({
      where: { id, organizationId },
      include: {
        vehicle: true,
        driver: true,
        trip: true,
        assignment: true,
        maintenanceRequests: true,
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          include: { actor: { select: { displayName: true } } },
        },
        notes: {
          orderBy: { createdAt: 'asc' },
          include: { createdByUser: { select: { displayName: true } } },
        },
        attachments: {
          orderBy: { createdAt: 'asc' },
          include: { createdByUser: { select: { displayName: true } } },
        },
      },
    });

    return raw ? this.mapIncident(raw) : null;
  }

  async listIncidents(
    organizationId: string,
    filter?: ListIncidentsFilter,
  ): Promise<PaginatedIncidents> {
    const where: Prisma.IncidentWhereInput = { organizationId };

    if (filter?.status) where.status = filter.status;
    if (filter?.type) where.type = filter.type;
    if (filter?.severity) where.severity = filter.severity;
    if (filter?.vehicleId) where.vehicleId = filter.vehicleId;
    if (filter?.driverId) where.driverId = filter.driverId;
    if (filter?.tripId) where.tripId = filter.tripId;
    if (filter?.operationalImpact) where.operationalImpact = filter.operationalImpact;

    if (filter?.fromOccurredAt || filter?.toOccurredAt) {
      where.occurredAt = {};
      if (filter.fromOccurredAt) where.occurredAt.gte = filter.fromOccurredAt;
      if (filter.toOccurredAt) where.occurredAt.lte = filter.toOccurredAt;
    }

    if (filter?.search) {
      const q = filter.search.trim();
      where.OR = [
        { displayId: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
        { vehicle: { registration: { contains: q, mode: 'insensitive' } } },
        { vehicle: { displayId: { contains: q, mode: 'insensitive' } } },
        { driver: { firstName: { contains: q, mode: 'insensitive' } } },
        { driver: { lastName: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const limit = Math.min(Math.max(filter?.limit ?? 50, 1), 100);
    const offset = Math.max(filter?.offset ?? 0, 0);

    const [items, total] = await Promise.all([
      this.database.incident.findMany({
        where,
        include: {
          vehicle: true,
          driver: true,
          trip: true,
          assignment: true,
          maintenanceRequests: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.database.incident.count({ where }),
    ]);

    return {
      items: items.map((i) => this.mapIncident(i)),
      total,
      limit,
      offset,
    };
  }

  async updateIncident(input: UpdateIncidentInput): Promise<IncidentDetail> {
    return this.database.$transaction(async (tx) => {
      const current = await tx.incident.findFirst({
        where: { id: input.id, organizationId: input.organizationId },
        include: {
          vehicle: true,
          driver: true,
          trip: true,
          assignment: true,
          maintenanceRequests: true,
        },
      });

      if (!current) {
        throw new IncidentNotFoundError(input.id);
      }

      if (current.status !== 'REPORTED' && current.status !== 'INVESTIGATING') {
        throw new ApplicationError(
          'INVALID_INCIDENT_TRANSITION',
          `Cannot edit incident in status ${current.status}`,
        );
      }

      const beforeMapped = this.mapIncident(current);

      const updateData: Prisma.IncidentUncheckedUpdateManyInput = {
        updatedBy: input.metadata.actorId,
        version: { increment: 1 },
      };

      if (input.title !== undefined) updateData.title = input.title.trim();
      if (input.description !== undefined) updateData.description = input.description.trim();
      if (input.severity !== undefined) updateData.severity = input.severity;
      if (input.locationText !== undefined)
        updateData.locationText = input.locationText?.trim() || null;
      if (input.operationalImpact !== undefined)
        updateData.operationalImpact = input.operationalImpact;

      const updateResult = await tx.incident.updateMany({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          version: input.version,
        },
        data: updateData,
      });

      if (updateResult.count !== 1) {
        throw new IncidentVersionConflictError();
      }

      const updated = await tx.incident.findFirstOrThrow({
        where: { id: input.id, organizationId: input.organizationId },
        include: {
          vehicle: true,
          driver: true,
          trip: true,
          assignment: true,
          maintenanceRequests: true,
        },
      });

      const afterMapped = this.mapIncident(updated);

      await this.recordAuditOnly(
        tx,
        input.organizationId,
        'incident.updated',
        current.id,
        beforeMapped,
        afterMapped,
        input.metadata,
      );

      return afterMapped;
    });
  }

  async startInvestigation(input: StartInvestigationInput): Promise<IncidentDetail> {
    return this.database.$transaction(async (tx) => {
      const current = await tx.incident.findFirst({
        where: { id: input.id, organizationId: input.organizationId },
        include: {
          vehicle: true,
          driver: true,
          trip: true,
          assignment: true,
          maintenanceRequests: true,
        },
      });

      if (!current) {
        throw new IncidentNotFoundError(input.id);
      }

      assertAllowedIncidentTransition(current.status as IncidentStatus, 'INVESTIGATING');
      const beforeMapped = this.mapIncident(current);

      const updateResult = await tx.incident.updateMany({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          version: input.version,
        },
        data: {
          status: 'INVESTIGATING',
          updatedBy: input.metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new IncidentVersionConflictError();
      }

      await tx.incidentStatusHistory.create({
        data: {
          organizationId: input.organizationId,
          incidentId: current.id,
          fromStatus: current.status as IncidentStatus,
          toStatus: 'INVESTIGATING',
          reason: 'Investigation started',
          actorId: input.metadata.actorId,
          requestId: input.metadata.requestId ?? null,
        },
      });

      const updated = await tx.incident.findFirstOrThrow({
        where: { id: input.id, organizationId: input.organizationId },
        include: {
          vehicle: true,
          driver: true,
          trip: true,
          assignment: true,
          maintenanceRequests: true,
        },
      });

      const afterMapped = this.mapIncident(updated);

      await this.recordAuditAndOutbox(
        tx,
        input.organizationId,
        'incident.investigation_started',
        'IncidentInvestigationStarted',
        current.id,
        beforeMapped,
        afterMapped,
        input.metadata,
        {
          eventId: randomUUID(),
          organizationId: current.organizationId,
          incidentId: current.id,
          displayId: current.displayId,
          status: 'INVESTIGATING',
          operationalImpact: current.operationalImpact,
        },
      );

      return afterMapped;
    });
  }

  async resolveIncident(input: ResolveIncidentInput): Promise<IncidentDetail> {
    return this.database.$transaction(async (tx) => {
      const current = await tx.incident.findFirst({
        where: { id: input.id, organizationId: input.organizationId },
        include: {
          vehicle: true,
          driver: true,
          trip: true,
          assignment: true,
          maintenanceRequests: true,
        },
      });

      if (!current) {
        throw new IncidentNotFoundError(input.id);
      }

      assertAllowedIncidentTransition(current.status as IncidentStatus, 'RESOLVED');
      const beforeMapped = this.mapIncident(current);
      const resolvedAt = new Date();

      const updateResult = await tx.incident.updateMany({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          version: input.version,
        },
        data: {
          status: 'RESOLVED',
          resolutionSummary: input.resolutionSummary.trim(),
          resolvedAt,
          updatedBy: input.metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new IncidentVersionConflictError();
      }

      await tx.incidentStatusHistory.create({
        data: {
          organizationId: input.organizationId,
          incidentId: current.id,
          fromStatus: current.status as IncidentStatus,
          toStatus: 'RESOLVED',
          reason: input.resolutionSummary.trim(),
          actorId: input.metadata.actorId,
          requestId: input.metadata.requestId ?? null,
        },
      });

      const updated = await tx.incident.findFirstOrThrow({
        where: { id: input.id, organizationId: input.organizationId },
        include: {
          vehicle: true,
          driver: true,
          trip: true,
          assignment: true,
          maintenanceRequests: true,
        },
      });

      const afterMapped = this.mapIncident(updated);

      await this.recordAuditAndOutbox(
        tx,
        input.organizationId,
        'incident.resolved',
        'IncidentResolved',
        current.id,
        beforeMapped,
        afterMapped,
        input.metadata,
        {
          eventId: randomUUID(),
          organizationId: current.organizationId,
          incidentId: current.id,
          displayId: current.displayId,
          status: 'RESOLVED',
          resolutionSummary: input.resolutionSummary.trim(),
          resolvedAt: resolvedAt.toISOString(),
        },
      );

      return afterMapped;
    });
  }

  async closeIncident(input: CloseIncidentInput): Promise<IncidentDetail> {
    return this.database.$transaction(async (tx) => {
      const current = await tx.incident.findFirst({
        where: { id: input.id, organizationId: input.organizationId },
        include: {
          vehicle: true,
          driver: true,
          trip: true,
          assignment: true,
          maintenanceRequests: true,
        },
      });

      if (!current) {
        throw new IncidentNotFoundError(input.id);
      }

      assertAllowedIncidentTransition(current.status as IncidentStatus, 'CLOSED');
      const beforeMapped = this.mapIncident(current);
      const closedAt = new Date();

      const updateResult = await tx.incident.updateMany({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          version: input.version,
        },
        data: {
          status: 'CLOSED',
          closedAt,
          updatedBy: input.metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new IncidentVersionConflictError();
      }

      await tx.incidentStatusHistory.create({
        data: {
          organizationId: input.organizationId,
          incidentId: current.id,
          fromStatus: current.status as IncidentStatus,
          toStatus: 'CLOSED',
          reason: 'Incident administratively closed',
          actorId: input.metadata.actorId,
          requestId: input.metadata.requestId ?? null,
        },
      });

      const updated = await tx.incident.findFirstOrThrow({
        where: { id: input.id, organizationId: input.organizationId },
        include: {
          vehicle: true,
          driver: true,
          trip: true,
          assignment: true,
          maintenanceRequests: true,
        },
      });

      const afterMapped = this.mapIncident(updated);

      await this.recordAuditAndOutbox(
        tx,
        input.organizationId,
        'incident.closed',
        'IncidentClosed',
        current.id,
        beforeMapped,
        afterMapped,
        input.metadata,
        {
          eventId: randomUUID(),
          organizationId: current.organizationId,
          incidentId: current.id,
          displayId: current.displayId,
          status: 'CLOSED',
          closedAt: closedAt.toISOString(),
        },
      );

      return afterMapped;
    });
  }

  async cancelIncident(input: CancelIncidentInput): Promise<IncidentDetail> {
    return this.database.$transaction(async (tx) => {
      const current = await tx.incident.findFirst({
        where: { id: input.id, organizationId: input.organizationId },
        include: {
          vehicle: true,
          driver: true,
          trip: true,
          assignment: true,
          maintenanceRequests: true,
        },
      });

      if (!current) {
        throw new IncidentNotFoundError(input.id);
      }

      assertAllowedIncidentTransition(current.status as IncidentStatus, 'CANCELLED');
      const beforeMapped = this.mapIncident(current);

      const updateResult = await tx.incident.updateMany({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          version: input.version,
        },
        data: {
          status: 'CANCELLED',
          cancelReason: input.cancelReason.trim(),
          updatedBy: input.metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new IncidentVersionConflictError();
      }

      await tx.incidentStatusHistory.create({
        data: {
          organizationId: input.organizationId,
          incidentId: current.id,
          fromStatus: current.status as IncidentStatus,
          toStatus: 'CANCELLED',
          reason: input.cancelReason.trim(),
          actorId: input.metadata.actorId,
          requestId: input.metadata.requestId ?? null,
        },
      });

      const updated = await tx.incident.findFirstOrThrow({
        where: { id: input.id, organizationId: input.organizationId },
        include: {
          vehicle: true,
          driver: true,
          trip: true,
          assignment: true,
          maintenanceRequests: true,
        },
      });

      const afterMapped = this.mapIncident(updated);

      await this.recordAuditAndOutbox(
        tx,
        input.organizationId,
        'incident.cancelled',
        'IncidentCancelled',
        current.id,
        beforeMapped,
        afterMapped,
        input.metadata,
        {
          eventId: randomUUID(),
          organizationId: current.organizationId,
          incidentId: current.id,
          displayId: current.displayId,
          status: 'CANCELLED',
          cancelReason: input.cancelReason.trim(),
        },
      );

      return afterMapped;
    });
  }

  async addNote(input: AddNoteInput): Promise<IncidentNoteEntry> {
    return this.database.$transaction(async (tx) => {
      const incident = await tx.incident.findFirst({
        where: { id: input.incidentId, organizationId: input.organizationId },
      });

      if (!incident) {
        throw new IncidentNotFoundError(input.incidentId);
      }

      const note = await tx.incidentNote.create({
        data: {
          organizationId: input.organizationId,
          incidentId: input.incidentId,
          body: input.body.trim(),
          createdBy: input.metadata.actorId,
        },
        include: { createdByUser: { select: { displayName: true } } },
      });

      const mapped: IncidentNoteEntry = {
        id: note.id,
        organizationId: note.organizationId,
        incidentId: note.incidentId,
        body: note.body,
        createdAt: note.createdAt,
        createdBy: note.createdBy,
        createdById: note.createdBy,
        createdByName: note.createdByUser?.displayName,
      };

      await this.recordAuditOnly(
        tx,
        input.organizationId,
        'incident.note_added',
        input.incidentId,
        null,
        mapped,
        input.metadata,
      );

      return mapped;
    });
  }

  async listNotes(incidentId: string, organizationId: string): Promise<IncidentNoteEntry[]> {
    const list = await this.database.incidentNote.findMany({
      where: { incidentId, organizationId },
      include: { createdByUser: { select: { displayName: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return list.map((n) => ({
      id: n.id,
      organizationId: n.organizationId,
      incidentId: n.incidentId,
      body: n.body,
      createdAt: n.createdAt,
      createdBy: n.createdBy,
      createdById: n.createdBy,
      createdByName: n.createdByUser?.displayName,
    }));
  }

  async addAttachment(input: UploadAttachmentInput): Promise<IncidentAttachmentEntry> {
    return this.database.$transaction(async (tx) => {
      const incident = await tx.incident.findFirst({
        where: { id: input.incidentId, organizationId: input.organizationId },
      });

      if (!incident) {
        throw new IncidentNotFoundError(input.incidentId);
      }

      const attachment = await tx.incidentAttachment.create({
        data: {
          organizationId: input.organizationId,
          incidentId: input.incidentId,
          fileName: input.fileName,
          mimeType: input.mimeType,
          sizeBytes: BigInt(input.sizeBytes),
          storageKey: input.storageKey,
          sha256: input.sha256,
          attachmentType: input.attachmentType,
          description: input.description ?? null,
          createdBy: input.metadata.actorId,
        },
        include: { createdByUser: { select: { displayName: true } } },
      });

      const mapped: IncidentAttachmentEntry = {
        id: attachment.id,
        organizationId: attachment.organizationId,
        incidentId: attachment.incidentId,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: Number(attachment.sizeBytes),
        fileSizeBytes: Number(attachment.sizeBytes),
        storageKey: attachment.storageKey,
        sha256: attachment.sha256,
        fileHashSha256: attachment.sha256,
        attachmentType: attachment.attachmentType as IncidentAttachmentType,
        description: attachment.description,
        createdAt: attachment.createdAt,
        createdBy: attachment.createdBy,
        createdByName: attachment.createdByUser?.displayName,
      };

      await this.recordAuditOnly(
        tx,
        input.organizationId,
        'incident.attachment_uploaded',
        input.incidentId,
        null,
        {
          id: mapped.id,
          fileName: mapped.fileName,
          mimeType: mapped.mimeType,
          sizeBytes: mapped.sizeBytes,
          attachmentType: mapped.attachmentType,
          sha256: mapped.sha256,
        },
        input.metadata,
      );

      return mapped;
    });
  }

  async findAttachmentById(
    attachmentId: string,
    incidentId: string,
    organizationId: string,
  ): Promise<IncidentAttachmentEntry | null> {
    const raw = await this.database.incidentAttachment.findFirst({
      where: { id: attachmentId, incidentId, organizationId },
      include: { createdByUser: { select: { displayName: true } } },
    });

    if (!raw) return null;

    return {
      id: raw.id,
      organizationId: raw.organizationId,
      incidentId: raw.incidentId,
      fileName: raw.fileName,
      mimeType: raw.mimeType,
      sizeBytes: Number(raw.sizeBytes),
      fileSizeBytes: Number(raw.sizeBytes),
      storageKey: raw.storageKey,
      sha256: raw.sha256,
      fileHashSha256: raw.sha256,
      attachmentType: raw.attachmentType as IncidentAttachmentType,
      description: raw.description,
      createdAt: raw.createdAt,
      createdBy: raw.createdBy,
      createdByName: raw.createdByUser?.displayName,
    };
  }

  async listAttachments(
    incidentId: string,
    organizationId: string,
  ): Promise<IncidentAttachmentEntry[]> {
    const list = await this.database.incidentAttachment.findMany({
      where: { incidentId, organizationId },
      include: { createdByUser: { select: { displayName: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return list.map((raw) => ({
      id: raw.id,
      organizationId: raw.organizationId,
      incidentId: raw.incidentId,
      fileName: raw.fileName,
      mimeType: raw.mimeType,
      sizeBytes: Number(raw.sizeBytes),
      fileSizeBytes: Number(raw.sizeBytes),
      storageKey: raw.storageKey,
      sha256: raw.sha256,
      fileHashSha256: raw.sha256,
      attachmentType: raw.attachmentType as IncidentAttachmentType,
      description: raw.description,
      createdAt: raw.createdAt,
      createdBy: raw.createdBy,
      createdByName: raw.createdByUser?.displayName,
    }));
  }

  async isVehicleBlocked(vehicleId: string, organizationId: string): Promise<boolean> {
    const blocking = await this.database.incident.findFirst({
      where: {
        organizationId,
        vehicleId,
        status: { in: ['REPORTED', 'INVESTIGATING'] },
        operationalImpact: { in: ['VEHICLE', 'BOTH'] },
      },
      select: { id: true },
    });
    return Boolean(blocking);
  }

  async isDriverBlocked(driverId: string, organizationId: string): Promise<boolean> {
    const blocking = await this.database.incident.findFirst({
      where: {
        organizationId,
        driverId,
        status: { in: ['REPORTED', 'INVESTIGATING'] },
        operationalImpact: { in: ['DRIVER', 'BOTH'] },
      },
      select: { id: true },
    });
    return Boolean(blocking);
  }

  async getIncidentsForVehicle(
    vehicleId: string,
    organizationId: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<PaginatedIncidents> {
    return this.listIncidents(organizationId, { vehicleId, limit, offset });
  }

  async getIncidentsForDriver(
    driverId: string,
    organizationId: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<PaginatedIncidents> {
    return this.listIncidents(organizationId, { driverId, limit, offset });
  }

  async getIncidentsForTrip(
    tripId: string,
    organizationId: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<PaginatedIncidents> {
    return this.listIncidents(organizationId, { tripId, limit, offset });
  }

  private mapIncident(raw: {
    id: string;
    organizationId: string;
    displayId: string;
    type: string;
    severity: string;
    status: string;
    vehicleId?: string | null;
    driverId?: string | null;
    tripId?: string | null;
    assignmentId?: string | null;
    occurredAt: Date;
    reportedAt: Date;
    title: string;
    description: string;
    locationText?: string | null;
    operationalImpact: string;
    resolutionSummary?: string | null;
    resolvedAt?: Date | null;
    closedAt?: Date | null;
    cancelReason?: string | null;
    version: number;
    createdAt: Date;
    createdBy: string;
    updatedAt: Date;
    updatedBy: string;
    vehicle?: {
      id: string;
      displayId: string;
      registration: string;
      model: string;
      status: string;
    } | null;
    driver?: {
      id: string;
      displayId: string;
      firstName: string;
      lastName: string;
      status: string;
    } | null;
    trip?: {
      id: string;
      displayId: string;
      status: string;
      origin: string;
      destination: string;
    } | null;
    assignment?: {
      id: string;
      status: string;
      startedAt: Date;
      endedAt?: Date | null;
    } | null;
    maintenanceRequests?: Array<{
      id: string;
      displayId: string;
      status: string;
      title: string;
    }> | null;
    statusHistory?: Array<{
      id: string;
      organizationId: string;
      incidentId: string;
      fromStatus?: string | null;
      toStatus: string;
      reason?: string | null;
      actorId: string;
      actor?: { displayName?: string | null; email?: string | null } | null;
      requestId?: string | null;
      createdAt: Date;
    }> | null;
    notes?: Array<{
      id: string;
      organizationId: string;
      incidentId: string;
      body: string;
      createdAt: Date;
      createdBy: string;
      createdByUser?: { id?: string; displayName?: string | null; email?: string | null } | null;
    }> | null;
    attachments?: Array<{
      id: string;
      organizationId: string;
      incidentId: string;
      fileName: string;
      mimeType: string;
      sizeBytes: bigint | number;
      storageKey: string;
      sha256: string;
      attachmentType: string;
      description?: string | null;
      createdAt: Date;
      createdBy: string;
      createdByUser?: { id?: string; displayName?: string | null; email?: string | null } | null;
    }> | null;
  }): IncidentDetail {
    const mr =
      raw.maintenanceRequests && raw.maintenanceRequests.length > 0
        ? raw.maintenanceRequests[0]
        : null;

    return {
      id: raw.id,
      organizationId: raw.organizationId,
      displayId: raw.displayId,
      type: raw.type as IncidentType,
      severity: raw.severity as IncidentSeverity,
      status: raw.status as IncidentStatus,
      vehicleId: raw.vehicleId ?? null,
      driverId: raw.driverId ?? null,
      tripId: raw.tripId ?? null,
      assignmentId: raw.assignmentId ?? null,
      occurredAt: raw.occurredAt,
      reportedAt: raw.reportedAt,
      title: raw.title,
      description: raw.description,
      locationText: raw.locationText ?? null,
      operationalImpact: raw.operationalImpact as IncidentOperationalImpact,
      resolutionSummary: raw.resolutionSummary ?? null,
      resolvedAt: raw.resolvedAt ?? null,
      closedAt: raw.closedAt ?? null,
      cancelReason: raw.cancelReason ?? null,
      cancellationReason: raw.cancelReason ?? null,
      version: raw.version,
      createdAt: raw.createdAt,
      createdBy: raw.createdBy,
      updatedAt: raw.updatedAt,
      updatedBy: raw.updatedBy,

      vehicle: raw.vehicle
        ? {
            id: raw.vehicle.id,
            displayId: raw.vehicle.displayId,
            registration: raw.vehicle.registration,
            model: raw.vehicle.model,
            status: raw.vehicle.status,
          }
        : null,
      driver: raw.driver
        ? {
            id: raw.driver.id,
            displayId: raw.driver.displayId,
            firstName: raw.driver.firstName,
            lastName: raw.driver.lastName,
            status: raw.driver.status,
          }
        : null,
      trip: raw.trip
        ? {
            id: raw.trip.id,
            displayId: raw.trip.displayId,
            status: raw.trip.status,
            origin: raw.trip.origin,
            destination: raw.trip.destination,
          }
        : null,
      assignment: raw.assignment
        ? {
            id: raw.assignment.id,
            status: raw.assignment.status,
            startedAt: raw.assignment.startedAt,
            endedAt: raw.assignment.endedAt ?? null,
          }
        : null,
      maintenanceRequest: mr
        ? {
            id: mr.id,
            displayId: mr.displayId,
            status: mr.status,
            title: mr.title,
          }
        : null,

      ...(raw.statusHistory
        ? {
            statusHistory: raw.statusHistory.map((h) => ({
              id: h.id,
              organizationId: h.organizationId,
              incidentId: h.incidentId,
              fromStatus: (h.fromStatus as IncidentStatus) ?? null,
              toStatus: h.toStatus as IncidentStatus,
              reason: h.reason ?? null,
              actorId: h.actorId,
              ...(h.actor?.displayName ? { actorName: h.actor.displayName } : {}),
              requestId: h.requestId ?? null,
              createdAt: h.createdAt,
            })),
          }
        : {}),
      ...(raw.notes
        ? {
            notes: raw.notes.map((n) => ({
              id: n.id,
              organizationId: n.organizationId,
              incidentId: n.incidentId,
              body: n.body,
              createdAt: n.createdAt,
              createdBy: n.createdBy,
              createdById: n.createdBy,
              createdByUser: n.createdByUser ?? null,
              ...(n.createdByUser?.displayName
                ? { createdByName: n.createdByUser.displayName }
                : {}),
            })),
          }
        : {}),
      ...(raw.attachments
        ? {
            attachments: raw.attachments.map((a) => ({
              id: a.id,
              organizationId: a.organizationId,
              incidentId: a.incidentId,
              fileName: a.fileName,
              mimeType: a.mimeType,
              sizeBytes: Number(a.sizeBytes),
              fileSizeBytes: Number(a.sizeBytes),
              storageKey: a.storageKey,
              sha256: a.sha256,
              fileHashSha256: a.sha256,
              attachmentType: a.attachmentType as IncidentAttachmentType,
              description: a.description ?? null,
              createdAt: a.createdAt,
              createdBy: a.createdBy,
              createdById: a.createdBy,
              createdByUser: a.createdByUser ?? null,
              ...(a.createdByUser?.displayName
                ? { createdByName: a.createdByUser.displayName }
                : {}),
            })),
          }
        : {}),
    };
  }
}
