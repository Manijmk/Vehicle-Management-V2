import { Inject, Injectable } from '@nestjs/common';
import {
  Prisma,
  type PrismaClient,
  TelemetryDeviceStatus,
  TelemetryPositionStatus,
  type TelemetrySource,
  TripStatus,
} from '@vms/database';
import { DATABASE } from '../../../common/tokens.js';
import { calculateFreshnessStatus } from '../domain/telemetry.js';
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
  TelemetryDeviceCredentialRecord,
  TelemetryDeviceRecord,
  TelemetryPositionRecord,
  TelemetryRepository,
  UpdateDeviceParams,
} from '../application/telemetry.repository.js';

@Injectable()
export class PrismaTelemetryRepository implements TelemetryRepository, DeviceRepository {
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

    await this.auditDeviceAction({
      organizationId,
      action: 'TELEMETRY_DEVICE_REGISTERED',
      deviceId: created.id,
      after: {
        displayId: created.displayId,
        name: created.name,
        identifier: created.identifier,
        status: created.status,
      },
      actorId: params.actorId,
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
    actorId?: string | undefined,
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

    await this.auditDeviceAction({
      organizationId,
      action:
        newStatus === TelemetryDeviceStatus.ACTIVE
          ? 'TELEMETRY_DEVICE_ACTIVATED'
          : 'TELEMETRY_DEVICE_SUSPENDED',
      deviceId,
      after: { status: newStatus },
      actorId,
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

    await this.auditDeviceAction({
      organizationId,
      action: 'TELEMETRY_DEVICE_ASSIGNED',
      deviceId,
      after: { vehicleId, assignedBy },
      actorId: assignedBy,
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
    unassignedBy?: string,
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

      await this.auditDeviceAction({
        organizationId,
        action: 'TELEMETRY_DEVICE_UNASSIGNED',
        deviceId,
        after: { vehicleId: active.vehicleId, unassignedAt: new Date() },
        actorId: unassignedBy,
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

  async findTripForVehicleAtTime(
    organizationId: string,
    vehicleId: string,
    capturedAt: Date,
  ): Promise<{ id: string } | null> {
    const trip = await this.database.trip.findFirst({
      where: {
        organizationId,
        vehicleId,
        status: { in: [TripStatus.IN_PROGRESS, TripStatus.COMPLETED, TripStatus.ABORTED] },
        actualStartAt: { lte: capturedAt },
        OR: [
          { actualEndAt: { gte: capturedAt } },
          { actualEndAt: null, status: TripStatus.IN_PROGRESS },
        ],
      },
      select: { id: true },
      orderBy: { actualStartAt: 'desc' },
    });
    return trip;
  }

  async createCredential(params: {
    readonly organizationId: string;
    readonly deviceId: string;
    readonly keyPrefix: string;
    readonly secretHash: string;
    readonly actorId?: string | undefined;
  }): Promise<TelemetryDeviceCredentialRecord> {
    const created = await this.database.telemetryDeviceCredential.create({
      data: {
        organizationId: params.organizationId,
        deviceId: params.deviceId,
        keyPrefix: params.keyPrefix,
        secretHash: params.secretHash,
        status: 'ACTIVE',
      },
    });

    await this.auditDeviceAction({
      organizationId: params.organizationId,
      action: 'TELEMETRY_DEVICE_CREDENTIAL_PROVISIONED',
      deviceId: params.deviceId,
      after: { credentialId: created.id, keyPrefix: created.keyPrefix },
      actorId: params.actorId,
    });

    return {
      id: created.id,
      organizationId: created.organizationId,
      deviceId: created.deviceId,
      keyPrefix: created.keyPrefix,
      secretHash: created.secretHash,
      status: created.status as 'ACTIVE' | 'REVOKED',
      createdAt: created.createdAt,
      lastUsedAt: created.lastUsedAt,
      revokedAt: created.revokedAt,
      revokedBy: created.revokedBy,
    };
  }

  async listCredentials(
    organizationId: string,
    deviceId: string,
  ): Promise<readonly TelemetryDeviceCredentialRecord[]> {
    const list = await this.database.telemetryDeviceCredential.findMany({
      where: { organizationId, deviceId },
      orderBy: { createdAt: 'desc' },
    });
    return list.map((c) => ({
      id: c.id,
      organizationId: c.organizationId,
      deviceId: c.deviceId,
      keyPrefix: c.keyPrefix,
      secretHash: c.secretHash,
      status: c.status as 'ACTIVE' | 'REVOKED',
      createdAt: c.createdAt,
      lastUsedAt: c.lastUsedAt,
      revokedAt: c.revokedAt,
      revokedBy: c.revokedBy,
    }));
  }

  async getCredentialByKeyPrefix(
    keyPrefix: string,
  ): Promise<TelemetryDeviceCredentialRecord | null> {
    const c = await this.database.telemetryDeviceCredential.findUnique({
      where: { keyPrefix },
    });
    if (!c) return null;
    return {
      id: c.id,
      organizationId: c.organizationId,
      deviceId: c.deviceId,
      keyPrefix: c.keyPrefix,
      secretHash: c.secretHash,
      status: c.status as 'ACTIVE' | 'REVOKED',
      createdAt: c.createdAt,
      lastUsedAt: c.lastUsedAt,
      revokedAt: c.revokedAt,
      revokedBy: c.revokedBy,
    };
  }

  async revokeCredential(
    organizationId: string,
    deviceId: string,
    credentialId: string,
    revokedBy: string,
  ): Promise<TelemetryDeviceCredentialRecord> {
    const updated = await this.database.telemetryDeviceCredential.update({
      where: { id: credentialId, organizationId, deviceId },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedBy,
      },
    });

    await this.auditDeviceAction({
      organizationId,
      action: 'TELEMETRY_DEVICE_CREDENTIAL_REVOKED',
      deviceId,
      after: { credentialId: updated.id, keyPrefix: updated.keyPrefix },
      actorId: revokedBy,
    });

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      deviceId: updated.deviceId,
      keyPrefix: updated.keyPrefix,
      secretHash: updated.secretHash,
      status: updated.status as 'ACTIVE' | 'REVOKED',
      createdAt: updated.createdAt,
      lastUsedAt: updated.lastUsedAt,
      revokedAt: updated.revokedAt,
      revokedBy: updated.revokedBy,
    };
  }

  async updateCredentialLastUsed(credentialId: string): Promise<void> {
    await this.database.telemetryDeviceCredential.update({
      where: { id: credentialId },
      data: { lastUsedAt: new Date() },
    });
  }

  async auditDeviceAction(params: {
    readonly organizationId: string;
    readonly action: string;
    readonly deviceId: string;
    readonly before?: unknown;
    readonly after?: unknown;
    readonly actorId?: string | undefined;
    readonly requestId?: string | undefined;
    readonly ipAddress?: string | undefined;
    readonly userAgent?: string | undefined;
  }): Promise<void> {
    if (!params.actorId) {
      return;
    }
    await this.database.auditLog.create({
      data: {
        organizationId: params.organizationId,
        action: params.action,
        entityType: 'TelemetryDevice',
        entityId: params.deviceId,
        ...(params.before ? { beforeData: params.before as Prisma.InputJsonValue } : {}),
        ...(params.after ? { afterData: params.after as Prisma.InputJsonValue } : {}),
        actorId: params.actorId,
        requestId: params.requestId ?? 'system',
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  }

  async verifyVehicleExists(organizationId: string, vehicleId: string): Promise<boolean> {
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
      providerMessageId,
      rawMetadata,
    } = params;

    // Check for duplicate providerMessageId upfront for idempotent return
    if (providerMessageId) {
      const existing = await (deviceId
        ? this.database.telemetryPosition.findFirst({
            where: {
              organizationId,
              deviceId,
              providerMessageId,
            },
          })
        : this.database.telemetryPosition.findFirst({
            where: {
              organizationId,
              source,
              providerMessageId,
              deviceId: null,
            },
          }));
      if (existing) {
        return this.mapPosition(existing);
      }
    }

    // Check existing current position for out-of-order classification
    const existingCurrent = await this.database.telemetryCurrentPosition.findUnique({
      where: {
        organizationId_vehicleId: {
          organizationId,
          vehicleId,
        },
      },
      select: { capturedAt: true },
    });

    const isOutOfOrder =
      existingCurrent != null && capturedAt.getTime() < existingCurrent.capturedAt.getTime();
    const resolvedStatus = isOutOfOrder
      ? TelemetryPositionStatus.OUT_OF_ORDER
      : (params.status ?? TelemetryPositionStatus.VALID);

    try {
      return await this.database.$transaction(async (tx) => {
        const positionRow = await tx.telemetryPosition.create({
          data: {
            organizationId,
            deviceId: deviceId ?? null,
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
            status: resolvedStatus,
            providerMessageId: providerMessageId ?? null,
            rawMetadata: rawMetadata ? (rawMetadata as Prisma.InputJsonValue) : Prisma.DbNull,
          },
        });

        // Atomic current position projection:
        // Use conditional ON CONFLICT DO UPDATE so stale points cannot overwrite newer ones
        // Deterministic tie-breaker:
        // 1. Newer captured_at wins
        // 2. Equal captured_at: strictly newer received_at wins
        // 3. Exact equal on both timestamps: first persisted wins (no update executed)
        await tx.$executeRawUnsafe(
          `INSERT INTO "telemetry_current_positions" (
            "organization_id", "vehicle_id", "device_id", "position_id",
            "latitude", "longitude", "speed_kmh", "heading", "ignition", "odometer_km",
            "captured_at", "received_at", "source", "status", "updated_at"
          ) VALUES (
            $1::uuid, $2::uuid, $3::uuid, $4::uuid,
            $5, $6, $7, $8, $9, $10,
            $11::timestamptz, $12::timestamptz, $13::"TelemetrySource", $14::"TelemetryPositionStatus", NOW()
          )
          ON CONFLICT ("organization_id", "vehicle_id")
          DO UPDATE SET
            "device_id" = EXCLUDED."device_id",
            "position_id" = EXCLUDED."position_id",
            "latitude" = EXCLUDED."latitude",
            "longitude" = EXCLUDED."longitude",
            "speed_kmh" = EXCLUDED."speed_kmh",
            "heading" = EXCLUDED."heading",
            "ignition" = EXCLUDED."ignition",
            "odometer_km" = EXCLUDED."odometer_km",
            "captured_at" = EXCLUDED."captured_at",
            "received_at" = EXCLUDED."received_at",
            "source" = EXCLUDED."source",
            "status" = EXCLUDED."status",
            "updated_at" = NOW()
          WHERE EXCLUDED."captured_at" > "telemetry_current_positions"."captured_at"
             OR (EXCLUDED."captured_at" = "telemetry_current_positions"."captured_at" AND EXCLUDED."received_at" > "telemetry_current_positions"."received_at");`,
          organizationId,
          vehicleId,
          deviceId ?? null,
          positionRow.id,
          latitude,
          longitude,
          speedKmh ?? null,
          heading ?? null,
          ignition ?? null,
          odometerKm ?? null,
          capturedAt.toISOString(),
          receivedAt.toISOString(),
          source,
          resolvedStatus,
        );

        return this.mapPosition(positionRow);
      });
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        providerMessageId
      ) {
        const existing = await (deviceId
          ? this.database.telemetryPosition.findFirst({
              where: {
                organizationId,
                deviceId,
                providerMessageId,
              },
            })
          : this.database.telemetryPosition.findFirst({
              where: {
                organizationId,
                source,
                providerMessageId,
                deviceId: null,
              },
            }));
        if (existing) {
          return this.mapPosition(existing);
        }
      }
      throw err;
    }
  }

  async findPositionByProviderMessageId(
    organizationId: string,
    deviceId: string | null | undefined,
    providerMessageId: string,
    source?: TelemetrySource,
  ): Promise<TelemetryPositionRecord | null> {
    const row = await (deviceId
      ? this.database.telemetryPosition.findFirst({
          where: {
            organizationId,
            deviceId,
            providerMessageId,
          },
        })
      : this.database.telemetryPosition.findFirst({
          where: {
            organizationId,
            ...(source ? { source } : {}),
            providerMessageId,
            deviceId: null,
          },
        }));
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

    const device = row.deviceId
      ? await this.database.telemetryDevice.findUnique({
          where: { id: row.deviceId },
          select: {
            id: true,
            displayId: true,
            name: true,
            identifier: true,
          },
        })
      : null;

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

    const deviceIds = [
      ...new Set(rows.map((r) => r.deviceId).filter((id): id is string => id != null)),
    ];
    const devices =
      deviceIds.length > 0
        ? await this.database.telemetryDevice.findMany({
            where: { id: { in: deviceIds }, organizationId },
            select: {
              id: true,
              displayId: true,
              name: true,
              identifier: true,
            },
          })
        : [];
    const deviceMap = new Map(devices.map((d) => [d.id, d]));

    return rows.map((r) =>
      this.mapCurrentPosition(r, r.deviceId ? (deviceMap.get(r.deviceId) ?? null) : null),
    );
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
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

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

  private mapDevice(
    row: Prisma.TelemetryDeviceGetPayload<Record<string, never>> & {
      vehicleAssignments?: Array<{
        id: string;
        vehicleId: string;
        assignedAt: Date;
        assignedBy: string;
        vehicle?: {
          id: string;
          displayId: string;
          registration: string;
          model: string;
        } | null;
      }>;
    },
  ): TelemetryDeviceRecord {
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

  private mapPosition(
    row: Prisma.TelemetryPositionGetPayload<Record<string, never>>,
  ): TelemetryPositionRecord {
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
    row: Prisma.TelemetryCurrentPositionGetPayload<{
      include: {
        vehicle: { select: { id: true; displayId: true; registration: true; model: true } };
      };
    }>,
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
