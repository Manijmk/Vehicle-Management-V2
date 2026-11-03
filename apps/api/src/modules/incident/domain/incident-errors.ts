import { ApplicationError } from '../../foundation/domain/errors.js';

export class IncidentNotFoundError extends ApplicationError {
  constructor(id: string) {
    super('INCIDENT_NOT_FOUND', `Incident ${id} was not found in this organization`);
  }
}

export class IncidentAttachmentNotFoundError extends ApplicationError {
  constructor(id: string) {
    super('INCIDENT_ATTACHMENT_NOT_FOUND', `Incident attachment ${id} was not found`);
  }
}

export class InvalidIncidentTransitionError extends ApplicationError {
  constructor(from: string, to: string) {
    super('INVALID_INCIDENT_TRANSITION', `Cannot transition incident from ${from} to ${to}`);
  }
}

export class IncidentAlreadyTerminalError extends ApplicationError {
  constructor(status: string) {
    super('INCIDENT_ALREADY_TERMINAL', `Incident is already in terminal status ${status}`);
  }
}

export class IncidentSubjectRequiredError extends ApplicationError {
  constructor() {
    super(
      'INCIDENT_SUBJECT_REQUIRED',
      'At least one operational subject (vehicleId, driverId, or tripId) is required',
    );
  }
}

export class IncidentTripParticipantMismatchError extends ApplicationError {
  constructor(field: string) {
    super(
      'INCIDENT_TRIP_PARTICIPANT_MISMATCH',
      `Provided ${field} does not match the authoritative trip participant`,
    );
  }
}

export class IncidentResolutionRequiredError extends ApplicationError {
  constructor() {
    super(
      'INCIDENT_RESOLUTION_REQUIRED',
      'A non-empty resolution summary is required to resolve an incident',
    );
  }
}

export class IncidentCancelReasonRequiredError extends ApplicationError {
  constructor() {
    super(
      'INCIDENT_CANCEL_REASON_REQUIRED',
      'A non-empty cancellation reason is required to cancel an incident',
    );
  }
}

export class IncidentAttachmentInvalidError extends ApplicationError {
  constructor(message: string) {
    super('INCIDENT_ATTACHMENT_INVALID', message);
  }
}

export class IncidentAttachmentFileTooLargeError extends ApplicationError {
  constructor(size: number, max: number) {
    super(
      'INCIDENT_ATTACHMENT_TOO_LARGE',
      `Attachment size of ${size} bytes exceeds maximum limit of ${max} bytes`,
    );
  }
}

export class UnsupportedIncidentAttachmentTypeError extends ApplicationError {
  constructor(mimeType: string) {
    super(
      'UNSUPPORTED_INCIDENT_ATTACHMENT_TYPE',
      `File type '${mimeType}' is not supported. Supported types: PDF, PNG, JPEG`,
    );
  }
}

export class IncidentAttachmentImmutableError extends ApplicationError {
  constructor() {
    super(
      'INCIDENT_ATTACHMENT_IMMUTABLE',
      'Incident attachments are immutable and cannot be deleted or replaced',
    );
  }
}

export class VehicleBlockedByIncidentError extends ApplicationError {
  constructor(incidentDisplayId: string) {
    super(
      'VEHICLE_BLOCKED_BY_INCIDENT',
      `Vehicle is operationally blocked by unresolved incident ${incidentDisplayId}`,
    );
  }
}

export class DriverBlockedByIncidentError extends ApplicationError {
  constructor(incidentDisplayId: string) {
    super(
      'DRIVER_BLOCKED_BY_INCIDENT',
      `Driver is operationally blocked by unresolved incident ${incidentDisplayId}`,
    );
  }
}

export class IncidentMaintenanceRequestExistsError extends ApplicationError {
  constructor(incidentDisplayId: string) {
    super(
      'INCIDENT_MAINTENANCE_REQUEST_EXISTS',
      `A maintenance request has already been created for incident ${incidentDisplayId}`,
    );
  }
}

export class IncidentOccurredAtInvalidError extends ApplicationError {
  constructor(message: string) {
    super('INCIDENT_OCCURRED_AT_INVALID', message);
  }
}

export class IncidentVersionConflictError extends ApplicationError {
  constructor() {
    super('CONCURRENCY_CONFLICT', 'Incident was modified by another concurrent request');
  }
}
