import { Inject, Injectable, Optional } from '@nestjs/common';
import { TelemetryDeviceStatus, TelemetryPositionStatus, TelemetrySource } from '@vms/database';
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
  TelemetrySourceUnsupportedError,
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
import { TelemetryMetricsService } from './telemetry-metrics.service.js';

export interface IngestPositionCommand {
  readonly organizationId: string;
  readonly deviceId?: string | null | undefined;
  readonly vehicleId?: string | null | undefined;
  readonly capturedAt: string | Date;
  readonly latitude: number;
  readonly longitude: number;
  readonly speedKmh?: number | null | undefined;
  readonly heading?: number | null | undefined;
  readonly altitudeM?: number | null | undefined;
  readonly accuracyM?: number | null | undefined;
  readonly ignition?: boolean | null | undefined;
  readonly odometerKm?: number | null | undefined;
  readonly source?: TelemetrySource | undefined;
  readonly providerMessageId?: string | null | undefined;
  readonly rawMetadata?: Record<string, unknown> | null | undefined;
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
    @Optional()
    @Inject(TelemetryMetricsService)
    private readonly metricsService?: TelemetryMetricsService,
  ) {}

  getMetricsService(): TelemetryMetricsService | undefined {
    return this.metricsService;
  }

  // NOTE: Telemetry positions are high-frequency time-series data and are NOT routed
  // through AuditLog or OutboxEvent tables by architectural decision.
  async ingestPosition(
    command: IngestPositionCommand,
    endpoint: 'device_single' | 'human_single' = 'device_single',
  ): Promise<TelemetryPositionRecord> {
    const startTime = performance.now();
    const source = command.source ?? TelemetrySource.DEVICE;
    const { organizationId, deviceId, vehicleId } = command;

    try {
      let resolvedVehicleId: string;

      if (deviceId) {
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
        resolvedVehicleId = assignment.vehicleId;
      } else {
        // Human deviceless ingestion (SIMULATOR / IMPORT)
        if (!vehicleId) {
          throw new ApplicationError(
            'VALIDATION_ERROR',
            'vehicleId is required when deviceId is omitted',
          );
        }
        const vehicleExists = await this.deviceRepository.verifyVehicleExists(
          organizationId,
          vehicleId,
        );
        if (!vehicleExists) {
          throw new ApplicationError('VEHICLE_NOT_FOUND', `Vehicle ${vehicleId} was not found`);
        }
        resolvedVehicleId = vehicleId;
      }

      // 3. Validate coordinates, timestamp, speed, heading
      const capturedAt =
        command.capturedAt instanceof Date ? command.capturedAt : new Date(command.capturedAt);
      const receivedAt = new Date();

      assertValidCoordinates(command.latitude, command.longitude);
      assertValidCapturedAt(capturedAt, receivedAt);

      if (command.speedKmh != null) {
        assertValidSpeed(command.speedKmh);
      }
      if (command.heading != null) {
        assertValidHeading(command.heading);
      }

      // 4. Validate source
      if (source === ('MOBILE' as TelemetrySource) || (source as string) === 'MOBILE_APP') {
        throw new TelemetrySourceUnsupportedError(source);
      }

      // 5. Correlate historical or active trip based on capturedAt
      const trip = await this.deviceRepository.findTripForVehicleAtTime(
        organizationId,
        resolvedVehicleId,
        capturedAt,
      );

      // 6. Insert position row & update current position if newer (handled in repo)
      // NOTE: Telemetry odometerKm is observational evidence and NEVER mutates Vehicle.odometerKm
      const record = await this.telemetryRepository.savePosition({
        organizationId,
        deviceId: deviceId ?? null,
        vehicleId: resolvedVehicleId,
        tripId: trip?.id ?? null,
        capturedAt,
        receivedAt,
        latitude: command.latitude,
        longitude: command.longitude,
        speedKmh: command.speedKmh ?? null,
        heading: command.heading ?? null,
        altitudeM: command.altitudeM ?? null,
        accuracyM: command.accuracyM ?? null,
        ignition: command.ignition ?? null,
        odometerKm: command.odometerKm ?? null,
        source,
        providerMessageId: command.providerMessageId?.trim() || null,
        rawMetadata: command.rawMetadata ?? null,
      });

      const durationSeconds = (performance.now() - startTime) / 1000;

      // Determine outcome: duplicate or success/out_of_order
      const isDuplicate =
        command.providerMessageId &&
        record.providerMessageId === command.providerMessageId?.trim() &&
        record.receivedAt.getTime() < receivedAt.getTime() - 50;

      const outcome = isDuplicate
        ? 'duplicate'
        : record.status === TelemetryPositionStatus.OUT_OF_ORDER
          ? 'out_of_order'
          : 'success';

      this.metricsService?.recordIngestionDuration({
        source,
        endpoint,
        outcome,
        durationSeconds,
      });

      this.metricsService?.incrementIngested({
        source,
        status: isDuplicate ? 'DUPLICATE' : record.status,
      });

      return record;
    } catch (err: unknown) {
      const durationSeconds = (performance.now() - startTime) / 1000;
      this.metricsService?.recordIngestionDuration({
        source,
        endpoint,
        outcome: 'error',
        durationSeconds,
      });

      const reason =
        err instanceof ApplicationError
          ? err.code
          : err instanceof Error
            ? 'VALIDATION_ERROR'
            : 'UNKNOWN_ERROR';

      this.metricsService?.incrementRejected({ reason });
      throw err;
    }
  }

  async ingestBatch(
    organizationId: string,
    positions: readonly Omit<IngestPositionCommand, 'organizationId'>[],
    endpoint: 'device_batch' | 'human_batch' = 'device_batch',
  ): Promise<BatchIngestResult> {
    if (!Array.isArray(positions) || positions.length === 0 || positions.length > 100) {
      throw new TelemetryBatchInvalidError('Batch size must be between 1 and 100 positions');
    }

    const firstSource = positions[0]?.source ?? TelemetrySource.DEVICE;
    this.metricsService?.recordBatchSize({
      source: firstSource,
      endpoint,
      size: positions.length,
    });

    let accepted = 0;
    let skipped = 0;
    const errors: Array<{ index: number; code: string; message: string }> = [];

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i]!;
      try {
        await this.ingestPosition(
          {
            ...pos,
            organizationId,
          },
          endpoint === 'device_batch' ? 'device_single' : 'human_single',
        );
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

    return this.telemetryRepository.getCurrentPositionForVehicle(organizationId, vehicleId);
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

    return this.telemetryRepository.getPositionHistory(organizationId, vehicleId, options);
  }

  async getTripRoute(
    organizationId: string,
    tripId: string,
  ): Promise<readonly TelemetryPositionRecord[]> {
    const tripExists = await this.deviceRepository.verifyTripExists(organizationId, tripId);
    if (!tripExists) {
      throw new ApplicationError('TRIP_NOT_FOUND', `Trip ${tripId} was not found`);
    }

    return this.telemetryRepository.getTripRoute(organizationId, tripId);
  }
}
