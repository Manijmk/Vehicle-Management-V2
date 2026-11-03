import { Inject, Injectable } from '@nestjs/common';
import { TelemetryDeviceStatus, TelemetrySource } from '@vms/database';
import { ApplicationError } from '../../foundation/domain/errors.js';
import {
  assertValidCapturedAt,
  assertValidCoordinates,
  assertValidHeading,
  assertValidSpeed,
} from '../domain/telemetry.js';
import {
  TelemetryBatchInvalidError,
  TelemetryDeviceInactiveError,
  TelemetryDeviceNotAssignedError,
  TelemetryDeviceNotFoundError,
} from '../domain/telemetry-errors.js';
import {
  DEVICE_REPOSITORY,
  TELEMETRY_REPOSITORY,
  type DeviceRepository,
  type HistoryQueryOptions,
  type TelemetryCurrentPositionRecord,
  type TelemetryPositionRecord,
  type TelemetryRepository,
} from './telemetry.repository.js';

export interface IngestPositionCommand {
  readonly organizationId: string;
  readonly deviceId: string;
  readonly capturedAt: string | Date;
  readonly latitude: number;
  readonly longitude: number;
  readonly speedKmh?: number | null;
  readonly heading?: number | null;
  readonly altitudeM?: number | null;
  readonly accuracyM?: number | null;
  readonly ignition?: boolean | null;
  readonly odometerKm?: number | null;
  readonly source?: TelemetrySource;
  readonly providerMessageId?: string | null;
  readonly rawMetadata?: Record<string, unknown> | null;
}

export interface BatchIngestResult {
  readonly accepted: number;
  readonly skipped: number;
  readonly errors: ReadonlyArray<{
    readonly index: number;
    readonly code: string;
    readonly message: string;
  }>;
}

@Injectable()
export class TelemetryService {
  constructor(
    @Inject(TELEMETRY_REPOSITORY)
    private readonly telemetryRepository: TelemetryRepository,
    @Inject(DEVICE_REPOSITORY)
    private readonly deviceRepository: DeviceRepository,
  ) {}

  // NOTE: Telemetry positions are high-frequency time-series data and are NOT routed
  // through AuditLog or OutboxEvent tables by architectural decision.
  async ingestPosition(command: IngestPositionCommand): Promise<TelemetryPositionRecord> {
    const { organizationId, deviceId } = command;

    // 1. Validate device exists in org and is ACTIVE
    const device = await this.deviceRepository.getDeviceById(organizationId, deviceId);
    if (!device) {
      throw new TelemetryDeviceNotFoundError(deviceId);
    }
    if (device.status !== TelemetryDeviceStatus.ACTIVE) {
      throw new TelemetryDeviceInactiveError(deviceId, device.status);
    }

    // 2. Validate device has an active vehicle assignment
    const assignment = await this.deviceRepository.getActiveAssignmentByDeviceId(
      organizationId,
      deviceId,
    );
    if (!assignment) {
      throw new TelemetryDeviceNotAssignedError(deviceId);
    }

    // 3. Validate coordinates, timestamp, speed, heading
    const capturedAt =
      command.capturedAt instanceof Date
        ? command.capturedAt
        : new Date(command.capturedAt);
    const receivedAt = new Date();

    assertValidCoordinates(command.latitude, command.longitude);
    assertValidCapturedAt(capturedAt, receivedAt);

    if (command.speedKmh != null) {
      assertValidSpeed(command.speedKmh);
    }
    if (command.heading != null) {
      assertValidHeading(command.heading);
    }

    // 4. Find active trip for vehicle (if any)
    const activeTrip = await this.deviceRepository.findActiveTripForVehicle(
      organizationId,
      assignment.vehicleId,
    );

    // 5. Insert position row & update current position if newer (handled in repo)
    return this.telemetryRepository.savePosition({
      organizationId,
      deviceId,
      vehicleId: assignment.vehicleId,
      tripId: activeTrip?.id ?? null,
      capturedAt,
      receivedAt,
      latitude: command.latitude,
      longitude: command.longitude,
      speedKmh: command.speedKmh,
      heading: command.heading,
      altitudeM: command.altitudeM,
      accuracyM: command.accuracyM,
      ignition: command.ignition,
      odometerKm: command.odometerKm,
      source: command.source ?? TelemetrySource.DEVICE,
      providerMessageId: command.providerMessageId?.trim() || null,
      rawMetadata: command.rawMetadata,
    });
  }

  async ingestBatch(
    organizationId: string,
    positions: readonly Omit<IngestPositionCommand, 'organizationId'>[],
  ): Promise<BatchIngestResult> {
    if (!Array.isArray(positions) || positions.length === 0 || positions.length > 100) {
      throw new TelemetryBatchInvalidError(
        'Batch size must be between 1 and 100 positions',
      );
    }

    let accepted = 0;
    let skipped = 0;
    const errors: Array<{ index: number; code: string; message: string }> = [];

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i]!;
      try {
        await this.ingestPosition({
          ...pos,
          organizationId,
        });
        accepted++;
      } catch (err: unknown) {
        if (err instanceof ApplicationError) {
          if (err.code === 'DUPLICATE_TELEMETRY_POSITION') {
            skipped++;
          } else {
            errors.push({
              index: i,
              code: err.code,
              message: err.message,
            });
          }
        } else if (err instanceof Error) {
          errors.push({
            index: i,
            code: 'VALIDATION_ERROR',
            message: err.message,
          });
        } else {
          errors.push({
            index: i,
            code: 'UNKNOWN_ERROR',
            message: String(err),
          });
        }
      }
    }

    return { accepted, skipped, errors };
  }

  async getCurrentFleetPositions(
    organizationId: string,
  ): Promise<readonly TelemetryCurrentPositionRecord[]> {
    return this.telemetryRepository.getCurrentPositionsForFleet(organizationId);
  }

  async getCurrentVehiclePosition(
    organizationId: string,
    vehicleId: string,
  ): Promise<TelemetryCurrentPositionRecord | null> {
    const vehicleExists = await this.deviceRepository.verifyVehicleExists(
      organizationId,
      vehicleId,
    );
    if (!vehicleExists) {
      throw new ApplicationError('VEHICLE_NOT_FOUND', `Vehicle ${vehicleId} was not found`);
    }

    return this.telemetryRepository.getCurrentPositionForVehicle(
      organizationId,
      vehicleId,
    );
  }

  async getVehicleHistory(
    organizationId: string,
    vehicleId: string,
    options?: HistoryQueryOptions,
  ): Promise<{
    readonly items: readonly TelemetryPositionRecord[];
    readonly nextCursor?: string | null;
  }> {
    const vehicleExists = await this.deviceRepository.verifyVehicleExists(
      organizationId,
      vehicleId,
    );
    if (!vehicleExists) {
      throw new ApplicationError('VEHICLE_NOT_FOUND', `Vehicle ${vehicleId} was not found`);
    }

    return this.telemetryRepository.getPositionHistory(
      organizationId,
      vehicleId,
      options,
    );
  }

  async getTripRoute(
    organizationId: string,
    tripId: string,
  ): Promise<readonly TelemetryPositionRecord[]> {
    const tripExists = await this.deviceRepository.verifyTripExists(
      organizationId,
      tripId,
    );
    if (!tripExists) {
      throw new ApplicationError('TRIP_NOT_FOUND', `Trip ${tripId} was not found`);
    }

    return this.telemetryRepository.getTripRoute(organizationId, tripId);
  }
}
