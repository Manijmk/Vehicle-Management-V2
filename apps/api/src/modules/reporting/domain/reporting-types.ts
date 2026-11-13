import { ApplicationError } from '../../foundation/domain/errors.js';

export interface ReportTimeWindow {
  readonly from: Date;
  readonly to: Date;
  readonly timezone: 'UTC';
  readonly durationSeconds: number;
}

export const MAX_INTERACTIVE_REPORT_DAYS = 366;
export const DEFAULT_REPORT_WINDOW_DAYS = 30;

export function normalizeReportTimeWindow(fromStr?: string, toStr?: string): ReportTimeWindow {
  const to = toStr ? new Date(toStr) : new Date();
  if (isNaN(to.getTime())) {
    throw new ApplicationError('REPORT_INVALID_DATE_RANGE', 'Invalid "to" date format');
  }

  const from = fromStr
    ? new Date(fromStr)
    : new Date(to.getTime() - DEFAULT_REPORT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  if (isNaN(from.getTime())) {
    throw new ApplicationError('REPORT_INVALID_DATE_RANGE', 'Invalid "from" date format');
  }

  if (to.getTime() <= from.getTime()) {
    throw new ApplicationError(
      'REPORT_INVALID_DATE_RANGE',
      'The "to" date must be strictly after the "from" date',
    );
  }

  const durationMs = to.getTime() - from.getTime();
  const maxMs = MAX_INTERACTIVE_REPORT_DAYS * 24 * 60 * 60 * 1000;
  if (durationMs > maxMs) {
    throw new ApplicationError(
      'REPORT_RANGE_TOO_LARGE',
      `Date range cannot exceed ${MAX_INTERACTIVE_REPORT_DAYS} days`,
    );
  }

  return {
    from,
    to,
    timezone: 'UTC',
    durationSeconds: Math.floor(durationMs / 1000),
  };
}

export interface TripOverlapParams {
  readonly actualStartAt: Date;
  readonly actualEndAt: Date | null;
  readonly status: string;
}

export function calculateTripActiveOverlapSeconds(
  trip: TripOverlapParams,
  windowFrom: Date,
  windowTo: Date,
  referenceTime: Date = new Date(),
): number {
  const tripStart = trip.actualStartAt;
  let tripEnd: Date;

  if (trip.actualEndAt !== null) {
    tripEnd = trip.actualEndAt;
  } else if (trip.status === 'IN_PROGRESS') {
    // For in-progress trip, cap at min(referenceTime, windowTo)
    tripEnd = referenceTime.getTime() < windowTo.getTime() ? referenceTime : windowTo;
  } else {
    tripEnd = tripStart;
  }

  // If trip ends before window or starts after window, overlap is 0
  if (tripEnd.getTime() <= windowFrom.getTime() || tripStart.getTime() >= windowTo.getTime()) {
    return 0;
  }

  const clippedStart =
    tripStart.getTime() > windowFrom.getTime() ? tripStart.getTime() : windowFrom.getTime();
  const clippedEnd =
    tripEnd.getTime() < windowTo.getTime() ? tripEnd.getTime() : windowTo.getTime();

  const overlapMs = clippedEnd - clippedStart;
  return overlapMs > 0 ? Math.floor(overlapMs / 1000) : 0;
}

export function calculateTripTimeUtilizationPercent(
  activeTripDurationSeconds: number,
  reportWindowDurationSeconds: number,
): number {
  if (reportWindowDurationSeconds <= 0) return 0;
  const raw = (activeTripDurationSeconds / reportWindowDurationSeconds) * 100;
  return Math.min(100, Math.max(0, Math.round(raw * 100) / 100));
}

export function safeDivide(numerator: number, denominator: number): number | null {
  if (denominator <= 0 || !Number.isFinite(denominator) || !Number.isFinite(numerator)) {
    return null;
  }
  return Math.round((numerator / denominator) * 100) / 100;
}

export function safePercentage(numerator: number, denominator: number): number | null {
  if (denominator <= 0 || !Number.isFinite(denominator) || !Number.isFinite(numerator)) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round((numerator / denominator) * 10000) / 100));
}

export function escapeCsvFormulaInjection(value: string): string {
  if (typeof value !== 'string') return String(value ?? '');
  const trimmed = value.trim();
  if (
    trimmed.startsWith('=') ||
    trimmed.startsWith('+') ||
    trimmed.startsWith('-') ||
    trimmed.startsWith('@')
  ) {
    return `'${value}`;
  }
  return value;
}
