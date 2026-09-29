import type { FuelType, VehicleStatus, VehicleType } from '../domain/vehicle.js';

export interface MutationMetadata {
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly requestId: string;
  readonly ipAddress?: string | undefined;
  readonly userAgent?: string | undefined;
}

export interface VehicleRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly displayId: string;
  readonly registration: string;
  readonly vin: string;
  readonly type: VehicleType;
  readonly fuelType: FuelType;
  readonly status: VehicleStatus;
  readonly model: string;
  readonly year: number;
  readonly odometerKm: number;
  readonly notes?: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface VehicleHistoryEntry {
  readonly id: string;
  readonly organizationId: string;
  readonly vehicleId: string;
  readonly previousStatus: VehicleStatus | null;
  readonly newStatus: VehicleStatus;
  readonly reason: string;
  readonly changedBy: string;
  readonly createdAt: Date;
}

export interface VehicleRepository {
  listVehicles(organizationId: string): Promise<VehicleRecord[]>;
  getVehicle(organizationId: string, vehicleId: string): Promise<VehicleRecord>;
  createVehicle(input: {
    organizationId: string;
    displayId: string;
    registration: string;
    vin: string;
    type: VehicleType;
    fuelType: FuelType;
    model: string;
    year: number;
    odometerKm: number;
    notes?: string;
    metadata: MutationMetadata;
  }): Promise<VehicleRecord>;
  updateVehicle(input: {
    organizationId: string;
    vehicleId: string;
    displayId?: string;
    registration?: string;
    vin?: string;
    type?: VehicleType;
    fuelType?: FuelType;
    model?: string;
    year?: number;
    odometerKm?: number;
    notes?: string;
    version: number;
    metadata: MutationMetadata;
  }): Promise<VehicleRecord>;
  activateVehicle(input: {
    organizationId: string;
    vehicleId: string;
    version?: number;
    metadata: MutationMetadata;
  }): Promise<VehicleRecord>;
  retireVehicle(input: {
    organizationId: string;
    vehicleId: string;
    reason: string;
    version: number;
    metadata: MutationMetadata;
  }): Promise<VehicleRecord>;
  listStatusHistory(organizationId: string, vehicleId: string): Promise<VehicleHistoryEntry[]>;
}
