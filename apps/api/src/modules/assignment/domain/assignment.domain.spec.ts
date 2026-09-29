import { describe, expect, it } from 'vitest';

import {
  assertAssignmentDates,
  assertAssignmentTransition,
  assertDriverEligibleForAssignment,
  assertVehicleEligibleForAssignment,
  normalizeEndReason,
  normalizeNotes,
} from './assignment.js';

describe('Assignment Domain Rules', () => {
  describe('Lifecycle State Machine Transitions', () => {
    it('allows transition from ACTIVE to ENDED', () => {
      expect(() => assertAssignmentTransition('ACTIVE', 'ENDED')).not.toThrow();
    });

    it('rejects transition from ENDED to ACTIVE', () => {
      expect(() => assertAssignmentTransition('ENDED', 'ACTIVE')).toThrowError(
        'Assignment has already ended and cannot be transitioned further',
      );
    });

    it('rejects transition from ENDED to ENDED', () => {
      expect(() => assertAssignmentTransition('ENDED', 'ENDED')).toThrowError(
        'Assignment has already ended and cannot be transitioned further',
      );
    });

    it('rejects invalid transition from ACTIVE to ACTIVE', () => {
      expect(() => assertAssignmentTransition('ACTIVE', 'ACTIVE')).toThrowError(
        'Cannot transition assignment status from ACTIVE to ACTIVE',
      );
    });
  });

  describe('Vehicle Operational Eligibility', () => {
    it('allows ACTIVE vehicles to be assigned', () => {
      expect(() => assertVehicleEligibleForAssignment('ACTIVE')).not.toThrow();
    });

    it('rejects DRAFT vehicles from assignment', () => {
      expect(() => assertVehicleEligibleForAssignment('DRAFT')).toThrowError(
        'Vehicle must be in ACTIVE status to be assigned',
      );
    });

    it('rejects RETIRED vehicles from assignment', () => {
      expect(() => assertVehicleEligibleForAssignment('RETIRED')).toThrowError(
        'Vehicle must be in ACTIVE status to be assigned',
      );
    });
  });

  describe('Driver Operational Eligibility', () => {
    it('allows ACTIVE drivers with valid licenses to be assigned', () => {
      expect(() => assertDriverEligibleForAssignment('ACTIVE', true)).not.toThrow();
    });

    it('rejects DRAFT drivers from assignment', () => {
      expect(() => assertDriverEligibleForAssignment('DRAFT', true)).toThrowError(
        'Driver must be in ACTIVE status to be assigned',
      );
    });

    it('rejects SUSPENDED drivers from assignment', () => {
      expect(() => assertDriverEligibleForAssignment('SUSPENDED', true)).toThrowError(
        'Driver must be in ACTIVE status to be assigned',
      );
    });

    it('rejects INACTIVE drivers from assignment', () => {
      expect(() => assertDriverEligibleForAssignment('INACTIVE', true)).toThrowError(
        'Driver must be in ACTIVE status to be assigned',
      );
    });

    it('rejects ACTIVE drivers without operational eligibility (expired/missing licenses)', () => {
      expect(() => assertDriverEligibleForAssignment('ACTIVE', false)).toThrowError(
        'Driver is not operationally eligible (must have at least one valid, unexpired license)',
      );
    });
  });

  describe('Date Assertions', () => {
    it('allows valid dates where endedAt is after startedAt', () => {
      const startedAt = new Date('2026-09-01T10:00:00Z');
      const endedAt = new Date('2026-09-02T10:00:00Z');
      expect(() => assertAssignmentDates(startedAt, endedAt)).not.toThrow();
    });

    it('allows null endedAt for ongoing assignments', () => {
      const startedAt = new Date('2026-09-01T10:00:00Z');
      expect(() => assertAssignmentDates(startedAt, null)).not.toThrow();
    });

    it('rejects endedAt that precedes startedAt', () => {
      const startedAt = new Date('2026-09-02T10:00:00Z');
      const endedAt = new Date('2026-09-01T10:00:00Z');
      expect(() => assertAssignmentDates(startedAt, endedAt)).toThrowError(
        'Assignment end date cannot precede start date',
      );
    });
  });

  describe('Field Normalizations', () => {
    it('normalizes endReason correctly and rejects empty string', () => {
      expect(normalizeEndReason('  Shift completed  ')).toBe('Shift completed');
      expect(() => normalizeEndReason('')).toThrowError(
        'End reason is required when ending an assignment',
      );
      expect(() => normalizeEndReason('   ')).toThrowError(
        'End reason is required when ending an assignment',
      );
      expect(() => normalizeEndReason(undefined)).toThrowError(
        'End reason is required when ending an assignment',
      );
    });

    it('normalizes notes correctly', () => {
      expect(normalizeNotes('  Test notes  ')).toBe('Test notes');
      expect(normalizeNotes('   ')).toBeNull();
      expect(normalizeNotes(undefined)).toBeNull();
      expect(normalizeNotes(null)).toBeNull();
    });
  });
});
