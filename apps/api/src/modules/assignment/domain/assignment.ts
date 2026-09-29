import { ApplicationError } from '../../foundation/domain/errors.js';

export type AssignmentStatus = 'ACTIVE' | 'ENDED';

export interface AssignmentRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly vehicleId: string;
  readonly driverId: string;
  readonly status: AssignmentStatus;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  readonly endReason: string | null;
  readonly notes: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function assertAssignmentTransition(
  current: AssignmentStatus,
  target: AssignmentStatus,
): void {
  if (current === 'ENDED') {
    throw new ApplicationError(
      'ASSIGNMENT_ALREADY_ENDED',
      'Assignment has already ended and cannot be transitioned further',
    );
  }

  if (current === 'ACTIVE' && target === 'ENDED') {
    return;
  }

  throw new ApplicationError(
    'INVALID_ASSIGNMENT_TRANSITION',
    `Cannot transition assignment status from ${current} to ${target}`,
  );
}

export function assertVehicleEligibleForAssignment(vehicleStatus: string): void {
  if (vehicleStatus !== 'ACTIVE') {
    throw new ApplicationError(
      'VEHICLE_NOT_ELIGIBLE_FOR_ASSIGNMENT',
      `Vehicle must be in ACTIVE status to be assigned. Current status: ${vehicleStatus}`,
    );
  }
}

export function assertDriverEligibleForAssignment(
  driverStatus: string,
  isOperationallyEligible: boolean,
): void {
  if (driverStatus !== 'ACTIVE') {
    throw new ApplicationError(
      'DRIVER_NOT_ELIGIBLE_FOR_ASSIGNMENT',
      `Driver must be in ACTIVE status to be assigned. Current status: ${driverStatus}`,
    );
  }

  if (!isOperationallyEligible) {
    throw new ApplicationError(
      'DRIVER_NOT_ELIGIBLE_FOR_ASSIGNMENT',
      'Driver is not operationally eligible (must have at least one valid, unexpired license)',
    );
  }
}

export function assertAssignmentDates(startedAt: Date, endedAt: Date | null): void {
  if (endedAt !== null && endedAt.getTime() < startedAt.getTime()) {
    throw new ApplicationError(
      'INVALID_ASSIGNMENT_DATE_RANGE',
      'Assignment end date cannot precede start date',
    );
  }
}

export function normalizeEndReason(reason: string | null | undefined): string {
  if (!reason || reason.trim().length === 0) {
    throw new ApplicationError(
      'INVALID_ASSIGNMENT_DATA',
      'End reason is required when ending an assignment',
    );
  }
  return reason.trim();
}

export function normalizeNotes(notes: string | null | undefined): string | null {
  if (notes === undefined || notes === null) {
    return null;
  }
  const trimmed = notes.trim();
  return trimmed.length > 0 ? trimmed : null;
}
