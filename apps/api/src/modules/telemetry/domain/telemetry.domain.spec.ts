import { describe, expect, it } from 'vitest';
import { TelemetryDeviceStatus } from '@vms/database';
import {
  assertValidCoordinates,
  assertValidSpeed,
  assertValidHeading,
  assertValidCapturedAt,
  calculateFreshnessStatus,
} from './telemetry.js';
import {
  assertValidDeviceName,
  assertValidDeviceIdentifier,
  assertValidDeviceStatusTransition,
  canTransitionDeviceStatus,
} from './device.js';
import {
  InvalidTelemetryCoordinatesError,
  InvalidTelemetryTimestampError,
  InvalidDeviceDataError,
  InvalidDeviceStatusTransitionError,
} from './telemetry-errors.js';

describe('Telemetry Domain Logic', () => {
  describe('assertValidCoordinates', () => {
    it('accepts valid coordinates', () => {
      expect(() => assertValidCoordinates(37.7749, -122.4194)).not.toThrow();
      expect(() => assertValidCoordinates(0, 0)).not.toThrow();
    });

    it('accepts boundary latitude and longitude', () => {
      expect(() => assertValidCoordinates(90, 180)).not.toThrow();
      expect(() => assertValidCoordinates(-90, -180)).not.toThrow();
    });

    it('rejects latitude greater than 90', () => {
      expect(() => assertValidCoordinates(90.0001, 0)).toThrow(InvalidTelemetryCoordinatesError);
    });

    it('rejects latitude less than -90', () => {
      expect(() => assertValidCoordinates(-90.1, 0)).toThrow(InvalidTelemetryCoordinatesError);
    });

    it('rejects longitude greater than 180', () => {
      expect(() => assertValidCoordinates(0, 180.0001)).toThrow(InvalidTelemetryCoordinatesError);
    });

    it('rejects longitude less than -180', () => {
      expect(() => assertValidCoordinates(0, -180.0001)).toThrow(InvalidTelemetryCoordinatesError);
    });

    it('rejects non-numeric, NaN, or non-finite coordinates', () => {
      expect(() => assertValidCoordinates(Number.NaN, 0)).toThrow(InvalidTelemetryCoordinatesError);
      expect(() => assertValidCoordinates(0, Number.POSITIVE_INFINITY)).toThrow(
        InvalidTelemetryCoordinatesError,
      );
      expect(() => assertValidCoordinates('37' as unknown as number, 10)).toThrow(
        InvalidTelemetryCoordinatesError,
      );
    });
  });

  describe('assertValidSpeed', () => {
    it('accepts speed in 0..300 range', () => {
      expect(() => assertValidSpeed(0)).not.toThrow();
      expect(() => assertValidSpeed(65.5)).not.toThrow();
      expect(() => assertValidSpeed(300)).not.toThrow();
    });

    it('rejects negative speed', () => {
      expect(() => assertValidSpeed(-0.1)).toThrow(InvalidDeviceDataError);
    });

    it('rejects speed over 300 km/h', () => {
      expect(() => assertValidSpeed(300.1)).toThrow(InvalidDeviceDataError);
    });

    it('rejects NaN or non-finite speed', () => {
      expect(() => assertValidSpeed(Number.NaN)).toThrow(InvalidDeviceDataError);
      expect(() => assertValidSpeed(Number.POSITIVE_INFINITY)).toThrow(InvalidDeviceDataError);
    });
  });

  describe('assertValidHeading', () => {
    it('accepts heading in 0..360 range', () => {
      expect(() => assertValidHeading(0)).not.toThrow();
      expect(() => assertValidHeading(180)).not.toThrow();
      expect(() => assertValidHeading(360)).not.toThrow();
    });

    it('rejects negative heading', () => {
      expect(() => assertValidHeading(-1)).toThrow(InvalidDeviceDataError);
    });

    it('rejects heading over 360', () => {
      expect(() => assertValidHeading(360.5)).toThrow(InvalidDeviceDataError);
    });

    it('rejects NaN or non-finite heading', () => {
      expect(() => assertValidHeading(Number.NaN)).toThrow(InvalidDeviceDataError);
    });
  });

  describe('assertValidCapturedAt', () => {
    it('accepts timestamps within allowable past/future range', () => {
      const receivedAt = new Date('2026-06-01T12:00:00Z');
      const capturedAt = new Date('2026-06-01T11:59:00Z'); // 1 minute in the past
      expect(() => assertValidCapturedAt(capturedAt, receivedAt)).not.toThrow();
    });

    it('accepts timestamp up to 5 minutes in the future', () => {
      const receivedAt = new Date('2026-06-01T12:00:00Z');
      const capturedAt = new Date('2026-06-01T12:04:30Z'); // 4.5 minutes in the future
      expect(() => assertValidCapturedAt(capturedAt, receivedAt)).not.toThrow();
    });

    it('rejects timestamp more than 5 minutes in the future', () => {
      const receivedAt = new Date('2026-06-01T12:00:00Z');
      const capturedAt = new Date('2026-06-01T12:05:01Z'); // 5 min 1 sec in future
      expect(() => assertValidCapturedAt(capturedAt, receivedAt)).toThrow(
        InvalidTelemetryTimestampError,
      );
    });

    it('rejects timestamp more than 365 days in the past', () => {
      const receivedAt = new Date('2026-06-01T12:00:00Z');
      const capturedAt = new Date('2025-05-31T11:59:00Z'); // 366 days in past
      expect(() => assertValidCapturedAt(capturedAt, receivedAt)).toThrow(
        InvalidTelemetryTimestampError,
      );
    });

    it('rejects invalid Date objects', () => {
      const receivedAt = new Date('2026-06-01T12:00:00Z');
      const invalidDate = new Date('invalid');
      expect(() => assertValidCapturedAt(invalidDate, receivedAt)).toThrow(
        InvalidTelemetryTimestampError,
      );
    });
  });

  describe('calculateFreshnessStatus', () => {
    it('returns FRESH when captured within 2 minutes', () => {
      const now = new Date('2026-06-01T12:02:00Z');
      const capturedAt = new Date('2026-06-01T12:01:00Z'); // 1 min ago
      expect(calculateFreshnessStatus(capturedAt, now)).toBe('FRESH');
    });

    it('returns STALE when captured between 2 minutes and 1 hour ago', () => {
      const now = new Date('2026-06-01T12:30:00Z');
      const capturedAt = new Date('2026-06-01T12:00:00Z'); // 30 min ago
      expect(calculateFreshnessStatus(capturedAt, now)).toBe('STALE');
    });

    it('returns UNKNOWN when captured more than 1 hour ago', () => {
      const now = new Date('2026-06-01T14:00:00Z');
      const capturedAt = new Date('2026-06-01T12:00:00Z'); // 2 hours ago
      expect(calculateFreshnessStatus(capturedAt, now)).toBe('UNKNOWN');
    });

    it('returns UNKNOWN for null, undefined, or future timestamp with large skew', () => {
      const now = new Date('2026-06-01T12:00:00Z');
      expect(calculateFreshnessStatus(null, now)).toBe('UNKNOWN');
      expect(calculateFreshnessStatus(undefined, now)).toBe('UNKNOWN');
      expect(calculateFreshnessStatus(new Date('2026-06-01T13:00:00Z'), now)).toBe('UNKNOWN');
    });
  });

  describe('Device Domain Logic', () => {
    it('allows valid device status transitions', () => {
      expect(
        canTransitionDeviceStatus(TelemetryDeviceStatus.ACTIVE, TelemetryDeviceStatus.INACTIVE),
      ).toBe(true);
      expect(
        canTransitionDeviceStatus(TelemetryDeviceStatus.ACTIVE, TelemetryDeviceStatus.SUSPENDED),
      ).toBe(true);
      expect(
        canTransitionDeviceStatus(TelemetryDeviceStatus.INACTIVE, TelemetryDeviceStatus.ACTIVE),
      ).toBe(true);
      expect(
        canTransitionDeviceStatus(TelemetryDeviceStatus.SUSPENDED, TelemetryDeviceStatus.ACTIVE),
      ).toBe(true);
      expect(
        canTransitionDeviceStatus(TelemetryDeviceStatus.SUSPENDED, TelemetryDeviceStatus.INACTIVE),
      ).toBe(true);
    });

    it('rejects invalid device status transitions', () => {
      expect(
        canTransitionDeviceStatus(TelemetryDeviceStatus.INACTIVE, TelemetryDeviceStatus.SUSPENDED),
      ).toBe(false);
      expect(
        canTransitionDeviceStatus(TelemetryDeviceStatus.ACTIVE, TelemetryDeviceStatus.ACTIVE),
      ).toBe(false);
      expect(() =>
        assertValidDeviceStatusTransition(
          TelemetryDeviceStatus.INACTIVE,
          TelemetryDeviceStatus.SUSPENDED,
        ),
      ).toThrow(InvalidDeviceStatusTransitionError);
    });

    it('validates device name', () => {
      expect(() => assertValidDeviceName('GPS Tracker A')).not.toThrow();
      expect(() => assertValidDeviceName('')).toThrow(InvalidDeviceDataError);
      expect(() => assertValidDeviceName('   ')).toThrow(InvalidDeviceDataError);
      expect(() => assertValidDeviceName('a'.repeat(201))).toThrow(InvalidDeviceDataError);
    });

    it('validates device identifier', () => {
      expect(() => assertValidDeviceIdentifier('IMEI-987654321012345')).not.toThrow();
      expect(() => assertValidDeviceIdentifier('')).toThrow(InvalidDeviceDataError);
      expect(() => assertValidDeviceIdentifier('   ')).toThrow(InvalidDeviceDataError);
      expect(() => assertValidDeviceIdentifier('x'.repeat(101))).toThrow(InvalidDeviceDataError);
    });
  });
});
