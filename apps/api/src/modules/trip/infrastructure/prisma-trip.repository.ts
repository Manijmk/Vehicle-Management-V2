import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@vms/database';

import { DATABASE } from '../../../common/tokens.js';
import { ApplicationError } from '../../foundation/domain/errors.js';
import {
  assertEndOdometer,
  assertStartOdometer,
  assertTripOperationalEligibility,
  assertTripPlanning,
  assertTripTransition,
  assertVehicleOdometerNoDecrease,
  calculateTripDistance,
  normalizeOptionalText,
  normalizeTripReason,
  type TripStatus,
} from '../domain/trip.js';
import type {
  AbortTripInput,
  CancelTripInput,
  CompleteTripInput,
  CreateTripInput,
  ListTripsFilter,
  MarkTripReadyInput,
  PaginatedTrips,
  StartTripInput,
  TripDetail,
  TripMutationMetadata,
  TripRepository,
  TripStatusHistoryEntry,
  UpdateTripInput,
} from '../application/trip.repository.js';

type Transaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

interface PrismaTripWithRelations {
  id: string;
  organizationId: string;
  displayId: string;
  assignmentId: string;
  vehicleId: string;
  driverId: string;
  status: string;
  origin: string;
  destination: string;
  purpose: string | null;
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  startOdometerKm: number | null;
  endOdometerKm: number | null;
  distanceKm: number | null;
  cancelReason: string | null;
  abortReason: string | null;
  notes: string | null;
  version: number;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  vehicle: {
    id: string;
    displayId: string;
    registration: string;
    vin: string;
    model: string;
    status: string;
    odometerKm: number;
  };
  driver: {
    id: string;
    displayId: string;
    firstName: string;
    lastName: string;
    status: string;
    licenses?: Array<{ issueDate: Date; expiryDate: Date }>;
  };
  assignment: {
    id: string;
    status: string;
  };
}

@Injectable()
export class PrismaTripRepository implements TripRepository {
  constructor(
    @Inject(DATABASE)
    private readonly database: PrismaClient,
  ) {}

  private isDriverEligible(driver: PrismaTripWithRelations['driver']): boolean {
    if (driver.status !== 'ACTIVE') return false;
    if (!driver.licenses || driver.licenses.length === 0) return false;
    const now = new Date();
    return driver.licenses.some(
      (lic) =>
        new Date(lic.issueDate).getTime() <= now.getTime() &&
        new Date(lic.expiryDate).getTime() >= now.getTime(),
    );
  }

  private mapTrip(raw: PrismaTripWithRelations): TripDetail {
    const isOperationallyEligible = this.isDriverEligible(raw.driver);
    return {
      id: raw.id,
      organizationId: raw.organizationId,
      displayId: raw.displayId,
      assignmentId: raw.assignmentId,
      vehicleId: raw.vehicleId,
      driverId: raw.driverId,
      status: raw.status as TripStatus,
      origin: raw.origin,
      destination: raw.destination,
      purpose: raw.purpose,
      plannedStartAt: raw.plannedStartAt,
      plannedEndAt: raw.plannedEndAt,
      actualStartAt: raw.actualStartAt,
      actualEndAt: raw.actualEndAt,
      startOdometerKm: raw.startOdometerKm,
      endOdometerKm: raw.endOdometerKm,
      distanceKm: raw.distanceKm,
      cancelReason: raw.cancelReason,
      abortReason: raw.abortReason,
      notes: raw.notes,
      version: raw.version,
      createdAt: raw.createdAt,
      createdBy: raw.createdBy,
      updatedAt: raw.updatedAt,
      updatedBy: raw.updatedBy,
      vehicle: {
        id: raw.vehicle.id,
        displayId: raw.vehicle.displayId,
        registration: raw.vehicle.registration,
        vin: raw.vehicle.vin,
        model: raw.vehicle.model,
        status: raw.vehicle.status,
        odometerKm: raw.vehicle.odometerKm,
      },
      driver: {
        id: raw.driver.id,
        displayId: raw.driver.displayId,
        firstName: raw.driver.firstName,
        lastName: raw.driver.lastName,
        status: raw.driver.status,
        eligible: isOperationallyEligible,
      },
      assignment: {
        id: raw.assignment.id,
        status: raw.assignment.status,
      },
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
    metadata: TripMutationMetadata,
    payloadData: Record<string, unknown>,
  ): Promise<void> {
    const occurredAt = new Date();
    const eventId = randomUUID();

    await tx.auditLog.create({
      data: {
        organizationId,
        action,
        entityType: 'Trip',
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
        aggregateType: 'Trip',
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

  private async allocateDisplayId(tx: Transaction, organizationId: string): Promise<string> {
    const existing = await tx.trip.findMany({
      where: { organizationId },
      select: { displayId: true },
    });
    let maxNumber = 1000;
    for (const t of existing) {
      const match = /^TRIP-(\d+)$/i.exec(t.displayId);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (num > maxNumber) maxNumber = num;
      }
    }
    return `TRIP-${maxNumber + 1}`;
  }

  async createTrip(input: CreateTripInput): Promise<TripDetail> {
    const planning = assertTripPlanning(
      input.origin,
      input.destination,
      input.plannedStartAt,
      input.plannedEndAt,
    );
    const purpose = normalizeOptionalText(input.purpose);
    const notes = normalizeOptionalText(input.notes);

    return this.database.$transaction(async (tx) => {
      const assignment = await tx.vehicleDriverAssignment.findFirst({
        where: { id: input.assignmentId, organizationId: input.organizationId },
        include: {
          vehicle: true,
          driver: { include: { licenses: true } },
        },
      });

      if (!assignment) {
        throw new ApplicationError(
          'ASSIGNMENT_NOT_FOUND',
          'Assignment was not found in this organization',
        );
      }

      if (assignment.status !== 'ACTIVE') {
        throw new ApplicationError(
          'TRIP_ASSIGNMENT_NOT_ACTIVE',
          'Cannot create trip for an inactive assignment',
        );
      }

      const displayId = await this.allocateDisplayId(tx, input.organizationId);

      const trip = await tx.trip.create({
        data: {
          organizationId: input.organizationId,
          displayId,
          assignmentId: assignment.id,
          vehicleId: assignment.vehicleId,
          driverId: assignment.driverId,
          status: 'DRAFT',
          origin: planning.origin,
          destination: planning.destination,
          purpose,
          plannedStartAt: input.plannedStartAt ?? null,
          plannedEndAt: input.plannedEndAt ?? null,
          notes,
          createdBy: input.metadata.actorId,
          updatedBy: input.metadata.actorId,
        },
        include: {
          vehicle: true,
          driver: { include: { licenses: true } },
          assignment: true,
        },
      });

      await tx.tripStatusHistory.create({
        data: {
          organizationId: input.organizationId,
          tripId: trip.id,
          fromStatus: null,
          toStatus: 'DRAFT',
          reason: 'Trip created',
          changedBy: input.metadata.actorId,
          requestId: input.metadata.requestId,
          ipAddress: input.metadata.ipAddress,
          userAgent: input.metadata.userAgent,
        },
      });

      const mapped = this.mapTrip(trip as unknown as PrismaTripWithRelations);

      await this.recordAuditAndOutbox(
        tx,
        input.organizationId,
        'trip.created',
        'TripCreated',
        trip.id,
        null,
        mapped,
        input.metadata,
        {
          tripId: trip.id,
          displayId: trip.displayId,
          organizationId: input.organizationId,
          assignmentId: trip.assignmentId,
          vehicleId: trip.vehicleId,
          driverId: trip.driverId,
          status: trip.status,
          origin: trip.origin,
          destination: trip.destination,
        },
      );

      return mapped;
    });
  }

  async getTrip(organizationId: string, tripId: string): Promise<TripDetail> {
    const trip = await this.database.trip.findFirst({
      where: { id: tripId, organizationId },
      include: {
        vehicle: true,
        driver: { include: { licenses: true } },
        assignment: true,
      },
    });

    if (!trip) {
      throw new ApplicationError('TRIP_NOT_FOUND', 'Trip was not found in this organization');
    }

    return this.mapTrip(trip as unknown as PrismaTripWithRelations);
  }

  async listTrips(organizationId: string, filter?: ListTripsFilter): Promise<PaginatedTrips> {
    const where: Prisma.TripWhereInput = {
      organizationId,
      ...(filter?.status ? { status: filter.status } : {}),
      ...(filter?.vehicleId ? { vehicleId: filter.vehicleId } : {}),
      ...(filter?.driverId ? { driverId: filter.driverId } : {}),
      ...(filter?.assignmentId ? { assignmentId: filter.assignmentId } : {}),
    };

    if (filter?.search) {
      const q = filter.search.trim();
      where.OR = [
        { displayId: { contains: q, mode: 'insensitive' } },
        { origin: { contains: q, mode: 'insensitive' } },
        { destination: { contains: q, mode: 'insensitive' } },
        { vehicle: { displayId: { contains: q, mode: 'insensitive' } } },
        { vehicle: { registration: { contains: q, mode: 'insensitive' } } },
        { driver: { displayId: { contains: q, mode: 'insensitive' } } },
        { driver: { firstName: { contains: q, mode: 'insensitive' } } },
        { driver: { lastName: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const limit = Math.min(Math.max(filter?.limit ?? 50, 1), 100);
    const offset = Math.max(filter?.offset ?? 0, 0);

    const [items, total] = await Promise.all([
      this.database.trip.findMany({
        where,
        include: {
          vehicle: true,
          driver: { include: { licenses: true } },
          assignment: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.database.trip.count({ where }),
    ]);

    return {
      items: items.map((t) => this.mapTrip(t as unknown as PrismaTripWithRelations)),
      total,
    };
  }

  async updateTrip(input: UpdateTripInput): Promise<TripDetail> {
    return this.database.$transaction(async (tx) => {
      const trip = await tx.trip.findFirst({
        where: { id: input.tripId, organizationId: input.organizationId },
        include: {
          vehicle: true,
          driver: { include: { licenses: true } },
          assignment: true,
        },
      });

      if (!trip) {
        throw new ApplicationError('TRIP_NOT_FOUND', 'Trip was not found in this organization');
      }

      if (trip.status !== 'DRAFT') {
        throw new ApplicationError(
          'TRIP_NOT_EDITABLE',
          `Cannot edit trip planning details while in status ${trip.status}`,
        );
      }

      const origin = input.origin !== undefined ? input.origin.trim() : trip.origin;
      const destination =
        input.destination !== undefined ? input.destination.trim() : trip.destination;
      const plannedStartAt =
        input.plannedStartAt !== undefined ? input.plannedStartAt : trip.plannedStartAt;
      const plannedEndAt =
        input.plannedEndAt !== undefined ? input.plannedEndAt : trip.plannedEndAt;

      const planning = assertTripPlanning(origin, destination, plannedStartAt, plannedEndAt);
      const purpose =
        input.purpose !== undefined ? normalizeOptionalText(input.purpose) : trip.purpose;
      const notes = input.notes !== undefined ? normalizeOptionalText(input.notes) : trip.notes;

      const updateResult = await tx.trip.updateMany({
        where: {
          id: input.tripId,
          organizationId: input.organizationId,
          version: input.version,
        },
        data: {
          origin: planning.origin,
          destination: planning.destination,
          purpose,
          plannedStartAt,
          plannedEndAt,
          notes,
          updatedBy: input.metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationError('CONCURRENCY_CONFLICT', 'Trip was modified by another request');
      }

      const updated = await tx.trip.findFirstOrThrow({
        where: { id: input.tripId, organizationId: input.organizationId },
        include: {
          vehicle: true,
          driver: { include: { licenses: true } },
          assignment: true,
        },
      });

      const beforeMapped = this.mapTrip(trip as unknown as PrismaTripWithRelations);
      const afterMapped = this.mapTrip(updated as unknown as PrismaTripWithRelations);

      await tx.auditLog.create({
        data: {
          organizationId: input.organizationId,
          action: 'trip.updated',
          entityType: 'Trip',
          entityId: trip.id,
          beforeData: json(beforeMapped),
          afterData: json(afterMapped),
          actorId: input.metadata.actorId,
          requestId: input.metadata.requestId,
          ipAddress: input.metadata.ipAddress,
          userAgent: input.metadata.userAgent,
        },
      });

      return afterMapped;
    });
  }

  async markTripReady(input: MarkTripReadyInput): Promise<TripDetail> {
    return this.database.$transaction(async (tx) => {
      const trip = await tx.trip.findFirst({
        where: { id: input.tripId, organizationId: input.organizationId },
        include: {
          vehicle: true,
          driver: { include: { licenses: true } },
          assignment: true,
        },
      });

      if (!trip) {
        throw new ApplicationError('TRIP_NOT_FOUND', 'Trip was not found in this organization');
      }

      assertTripTransition(trip.status as TripStatus, 'READY');

      const isEligible = this.isDriverEligible(trip.driver);
      assertTripOperationalEligibility({
        assignmentStatus: trip.assignment.status,
        vehicleStatus: trip.vehicle.status,
        driverStatus: trip.driver.status,
        isDriverEligible: isEligible,
      });

      const updateResult = await tx.trip.updateMany({
        where: {
          id: input.tripId,
          organizationId: input.organizationId,
          version: input.version,
        },
        data: {
          status: 'READY',
          updatedBy: input.metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationError('CONCURRENCY_CONFLICT', 'Trip was modified by another request');
      }

      await tx.tripStatusHistory.create({
        data: {
          organizationId: input.organizationId,
          tripId: trip.id,
          fromStatus: trip.status as TripStatus,
          toStatus: 'READY',
          reason: 'Trip marked ready',
          changedBy: input.metadata.actorId,
          requestId: input.metadata.requestId,
          ipAddress: input.metadata.ipAddress,
          userAgent: input.metadata.userAgent,
        },
      });

      const updated = await tx.trip.findFirstOrThrow({
        where: { id: input.tripId, organizationId: input.organizationId },
        include: {
          vehicle: true,
          driver: { include: { licenses: true } },
          assignment: true,
        },
      });

      const beforeMapped = this.mapTrip(trip as unknown as PrismaTripWithRelations);
      const afterMapped = this.mapTrip(updated as unknown as PrismaTripWithRelations);

      await this.recordAuditAndOutbox(
        tx,
        input.organizationId,
        'trip.ready',
        'TripReady',
        trip.id,
        beforeMapped,
        afterMapped,
        input.metadata,
        {
          tripId: trip.id,
          displayId: trip.displayId,
          organizationId: input.organizationId,
          assignmentId: trip.assignmentId,
          vehicleId: trip.vehicleId,
          driverId: trip.driverId,
          status: 'READY',
        },
      );

      return afterMapped;
    });
  }

  async startTrip(input: StartTripInput): Promise<TripDetail> {
    return this.database.$transaction(async (tx) => {
      const trip = await tx.trip.findFirst({
        where: { id: input.tripId, organizationId: input.organizationId },
        include: {
          vehicle: true,
          driver: { include: { licenses: true } },
          assignment: true,
        },
      });

      if (!trip) {
        throw new ApplicationError('TRIP_NOT_FOUND', 'Trip was not found in this organization');
      }

      assertTripTransition(trip.status as TripStatus, 'IN_PROGRESS');

      assertStartOdometer(input.startOdometerKm, trip.vehicle.odometerKm);

      const isEligible = this.isDriverEligible(trip.driver);
      assertTripOperationalEligibility({
        assignmentStatus: trip.assignment.status,
        vehicleStatus: trip.vehicle.status,
        driverStatus: trip.driver.status,
        isDriverEligible: isEligible,
      });

      // Milestone 6: Pre-Trip Inspection Gate
      const latestPreTrip = await tx.inspection.findFirst({
        where: {
          organizationId: input.organizationId,
          tripId: trip.id,
          type: 'PRE_TRIP',
          status: 'COMPLETED',
        },
        orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
      });

      if (!latestPreTrip) {
        throw new ApplicationError(
          'PRE_TRIP_INSPECTION_REQUIRED',
          'A completed and passing pre-trip inspection is required before the trip can start',
        );
      }

      if (latestPreTrip.result !== 'PASS') {
        throw new ApplicationError(
          'PRE_TRIP_INSPECTION_FAILED',
          'The latest pre-trip inspection failed. Complete a passing reinspection before starting',
        );
      }

      // Check if vehicle or driver already has an in-progress trip
      const existingVehicleTrip = await tx.trip.findFirst({
        where: {
          organizationId: input.organizationId,
          vehicleId: trip.vehicleId,
          status: 'IN_PROGRESS',
        },
      });
      if (existingVehicleTrip && existingVehicleTrip.id !== trip.id) {
        throw new ApplicationError(
          'VEHICLE_HAS_IN_PROGRESS_TRIP',
          'Vehicle already has an in-progress trip',
        );
      }

      const existingDriverTrip = await tx.trip.findFirst({
        where: {
          organizationId: input.organizationId,
          driverId: trip.driverId,
          status: 'IN_PROGRESS',
        },
      });
      if (existingDriverTrip && existingDriverTrip.id !== trip.id) {
        throw new ApplicationError(
          'DRIVER_HAS_IN_PROGRESS_TRIP',
          'Driver already has an in-progress trip',
        );
      }

      const actualStartAt = new Date();

      try {
        const updateResult = await tx.trip.updateMany({
          where: {
            id: input.tripId,
            organizationId: input.organizationId,
            version: input.version,
          },
          data: {
            status: 'IN_PROGRESS',
            actualStartAt,
            startOdometerKm: input.startOdometerKm,
            updatedBy: input.metadata.actorId,
            version: { increment: 1 },
          },
        });

        if (updateResult.count !== 1) {
          throw new ApplicationError(
            'CONCURRENCY_CONFLICT',
            'Trip was modified by another request',
          );
        }
      } catch (err: unknown) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          const target = String(err.meta?.['target'] ?? '');
          if (target.includes('vehicle') || target.includes('idx_trips_in_progress_vehicle')) {
            throw new ApplicationError(
              'VEHICLE_HAS_IN_PROGRESS_TRIP',
              'Vehicle already has an in-progress trip',
            );
          }
          if (target.includes('driver') || target.includes('idx_trips_in_progress_driver')) {
            throw new ApplicationError(
              'DRIVER_HAS_IN_PROGRESS_TRIP',
              'Driver already has an in-progress trip',
            );
          }
        }
        throw err;
      }

      await tx.tripStatusHistory.create({
        data: {
          organizationId: input.organizationId,
          tripId: trip.id,
          fromStatus: trip.status as TripStatus,
          toStatus: 'IN_PROGRESS',
          reason: 'Trip started',
          changedBy: input.metadata.actorId,
          requestId: input.metadata.requestId,
          ipAddress: input.metadata.ipAddress,
          userAgent: input.metadata.userAgent,
        },
      });

      const updated = await tx.trip.findFirstOrThrow({
        where: { id: input.tripId, organizationId: input.organizationId },
        include: {
          vehicle: true,
          driver: { include: { licenses: true } },
          assignment: true,
        },
      });

      const beforeMapped = this.mapTrip(trip as unknown as PrismaTripWithRelations);
      const afterMapped = this.mapTrip(updated as unknown as PrismaTripWithRelations);

      await this.recordAuditAndOutbox(
        tx,
        input.organizationId,
        'trip.started',
        'TripStarted',
        trip.id,
        beforeMapped,
        afterMapped,
        input.metadata,
        {
          tripId: trip.id,
          displayId: trip.displayId,
          organizationId: input.organizationId,
          assignmentId: trip.assignmentId,
          vehicleId: trip.vehicleId,
          driverId: trip.driverId,
          status: 'IN_PROGRESS',
          actualStartAt: actualStartAt.toISOString(),
          startOdometerKm: input.startOdometerKm,
        },
      );

      return afterMapped;
    });
  }

  async completeTrip(input: CompleteTripInput): Promise<TripDetail> {
    return this.database.$transaction(async (tx) => {
      const trip = await tx.trip.findFirst({
        where: { id: input.tripId, organizationId: input.organizationId },
        include: {
          vehicle: true,
          driver: { include: { licenses: true } },
          assignment: true,
        },
      });

      if (!trip) {
        throw new ApplicationError('TRIP_NOT_FOUND', 'Trip was not found in this organization');
      }

      assertTripTransition(trip.status as TripStatus, 'COMPLETED');

      const startOdo = trip.startOdometerKm ?? trip.vehicle.odometerKm;
      assertEndOdometer(input.endOdometerKm, startOdo);
      assertVehicleOdometerNoDecrease(trip.vehicle.odometerKm, input.endOdometerKm);

      // Milestone 6: Post-Trip Inspection Gate
      // Requires at least one COMPLETED POST_TRIP inspection for this trip (result does not need to be PASS)
      const postTripInspection = await tx.inspection.findFirst({
        where: {
          organizationId: input.organizationId,
          tripId: trip.id,
          type: 'POST_TRIP',
          status: 'COMPLETED',
        },
      });

      if (!postTripInspection) {
        throw new ApplicationError(
          'POST_TRIP_INSPECTION_REQUIRED',
          'A completed post-trip inspection is required before the trip can be completed',
        );
      }

      const distanceKm = calculateTripDistance(startOdo, input.endOdometerKm);
      const actualEndAt = new Date();

      const updateResult = await tx.trip.updateMany({
        where: {
          id: input.tripId,
          organizationId: input.organizationId,
          version: input.version,
        },
        data: {
          status: 'COMPLETED',
          actualEndAt,
          endOdometerKm: input.endOdometerKm,
          distanceKm,
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          updatedBy: input.metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationError('CONCURRENCY_CONFLICT', 'Trip was modified by another request');
      }

      // Update vehicle odometer atomically
      await tx.vehicle.updateMany({
        where: {
          id: trip.vehicleId,
          organizationId: input.organizationId,
        },
        data: {
          odometerKm: input.endOdometerKm,
          version: { increment: 1 },
        },
      });

      await tx.tripStatusHistory.create({
        data: {
          organizationId: input.organizationId,
          tripId: trip.id,
          fromStatus: trip.status as TripStatus,
          toStatus: 'COMPLETED',
          reason: 'Trip completed',
          changedBy: input.metadata.actorId,
          requestId: input.metadata.requestId,
          ipAddress: input.metadata.ipAddress,
          userAgent: input.metadata.userAgent,
        },
      });

      const updated = await tx.trip.findFirstOrThrow({
        where: { id: input.tripId, organizationId: input.organizationId },
        include: {
          vehicle: true,
          driver: { include: { licenses: true } },
          assignment: true,
        },
      });

      const beforeMapped = this.mapTrip(trip as unknown as PrismaTripWithRelations);
      const afterMapped = this.mapTrip(updated as unknown as PrismaTripWithRelations);

      await this.recordAuditAndOutbox(
        tx,
        input.organizationId,
        'trip.completed',
        'TripCompleted',
        trip.id,
        beforeMapped,
        afterMapped,
        input.metadata,
        {
          tripId: trip.id,
          displayId: trip.displayId,
          organizationId: input.organizationId,
          assignmentId: trip.assignmentId,
          vehicleId: trip.vehicleId,
          driverId: trip.driverId,
          status: 'COMPLETED',
          actualEndAt: actualEndAt.toISOString(),
          startOdometerKm: startOdo,
          endOdometerKm: input.endOdometerKm,
          distanceKm,
        },
      );

      return afterMapped;
    });
  }

  async cancelTrip(input: CancelTripInput): Promise<TripDetail> {
    const cancelReason = input.cancelReason
      ? normalizeTripReason(input.cancelReason, 'cancelReason')
      : 'Trip cancelled';

    return this.database.$transaction(async (tx) => {
      const trip = await tx.trip.findFirst({
        where: { id: input.tripId, organizationId: input.organizationId },
        include: {
          vehicle: true,
          driver: { include: { licenses: true } },
          assignment: true,
        },
      });

      if (!trip) {
        throw new ApplicationError('TRIP_NOT_FOUND', 'Trip was not found in this organization');
      }

      assertTripTransition(trip.status as TripStatus, 'CANCELLED');

      const updateResult = await tx.trip.updateMany({
        where: {
          id: input.tripId,
          organizationId: input.organizationId,
          version: input.version,
        },
        data: {
          status: 'CANCELLED',
          cancelReason,
          updatedBy: input.metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationError('CONCURRENCY_CONFLICT', 'Trip was modified by another request');
      }

      await tx.tripStatusHistory.create({
        data: {
          organizationId: input.organizationId,
          tripId: trip.id,
          fromStatus: trip.status as TripStatus,
          toStatus: 'CANCELLED',
          reason: cancelReason,
          changedBy: input.metadata.actorId,
          requestId: input.metadata.requestId,
          ipAddress: input.metadata.ipAddress,
          userAgent: input.metadata.userAgent,
        },
      });

      const updated = await tx.trip.findFirstOrThrow({
        where: { id: input.tripId, organizationId: input.organizationId },
        include: {
          vehicle: true,
          driver: { include: { licenses: true } },
          assignment: true,
        },
      });

      const beforeMapped = this.mapTrip(trip as unknown as PrismaTripWithRelations);
      const afterMapped = this.mapTrip(updated as unknown as PrismaTripWithRelations);

      await this.recordAuditAndOutbox(
        tx,
        input.organizationId,
        'trip.cancelled',
        'TripCancelled',
        trip.id,
        beforeMapped,
        afterMapped,
        input.metadata,
        {
          tripId: trip.id,
          displayId: trip.displayId,
          organizationId: input.organizationId,
          assignmentId: trip.assignmentId,
          vehicleId: trip.vehicleId,
          driverId: trip.driverId,
          status: 'CANCELLED',
          cancelReason,
        },
      );

      return afterMapped;
    });
  }

  async abortTrip(input: AbortTripInput): Promise<TripDetail> {
    const abortReason = normalizeTripReason(input.abortReason, 'abortReason');

    return this.database.$transaction(async (tx) => {
      const trip = await tx.trip.findFirst({
        where: { id: input.tripId, organizationId: input.organizationId },
        include: {
          vehicle: true,
          driver: { include: { licenses: true } },
          assignment: true,
        },
      });

      if (!trip) {
        throw new ApplicationError('TRIP_NOT_FOUND', 'Trip was not found in this organization');
      }

      assertTripTransition(trip.status as TripStatus, 'ABORTED');

      const startOdo = trip.startOdometerKm ?? trip.vehicle.odometerKm;
      assertEndOdometer(input.endOdometerKm, startOdo);
      assertVehicleOdometerNoDecrease(trip.vehicle.odometerKm, input.endOdometerKm);

      const distanceKm = calculateTripDistance(startOdo, input.endOdometerKm);
      const actualEndAt = new Date();

      const updateResult = await tx.trip.updateMany({
        where: {
          id: input.tripId,
          organizationId: input.organizationId,
          version: input.version,
        },
        data: {
          status: 'ABORTED',
          actualEndAt,
          endOdometerKm: input.endOdometerKm,
          distanceKm,
          abortReason,
          updatedBy: input.metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationError('CONCURRENCY_CONFLICT', 'Trip was modified by another request');
      }

      // Update vehicle odometer atomically on abort
      await tx.vehicle.updateMany({
        where: {
          id: trip.vehicleId,
          organizationId: input.organizationId,
        },
        data: {
          odometerKm: input.endOdometerKm,
          version: { increment: 1 },
        },
      });

      await tx.tripStatusHistory.create({
        data: {
          organizationId: input.organizationId,
          tripId: trip.id,
          fromStatus: trip.status as TripStatus,
          toStatus: 'ABORTED',
          reason: abortReason,
          changedBy: input.metadata.actorId,
          requestId: input.metadata.requestId,
          ipAddress: input.metadata.ipAddress,
          userAgent: input.metadata.userAgent,
        },
      });

      const updated = await tx.trip.findFirstOrThrow({
        where: { id: input.tripId, organizationId: input.organizationId },
        include: {
          vehicle: true,
          driver: { include: { licenses: true } },
          assignment: true,
        },
      });

      const beforeMapped = this.mapTrip(trip as unknown as PrismaTripWithRelations);
      const afterMapped = this.mapTrip(updated as unknown as PrismaTripWithRelations);

      await this.recordAuditAndOutbox(
        tx,
        input.organizationId,
        'trip.aborted',
        'TripAborted',
        trip.id,
        beforeMapped,
        afterMapped,
        input.metadata,
        {
          tripId: trip.id,
          displayId: trip.displayId,
          organizationId: input.organizationId,
          assignmentId: trip.assignmentId,
          vehicleId: trip.vehicleId,
          driverId: trip.driverId,
          status: 'ABORTED',
          abortReason,
          actualEndAt: actualEndAt.toISOString(),
          startOdometerKm: startOdo,
          endOdometerKm: input.endOdometerKm,
          distanceKm,
        },
      );

      return afterMapped;
    });
  }

  async getStatusHistory(
    organizationId: string,
    tripId: string,
  ): Promise<TripStatusHistoryEntry[]> {
    // Verify trip exists in organization
    const trip = await this.database.trip.findFirst({
      where: { id: tripId, organizationId },
      select: { id: true },
    });

    if (!trip) {
      throw new ApplicationError('TRIP_NOT_FOUND', 'Trip was not found in this organization');
    }

    const history = await this.database.tripStatusHistory.findMany({
      where: { organizationId, tripId },
      orderBy: { createdAt: 'asc' },
    });

    return history.map((entry) => ({
      id: entry.id,
      organizationId: entry.organizationId,
      tripId: entry.tripId,
      fromStatus: entry.fromStatus as TripStatus | null,
      toStatus: entry.toStatus as TripStatus,
      reason: entry.reason,
      changedBy: entry.changedBy,
      requestId: entry.requestId,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      createdAt: entry.createdAt,
    }));
  }

  async getCurrentTripForVehicle(
    organizationId: string,
    vehicleId: string,
  ): Promise<TripDetail | null> {
    const trip = await this.database.trip.findFirst({
      where: {
        organizationId,
        vehicleId,
        status: 'IN_PROGRESS',
      },
      include: {
        vehicle: true,
        driver: { include: { licenses: true } },
        assignment: true,
      },
    });

    return trip ? this.mapTrip(trip as unknown as PrismaTripWithRelations) : null;
  }

  async getTripsForVehicle(
    organizationId: string,
    vehicleId: string,
    limit = 50,
    offset = 0,
  ): Promise<PaginatedTrips> {
    const where = { organizationId, vehicleId };
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safeOffset = Math.max(offset, 0);

    const [items, total] = await Promise.all([
      this.database.trip.findMany({
        where,
        include: {
          vehicle: true,
          driver: { include: { licenses: true } },
          assignment: true,
        },
        orderBy: { createdAt: 'desc' },
        take: safeLimit,
        skip: safeOffset,
      }),
      this.database.trip.count({ where }),
    ]);

    return {
      items: items.map((t) => this.mapTrip(t as unknown as PrismaTripWithRelations)),
      total,
    };
  }

  async getCurrentTripForDriver(
    organizationId: string,
    driverId: string,
  ): Promise<TripDetail | null> {
    const trip = await this.database.trip.findFirst({
      where: {
        organizationId,
        driverId,
        status: 'IN_PROGRESS',
      },
      include: {
        vehicle: true,
        driver: { include: { licenses: true } },
        assignment: true,
      },
    });

    return trip ? this.mapTrip(trip as unknown as PrismaTripWithRelations) : null;
  }

  async getTripsForDriver(
    organizationId: string,
    driverId: string,
    limit = 50,
    offset = 0,
  ): Promise<PaginatedTrips> {
    const where = { organizationId, driverId };
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safeOffset = Math.max(offset, 0);

    const [items, total] = await Promise.all([
      this.database.trip.findMany({
        where,
        include: {
          vehicle: true,
          driver: { include: { licenses: true } },
          assignment: true,
        },
        orderBy: { createdAt: 'desc' },
        take: safeLimit,
        skip: safeOffset,
      }),
      this.database.trip.count({ where }),
    ]);

    return {
      items: items.map((t) => this.mapTrip(t as unknown as PrismaTripWithRelations)),
      total,
    };
  }

  async getTripsForAssignment(
    organizationId: string,
    assignmentId: string,
    limit = 50,
    offset = 0,
  ): Promise<PaginatedTrips> {
    const where = { organizationId, assignmentId };
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safeOffset = Math.max(offset, 0);

    const [items, total] = await Promise.all([
      this.database.trip.findMany({
        where,
        include: {
          vehicle: true,
          driver: { include: { licenses: true } },
          assignment: true,
        },
        orderBy: { createdAt: 'desc' },
        take: safeLimit,
        skip: safeOffset,
      }),
      this.database.trip.count({ where }),
    ]);

    return {
      items: items.map((t) => this.mapTrip(t as unknown as PrismaTripWithRelations)),
      total,
    };
  }

  async hasNonTerminalTripForAssignment(
    organizationId: string,
    assignmentId: string,
  ): Promise<boolean> {
    const count = await this.database.trip.count({
      where: {
        organizationId,
        assignmentId,
        status: { in: ['DRAFT', 'READY', 'IN_PROGRESS'] },
      },
    });
    return count > 0;
  }
}
