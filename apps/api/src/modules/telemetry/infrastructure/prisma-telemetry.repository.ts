import { Inject, Injectable } from '@nestjs/common';
import {
  Prisma,
  type PrismaClient,
  TelemetryDeviceStatus,
  TelemetryPositionStatus,
  TripStatus,
} from '@vms/database';
import { DATABASE } from '../../../common/tokens.js';
import {
  calculateFreshnessStatus,
} from '../domain/telemetry.js';
import {
  TelemetryDeviceAlreadyExistsError,
  TelemetryDeviceNotFoundError,
} from '../domain/telemetry-errors.js';
import type {
  AssignDeviceParams,
  CreateDeviceParams,
  DeviceRepository,
  HistoryQueryOptions,
  IngestPositionParams,
  TelemetryCurrentPositionRecord,
  TelemetryDeviceRecord,
  TelemetryPositionRecord,
  TelemetryRepository,
  UpdateDeviceParams,
} from '../application/telemetry.repository.js';

@Injectable()
export class PrismaTelemetryRepository
  implements TelemetryRepository, DeviceRepository
{
  constructor(
    @Inject(DATABASE)
    private readonly database: PrismaClient,
  ) {}

  // ==========================================
  // DEVICE REPOSITORY IMPLEMENTATION
  // ==========================================

  async createDevice(params: CreateDeviceParams): Promise<TelemetryDeviceRecord> {
    const { organizationId, name, identifier, notes, metadata } = params;

    // Check if identifier is already taken in this org
    const existing = await this.database.telemetryDevice.findFirst({
      where: { organizationId, identifier },
    });
    if (existing) {
      throw new TelemetryDeviceAlreadyExistsError(identifier);
    }

    // Allocate display ID following pattern: scan existing, increment max DEV-1001
    const existingDevices = await this.database.telemetryDevice.findMany({
      where: { organizationId },
      select: { displayId: true },
    });

    let maxNum = 1000;
    for (const d of existingDevices) {
      const match = /^DEV-(\d+)$/i.exec(d.displayId);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    const displayId = `DEV-${maxNum + 1}`;

    const created = await this.database.telemetryDevice.create({
      data: {
        organizationId,
        displayId,
        name,
        identifier,
        status: TelemetryDeviceStatus.ACTIVE,
        notes: notes ?? null,
        metadata: metadata ? (metadata as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    });

    return this.mapDevice(created);
  }

  async getDeviceById(
    organizationId: string,
    deviceId: string,
  ): Promise<TelemetryDeviceRecord | null> {
    const row = await this.database.telemetryDevice.findFirst({
      where: { id: deviceId, organizationId },
      include: {
        vehicleAssignments: {
          where: { unassignedAt: null },
          take: 1,
          include: {
            vehicle: {
              select: {
                id: true,
                displayId: true,
                registration: true,
                model: true,
              },
            },
          },
        },
      },
    });

    return row ? this.mapDevice(row) : null;
  }

  async getDeviceByIdentifier(
    organizationId: string,
    identifier: string,
  ): Promise<TelemetryDeviceRecord | null> {
    const row = await this.database.telemetryDevice.findFirst({
      where: { organizationId, identifier },
      include: {
        vehicleAssignments: {
          where: { unassignedAt: null },
          take: 1,
          include: {
            vehicle: {
              select: {
                id: true,
                displayId: true,
                registration: true,
                model: true,
              },
            },
          },
        },
      },
    });

    return row ? this.mapDevice(row) : null;
  }

  async listDevices(organizationId: string): Promise<readonly TelemetryDeviceRecord[]> {
    const rows = await this.database.telemetryDevice.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        vehicleAssignments: {
          where: { unassignedAt: null },
          take: 1,
          include: {
            vehicle: {
              select: {
                id: true,
                displayId: true,
                registration: true,
                model: true,
              },
            },
          },
        },
      },
    });

    return rows.map((r) => this.mapDevice(r));
  }

  async updateDevice(params: UpdateDeviceParams): Promise<TelemetryDeviceRecord> {
    const { organizationId, deviceId, name, notes, metadata } = params;

    const updated = await this.database.telemetryDevice.update({
      where: { id: deviceId, organizationId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(notes !== undefined ? { notes: notes ?? null } : {}),
        ...(metadata !== undefined
          ? { metadata: metadata ? (metadata as Prisma.InputJsonValue) : Prisma.DbNull }
          : {}),
        version: { increment: 1 },
      },
      include: {
        vehicleAssignments: {
          where: { unassignedAt: null },
          take: 1,
          include: {
            vehicle: {
              select: {
                id: true,
                displayId: true,
                registration: true,
                model: true,
              },
            },
          },
        },
      },
    });

    return this.mapDevice(updated);
  }

  async updateDeviceStatus(
    organizationId: string,
    deviceId: string,
    newStatus: TelemetryDeviceStatus,
  ): Promise<TelemetryDeviceRecord> {
    const updated = await this.database.telemetryDevice.update({
      where: { id: deviceId, organizationId },
      data: {
        status: newStatus,
        version: { increment: 1 },
      },
      include: {
        vehicleAssignments: {
          where: { unassignedAt: null },
          take: 1,
          include: {
            vehicle: {
              select: {
                id: true,
                displayId: true,
                registration: true,
                model: true,
              },
            },
          },
        },
      },
    });

    return this.mapDevice(updated);
  }

  async assignDevice(params: AssignDeviceParams): Promise<TelemetryDeviceRecord> {
    const { organizationId, deviceId, vehicleId, assignedBy, notes } = params;

    await this.database.telemetryDeviceVehicleAssignment.create({
      data: {
        organizationId,
        deviceId,
        vehicleId,
        assignedBy,
        notes: notes ?? null,
      },
    });

    const device = await this.getDeviceById(organizationId, deviceId);
    if (!device) {
      throw new TelemetryDeviceNotFoundError(deviceId);
    }
    return device;
  }

  async unassignDevice(
    organizationId: string,
    deviceId: string,
    notes?: string,
  ): Promise<TelemetryDeviceRecord> {
    const active = await this.database.telemetryDeviceVehicleAssignment.findFirst({
      where: {
        organizationId,
        deviceId,
        unassignedAt: null,
      },
    });

    if (active) {
      await this.database.telemetryDeviceVehicleAssignment.update({
        where: { id: active.id },
        data: {
          unassignedAt: new Date(),
          ...(notes !== undefined ? { notes: notes ?? null } : {}),
        },
      });
    }

    const device = await this.getDeviceById(organizationId, deviceId);
    if (!device) {
      throw new TelemetryDeviceNotFoundError(deviceId);
    }
    return device;
  }

  async getActiveAssignmentByDeviceId(
    organizationId: string,
    deviceId: string,
  ): Promise<{
    readonly id: string;
    readonly vehicleId: string;
    readonly deviceId: string;
    readonly assignedAt: Date;
  } | null> {
    const assignment = await this.database.telemetryDeviceVehicleAssignment.findFirst({
      where: {
        organizationId,
        deviceId,
        unassignedAt: null,
      },
      select: {
        id: true,
        vehicleId: true,
        deviceId: true,
        assignedAt: true,
      },
    });
    return assignment;
  }

  async getActiveAssignmentByVehicleId(
    organizationId: string,
    vehicleId: string,
  ): Promise<{
    readonly id: string;
    readonly vehicleId: string;
    readonly deviceId: string;
    readonly assignedAt: Date;
  } | null> {
    const assignment = await this.database.telemetryDeviceVehicleAssignment.findFirst({
      where: {
        organizationId,
        vehicleId,
        unassignedAt: null,
      },
      select: {
        id: true,
        vehicleId: true,
        deviceId: true,
        assignedAt: true,
      },
    });
    return assignment;
  }

  async findActiveTripForVehicle(
    organizationId: string,
    vehicleId: string,
  ): Promise<{ id: string } | null> {
    const trip = await this.database.trip.findFirst({
      where: {
        organizationId,
        vehicleId,
        status: TripStatus.IN_PROGRESS,
      },
      select: { id: true },
    });
    return trip;
  }

  async verifyVehicleExists(
    organizationId: string,
    vehicleId: string,
  ): Promise<boolean> {
    const count = await this.database.vehicle.count({
      where: { id: vehicleId, organizationId },
    });
    return count > 0;
  }

  async verifyTripExists(organizationId: string, tripId: string): Promise<boolean> {
    const count = await this.database.trip.count({
      where: { id: tripId, organizationId },
    });
    return count > 0;
  }

  // ==========================================
  // TELEMETRY REPOSITORY IMPLEMENTATION
  // ==========================================

  // NOTE: Telemetry positions are high-frequency time-series data and are NOT routed
  // through AuditLog or OutboxEvent tables by architectural decision.
  async savePosition(params: IngestPositionParams): Promise<TelemetryPositionRecord> {
    const {
      organizationId,
      deviceId,
      vehicleId,
      tripId,
      capturedAt,
      receivedAt,
      latitude,
      longitude,
      speedKmh,
      heading,
      altitudeM,
      accuracyM,
      ignition,
      odometerKm,
      source,
      status = TelemetryPositionStatus.VALID,
      providerMessageId,
      rawMetadata,
    } = params;

    return this.database.$transaction(async (tx) => {
      let positionRow;
      try {
        positionRow = await tx.telemetryPosition.create({
          data: {
            organizationId,
            deviceId,
            vehicleId,
            tripId: tripId ?? null,
            capturedAt,
            receivedAt,
            latitude: new Prisma.Decimal(latitude),
            longitude: new Prisma.Decimal(longitude),
            speedKmh: speedKmh != null ? new Prisma.Decimal(speedKmh) : null,
            heading: heading != null ? new Prisma.Decimal(heading) : null,
            altitudeM: altitudeM != null ? new Prisma.Decimal(altitudeM) : null,
            accuracyM: accuracyM != null ? new Prisma.Decimal(accuracyM) : null,
            ignition: ignition ?? null,
            odometerKm: odometerKm ?? null,
            source,
            status,
            providerMessageId: providerMessageId ?? null,
            rawMetadata: rawMetadata
              ? (rawMetadata as Prisma.InputJsonValue)
              : Prisma.DbNull,
          },
        });
      } catch (err: unknown) {
        // Catch duplicate provider message ID (Prisma error code P2002) for race safety and idempotent return
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          providerMessageId
        ) {
          const existing = await tx.telemetryPosition.findFirst({
            where: {
              organizationId,
              deviceId,
              providerMessageId,
            },
          });
          if (existing) {
            return this.mapPosition(existing);
          }
        }
        throw err;
      }

      // Check current position for out-of-order protection
      const existingCurrent = await tx.telemetryCurrentPosition.findUnique({
        where: {
          organizationId_vehicleId: {
            organizationId,
            vehicleId,
          },
        },
      });

      if (!existingCurrent) {
        await tx.telemetryCurrentPosition.create({
          data: {
            organizationId,
            vehicleId,
            deviceId,
            positionId: positionRow.id,
            latitude: new Prisma.Decimal(latitude),
            longitude: new Prisma.Decimal(longitude),
            speedKmh: speedKmh != null ? new Prisma.Decimal(speedKmh) : null,
            heading: heading != null ? new Prisma.Decimal(heading) : null,
            ignition: ignition ?? null,
            odometerKm: odometerKm ?? null,
            capturedAt,
            receivedAt,
            source,
            status,
          },
        });
      } else if (capturedAt.getTime() > existingCurrent.capturedAt.getTime()) {
        // Out-of-order guard: only update if new capturedAt is strictly later than existing
        await tx.telemetryCurrentPosition.update({
          where: {
            organizationId_vehicleId: {
              organizationId,
              vehicleId,
            },
          },
          data: {
            deviceId,
            positionId: positionRow.id,
            latitude: new Prisma.Decimal(latitude),
            longitude: new Prisma.Decimal(longitude),
            speedKmh: speedKmh != null ? new Prisma.Decimal(speedKmh) : null,
            heading: heading != null ? new Prisma.Decimal(heading) : null,
            ignition: ignition ?? null,
            odometerKm: odometerKm ?? null,
            capturedAt,
            receivedAt,
            source,
            status,
          },
        });
      }

      return this.mapPosition(positionRow);
    });
  }

  async findPositionByProviderMessageId(
    organizationId: string,
    deviceId: string,
    providerMessageId: string,
  ): Promise<TelemetryPositionRecord | null> {
    const row = await this.database.telemetryPosition.findFirst({
      where: {
        organizationId,
        deviceId,
        providerMessageId,
      },
    });
    return row ? this.mapPosition(row) : null;
  }

  async getCurrentPositionForVehicle(
    organizationId: string,
    vehicleId: string,
  ): Promise<TelemetryCurrentPositionRecord | null> {
    const row = await this.database.telemetryCurrentPosition.findUnique({
      where: {
        organizationId_vehicleId: {
          organizationId,
          vehicleId,
        },
      },
      include: {
        vehicle: {
          select: {
            id: true,
            displayId: true,
            registration: true,
            model: true,
          },
        },
      },
    });

    if (!row) return null;

    const device = await this.database.telemetryDevice.findUnique({
      where: { id: row.deviceId },
      select: {
        id: true,
        displayId: true,
        name: true,
        identifier: true,
      },
    });

    return this.mapCurrentPosition(row, device);
  }

  async getCurrentPositionsForFleet(
    organizationId: string,
  ): Promise<readonly TelemetryCurrentPositionRecord[]> {
    const rows = await this.database.telemetryCurrentPosition.findMany({
      where: { organizationId },
      include: {
        vehicle: {
          select: {
            id: true,
            displayId: true,
            registration: true,
            model: true,
          },
        },
      },
      orderBy: { capturedAt: 'desc' },
    });

    if (rows.length === 0) return [];

    const deviceIds = [...new Set(rows.map((r) => r.deviceId))];
    const devices = await this.database.telemetryDevice.findMany({
      where: { id: { in: deviceIds }, organizationId },
      select: {
        id: true,
        displayId: true,
        name: true,
        identifier: true,
      },
    });
    const deviceMap = new Map(devices.map((d) => [d.id, d]));

    return rows.map((r) => this.mapCurrentPosition(r, deviceMap.get(r.deviceId)));
  }

  async getPositionHistory(
    organizationId: string,
    vehicleId: string,
    options?: HistoryQueryOptions,
  ): Promise<{
    readonly items: readonly TelemetryPositionRecord[];
    readonly nextCursor?: string | null;
  }> {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 500);
    const where: Prisma.TelemetryPositionWhereInput = {
      organizationId,
      vehicleId,
      ...(options?.from || options?.to
        ? {
            capturedAt: {
              ...(options.from ? { gte: options.from } : {}),
              ...(options.to ? { lte: options.to } : {}),
            },
          }
        : {}),
    };

    const rows = await this.database.telemetryPosition.findMany({
      where,
      orderBy: { capturedAt: 'desc' },
      take: limit + 1,
      ...(options?.cursor
        ? {
            cursor: { id: options.cursor },
            skip: 1,
          }
        : {}),
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;

    return {
      items: items.map((r) => this.mapPosition(r)),
      nextCursor,
    };
  }

  async getTripRoute(
    organizationId: string,
    tripId: string,
  ): Promise<readonly TelemetryPositionRecord[]> {
    const rows = await this.database.telemetryPosition.findMany({
      where: { organizationId, tripId },
      orderBy: { capturedAt: 'asc' },
    });

    return rows.map((r) => this.mapPosition(r));
  }

  // ==========================================
  // PRIVATE MAPPERS
  // ==========================================

  private mapDevice(row: any): TelemetryDeviceRecord {
    const active = row.vehicleAssignments?.[0];
    return {
      id: row.id,
      organizationId: row.organizationId,
      displayId: row.displayId,
      name: row.name,
      identifier: row.identifier,
      status: row.status,
      notes: row.notes,
      metadata: (row.metadata as Record<string, unknown>) ?? null,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      activeAssignment: active
        ? {
            id: active.id,
            vehicleId: active.vehicleId,
            assignedAt: active.assignedAt,
            assignedBy: active.assignedBy,
            vehicle: active.vehicle ?? null,
          }
        : null,
    };
  }

  private mapPosition(row: any): TelemetryPositionRecord {
    return {
      id: row.id,
      organizationId: row.organizationId,
      deviceId: row.deviceId,
      vehicleId: row.vehicleId,
      tripId: row.tripId,
      capturedAt: row.capturedAt,
      receivedAt: row.receivedAt,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      speedKmh: row.speedKmh != null ? Number(row.speedKmh) : null,
      heading: row.heading != null ? Number(row.heading) : null,
      altitudeM: row.altitudeM != null ? Number(row.altitudeM) : null,
      accuracyM: row.accuracyM != null ? Number(row.accuracyM) : null,
      ignition: row.ignition,
      odometerKm: row.odometerKm,
      source: row.source,
      status: row.status,
      providerMessageId: row.providerMessageId,
      rawMetadata: (row.rawMetadata as Record<string, unknown>) ?? null,
    };
  }

  private mapCurrentPosition(
    row: any,
    device?: { id: string; displayId: string; name: string; identifier: string } | null,
  ): TelemetryCurrentPositionRecord {
    return {
      organizationId: row.organizationId,
      vehicleId: row.vehicleId,
      deviceId: row.deviceId,
      positionId: row.positionId,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      speedKmh: row.speedKmh != null ? Number(row.speedKmh) : null,
      heading: row.heading != null ? Number(row.heading) : null,
      ignition: row.ignition,
      odometerKm: row.odometerKm,
      capturedAt: row.capturedAt,
      receivedAt: row.receivedAt,
      source: row.source,
      status: row.status,
      updatedAt: row.updatedAt,
      freshness: calculateFreshnessStatus(row.capturedAt, new Date()),
      vehicle: row.vehicle ?? null,
      device: device ?? null,
    };
  }
}
