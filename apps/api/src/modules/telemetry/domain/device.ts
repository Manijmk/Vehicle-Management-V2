import { TelemetryDeviceStatus } from '@vms/database';
import {
  InvalidDeviceDataError,
  InvalidDeviceStatusTransitionError,
} from './telemetry-errors.js';

export const VALID_DEVICE_TRANSITIONS: Record<TelemetryDeviceStatus, readonly TelemetryDeviceStatus[]> = {
  ACTIVE: ['INACTIVE', 'SUSPENDED'],
  INACTIVE: ['ACTIVE'],
  SUSPENDED: ['ACTIVE', 'INACTIVE'],
};

export function canTransitionDeviceStatus(
  currentStatus: TelemetryDeviceStatus,
  targetStatus: TelemetryDeviceStatus,
): boolean {
  const allowed = VALID_DEVICE_TRANSITIONS[currentStatus];
  return allowed ? allowed.includes(targetStatus) : false;
}

export function assertValidDeviceStatusTransition(
  currentStatus: TelemetryDeviceStatus,
  targetStatus: TelemetryDeviceStatus,
): void {
  if (!canTransitionDeviceStatus(currentStatus, targetStatus)) {
    throw new InvalidDeviceStatusTransitionError(currentStatus, targetStatus);
  }
}

export function assertValidDeviceName(name: string): void {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 200) {
    throw new InvalidDeviceDataError('Device name must be a non-empty string of up to 200 characters');
  }
}

export function assertValidDeviceIdentifier(identifier: string): void {
  if (typeof identifier !== 'string' || !identifier.trim() || identifier.trim().length > 100) {
    throw new InvalidDeviceDataError('Device identifier must be a non-empty string of up to 100 characters');
  }
}

export function assertValidDeviceNotes(notes?: string | null): void {
  if (notes && notes.length > 500) {
    throw new InvalidDeviceDataError('Device notes cannot exceed 500 characters');
  }
}
