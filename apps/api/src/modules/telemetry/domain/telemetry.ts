import {
  InvalidTelemetryCoordinatesError,
  InvalidTelemetryTimestampError,
  InvalidDeviceDataError,
} from './telemetry-errors.js';

export const FRESH_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
export const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

export type TelemetryFreshness = 'FRESH' | 'STALE' | 'UNKNOWN';

export function assertValidCoordinates(lat: number, lon: number): void {
  if (typeof lat !== 'number' || !Number.isFinite(lat) || Number.isNaN(lat) || lat < -90 || lat > 90) {
    throw new InvalidTelemetryCoordinatesError(`Latitude must be between -90 and 90 degrees. Received: ${lat}`);
  }
  if (typeof lon !== 'number' || !Number.isFinite(lon) || Number.isNaN(lon) || lon < -180 || lon > 180) {
    throw new InvalidTelemetryCoordinatesError(`Longitude must be between -180 and 180 degrees. Received: ${lon}`);
  }
}

export function assertValidSpeed(speedKmh: number): void {
  if (typeof speedKmh !== 'number' || !Number.isFinite(speedKmh) || Number.isNaN(speedKmh) || speedKmh < 0 || speedKmh > 300) {
    throw new InvalidDeviceDataError(`Speed must be between 0 and 300 km/h. Received: ${speedKmh}`);
  }
}

export function assertValidHeading(heading: number): void {
  if (typeof heading !== 'number' || !Number.isFinite(heading) || Number.isNaN(heading) || heading < 0 || heading > 360) {
    throw new InvalidDeviceDataError(`Heading must be between 0 and 360 degrees. Received: ${heading}`);
  }
}

export function assertValidCapturedAt(capturedAt: Date, receivedAt: Date): void {
  if (!(capturedAt instanceof Date) || Number.isNaN(capturedAt.getTime())) {
    throw new InvalidTelemetryTimestampError('capturedAt must be a valid date');
  }
  if (!(receivedAt instanceof Date) || Number.isNaN(receivedAt.getTime())) {
    throw new InvalidTelemetryTimestampError('receivedAt must be a valid date');
  }

  const MAX_FUTURE_MS = 5 * 60 * 1000; // 5 minutes
  const MAX_PAST_MS = 365 * 24 * 60 * 60 * 1000; // 365 days

  const futureDiff = capturedAt.getTime() - receivedAt.getTime();
  if (futureDiff > MAX_FUTURE_MS) {
    throw new InvalidTelemetryTimestampError('Telemetry capturedAt cannot be more than 5 minutes in the future');
  }

  const pastDiff = receivedAt.getTime() - capturedAt.getTime();
  if (pastDiff > MAX_PAST_MS) {
    throw new InvalidTelemetryTimestampError('Telemetry capturedAt cannot be older than 365 days in the past');
  }
}

export function calculateFreshnessStatus(capturedAt: Date | null | undefined, now: Date): TelemetryFreshness {
  if (!capturedAt || !(capturedAt instanceof Date) || Number.isNaN(capturedAt.getTime())) {
    return 'UNKNOWN';
  }
  const ageMs = now.getTime() - capturedAt.getTime();
  if (ageMs < -5000) {
    return 'UNKNOWN';
  }
  if (ageMs <= FRESH_THRESHOLD_MS) {
    return 'FRESH';
  }
  if (ageMs <= STALE_THRESHOLD_MS) {
    return 'STALE';
  }
  return 'UNKNOWN';
}
