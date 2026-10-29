import { ApplicationError } from '../../foundation/domain/errors.js';

export type TripStatus = 'DRAFT' | 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'ABORTED';

export const TERMINAL_TRIP_STATUSES = new Set<TripStatus>(['COMPLETED', 'CANCELLED', 'ABORTED']);

export function isTerminalTripStatus(status: TripStatus): boolean {
  return TERMINAL_TRIP_STATUSES.has(status);
}

export function isTripNonTerminal(status: TripStatus): boolean {
  return !isTerminalTripStatus(status);
}

const ALLOWED_TRIP_TRANSITIONS: Record<TripStatus, readonly TripStatus[]> = {
  DRAFT: ['READY', 'CANCELLED'],
  READY: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'ABORTED'],
  COMPLETED: [],
  CANCELLED: [],
  ABORTED: [],
};

export function assertTripTransition(currentStatus: TripStatus, targetStatus: TripStatus): void {
  if (isTerminalTripStatus(currentStatus)) {
    throw new ApplicationError(
      'TRIP_ALREADY_TERMINAL',
      `Cannot transition trip from terminal status ${currentStatus} to ${targetStatus}`,
    );
  }

  const allowed = ALLOWED_TRIP_TRANSITIONS[currentStatus];
  if (!allowed.includes(targetStatus)) {
    throw new ApplicationError(
      'INVALID_TRIP_STATUS_TRANSITION',
      `Cannot transition trip from ${currentStatus} to ${targetStatus}`,
    );
  }
}

export function assertTripPlanning(
  origin: string,
  destination: string,
  plannedStartAt?: Date | null,
  plannedEndAt?: Date | null,
): { origin: string; destination: string } {
  const trimmedOrigin = origin.trim();
  const trimmedDestination = destination.trim();

  if (!trimmedOrigin || trimmedOrigin.length > 200) {
    throw new ApplicationError(
      'TRIP_PLANNING_INVALID',
      'Trip origin must be non-empty and at most 200 characters',
    );
  }

  if (!trimmedDestination || trimmedDestination.length > 200) {
    throw new ApplicationError(
      'TRIP_PLANNING_INVALID',
      'Trip destination must be non-empty and at most 200 characters',
    );
  }

  if (plannedStartAt && plannedEndAt && plannedEndAt.getTime() < plannedStartAt.getTime()) {
    throw new ApplicationError(
      'TRIP_PLANNING_INVALID',
      'Trip plannedEndAt cannot be before plannedStartAt',
    );
  }

  return { origin: trimmedOrigin, destination: trimmedDestination };
}

export function assertTripOperationalEligibility(params: {
  assignmentStatus: string;
  vehicleStatus: string;
  driverStatus: string;
  isDriverEligible: boolean;
}): void {
  if (params.assignmentStatus !== 'ACTIVE') {
    throw new ApplicationError('TRIP_ASSIGNMENT_NOT_ACTIVE', 'Trip requires an ACTIVE assignment');
  }

  if (params.vehicleStatus !== 'ACTIVE') {
    throw new ApplicationError(
      'TRIP_VEHICLE_NOT_ACTIVE',
      'Assigned vehicle must be in ACTIVE status',
    );
  }

  if (params.driverStatus !== 'ACTIVE') {
    throw new ApplicationError(
      'TRIP_DRIVER_NOT_ACTIVE',
      'Assigned driver must be in ACTIVE status',
    );
  }

  if (!params.isDriverEligible) {
    throw new ApplicationError(
      'TRIP_DRIVER_NOT_ELIGIBLE',
      'Assigned driver is not operationally eligible (must have a valid, unexpired license)',
    );
  }
}

export function assertStartOdometer(
  startOdometerKm: number,
  currentVehicleOdometerKm: number,
): number {
  if (
    typeof startOdometerKm !== 'number' ||
    !Number.isInteger(startOdometerKm) ||
    startOdometerKm < 0
  ) {
    throw new ApplicationError(
      'INVALID_START_ODOMETER',
      'Start odometer must be a non-negative integer',
    );
  }

  if (startOdometerKm < currentVehicleOdometerKm) {
    throw new ApplicationError(
      'INVALID_START_ODOMETER',
      `Start odometer (${startOdometerKm} km) cannot be less than current vehicle odometer (${currentVehicleOdometerKm} km)`,
    );
  }

  return startOdometerKm;
}

export function assertEndOdometer(endOdometerKm: number, startOdometerKm: number): number {
  if (typeof endOdometerKm !== 'number' || !Number.isInteger(endOdometerKm) || endOdometerKm < 0) {
    throw new ApplicationError(
      'INVALID_END_ODOMETER',
      'End odometer must be a non-negative integer',
    );
  }

  if (endOdometerKm < startOdometerKm) {
    throw new ApplicationError(
      'INVALID_END_ODOMETER',
      `End odometer (${endOdometerKm} km) cannot be less than start odometer (${startOdometerKm} km)`,
    );
  }

  return endOdometerKm;
}

export function calculateTripDistance(startOdometerKm: number, endOdometerKm: number): number {
  return endOdometerKm - startOdometerKm;
}

export function assertVehicleOdometerNoDecrease(
  currentOdometerKm: number,
  newOdometerKm: number,
): void {
  if (newOdometerKm < currentOdometerKm) {
    throw new ApplicationError(
      'ODOMETER_DECREASE_NOT_ALLOWED',
      `New vehicle odometer (${newOdometerKm} km) cannot decrease current vehicle odometer (${currentOdometerKm} km)`,
    );
  }
}

export function normalizeTripReason(
  reason: string,
  fieldName: 'cancelReason' | 'abortReason',
): string {
  const trimmed = reason.trim();
  if (!trimmed) {
    throw new ApplicationError(
      'TRIP_PLANNING_INVALID',
      `${fieldName} is required and cannot be empty`,
    );
  }
  if (trimmed.length > 500) {
    throw new ApplicationError(
      'TRIP_PLANNING_INVALID',
      `${fieldName} cannot exceed 500 characters`,
    );
  }
  return trimmed;
}

export function normalizeOptionalText(text?: string | null, maxLength = 500): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new ApplicationError(
      'TRIP_PLANNING_INVALID',
      `Text exceeds maximum length of ${maxLength} characters`,
    );
  }
  return trimmed;
}
