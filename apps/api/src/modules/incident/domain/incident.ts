import {
  IncidentAlreadyTerminalError,
  IncidentCancelReasonRequiredError,
  IncidentOccurredAtInvalidError,
  IncidentResolutionRequiredError,
  IncidentSubjectRequiredError,
  IncidentTripParticipantMismatchError,
  InvalidIncidentTransitionError,
} from './incident-errors.js';
export type { IncidentAttachmentType } from './incident-attachment.js';

export type IncidentType =
  'ACCIDENT' | 'BREAKDOWN' | 'VIOLATION' | 'DAMAGE' | 'THEFT' | 'SAFETY' | 'OTHER';

export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type IncidentStatus = 'REPORTED' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED' | 'CANCELLED';

export type IncidentOperationalImpact = 'NONE' | 'VEHICLE' | 'DRIVER' | 'BOTH';

export const TERMINAL_INCIDENT_STATUSES = new Set<IncidentStatus>(['CLOSED', 'CANCELLED']);

export const ACTIVE_OPERATIONAL_STATUSES = new Set<IncidentStatus>(['REPORTED', 'INVESTIGATING']);

export function isTerminalIncidentStatus(status: IncidentStatus): boolean {
  return TERMINAL_INCIDENT_STATUSES.has(status);
}

export function isActiveOperationalStatus(status: IncidentStatus): boolean {
  return ACTIVE_OPERATIONAL_STATUSES.has(status);
}

export interface IncidentParticipantContext {
  readonly vehicleId?: string | null | undefined;
  readonly driverId?: string | null | undefined;
  readonly tripId?: string | null | undefined;
  readonly assignmentId?: string | null | undefined;
}

export function validateIncidentSubjects(subjects: IncidentParticipantContext): void {
  const hasVehicle = Boolean(subjects.vehicleId);
  const hasDriver = Boolean(subjects.driverId);
  const hasTrip = Boolean(subjects.tripId);

  if (!hasVehicle && !hasDriver && !hasTrip) {
    throw new IncidentSubjectRequiredError();
  }
}

export function validateOperationalImpactConsistency(
  impact: IncidentOperationalImpact,
  vehicleId: string | null | undefined,
  driverId: string | null | undefined,
): void {
  if (impact === 'VEHICLE' && !vehicleId) {
    throw new IncidentSubjectRequiredError();
  }
  if (impact === 'DRIVER' && !driverId) {
    throw new IncidentSubjectRequiredError();
  }
  if (impact === 'BOTH' && (!vehicleId || !driverId)) {
    throw new IncidentSubjectRequiredError();
  }
}

export function validateIncidentOccurredAt(occurredAt: Date, now: Date = new Date()): void {
  if (isNaN(occurredAt.getTime())) {
    throw new IncidentOccurredAtInvalidError('Occurred date is invalid');
  }
  // Allow 5 minutes of future tolerance for clock skew
  const maxFutureAllowed = now.getTime() + 5 * 60 * 1000;
  if (occurredAt.getTime() > maxFutureAllowed) {
    throw new IncidentOccurredAtInvalidError('Incident occurrence time cannot be in the future');
  }
}

export function validateTripParticipantsMatch(
  trip: { vehicleId: string; driverId: string; assignmentId: string },
  provided?:
    { vehicleId?: string | null | undefined; driverId?: string | null | undefined } | undefined,
): void {
  if (provided?.vehicleId && provided.vehicleId !== trip.vehicleId) {
    throw new IncidentTripParticipantMismatchError('vehicleId');
  }
  if (provided?.driverId && provided.driverId !== trip.driverId) {
    throw new IncidentTripParticipantMismatchError('driverId');
  }
}

export function assertAllowedIncidentTransition(
  fromStatus: IncidentStatus,
  toStatus: IncidentStatus,
): void {
  if (isTerminalIncidentStatus(fromStatus)) {
    throw new IncidentAlreadyTerminalError(fromStatus);
  }

  const allowedTransitions: Record<IncidentStatus, IncidentStatus[]> = {
    REPORTED: ['INVESTIGATING', 'RESOLVED', 'CANCELLED'],
    INVESTIGATING: ['RESOLVED', 'CANCELLED'],
    RESOLVED: ['CLOSED'],
    CLOSED: [],
    CANCELLED: [],
  };

  const allowed = allowedTransitions[fromStatus] ?? [];
  if (!allowed.includes(toStatus)) {
    throw new InvalidIncidentTransitionError(fromStatus, toStatus);
  }
}

export function assertValidResolution(summary?: string | null): string {
  if (!summary || summary.trim().length === 0) {
    throw new IncidentResolutionRequiredError();
  }
  return summary.trim();
}

export function assertValidCancellation(reason?: string | null): string {
  if (!reason || reason.trim().length === 0) {
    throw new IncidentCancelReasonRequiredError();
  }
  return reason.trim();
}

export function doesIncidentBlockVehicle(
  status: IncidentStatus,
  impact: IncidentOperationalImpact,
): boolean {
  if (!isActiveOperationalStatus(status)) {
    return false;
  }
  return impact === 'VEHICLE' || impact === 'BOTH';
}

export function doesIncidentBlockDriver(
  status: IncidentStatus,
  impact: IncidentOperationalImpact,
): boolean {
  if (!isActiveOperationalStatus(status)) {
    return false;
  }
  return impact === 'DRIVER' || impact === 'BOTH';
}

export interface IncidentEntity {
  readonly id: string;
  readonly organizationId: string;
  readonly displayId: string;
  readonly type: IncidentType;
  readonly severity: IncidentSeverity;
  readonly status: IncidentStatus;
  readonly vehicleId: string | null;
  readonly driverId: string | null;
  readonly tripId: string | null;
  readonly assignmentId: string | null;
  readonly occurredAt: Date;
  readonly reportedAt: Date;
  readonly title: string;
  readonly description: string;
  readonly locationText: string | null;
  readonly operationalImpact: IncidentOperationalImpact;
  readonly resolutionSummary: string | null;
  readonly resolvedAt: Date | null;
  readonly closedAt: Date | null;
  readonly cancelReason: string | null;
  readonly cancellationReason?: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}
