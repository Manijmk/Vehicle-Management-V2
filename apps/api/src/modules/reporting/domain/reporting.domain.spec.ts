import { describe, expect, it } from 'vitest';
import {
  calculateTripActiveOverlapSeconds,
  calculateTripTimeUtilizationPercent,
  escapeCsvFormulaInjection,
  normalizeReportTimeWindow,
  safeDivide,
  safePercentage,
} from './reporting-types.js';
import {
  calculateFreshnessStatus,
  FRESH_THRESHOLD_MS,
  STALE_THRESHOLD_MS,
} from '../../telemetry/domain/telemetry.js';

describe('Reporting Domain Functions', () => {
  describe('normalizeReportTimeWindow', () => {
    it('defaults to trailing 30 days when dates are omitted', () => {
      const window = normalizeReportTimeWindow();
      expect(window.timezone).toBe('UTC');
      const diffMs = window.to.getTime() - window.from.getTime();
      const expectedDiffMs = 30 * 24 * 60 * 60 * 1000;
      expect(Math.abs(diffMs - expectedDiffMs)).toBeLessThan(1000);
    });

    it('parses valid ISO string range correctly', () => {
      const window = normalizeReportTimeWindow(
        '2026-11-01T00:00:00.000Z',
        '2026-11-15T00:00:00.000Z',
      );
      expect(window.from.toISOString()).toBe('2026-11-01T00:00:00.000Z');
      expect(window.to.toISOString()).toBe('2026-11-15T00:00:00.000Z');
      expect(window.durationSeconds).toBe(14 * 24 * 3600);
      expect(window.timezone).toBe('UTC');
    });

    it('rejects when "to" is before or equal to "from"', () => {
      expect(() =>
        normalizeReportTimeWindow('2026-11-15T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
      ).toThrowError(/strictly after/i);

      expect(() =>
        normalizeReportTimeWindow('2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'),
      ).toThrowError(/strictly after/i);
    });

    it('rejects when range exceeds 366 days', () => {
      expect(() =>
        normalizeReportTimeWindow('2025-01-01T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
      ).toThrowError(/cannot exceed 366 days/i);
    });

    it('rejects invalid date strings', () => {
      expect(() => normalizeReportTimeWindow('invalid-date', '2026-11-15T00:00:00.000Z')).toThrow(
        /Invalid "from" date format/,
      );
      expect(() => normalizeReportTimeWindow('2026-11-01T00:00:00.000Z', 'invalid-date')).toThrow(
        /Invalid "to" date format/,
      );
    });
  });

  describe('calculateTripActiveOverlapSeconds', () => {
    const windowFrom = new Date('2026-11-10T00:00:00Z');
    const windowTo = new Date('2026-11-20T00:00:00Z');

    it('calculates full duration when trip is entirely inside window', () => {
      const trip = {
        actualStartAt: new Date('2026-11-12T10:00:00Z'),
        actualEndAt: new Date('2026-11-12T14:00:00Z'),
        status: 'COMPLETED',
      };
      const overlap = calculateTripActiveOverlapSeconds(trip, windowFrom, windowTo);
      expect(overlap).toBe(4 * 3600); // 4 hours
    });

    it('clips overlap when trip starts before window and ends inside', () => {
      const trip = {
        actualStartAt: new Date('2026-11-09T20:00:00Z'),
        actualEndAt: new Date('2026-11-10T04:00:00Z'),
        status: 'COMPLETED',
      };
      const overlap = calculateTripActiveOverlapSeconds(trip, windowFrom, windowTo);
      expect(overlap).toBe(4 * 3600); // Only 00:00 to 04:00 inside window
    });

    it('clips overlap when trip starts inside window and ends after', () => {
      const trip = {
        actualStartAt: new Date('2026-11-19T20:00:00Z'),
        actualEndAt: new Date('2026-11-20T08:00:00Z'),
        status: 'COMPLETED',
      };
      const overlap = calculateTripActiveOverlapSeconds(trip, windowFrom, windowTo);
      expect(overlap).toBe(4 * 3600); // Only 20:00 to 24:00 (windowTo) inside window
    });

    it('clips overlap to window boundaries when trip spans entire window', () => {
      const trip = {
        actualStartAt: new Date('2026-11-05T00:00:00Z'),
        actualEndAt: new Date('2026-11-25T00:00:00Z'),
        status: 'COMPLETED',
      };
      const overlap = calculateTripActiveOverlapSeconds(trip, windowFrom, windowTo);
      expect(overlap).toBe(10 * 24 * 3600); // Entire 10 days
    });

    it('returns 0 when trip is completely before or after window', () => {
      const beforeTrip = {
        actualStartAt: new Date('2026-11-01T00:00:00Z'),
        actualEndAt: new Date('2026-11-05T00:00:00Z'),
        status: 'COMPLETED',
      };
      expect(calculateTripActiveOverlapSeconds(beforeTrip, windowFrom, windowTo)).toBe(0);

      const afterTrip = {
        actualStartAt: new Date('2026-11-21T00:00:00Z'),
        actualEndAt: new Date('2026-11-25T00:00:00Z'),
        status: 'COMPLETED',
      };
      expect(calculateTripActiveOverlapSeconds(afterTrip, windowFrom, windowTo)).toBe(0);
    });

    it('handles IN_PROGRESS trip capping at min(referenceTime, windowTo)', () => {
      const trip = {
        actualStartAt: new Date('2026-11-15T00:00:00Z'),
        actualEndAt: null,
        status: 'IN_PROGRESS',
      };
      const referenceTime = new Date('2026-11-16T12:00:00Z'); // 36 hours after start
      const overlap = calculateTripActiveOverlapSeconds(trip, windowFrom, windowTo, referenceTime);
      expect(overlap).toBe(36 * 3600);
    });
  });

  describe('calculateTripTimeUtilizationPercent', () => {
    it('calculates correct utilization percentage', () => {
      const windowSeconds = 100 * 3600;
      const activeSeconds = 25 * 3600;
      expect(calculateTripTimeUtilizationPercent(activeSeconds, windowSeconds)).toBe(25);
    });

    it('returns 0 when window duration is 0 or negative', () => {
      expect(calculateTripTimeUtilizationPercent(100, 0)).toBe(0);
      expect(calculateTripTimeUtilizationPercent(100, -50)).toBe(0);
    });

    it('caps utilization at 100%', () => {
      expect(calculateTripTimeUtilizationPercent(150, 100)).toBe(100);
    });
  });

  describe('safeDivide and safePercentage', () => {
    it('returns null on zero or negative denominator', () => {
      expect(safeDivide(50, 0)).toBeNull();
      expect(safeDivide(50, -5)).toBeNull();
      expect(safePercentage(10, 0)).toBeNull();
      expect(safePercentage(10, -1)).toBeNull();
    });

    it('computes correct division and percentages', () => {
      expect(safeDivide(100, 4)).toBe(25);
      expect(safePercentage(25, 100)).toBe(25);
      expect(safePercentage(1, 3)).toBe(33.33);
    });
  });

  describe('escapeCsvFormulaInjection', () => {
    it('neutralizes formula triggers (=, +, -, @) by prefixing with a single quote', () => {
      expect(escapeCsvFormulaInjection('=SUM(1,2)')).toBe("'=SUM(1,2)");
      expect(escapeCsvFormulaInjection('+12345')).toBe("'+12345");
      expect(escapeCsvFormulaInjection('-10.50')).toBe("'-10.50");
      expect(escapeCsvFormulaInjection('@HYPERLINK("http://evil.com")')).toBe(
        '\'@HYPERLINK("http://evil.com")',
      );
      expect(escapeCsvFormulaInjection('  =MALICIOUS')).toBe("'  =MALICIOUS");
    });

    it('preserves safe text strings without modification', () => {
      expect(escapeCsvFormulaInjection('Ford Transit Custom')).toBe('Ford Transit Custom');
      expect(escapeCsvFormulaInjection('AB-123-CD')).toBe('AB-123-CD');
      expect(escapeCsvFormulaInjection('John Doe')).toBe('John Doe');
      expect(escapeCsvFormulaInjection('100.50')).toBe('100.50');
    });
  });

  describe('Shared Telemetry Freshness Policy & Boundaries', () => {
    it('verifies exact M12 freshness threshold constants', () => {
      expect(FRESH_THRESHOLD_MS).toBe(120_000); // 2 minutes
      expect(STALE_THRESHOLD_MS).toBe(3_600_000); // 1 hour (60 minutes)
    });

    it('evaluates timestamps precisely against freshness boundaries', () => {
      const now = new Date('2026-11-12T12:00:00Z');

      // 1 minute ago -> FRESH
      const t1m = new Date(now.getTime() - 60_000);
      expect(calculateFreshnessStatus(t1m, now)).toBe('FRESH');

      // Exactly at 2 minutes boundary -> FRESH
      const t2m = new Date(now.getTime() - FRESH_THRESHOLD_MS);
      expect(calculateFreshnessStatus(t2m, now)).toBe('FRESH');

      // 2 minutes + 1 ms -> STALE
      const t2mPlus = new Date(now.getTime() - (FRESH_THRESHOLD_MS + 1));
      expect(calculateFreshnessStatus(t2mPlus, now)).toBe('STALE');

      // 30 minutes ago -> STALE
      const t30m = new Date(now.getTime() - 30 * 60_000);
      expect(calculateFreshnessStatus(t30m, now)).toBe('STALE');

      // Exactly at 60 minutes boundary -> STALE
      const t60m = new Date(now.getTime() - STALE_THRESHOLD_MS);
      expect(calculateFreshnessStatus(t60m, now)).toBe('STALE');

      // 60 minutes + 1 ms -> UNKNOWN
      const t60mPlus = new Date(now.getTime() - (STALE_THRESHOLD_MS + 1));
      expect(calculateFreshnessStatus(t60mPlus, now)).toBe('UNKNOWN');

      // Null, undefined, or future (>5s) -> UNKNOWN
      expect(calculateFreshnessStatus(null, now)).toBe('UNKNOWN');
      expect(calculateFreshnessStatus(undefined, now)).toBe('UNKNOWN');
      expect(calculateFreshnessStatus(new Date(now.getTime() + 10_000), now)).toBe('UNKNOWN');
    });
  });
});
