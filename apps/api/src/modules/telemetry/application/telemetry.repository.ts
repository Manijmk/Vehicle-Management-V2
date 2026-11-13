import type {
  TelemetryDeviceStatus,
  TelemetryPositionStatus,
  TelemetrySource,
} from '@vms/database';
import type { TelemetryFreshness } from '../domain/telemetry.js';

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

export interface TelemetryDeviceCredentialRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly deviceId: string;
  readonly keyPrefix: string;
  readonly secretHash: string;
  readonly status: 'ACTIVE' | 'REVOKED';
  readonly createdAt: Date;
  readonly lastUsedAt?: Date | null;
  readonly revokedAt?: Date | null;
  readonly revokedBy?: string | null;
}

export interface TelemetryPositionRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly deviceId?: string | null;
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
  readonly deviceId?: string | null;
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
  readonly notes?: string | null | undefined;
  readonly metadata?: Record<string, unknown> | null | undefined;
  readonly actorId?: string | undefined;
}

export interface UpdateDeviceParams {
  readonly organizationId: string;
  readonly deviceId: string;
  readonly name?: string | undefined;
  readonly notes?: string | null | undefined;
  readonly metadata?: Record<string, unknown> | null | undefined;
  readonly actorId?: string | undefined;
}

export interface AssignDeviceParams {
  readonly organizationId: string;
  readonly deviceId: string;
  readonly vehicleId: string;
  readonly assignedBy: string;
  readonly notes?: string | null | undefined;
}

export interface IngestPositionParams {
  readonly organizationId: string;
  readonly deviceId?: string | null | undefined;
  readonly vehicleId: string;
  readonly tripId?: string | null | undefined;
  readonly capturedAt: Date;
  readonly receivedAt: Date;
  readonly latitude: number;
  readonly longitude: number;
  readonly speedKmh?: number | null | undefined;
  readonly heading?: number | null | undefined;
  readonly altitudeM?: number | null | undefined;
  readonly accuracyM?: number | null | undefined;
  readonly ignition?: boolean | null | undefined;
  readonly odometerKm?: number | null | undefined;
  readonly source: TelemetrySource;
  readonly status?: TelemetryPositionStatus | undefined;
  readonly providerMessageId?: string | null | undefined;
  readonly rawMetadata?: Record<string, unknown> | null | undefined;
}

export interface HistoryQueryOptions {
  readonly from?: Date | undefined;
  readonly to?: Date | undefined;
  readonly limit?: number | undefined;
  readonly cursor?: string | undefined;
}

export interface TelemetryRepository {
  savePosition(params: IngestPositionParams): Promise<TelemetryPositionRecord>;
  findPositionByProviderMessageId(
    organizationId: string,
    deviceId: string | null | undefined,
    providerMessageId: string,
    source?: TelemetrySource,
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
  getTripRoute(organizationId: string, tripId: string): Promise<readonly TelemetryPositionRecord[]>;
}

export interface DeviceRepository {
  createDevice(params: CreateDeviceParams): Promise<TelemetryDeviceRecord>;
  getDeviceById(organizationId: string, deviceId: string): Promise<TelemetryDeviceRecord | null>;
  getDeviceByIdentifier(
    organizationId: string,
    identifier: string,
  ): Promise<TelemetryDeviceRecord | null>;
  listDevices(organizationId: string): Promise<readonly TelemetryDeviceRecord[]>;
  updateDevice(params: UpdateDeviceParams): Promise<TelemetryDeviceRecord>;
  updateDeviceStatus(
    organizationId: string,
    deviceId: string,
    newStatus: TelemetryDeviceStatus,
    actorId?: string | undefined,
  ): Promise<TelemetryDeviceRecord>;
  assignDevice(params: AssignDeviceParams): Promise<TelemetryDeviceRecord>;
  unassignDevice(
    organizationId: string,
    deviceId: string,
    notes?: string | undefined,
    unassignedBy?: string | undefined,
  ): Promise<TelemetryDeviceRecord>;
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
  findTripForVehicleAtTime(
    organizationId: string,
    vehicleId: string,
    capturedAt: Date,
  ): Promise<{ id: string } | null>;
  createCredential(params: {
    readonly organizationId: string;
    readonly deviceId: string;
    readonly keyPrefix: string;
    readonly secretHash: string;
    readonly actorId?: string | undefined;
  }): Promise<TelemetryDeviceCredentialRecord>;
  listCredentials(
    organizationId: string,
    deviceId: string,
  ): Promise<readonly TelemetryDeviceCredentialRecord[]>;
  getCredentialByKeyPrefix(keyPrefix: string): Promise<TelemetryDeviceCredentialRecord | null>;
  revokeCredential(
    organizationId: string,
    deviceId: string,
    credentialId: string,
    revokedBy: string,
  ): Promise<TelemetryDeviceCredentialRecord>;
  updateCredentialLastUsed(credentialId: string): Promise<void>;
  auditDeviceAction(params: {
    readonly organizationId: string;
    readonly action: string;
    readonly deviceId: string;
    readonly before?: unknown;
    readonly after?: unknown;
    readonly actorId?: string | undefined;
    readonly requestId?: string | undefined;
    readonly ipAddress?: string | undefined;
    readonly userAgent?: string | undefined;
  }): Promise<void>;
  verifyVehicleExists(organizationId: string, vehicleId: string): Promise<boolean>;
  verifyTripExists(organizationId: string, tripId: string): Promise<boolean>;
}
