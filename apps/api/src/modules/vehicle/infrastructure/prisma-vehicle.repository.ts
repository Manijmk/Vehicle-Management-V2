import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, VehicleStatus as PrismaVehicleStatus } from '@vms/database';
import type { PrismaClient } from '@vms/database';

import { DATABASE } from '../../../common/tokens.js';
import { ApplicationError } from '../../foundation/domain/errors.js';
import {
  assertVehicleTransition,
  normalizeDisplayId,
  normalizeRegistration,
  normalizeVin,
} from '../domain/vehicle.js';
import type {
  MutationMetadata,
  VehicleHistoryEntry,
  VehicleRecord,
  VehicleRepository,
} from '../application/vehicle.repository.js';

type Transaction = Prisma.TransactionClient;

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

@Injectable()
export class PrismaVehicleRepository implements VehicleRepository {
  constructor(@Inject(DATABASE) private readonly database: PrismaClient) {}

  async listVehicles(organizationId: string): Promise<VehicleRecord[]> {
    return this.database.vehicle.findMany({
      where: { organizationId },
      orderBy: [{ status: 'asc' }, { displayId: 'asc' }],
    });
  }

  async getVehicle(organizationId: string, vehicleId: string): Promise<VehicleRecord> {
    const vehicle = await this.database.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
    });
    if (vehicle === null) throw new ApplicationError('VEHICLE_NOT_FOUND', 'Vehicle was not found');
    return vehicle;
  }

  async createVehicle(
    input: Parameters<VehicleRepository['createVehicle']>[0],
  ): Promise<VehicleRecord> {
    try {
      return await this.database.$transaction(async (tx) => {
        const displayId = normalizeDisplayId(input.displayId);
        const registration = normalizeRegistration(input.registration);
        const vin = normalizeVin(input.vin);
        const existing = await tx.vehicle.findFirst({
          where: {
            organizationId: input.organizationId,
            OR: [{ displayId }, { registration }, { vin }],
          },
        });
        if (existing !== null) {
          throw new ApplicationError(
            'VEHICLE_ALREADY_EXISTS',
            'Vehicle display ID, registration, or VIN already exists in this organization',
          );
        }

        const vehicle = await tx.vehicle.create({
          data: {
            organizationId: input.organizationId,
            displayId,
            registration,
            vin,
            type: input.type,
            fuelType: input.fuelType,
            model: input.model,
            year: input.year,
            odometerKm: input.odometerKm,
            ...(input.notes === undefined ? {} : { notes: input.notes }),
            status: 'DRAFT',
          },
        });

        await this.recordStatusHistory(
          tx,
          input.organizationId,
          vehicle.id,
          'DRAFT',
          'DRAFT',
          'Vehicle created',
          input.metadata,
        );

        await this.record(
          tx,
          input.organizationId,
          'vehicle.created',
          'Vehicle',
          vehicle.id,
          null,
          vehicle,
          'VehicleCreated',
          input.metadata,
        );

        return vehicle;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApplicationError(
          'VEHICLE_ALREADY_EXISTS',
          'Vehicle already exists in this organization',
        );
      }
      throw error;
    }
  }

  async updateVehicle(
    input: Parameters<VehicleRepository['updateVehicle']>[0],
  ): Promise<VehicleRecord> {
    return this.database.$transaction(async (tx) => {
      const before = await tx.vehicle.findFirst({
        where: { id: input.vehicleId, organizationId: input.organizationId },
      });
      if (before === null) throw new ApplicationError('VEHICLE_NOT_FOUND', 'Vehicle was not found');

      const displayId =
        input.displayId === undefined ? before.displayId : normalizeDisplayId(input.displayId);
      const registration =
        input.registration === undefined
          ? before.registration
          : normalizeRegistration(input.registration);
      const vin = input.vin === undefined ? before.vin : normalizeVin(input.vin);

      const duplicate = await tx.vehicle.findFirst({
        where: {
          organizationId: input.organizationId,
          NOT: { id: input.vehicleId },
          OR: [{ displayId }, { registration }, { vin }],
        },
      });
      if (duplicate !== null) {
        throw new ApplicationError(
          'VEHICLE_ALREADY_EXISTS',
          'Another vehicle already uses that identity',
        );
      }

      const result = await tx.vehicle.updateMany({
        where: {
          id: input.vehicleId,
          organizationId: input.organizationId,
          version: input.version,
        },
        data: {
          ...(input.displayId === undefined ? {} : { displayId }),
          ...(input.registration === undefined ? {} : { registration }),
          ...(input.type === undefined ? {} : { type: input.type }),
          ...(input.fuelType === undefined ? {} : { fuelType: input.fuelType }),
          ...(input.model === undefined ? {} : { model: input.model }),
          ...(input.year === undefined ? {} : { year: input.year }),
          ...(input.odometerKm === undefined ? {} : { odometerKm: input.odometerKm }),
          ...(input.notes === undefined ? {} : { notes: input.notes }),
          version: { increment: 1 },
        },
      });

      if (result.count !== 1) {
        throw new ApplicationError(
          'CONCURRENCY_CONFLICT',
          'Vehicle was changed by another request',
        );
      }

      const after = await tx.vehicle.findUniqueOrThrow({ where: { id: input.vehicleId } });
      await this.record(
        tx,
        input.organizationId,
        'vehicle.updated',
        'Vehicle',
        input.vehicleId,
        before,
        after,
        'VehicleUpdated',
        input.metadata,
      );
      return after;
    });
  }

  async activateVehicle(
    input: Parameters<VehicleRepository['activateVehicle']>[0],
  ): Promise<VehicleRecord> {
    return this.database.$transaction(async (tx) => {
      const before = await tx.vehicle.findFirst({
        where: { id: input.vehicleId, organizationId: input.organizationId },
      });
      if (before === null) throw new ApplicationError('VEHICLE_NOT_FOUND', 'Vehicle was not found');
      assertVehicleTransition(before.status, 'ACTIVE');
      const version = input.version ?? before.version;

      const result = await tx.vehicle.updateMany({
        where: { id: input.vehicleId, organizationId: input.organizationId, version },
        data: { status: 'ACTIVE', version: { increment: 1 } },
      });
      if (result.count !== 1) {
        throw new ApplicationError(
          'CONCURRENCY_CONFLICT',
          'Vehicle was changed by another request',
        );
      }

      const after = await tx.vehicle.findUniqueOrThrow({ where: { id: input.vehicleId } });
      await this.recordStatusHistory(
        tx,
        input.organizationId,
        input.vehicleId,
        before.status,
        'ACTIVE',
        'Activated',
        input.metadata,
      );
      await this.record(
        tx,
        input.organizationId,
        'vehicle.activated',
        'Vehicle',
        input.vehicleId,
        before,
        after,
        'VehicleActivated',
        input.metadata,
      );
      return after;
    });
  }

  async retireVehicle(
    input: Parameters<VehicleRepository['retireVehicle']>[0],
  ): Promise<VehicleRecord> {
    return this.database.$transaction(async (tx) => {
      const before = await tx.vehicle.findFirst({
        where: { id: input.vehicleId, organizationId: input.organizationId },
      });
      if (before === null) throw new ApplicationError('VEHICLE_NOT_FOUND', 'Vehicle was not found');
      assertVehicleTransition(before.status, 'RETIRED');

      const result = await tx.vehicle.updateMany({
        where: {
          id: input.vehicleId,
          organizationId: input.organizationId,
          version: input.version,
        },
        data: { status: 'RETIRED', version: { increment: 1 } },
      });
      if (result.count !== 1) {
        throw new ApplicationError(
          'CONCURRENCY_CONFLICT',
          'Vehicle was changed by another request',
        );
      }

      const after = await tx.vehicle.findUniqueOrThrow({ where: { id: input.vehicleId } });
      await this.recordStatusHistory(
        tx,
        input.organizationId,
        input.vehicleId,
        before.status,
        'RETIRED',
        input.reason,
        input.metadata,
      );
      await this.record(
        tx,
        input.organizationId,
        'vehicle.retired',
        'Vehicle',
        input.vehicleId,
        before,
        after,
        'VehicleRetired',
        input.metadata,
      );
      return after;
    });
  }

  async listStatusHistory(
    organizationId: string,
    vehicleId: string,
  ): Promise<VehicleHistoryEntry[]> {
    const vehicle = await this.database.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (vehicle === null) throw new ApplicationError('VEHICLE_NOT_FOUND', 'Vehicle was not found');

    return this.database.vehicleStatusHistory.findMany({
      where: { organizationId, vehicleId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async recordStatusHistory(
    tx: Transaction,
    organizationId: string,
    vehicleId: string,
    previousStatus: string,
    newStatus: string,
    reason: string,
    metadata: MutationMetadata,
  ): Promise<void> {
    const statusHistoryMetadata: {
      actorId: string;
      requestId: string;
      ipAddress?: string;
      userAgent?: string;
    } = {
      actorId: metadata.actorId,
      requestId: metadata.requestId,
      ...(metadata.ipAddress === undefined ? {} : { ipAddress: metadata.ipAddress }),
      ...(metadata.userAgent === undefined ? {} : { userAgent: metadata.userAgent }),
    };

    await tx.vehicleStatusHistory.create({
      data: {
        id: randomUUID(),
        organizationId,
        vehicleId,
        previousStatus:
          previousStatus === 'DRAFT' ? 'DRAFT' : (previousStatus as PrismaVehicleStatus),
        newStatus: newStatus as PrismaVehicleStatus,
        reason,
        changedBy: statusHistoryMetadata.actorId,
        requestId: statusHistoryMetadata.requestId,
        ...(statusHistoryMetadata.ipAddress === undefined
          ? {}
          : { ipAddress: statusHistoryMetadata.ipAddress }),
        ...(statusHistoryMetadata.userAgent === undefined
          ? {}
          : { userAgent: statusHistoryMetadata.userAgent }),
      },
    });
  }

  private async record(
    tx: Transaction,
    organizationId: string,
    action: string,
    entityType: string,
    entityId: string,
    before: unknown,
    after: unknown,
    eventType: string,
    metadata: MutationMetadata,
  ): Promise<void> {
    const occurredAt = new Date();
    const eventId = randomUUID();
    const auditMetadata: {
      actorId: string;
      requestId: string;
      ipAddress?: string;
      userAgent?: string;
    } = {
      actorId: metadata.actorId,
      requestId: metadata.requestId,
      ...(metadata.ipAddress === undefined ? {} : { ipAddress: metadata.ipAddress }),
      ...(metadata.userAgent === undefined ? {} : { userAgent: metadata.userAgent }),
    };
    await tx.auditLog.create({
      data: {
        organizationId,
        action,
        entityType,
        entityId,
        ...(before === null ? {} : { beforeData: json(before) }),
        ...(after === null ? {} : { afterData: json(after) }),
        actorId: auditMetadata.actorId,
        requestId: auditMetadata.requestId,
        ...(auditMetadata.ipAddress === undefined ? {} : { ipAddress: auditMetadata.ipAddress }),
        ...(auditMetadata.userAgent === undefined ? {} : { userAgent: auditMetadata.userAgent }),
      },
    });
    await tx.outboxEvent.create({
      data: {
        id: eventId,
        organizationId,
        eventType,
        aggregateType: entityType,
        aggregateId: entityId,
        occurredAt,
        payload: json({
          eventId,
          organizationId,
          entityId,
          eventType,
          occurredAt: occurredAt.toISOString(),
        }),
      },
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
