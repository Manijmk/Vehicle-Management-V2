import {
  TelemetryDeviceStatus,
  TelemetryPositionStatus,
  TelemetrySource,
} from '@vms/database';
import { TelemetryFreshness } from '../domain/telemetry.js';

export { TELEMETRY_REPOSITORY, DEVICE_REPOSITORY } from '../telemetry.tokens.js';

export interface TelemetryDeviceRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly displayId: string;
  readonly name: string;
  readonly identifier: string;
  readonly status: TelemetryDeviceStatus;
  readonly notes?: string | null;
  readonly metadata?: Record<string, unknown> | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly activeAssignment?: {
    readonly id: string;
    readonly vehicleId: string;
    readonly assignedAt: Date;
    readonly assignedBy: string;
    readonly vehicle?: {
      readonly id: string;
      readonly displayId: string;
      readonly registration: string;
      readonly model: string;
    } | null;
  } | null;
}

export interface TelemetryPositionRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly deviceId: string;
  readonly vehicleId: string;
  readonly tripId?: string | null;
  readonly capturedAt: Date;
  readonly receivedAt: Date;
  readonly latitude: number;
  readonly longitude: number;
  readonly speedKmh?: number | null;
  readonly heading?: number | null;
  readonly altitudeM?: number | null;
  readonly accuracyM?: number | null;
  readonly ignition?: boolean | null;
  readonly odometerKm?: number | null;
  readonly source: TelemetrySource;
  readonly status: TelemetryPositionStatus;
  readonly providerMessageId?: string | null;
  readonly rawMetadata?: Record<string, unknown> | null;
}

export interface TelemetryCurrentPositionRecord {
  readonly organizationId: string;
  readonly vehicleId: string;
  readonly deviceId: string;
  readonly positionId: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly speedKmh?: number | null;
  readonly heading?: number | null;
  readonly ignition?: boolean | null;
  readonly odometerKm?: number | null;
  readonly capturedAt: Date;
  readonly receivedAt: Date;
  readonly source: TelemetrySource;
  readonly status: TelemetryPositionStatus;
  readonly updatedAt: Date;
  readonly freshness: TelemetryFreshness;
  readonly vehicle?: {
    readonly id: string;
    readonly displayId: string;
    readonly registration: string;
    readonly model: string;
  } | null;
  readonly device?: {
    readonly id: string;
    readonly displayId: string;
    readonly name: string;
    readonly identifier: string;
  } | null;
}

export interface CreateDeviceParams {
  readonly organizationId: string;
  readonly name: string;
  readonly identifier: string;
  readonly notes?: string | null;
  readonly metadata?: Record<string, unknown> | null;
}

export interface UpdateDeviceParams {
  readonly organizationId: string;
  readonly deviceId: string;
  readonly name?: string;
  readonly notes?: string | null;
  readonly metadata?: Record<string, unknown> | null;
}

export interface AssignDeviceParams {
  readonly organizationId: string;
  readonly deviceId: string;
  readonly vehicleId: string;
  readonly assignedBy: string;
  readonly notes?: string | null;
}

export interface IngestPositionParams {
  readonly organizationId: string;
  readonly deviceId: string;
  readonly vehicleId: string;
  readonly tripId?: string | null;
  readonly capturedAt: Date;
  readonly receivedAt: Date;
  readonly latitude: number;
  readonly longitude: number;
  readonly speedKmh?: number | null;
  readonly heading?: number | null;
  readonly altitudeM?: number | null;
  readonly accuracyM?: number | null;
  readonly ignition?: boolean | null;
  readonly odometerKm?: number | null;
  readonly source: TelemetrySource;
  readonly status?: TelemetryPositionStatus;
  readonly providerMessageId?: string | null;
  readonly rawMetadata?: Record<string, unknown> | null;
}

export interface HistoryQueryOptions {
  readonly from?: Date;
  readonly to?: Date;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface TelemetryRepository {
  savePosition(params: IngestPositionParams): Promise<TelemetryPositionRecord>;
  findPositionByProviderMessageId(
    organizationId: string,
    deviceId: string,
    providerMessageId: string,
  ): Promise<TelemetryPositionRecord | null>;
  getCurrentPositionForVehicle(
    organizationId: string,
    vehicleId: string,
  ): Promise<TelemetryCurrentPositionRecord | null>;
  getCurrentPositionsForFleet(
    organizationId: string,
  ): Promise<readonly TelemetryCurrentPositionRecord[]>;
  getPositionHistory(
    organizationId: string,
    vehicleId: string,
    options?: HistoryQueryOptions,
  ): Promise<{
    readonly items: readonly TelemetryPositionRecord[];
    readonly nextCursor?: string | null;
  }>;
  getTripRoute(
    organizationId: string,
    tripId: string,
  ): Promise<readonly TelemetryPositionRecord[]>;
}

export interface DeviceRepository {
  createDevice(params: CreateDeviceParams): Promise<TelemetryDeviceRecord>;
  getDeviceById(organizationId: string, deviceId: string): Promise<TelemetryDeviceRecord | null>;
  getDeviceByIdentifier(organizationId: string, identifier: string): Promise<TelemetryDeviceRecord | null>;
  listDevices(organizationId: string): Promise<readonly TelemetryDeviceRecord[]>;
  updateDevice(params: UpdateDeviceParams): Promise<TelemetryDeviceRecord>;
  updateDeviceStatus(
    organizationId: string,
    deviceId: string,
    newStatus: TelemetryDeviceStatus,
  ): Promise<TelemetryDeviceRecord>;
  assignDevice(params: AssignDeviceParams): Promise<TelemetryDeviceRecord>;
  unassignDevice(organizationId: string, deviceId: string, notes?: string): Promise<TelemetryDeviceRecord>;
  getActiveAssignmentByDeviceId(
    organizationId: string,
    deviceId: string,
  ): Promise<{
    readonly id: string;
    readonly vehicleId: string;
    readonly deviceId: string;
    readonly assignedAt: Date;
  } | null>;
  getActiveAssignmentByVehicleId(
    organizationId: string,
    vehicleId: string,
  ): Promise<{
    readonly id: string;
    readonly vehicleId: string;
    readonly deviceId: string;
    readonly assignedAt: Date;
  } | null>;
  findActiveTripForVehicle(
    organizationId: string,
    vehicleId: string,
  ): Promise<{ id: string } | null>;
  verifyVehicleExists(organizationId: string, vehicleId: string): Promise<boolean>;
  verifyTripExists(organizationId: string, tripId: string): Promise<boolean>;
}
