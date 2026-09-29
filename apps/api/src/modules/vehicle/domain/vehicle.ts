import { ApplicationError } from '../../foundation/domain/errors.js';

export const vehicleStatuses = ['DRAFT', 'ACTIVE', 'RETIRED'] as const;
export type VehicleStatus = (typeof vehicleStatuses)[number];

export const vehicleTypes = ['CAR', 'VAN', 'TRUCK', 'BUS', 'MOTORCYCLE', 'OTHER'] as const;
export type VehicleType = (typeof vehicleTypes)[number];

export const fuelTypes = ['PETROL', 'DIESEL', 'HYBRID', 'ELECTRIC', 'GAS', 'OTHER'] as const;
export type FuelType = (typeof fuelTypes)[number];

const transitions: Readonly<Record<VehicleStatus, readonly VehicleStatus[]>> = {
  DRAFT: ['ACTIVE', 'RETIRED'],
  ACTIVE: ['RETIRED'],
  RETIRED: [],
};

export function assertVehicleTransition(from: VehicleStatus, to: VehicleStatus): void {
  if (from === to) return;
  if (!transitions[from].includes(to)) {
    throw new ApplicationError(
      'INVALID_VEHICLE_TRANSITION',
      `Vehicle cannot transition from ${from} to ${to}`,
    );
  }
}

export function normalizeDisplayId(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 40) {
    throw new ApplicationError('INVALID_VEHICLE_DATA', 'Display ID must be 1-40 characters');
  }
  return trimmed;
}

export function normalizeRegistration(value: string): string {
  const trimmed = value.trim().toUpperCase();
  if (!/^[A-Z]{2,3}[-\s]?[0-9A-Z]{2,8}$/u.test(trimmed)) {
    throw new ApplicationError('INVALID_VEHICLE_DATA', 'Registration must be a valid plate format');
  }
  return trimmed.replace(/\s+/gu, ' ').trim();
}

export function normalizeVin(value: string): string {
  const trimmed = value.trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/u.test(trimmed)) {
    throw new ApplicationError(
      'INVALID_VEHICLE_DATA',
      'VIN must be 17 characters with valid characters',
    );
  }
  return trimmed;
}
