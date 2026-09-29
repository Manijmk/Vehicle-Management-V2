import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@vms/database';

import { DATABASE } from '../../../common/tokens.js';
import { ApplicationError } from '../../foundation/domain/errors.js';
import {
  assertAssignmentDates,
  assertAssignmentTransition,
  assertDriverEligibleForAssignment,
  assertVehicleEligibleForAssignment,
  normalizeEndReason,
  normalizeNotes,
  type AssignmentRecord,
  type AssignmentStatus,
} from '../domain/assignment.js';
import type {
  AssignmentDetail,
  AssignmentMutationMetadata,
  AssignmentRepository,
  CreateAssignmentInput,
  EndAssignmentInput,
  ListAssignmentsFilter,
  PaginatedAssignments,
} from '../application/assignment.repository.js';

type Transaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

interface PrismaAssignmentWithRelations {
  id: string;
  organizationId: string;
  vehicleId: string;
  driverId: string;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  endReason: string | null;
  notes: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  vehicle: {
    id: string;
    displayId: string;
    registration: string;
    vin: string;
    status: string;
  };
  driver: {
    id: string;
    displayId: string;
    firstName: string;
    lastName: string;
    status: string;
    licenses?: Array<{
      issueDate: Date;
      expiryDate: Date;
    }>;
  };
}

@Injectable()
export class PrismaAssignmentRepository implements AssignmentRepository {
  constructor(
    @Inject(DATABASE)
    private readonly database: PrismaClient,
  ) {}

  private isDriverEligible(driver: PrismaAssignmentWithRelations['driver']): boolean {
    if (driver.status !== 'ACTIVE') return false;
    if (!driver.licenses || driver.licenses.length === 0) return false;
    const now = new Date();
    return driver.licenses.some(
      (lic) =>
        new Date(lic.issueDate).getTime() <= now.getTime() &&
        new Date(lic.expiryDate).getTime() >= now.getTime(),
    );
  }

  private mapAssignment(raw: PrismaAssignmentWithRelations): AssignmentDetail {
    const isOperationallyEligible = this.isDriverEligible(raw.driver);
    return {
      id: raw.id,
      organizationId: raw.organizationId,
      vehicleId: raw.vehicleId,
      driverId: raw.driverId,
      status: raw.status as AssignmentStatus,
      startedAt: raw.startedAt,
      endedAt: raw.endedAt,
      endReason: raw.endReason,
      notes: raw.notes,
      version: raw.version,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      vehicle: {
        id: raw.vehicle.id,
        displayId: raw.vehicle.displayId,
        registration: raw.vehicle.registration,
        vin: raw.vehicle.vin,
        status: raw.vehicle.status,
      },
      driver: {
        id: raw.driver.id,
        displayId: raw.driver.displayId,
        firstName: raw.driver.firstName,
        lastName: raw.driver.lastName,
        status: raw.driver.status,
        eligible: isOperationallyEligible,
        isOperationallyEligible,
      },
    };
  }

  private async recordAuditAndOutbox(
    tx: Transaction,
    organizationId: string,
    action: string,
    entityId: string,
    before: unknown,
    after: unknown,
    eventType: string,
    metadata: AssignmentMutationMetadata,
    payloadData: Record<string, unknown>,
  ): Promise<void> {
    const occurredAt = new Date();
    const eventId = randomUUID();

    await tx.auditLog.create({
      data: {
        organizationId,
        action,
        entityType: 'VehicleDriverAssignment',
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
        aggregateType: 'VehicleDriverAssignment',
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

  async createAssignment(input: CreateAssignmentInput): Promise<AssignmentDetail> {
    return this.database.$transaction(async (tx) => {
      // 1. Verify vehicle existence and tenant boundary
      const vehicle = await tx.vehicle.findFirst({
        where: { id: input.vehicleId, organizationId: input.organizationId },
      });
      if (!vehicle) {
        throw new ApplicationError(
          'VEHICLE_NOT_FOUND',
          'Vehicle was not found in this organization',
        );
      }
      assertVehicleEligibleForAssignment(vehicle.status);

      // 2. Check if vehicle already has an active assignment
      const existingVehicleAssignment = await tx.vehicleDriverAssignment.findFirst({
        where: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          status: 'ACTIVE',
        },
      });
      if (existingVehicleAssignment) {
        throw new ApplicationError(
          'VEHICLE_ALREADY_ASSIGNED',
          'Vehicle is already actively assigned to another driver',
        );
      }

      // 3. Verify driver existence and tenant boundary
      const driver = await tx.driver.findFirst({
        where: { id: input.driverId, organizationId: input.organizationId },
        include: { licenses: true },
      });
      if (!driver) {
        throw new ApplicationError('DRIVER_NOT_FOUND', 'Driver was not found in this organization');
      }

      const isEligible = this.isDriverEligible(driver);
      assertDriverEligibleForAssignment(driver.status, isEligible);

      // 4. Check if driver already has an active assignment
      const existingDriverAssignment = await tx.vehicleDriverAssignment.findFirst({
        where: {
          organizationId: input.organizationId,
          driverId: input.driverId,
          status: 'ACTIVE',
        },
      });
      if (existingDriverAssignment) {
        throw new ApplicationError(
          'DRIVER_ALREADY_ASSIGNED',
          'Driver is already actively assigned to another vehicle',
        );
      }

      const startedAt = input.startedAt ?? new Date();
      const notes = normalizeNotes(input.notes);

      // 5. Create assignment record
      const created = await tx.vehicleDriverAssignment.create({
        data: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          driverId: input.driverId,
          status: 'ACTIVE',
          startedAt,
          notes,
          version: 1,
        },
        include: {
          vehicle: {
            select: { id: true, displayId: true, registration: true, vin: true, status: true },
          },
          driver: {
            select: {
              id: true,
              displayId: true,
              firstName: true,
              lastName: true,
              status: true,
              licenses: { select: { issueDate: true, expiryDate: true } },
            },
          },
        },
      });

      const mapped = this.mapAssignment(created);

      // 6. Write audit log & transactional outbox event
      await this.recordAuditAndOutbox(
        tx,
        input.organizationId,
        'assignment.created',
        created.id,
        null,
        mapped,
        'VehicleDriverAssigned',
        input.metadata,
        {
          assignmentId: created.id,
          organizationId: created.organizationId,
          vehicleId: created.vehicleId,
          driverId: created.driverId,
          startedAt: created.startedAt.toISOString(),
          status: 'ACTIVE',
        },
      );

      return mapped;
    });
  }

  async endAssignment(input: EndAssignmentInput): Promise<AssignmentDetail> {
    return this.database.$transaction(async (tx) => {
      const before = await tx.vehicleDriverAssignment.findFirst({
        where: { id: input.assignmentId, organizationId: input.organizationId },
        include: {
          vehicle: {
            select: { id: true, displayId: true, registration: true, vin: true, status: true },
          },
          driver: {
            select: {
              id: true,
              displayId: true,
              firstName: true,
              lastName: true,
              status: true,
              licenses: { select: { issueDate: true, expiryDate: true } },
            },
          },
        },
      });

      if (!before) {
        throw new ApplicationError(
          'ASSIGNMENT_NOT_FOUND',
          'Assignment was not found in this organization',
        );
      }

      assertAssignmentTransition(before.status as AssignmentStatus, 'ENDED');

      const endReason = normalizeEndReason(input.endReason);
      const endedAt = input.endedAt ?? new Date();
      assertAssignmentDates(before.startedAt, endedAt);

      // Optimistic concurrency check
      const updateResult = await tx.vehicleDriverAssignment.updateMany({
        where: {
          id: input.assignmentId,
          organizationId: input.organizationId,
          version: input.version,
        },
        data: {
          status: 'ENDED',
          endedAt,
          endReason,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationError(
          'CONCURRENCY_CONFLICT',
          'Assignment was updated or ended by another request',
        );
      }

      const updated = await tx.vehicleDriverAssignment.findUniqueOrThrow({
        where: { id: input.assignmentId },
        include: {
          vehicle: {
            select: { id: true, displayId: true, registration: true, vin: true, status: true },
          },
          driver: {
            select: {
              id: true,
              displayId: true,
              firstName: true,
              lastName: true,
              status: true,
              licenses: { select: { issueDate: true, expiryDate: true } },
            },
          },
        },
      });

      const beforeMapped = this.mapAssignment(before);
      const afterMapped = this.mapAssignment(updated);

      await this.recordAuditAndOutbox(
        tx,
        input.organizationId,
        'assignment.ended',
        updated.id,
        beforeMapped,
        afterMapped,
        'VehicleDriverUnassigned',
        input.metadata,
        {
          assignmentId: updated.id,
          organizationId: updated.organizationId,
          vehicleId: updated.vehicleId,
          driverId: updated.driverId,
          endedAt: endedAt.toISOString(),
          endReason,
          status: 'ENDED',
        },
      );

      return afterMapped;
    });
  }

  async getAssignment(organizationId: string, assignmentId: string): Promise<AssignmentDetail> {
    const raw = await this.database.vehicleDriverAssignment.findFirst({
      where: { id: assignmentId, organizationId },
      include: {
        vehicle: {
          select: { id: true, displayId: true, registration: true, vin: true, status: true },
        },
        driver: {
          select: {
            id: true,
            displayId: true,
            firstName: true,
            lastName: true,
            status: true,
            licenses: { select: { issueDate: true, expiryDate: true } },
          },
        },
      },
    });

    if (!raw) {
      throw new ApplicationError(
        'ASSIGNMENT_NOT_FOUND',
        'Assignment was not found in this organization',
      );
    }

    return this.mapAssignment(raw);
  }

  async listAssignments(
    organizationId: string,
    filter?: ListAssignmentsFilter,
  ): Promise<PaginatedAssignments> {
    const where: Prisma.VehicleDriverAssignmentWhereInput = {
      organizationId,
      ...(filter?.status ? { status: filter.status } : {}),
      ...(filter?.vehicleId ? { vehicleId: filter.vehicleId } : {}),
      ...(filter?.driverId ? { driverId: filter.driverId } : {}),
    };

    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;

    const [items, total] = await Promise.all([
      this.database.vehicleDriverAssignment.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { startedAt: 'desc' },
        include: {
          vehicle: {
            select: { id: true, displayId: true, registration: true, vin: true, status: true },
          },
          driver: {
            select: {
              id: true,
              displayId: true,
              firstName: true,
              lastName: true,
              status: true,
              licenses: { select: { issueDate: true, expiryDate: true } },
            },
          },
        },
      }),
      this.database.vehicleDriverAssignment.count({ where }),
    ]);

    return {
      items: items.map((i) => this.mapAssignment(i)),
      total,
    };
  }

  async getCurrentAssignmentForVehicle(
    organizationId: string,
    vehicleId: string,
  ): Promise<AssignmentDetail | null> {
    const raw = await this.database.vehicleDriverAssignment.findFirst({
      where: { organizationId, vehicleId, status: 'ACTIVE' },
      include: {
        vehicle: {
          select: { id: true, displayId: true, registration: true, vin: true, status: true },
        },
        driver: {
          select: {
            id: true,
            displayId: true,
            firstName: true,
            lastName: true,
            status: true,
            licenses: { select: { issueDate: true, expiryDate: true } },
          },
        },
      },
    });

    return raw ? this.mapAssignment(raw) : null;
  }

  async getCurrentAssignmentForDriver(
    organizationId: string,
    driverId: string,
  ): Promise<AssignmentDetail | null> {
    const raw = await this.database.vehicleDriverAssignment.findFirst({
      where: { organizationId, driverId, status: 'ACTIVE' },
      include: {
        vehicle: {
          select: { id: true, displayId: true, registration: true, vin: true, status: true },
        },
        driver: {
          select: {
            id: true,
            displayId: true,
            firstName: true,
            lastName: true,
            status: true,
            licenses: { select: { issueDate: true, expiryDate: true } },
          },
        },
      },
    });

    return raw ? this.mapAssignment(raw) : null;
  }

  async getVehicleAssignmentHistory(
    organizationId: string,
    vehicleId: string,
  ): Promise<AssignmentDetail[]> {
    const items = await this.database.vehicleDriverAssignment.findMany({
      where: { organizationId, vehicleId },
      orderBy: { startedAt: 'desc' },
      include: {
        vehicle: {
          select: { id: true, displayId: true, registration: true, vin: true, status: true },
        },
        driver: {
          select: {
            id: true,
            displayId: true,
            firstName: true,
            lastName: true,
            status: true,
            licenses: { select: { issueDate: true, expiryDate: true } },
          },
        },
      },
    });

    return items.map((i) => this.mapAssignment(i));
  }

  async getDriverAssignmentHistory(
    organizationId: string,
    driverId: string,
  ): Promise<AssignmentDetail[]> {
    const items = await this.database.vehicleDriverAssignment.findMany({
      where: { organizationId, driverId },
      orderBy: { startedAt: 'desc' },
      include: {
        vehicle: {
          select: { id: true, displayId: true, registration: true, vin: true, status: true },
        },
        driver: {
          select: {
            id: true,
            displayId: true,
            firstName: true,
            lastName: true,
            status: true,
            licenses: { select: { issueDate: true, expiryDate: true } },
          },
        },
      },
    });

    return items.map((i) => this.mapAssignment(i));
  }
}
