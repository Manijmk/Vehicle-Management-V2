import { ApplicationError } from '../../foundation/domain/errors.js';

export class TelemetryDeviceNotFoundError extends ApplicationError {
  constructor(deviceId: string) {
    super('TELEMETRY_DEVICE_NOT_FOUND', `Telemetry device ${deviceId} was not found`);
  }
}

export class TelemetryDeviceAlreadyExistsError extends ApplicationError {
  constructor(identifierOrDisplayId: string) {
    super('TELEMETRY_DEVICE_ALREADY_EXISTS', `Telemetry device with identifier or display ID '${identifierOrDisplayId}' already exists`);
  }
}

export class TelemetryDeviceInactiveError extends ApplicationError {
  constructor(deviceId: string, status?: string) {
    super('TELEMETRY_DEVICE_INACTIVE', `Telemetry device ${deviceId} is not active (current status: ${status ?? 'INACTIVE'})`);
  }
}

export class TelemetryDeviceNotAssignedError extends ApplicationError {
  constructor(deviceId: string) {
    super('TELEMETRY_DEVICE_NOT_ASSIGNED', `Telemetry device ${deviceId} is not assigned to any vehicle`);
  }
}

export class TelemetryDeviceAlreadyAssignedError extends ApplicationError {
  constructor(deviceId: string, vehicleId?: string) {
    super('TELEMETRY_DEVICE_ALREADY_ASSIGNED', `Telemetry device ${deviceId} is already assigned to a vehicle${vehicleId ? ` (${vehicleId})` : ''}`);
  }
}

export class TelemetryDeviceHasActiveAssignmentError extends ApplicationError {
  constructor(deviceId: string) {
    super('TELEMETRY_DEVICE_HAS_ACTIVE_ASSIGNMENT', `Telemetry device ${deviceId} has an active vehicle assignment and cannot be modified or suspended before unassigning`);
  }
}

export class InvalidTelemetryCoordinatesError extends ApplicationError {
  constructor(message: string) {
    super('INVALID_TELEMETRY_COORDINATES', message);
  }
}

export class InvalidTelemetryTimestampError extends ApplicationError {
  constructor(message: string) {
    super('INVALID_TELEMETRY_TIMESTAMP', message);
  }
}

export class DuplicateTelemetryPositionError extends ApplicationError {
  constructor(providerMessageId: string) {
    super('DUPLICATE_TELEMETRY_POSITION', `Telemetry position with provider message ID '${providerMessageId}' already exists`);
  }
}

export class TelemetryPositionNotFoundError extends ApplicationError {
  constructor(positionId: string) {
    super('TELEMETRY_POSITION_NOT_FOUND', `Telemetry position ${positionId} was not found`);
  }
}

export class InvalidDeviceStatusTransitionError extends ApplicationError {
  constructor(fromStatus: string, toStatus: string) {
    super('INVALID_DEVICE_STATUS_TRANSITION', `Cannot transition telemetry device status from ${fromStatus} to ${toStatus}`);
  }
}

export class InvalidDeviceDataError extends ApplicationError {
  constructor(message: string) {
    super('INVALID_DEVICE_DATA', message);
  }
}

export class TelemetryBatchInvalidError extends ApplicationError {
  constructor(message: string) {
    super('TELEMETRY_BATCH_INVALID', message);
  }
}
