import { describe, expect, it } from 'vitest';

import { ApplicationError } from '../../foundation/domain/errors.js';
import {
  assertEndOdometer,
  assertStartOdometer,
  assertTripOperationalEligibility,
  assertTripPlanning,
  assertTripTransition,
  assertVehicleOdometerNoDecrease,
  calculateTripDistance,
  isTerminalTripStatus,
  isTripNonTerminal,
  normalizeOptionalText,
  normalizeTripReason,
  type TripStatus,
} from './trip.js';

describe('Trip domain model', () => {
  describe('lifecycle transitions', () => {
    it('allows valid lifecycle transitions from DRAFT', () => {
      expect(() => assertTripTransition('DRAFT', 'READY')).not.toThrow();
      expect(() => assertTripTransition('DRAFT', 'CANCELLED')).not.toThrow();
      expect(() => assertTripTransition('DRAFT', 'IN_PROGRESS')).toThrow(ApplicationError);
      expect(() => assertTripTransition('DRAFT', 'COMPLETED')).toThrow(ApplicationError);
      expect(() => assertTripTransition('DRAFT', 'ABORTED')).toThrow(ApplicationError);
    });

    it('allows valid lifecycle transitions from READY', () => {
      expect(() => assertTripTransition('READY', 'IN_PROGRESS')).not.toThrow();
      expect(() => assertTripTransition('READY', 'CANCELLED')).not.toThrow();
      expect(() => assertTripTransition('READY', 'DRAFT')).toThrow(ApplicationError);
      expect(() => assertTripTransition('READY', 'COMPLETED')).toThrow(ApplicationError);
      expect(() => assertTripTransition('READY', 'ABORTED')).toThrow(ApplicationError);
    });

    it('allows valid lifecycle transitions from IN_PROGRESS', () => {
      expect(() => assertTripTransition('IN_PROGRESS', 'COMPLETED')).not.toThrow();
      expect(() => assertTripTransition('IN_PROGRESS', 'ABORTED')).not.toThrow();
      expect(() => assertTripTransition('IN_PROGRESS', 'READY')).toThrow(ApplicationError);
      expect(() => assertTripTransition('IN_PROGRESS', 'DRAFT')).toThrow(ApplicationError);
      expect(() => assertTripTransition('IN_PROGRESS', 'CANCELLED')).toThrow(ApplicationError);
    });

    it('blocks any transition from terminal states', () => {
      const terminalStatuses: TripStatus[] = ['COMPLETED', 'CANCELLED', 'ABORTED'];
      const allStatuses: TripStatus[] = [
        'DRAFT',
        'READY',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED',
        'ABORTED',
      ];

      for (const terminal of terminalStatuses) {
        expect(isTerminalTripStatus(terminal)).toBe(true);
        expect(isTripNonTerminal(terminal)).toBe(false);

        for (const target of allStatuses) {
          try {
            assertTripTransition(terminal, target);
            expect.unreachable(`Should have thrown for ${terminal} -> ${target}`);
          } catch (err) {
            expect(err).toBeInstanceOf(ApplicationError);
            expect((err as ApplicationError).code).toBe('TRIP_ALREADY_TERMINAL');
          }
        }
      }
    });
  });

  describe('trip planning validation', () => {
    it('accepts valid origin and destination', () => {
      const result = assertTripPlanning(' Warehouse A ', ' Distribution Center B ');
      expect(result.origin).toBe('Warehouse A');
      expect(result.destination).toBe('Distribution Center B');
    });

    it('rejects empty or whitespace-only origin or destination', () => {
      expect(() => assertTripPlanning('', 'Dest')).toThrow(ApplicationError);
      expect(() => assertTripPlanning('   ', 'Dest')).toThrow(ApplicationError);
      expect(() => assertTripPlanning('Origin', '')).toThrow(ApplicationError);
      expect(() => assertTripPlanning('Origin', '   ')).toThrow(ApplicationError);
    });

    it('validates planned date order when both dates provided', () => {
      const now = new Date();
      const future = new Date(now.getTime() + 3600000);

      expect(() => assertTripPlanning('Origin', 'Dest', now, future)).not.toThrow();
      expect(() => assertTripPlanning('Origin', 'Dest', future, now)).toThrow(ApplicationError);
    });

    it('allows planning when only plannedStartAt or plannedEndAt is provided', () => {
      const now = new Date();
      expect(() => assertTripPlanning('Origin', 'Dest', now, null)).not.toThrow();
      expect(() => assertTripPlanning('Origin', 'Dest', null, now)).not.toThrow();
      expect(() => assertTripPlanning('Origin', 'Dest', null, null)).not.toThrow();
    });
  });

  describe('operational eligibility verification', () => {
    it('passes when all aggregate conditions are satisfied', () => {
      expect(() =>
        assertTripOperationalEligibility({
          assignmentStatus: 'ACTIVE',
          vehicleStatus: 'ACTIVE',
          driverStatus: 'ACTIVE',
          isDriverEligible: true,
        }),
      ).not.toThrow();
    });

    it('rejects non-ACTIVE assignment', () => {
      try {
        assertTripOperationalEligibility({
          assignmentStatus: 'ENDED',
          vehicleStatus: 'ACTIVE',
          driverStatus: 'ACTIVE',
          isDriverEligible: true,
        });
        expect.unreachable();
      } catch (err) {
        expect((err as ApplicationError).code).toBe('TRIP_ASSIGNMENT_NOT_ACTIVE');
      }
    });

    it('rejects non-ACTIVE vehicle', () => {
      try {
        assertTripOperationalEligibility({
          assignmentStatus: 'ACTIVE',
          vehicleStatus: 'DRAFT',
          driverStatus: 'ACTIVE',
          isDriverEligible: true,
        });
        expect.unreachable();
      } catch (err) {
        expect((err as ApplicationError).code).toBe('TRIP_VEHICLE_NOT_ACTIVE');
      }
    });

    it('rejects non-ACTIVE driver (e.g. SUSPENDED or INACTIVE)', () => {
      try {
        assertTripOperationalEligibility({
          assignmentStatus: 'ACTIVE',
          vehicleStatus: 'ACTIVE',
          driverStatus: 'SUSPENDED',
          isDriverEligible: true,
        });
        expect.unreachable();
      } catch (err) {
        expect((err as ApplicationError).code).toBe('TRIP_DRIVER_NOT_ACTIVE');
      }
    });

    it('rejects operationally ineligible driver (e.g. expired license)', () => {
      try {
        assertTripOperationalEligibility({
          assignmentStatus: 'ACTIVE',
          vehicleStatus: 'ACTIVE',
          driverStatus: 'ACTIVE',
          isDriverEligible: false,
        });
        expect.unreachable();
      } catch (err) {
        expect((err as ApplicationError).code).toBe('TRIP_DRIVER_NOT_ELIGIBLE');
      }
    });
  });

  describe('odometer progression and distance calculation', () => {
    it('validates start odometer >= current vehicle odometer', () => {
      expect(assertStartOdometer(10500, 10000)).toBe(10500);
      expect(assertStartOdometer(10000, 10000)).toBe(10000);

      expect(() => assertStartOdometer(9999, 10000)).toThrow(ApplicationError);
      expect(() => assertStartOdometer(-1, 0)).toThrow(ApplicationError);
      expect(() => assertStartOdometer(1.5, 0)).toThrow(ApplicationError);
    });

    it('validates end odometer >= start odometer', () => {
      expect(assertEndOdometer(10200, 10000)).toBe(10200);
      expect(assertEndOdometer(10000, 10000)).toBe(10000);

      expect(() => assertEndOdometer(9999, 10000)).toThrow(ApplicationError);
      expect(() => assertEndOdometer(-1, 0)).toThrow(ApplicationError);
    });

    it('calculates distance correctly', () => {
      expect(calculateTripDistance(10000, 10250)).toBe(250);
      expect(calculateTripDistance(5000, 5000)).toBe(0);
    });

    it('guards against vehicle odometer decrease', () => {
      expect(() => assertVehicleOdometerNoDecrease(10000, 10250)).not.toThrow();
      expect(() => assertVehicleOdometerNoDecrease(10000, 10000)).not.toThrow();
      expect(() => assertVehicleOdometerNoDecrease(10000, 9999)).toThrow(ApplicationError);
    });
  });

  describe('text and reason normalization', () => {
    it('normalizes cancellation and abort reasons', () => {
      expect(normalizeTripReason('  Customer canceled order  ', 'cancelReason')).toBe(
        'Customer canceled order',
      );
      expect(normalizeTripReason('  Engine breakdown on highway  ', 'abortReason')).toBe(
        'Engine breakdown on highway',
      );
      expect(() => normalizeTripReason('', 'cancelReason')).toThrow(ApplicationError);
      expect(() => normalizeTripReason('   ', 'abortReason')).toThrow(ApplicationError);
    });

    it('normalizes optional text and trims whitespace', () => {
      expect(normalizeOptionalText('  Some notes  ')).toBe('Some notes');
      expect(normalizeOptionalText('   ')).toBeNull();
      expect(normalizeOptionalText(null)).toBeNull();
      expect(normalizeOptionalText(undefined)).toBeNull();
    });
  });
});
