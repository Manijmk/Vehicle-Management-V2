import { describe, expect, it } from 'vitest';
import {
  assertAllowedIncidentTransition,
  assertValidCancellation,
  assertValidResolution,
  doesIncidentBlockDriver,
  doesIncidentBlockVehicle,
  isActiveOperationalStatus,
  isTerminalIncidentStatus,
  validateIncidentOccurredAt,
  validateIncidentSubjects,
  validateOperationalImpactConsistency,
  validateTripParticipantsMatch,
} from './incident.js';
import {
  IncidentAlreadyTerminalError,
  IncidentCancelReasonRequiredError,
  IncidentOccurredAtInvalidError,
  IncidentResolutionRequiredError,
  IncidentSubjectRequiredError,
  IncidentTripParticipantMismatchError,
  InvalidIncidentTransitionError,
} from './incident-errors.js';

describe('Incident Domain Model', () => {
  describe('Subject Validation', () => {
    it('accepts when vehicleId is provided', () => {
      expect(() =>
        validateIncidentSubjects({ vehicleId: '00000000-0000-0000-0000-000000000001' }),
      ).not.toThrow();
    });

    it('accepts when driverId is provided', () => {
      expect(() =>
        validateIncidentSubjects({ driverId: '00000000-0000-0000-0000-000000000002' }),
      ).not.toThrow();
    });

    it('accepts when tripId is provided', () => {
      expect(() =>
        validateIncidentSubjects({ tripId: '00000000-0000-0000-0000-000000000003' }),
      ).not.toThrow();
    });

    it('rejects when no operational subject is provided', () => {
      expect(() => validateIncidentSubjects({})).toThrow(IncidentSubjectRequiredError);
      expect(() =>
        validateIncidentSubjects({ vehicleId: null, driverId: null, tripId: null }),
      ).toThrow(IncidentSubjectRequiredError);
    });
  });

  describe('Operational Impact Consistency', () => {
    it('allows NONE for any subjects', () => {
      expect(() => validateOperationalImpactConsistency('NONE', null, null)).not.toThrow();
      expect(() => validateOperationalImpactConsistency('NONE', 'v-1', null)).not.toThrow();
      expect(() => validateOperationalImpactConsistency('NONE', null, 'd-1')).not.toThrow();
    });

    it('requires vehicleId when impact is VEHICLE', () => {
      expect(() => validateOperationalImpactConsistency('VEHICLE', 'v-1', null)).not.toThrow();
      expect(() => validateOperationalImpactConsistency('VEHICLE', null, 'd-1')).toThrow(
        IncidentSubjectRequiredError,
      );
    });

    it('requires driverId when impact is DRIVER', () => {
      expect(() => validateOperationalImpactConsistency('DRIVER', null, 'd-1')).not.toThrow();
      expect(() => validateOperationalImpactConsistency('DRIVER', 'v-1', null)).toThrow(
        IncidentSubjectRequiredError,
      );
    });

    it('requires both vehicleId and driverId when impact is BOTH', () => {
      expect(() => validateOperationalImpactConsistency('BOTH', 'v-1', 'd-1')).not.toThrow();
      expect(() => validateOperationalImpactConsistency('BOTH', 'v-1', null)).toThrow(
        IncidentSubjectRequiredError,
      );
      expect(() => validateOperationalImpactConsistency('BOTH', null, 'd-1')).toThrow(
        IncidentSubjectRequiredError,
      );
    });
  });

  describe('Occurred At Validation', () => {
    it('accepts valid historical time', () => {
      const past = new Date(Date.now() - 3600 * 1000);
      expect(() => validateIncidentOccurredAt(past)).not.toThrow();
    });

    it('accepts within 5-minute clock skew tolerance', () => {
      const slightFuture = new Date(Date.now() + 2 * 60 * 1000);
      expect(() => validateIncidentOccurredAt(slightFuture)).not.toThrow();
    });

    it('rejects timestamps far in the future', () => {
      const farFuture = new Date(Date.now() + 10 * 60 * 1000);
      expect(() => validateIncidentOccurredAt(farFuture)).toThrow(IncidentOccurredAtInvalidError);
    });

    it('rejects invalid date', () => {
      expect(() => validateIncidentOccurredAt(new Date('invalid'))).toThrow(
        IncidentOccurredAtInvalidError,
      );
    });
  });

  describe('Trip Participant Integrity', () => {
    const trip = {
      vehicleId: 'v-100',
      driverId: 'd-100',
      assignmentId: 'a-100',
    };

    it('accepts matching participants', () => {
      expect(() =>
        validateTripParticipantsMatch(trip, { vehicleId: 'v-100', driverId: 'd-100' }),
      ).not.toThrow();
    });

    it('accepts omitted participants when trip is provided', () => {
      expect(() => validateTripParticipantsMatch(trip, {})).not.toThrow();
    });

    it('rejects mismatched vehicleId', () => {
      expect(() =>
        validateTripParticipantsMatch(trip, { vehicleId: 'v-wrong', driverId: 'd-100' }),
      ).toThrow(IncidentTripParticipantMismatchError);
    });

    it('rejects mismatched driverId', () => {
      expect(() =>
        validateTripParticipantsMatch(trip, { vehicleId: 'v-100', driverId: 'd-wrong' }),
      ).toThrow(IncidentTripParticipantMismatchError);
    });
  });

  describe('Lifecycle State Transitions', () => {
    it('identifies terminal and active statuses correctly', () => {
      expect(isTerminalIncidentStatus('CLOSED')).toBe(true);
      expect(isTerminalIncidentStatus('CANCELLED')).toBe(true);
      expect(isTerminalIncidentStatus('REPORTED')).toBe(false);
      expect(isTerminalIncidentStatus('INVESTIGATING')).toBe(false);
      expect(isTerminalIncidentStatus('RESOLVED')).toBe(false);

      expect(isActiveOperationalStatus('REPORTED')).toBe(true);
      expect(isActiveOperationalStatus('INVESTIGATING')).toBe(true);
      expect(isActiveOperationalStatus('RESOLVED')).toBe(false);
      expect(isActiveOperationalStatus('CLOSED')).toBe(false);
      expect(isActiveOperationalStatus('CANCELLED')).toBe(false);
    });

    it('allows valid transitions from REPORTED', () => {
      expect(() => assertAllowedIncidentTransition('REPORTED', 'INVESTIGATING')).not.toThrow();
      expect(() => assertAllowedIncidentTransition('REPORTED', 'RESOLVED')).not.toThrow();
      expect(() => assertAllowedIncidentTransition('REPORTED', 'CANCELLED')).not.toThrow();
    });

    it('allows valid transitions from INVESTIGATING', () => {
      expect(() => assertAllowedIncidentTransition('INVESTIGATING', 'RESOLVED')).not.toThrow();
      expect(() => assertAllowedIncidentTransition('INVESTIGATING', 'CANCELLED')).not.toThrow();
    });

    it('allows valid transitions from RESOLVED', () => {
      expect(() => assertAllowedIncidentTransition('RESOLVED', 'CLOSED')).not.toThrow();
    });

    it('rejects invalid transitions', () => {
      expect(() => assertAllowedIncidentTransition('REPORTED', 'CLOSED')).toThrow(
        InvalidIncidentTransitionError,
      );
      expect(() => assertAllowedIncidentTransition('INVESTIGATING', 'CLOSED')).toThrow(
        InvalidIncidentTransitionError,
      );
      expect(() => assertAllowedIncidentTransition('RESOLVED', 'INVESTIGATING')).toThrow(
        InvalidIncidentTransitionError,
      );
    });

    it('rejects any transition from terminal states', () => {
      expect(() => assertAllowedIncidentTransition('CLOSED', 'REPORTED')).toThrow(
        IncidentAlreadyTerminalError,
      );
      expect(() => assertAllowedIncidentTransition('CLOSED', 'INVESTIGATING')).toThrow(
        IncidentAlreadyTerminalError,
      );
      expect(() => assertAllowedIncidentTransition('CANCELLED', 'REPORTED')).toThrow(
        IncidentAlreadyTerminalError,
      );
    });
  });

  describe('Resolution and Cancellation Validation', () => {
    it('validates resolution summary is required and trimmed', () => {
      expect(() => assertValidResolution('')).toThrow(IncidentResolutionRequiredError);
      expect(() => assertValidResolution('   ')).toThrow(IncidentResolutionRequiredError);
      expect(assertValidResolution('Resolved repair completed')).toBe('Resolved repair completed');
    });

    it('validates cancel reason is required and trimmed', () => {
      expect(() => assertValidCancellation('')).toThrow(IncidentCancelReasonRequiredError);
      expect(() => assertValidCancellation('   ')).toThrow(IncidentCancelReasonRequiredError);
      expect(assertValidCancellation('Duplicate report')).toBe('Duplicate report');
    });
  });

  describe('Operational Block Derivation', () => {
    it('blocks vehicle when status is REPORTED or INVESTIGATING and impact is VEHICLE or BOTH', () => {
      expect(doesIncidentBlockVehicle('REPORTED', 'VEHICLE')).toBe(true);
      expect(doesIncidentBlockVehicle('REPORTED', 'BOTH')).toBe(true);
      expect(doesIncidentBlockVehicle('INVESTIGATING', 'VEHICLE')).toBe(true);
      expect(doesIncidentBlockVehicle('INVESTIGATING', 'BOTH')).toBe(true);

      expect(doesIncidentBlockVehicle('REPORTED', 'DRIVER')).toBe(false);
      expect(doesIncidentBlockVehicle('REPORTED', 'NONE')).toBe(false);
      expect(doesIncidentBlockVehicle('RESOLVED', 'VEHICLE')).toBe(false);
      expect(doesIncidentBlockVehicle('CLOSED', 'VEHICLE')).toBe(false);
      expect(doesIncidentBlockVehicle('CANCELLED', 'VEHICLE')).toBe(false);
    });

    it('blocks driver when status is REPORTED or INVESTIGATING and impact is DRIVER or BOTH', () => {
      expect(doesIncidentBlockDriver('REPORTED', 'DRIVER')).toBe(true);
      expect(doesIncidentBlockDriver('REPORTED', 'BOTH')).toBe(true);
      expect(doesIncidentBlockDriver('INVESTIGATING', 'DRIVER')).toBe(true);
      expect(doesIncidentBlockDriver('INVESTIGATING', 'BOTH')).toBe(true);

      expect(doesIncidentBlockDriver('REPORTED', 'VEHICLE')).toBe(false);
      expect(doesIncidentBlockDriver('REPORTED', 'NONE')).toBe(false);
      expect(doesIncidentBlockDriver('RESOLVED', 'DRIVER')).toBe(false);
      expect(doesIncidentBlockDriver('CLOSED', 'DRIVER')).toBe(false);
      expect(doesIncidentBlockDriver('CANCELLED', 'DRIVER')).toBe(false);
    });
  });
});
