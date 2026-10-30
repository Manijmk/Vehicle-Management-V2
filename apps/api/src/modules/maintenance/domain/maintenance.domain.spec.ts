import { describe, expect, it } from 'vitest';

import {
  assertPlanCanBeActivated,
  assertPlanCanBeArchived,
  assertPlanCanBeEdited,
  assertRequestCanBeCancelled,
  assertRequestCanBeConverted,
  assertVehicleOperationallyAvailable,
  assertWorkOrderCanBeCancelled,
  assertWorkOrderCanBeCompleted,
  assertWorkOrderTransition,
  calculateInitialDueThresholds,
  calculateResetDueThresholds,
  calculateWorkOrderTotals,
  deriveScheduleDueState,
  isTerminalPlanStatus,
  isTerminalRequestStatus,
  isTerminalWorkOrderStatus,
  isVehicleOperationallyBlocked,
} from './index.js';

describe('Maintenance Domain Aggregate Invariants', () => {
  describe('MaintenanceRequest', () => {
    it('identifies terminal statuses correctly', () => {
      expect(isTerminalRequestStatus('OPEN')).toBe(false);
      expect(isTerminalRequestStatus('CONVERTED')).toBe(true);
      expect(isTerminalRequestStatus('CANCELLED')).toBe(true);
    });

    it('allows conversion when OPEN, rejects when CONVERTED or CANCELLED', () => {
      expect(() => assertRequestCanBeConverted('OPEN')).not.toThrow();
      expect(() => assertRequestCanBeConverted('CONVERTED')).toThrowError(/already been converted/);
      expect(() => assertRequestCanBeConverted('CANCELLED')).toThrowError(/cancelled/);
    });

    it('allows cancellation with valid reason, rejects without reason or if terminal', () => {
      expect(() => assertRequestCanBeCancelled('OPEN', 'Duplicate request')).not.toThrow();
      expect(() => assertRequestCanBeCancelled('OPEN', '')).toThrowError(
        /Cancel reason is required/,
      );
      expect(() => assertRequestCanBeCancelled('OPEN', 'ab')).toThrowError(
        /Cancel reason is required/,
      );
      expect(() => assertRequestCanBeCancelled('CONVERTED', 'Valid reason')).toThrowError(
        /terminal/,
      );
      expect(() => assertRequestCanBeCancelled('CANCELLED', 'Valid reason')).toThrowError(
        /terminal/,
      );
    });
  });

  describe('MaintenancePlan', () => {
    it('identifies terminal statuses correctly', () => {
      expect(isTerminalPlanStatus('DRAFT')).toBe(false);
      expect(isTerminalPlanStatus('ACTIVE')).toBe(false);
      expect(isTerminalPlanStatus('ARCHIVED')).toBe(true);
    });

    it('requires at least one interval (days or odo) for activation', () => {
      expect(() => assertPlanCanBeActivated('DRAFT', null, null)).toThrowError(/trigger interval/);
      expect(() => assertPlanCanBeActivated('DRAFT', 0, 0)).toThrowError(/trigger interval/);
      expect(() => assertPlanCanBeActivated('DRAFT', 90, null)).not.toThrow();
      expect(() => assertPlanCanBeActivated('DRAFT', null, 5000)).not.toThrow();
      expect(() => assertPlanCanBeActivated('DRAFT', 180, 10000)).not.toThrow();
      expect(() => assertPlanCanBeActivated('ACTIVE', 90, null)).not.toThrow();
      expect(() => assertPlanCanBeActivated('ARCHIVED', 90, null)).toThrowError(/archived/);
    });

    it('enforces plan immutability once activated or archived', () => {
      expect(() => assertPlanCanBeEdited('DRAFT')).not.toThrow();
      expect(() => assertPlanCanBeEdited('ACTIVE')).toThrowError(/immutable/);
      expect(() => assertPlanCanBeEdited('ARCHIVED')).toThrowError(/immutable/);
    });

    it('allows archiving', () => {
      expect(() => assertPlanCanBeArchived('DRAFT')).not.toThrow();
      expect(() => assertPlanCanBeArchived('ACTIVE')).not.toThrow();
      expect(() => assertPlanCanBeArchived('ARCHIVED')).not.toThrow();
    });
  });

  describe('VehicleMaintenanceSchedule Due Thresholds', () => {
    const baseDate = new Date('2026-10-01T00:00:00Z');

    it('calculates initial thresholds for date and odometer intervals', () => {
      const thresholds = calculateInitialDueThresholds(
        { intervalDays: 30, intervalOdometerKm: 5000 },
        12000,
        baseDate,
      );
      expect(thresholds.nextDueAt).toEqual(new Date('2026-10-31T00:00:00.000Z'));
      expect(thresholds.nextDueOdometerKm).toBe(17000);
    });

    it('calculates reset thresholds upon work order completion', () => {
      const completionDate = new Date('2026-10-25T10:00:00Z');
      const reset = calculateResetDueThresholds(
        { intervalDays: 60, intervalOdometerKm: 10000 },
        15000,
        completionDate,
      );
      expect(reset.lastCompletedAt).toEqual(completionDate);
      expect(reset.lastCompletedOdometerKm).toBe(15000);
      expect(reset.nextDueAt).toEqual(new Date('2026-12-24T10:00:00.000Z'));
      expect(reset.nextDueOdometerKm).toBe(25000);
    });

    it('derives UPCOMING, DUE, and OVERDUE state deterministically', () => {
      const schedule = {
        nextDueAt: new Date('2026-10-20T00:00:00Z'),
        nextDueOdometerKm: 20000,
      };

      // Before due date & below odometer -> UPCOMING
      expect(deriveScheduleDueState(schedule, 19500, new Date('2026-10-15T00:00:00Z'))).toBe(
        'UPCOMING',
      );

      // Reached odometer exactly -> DUE
      expect(deriveScheduleDueState(schedule, 20000, new Date('2026-10-15T00:00:00Z'))).toBe('DUE');

      // Exceeded odometer -> OVERDUE
      expect(deriveScheduleDueState(schedule, 20001, new Date('2026-10-15T00:00:00Z'))).toBe(
        'OVERDUE',
      );

      // Reached due date exactly -> DUE
      expect(deriveScheduleDueState(schedule, 19000, new Date('2026-10-20T00:00:00Z'))).toBe('DUE');

      // Passed due date -> OVERDUE
      expect(deriveScheduleDueState(schedule, 19000, new Date('2026-10-21T00:00:00Z'))).toBe(
        'OVERDUE',
      );
    });
  });

  describe('MaintenanceWorkOrder Lifecycle & Tasks', () => {
    it('identifies terminal statuses correctly', () => {
      expect(isTerminalWorkOrderStatus('DRAFT')).toBe(false);
      expect(isTerminalWorkOrderStatus('OPEN')).toBe(false);
      expect(isTerminalWorkOrderStatus('IN_PROGRESS')).toBe(false);
      expect(isTerminalWorkOrderStatus('COMPLETED')).toBe(true);
      expect(isTerminalWorkOrderStatus('CANCELLED')).toBe(true);
    });

    it('enforces allowed state machine transitions', () => {
      expect(() => assertWorkOrderTransition('DRAFT', 'OPEN')).not.toThrow();
      expect(() => assertWorkOrderTransition('OPEN', 'IN_PROGRESS')).not.toThrow();
      expect(() => assertWorkOrderTransition('IN_PROGRESS', 'COMPLETED')).not.toThrow();
      expect(() => assertWorkOrderTransition('DRAFT', 'CANCELLED')).not.toThrow();
      expect(() => assertWorkOrderTransition('OPEN', 'CANCELLED')).not.toThrow();
      expect(() => assertWorkOrderTransition('IN_PROGRESS', 'CANCELLED')).not.toThrow();

      // Disallowed transitions
      expect(() => assertWorkOrderTransition('DRAFT', 'COMPLETED')).toThrowError(
        /Cannot transition/,
      );
      expect(() => assertWorkOrderTransition('OPEN', 'COMPLETED')).toThrowError(
        /Cannot transition/,
      );
      expect(() => assertWorkOrderTransition('COMPLETED', 'OPEN')).toThrowError(/terminal/);
      expect(() => assertWorkOrderTransition('CANCELLED', 'OPEN')).toThrowError(/terminal/);
    });

    it('validates completion requirements (tasks, notes, odometer)', () => {
      const allDone = [{ status: 'COMPLETED' as const }, { status: 'SKIPPED' as const }];
      const hasPending = [{ status: 'COMPLETED' as const }, { status: 'PENDING' as const }];

      // Rejects if tasks incomplete
      expect(() =>
        assertWorkOrderCanBeCompleted('IN_PROGRESS', hasPending, 'Done', 50000, 48000),
      ).toThrowError(/All tasks must be completed or skipped/);

      // Rejects without notes
      expect(() =>
        assertWorkOrderCanBeCompleted('IN_PROGRESS', allDone, '', 50000, 48000),
      ).toThrowError(/Completion notes are mandatory/);

      // Rejects odometer rollback
      expect(() =>
        assertWorkOrderCanBeCompleted('IN_PROGRESS', allDone, 'Done', 47000, 48000),
      ).toThrowError(/cannot be less than current vehicle odometer/);

      // Accepts valid completion
      expect(() =>
        assertWorkOrderCanBeCompleted(
          'IN_PROGRESS',
          allDone,
          'Work finished successfully',
          49000,
          48000,
        ),
      ).not.toThrow();
    });

    it('validates cancellation requirements', () => {
      expect(() => assertWorkOrderCanBeCancelled('OPEN', 'Vendor unavailable')).not.toThrow();
      expect(() => assertWorkOrderCanBeCancelled('OPEN', '')).toThrowError(
        /Cancel reason is required/,
      );
      expect(() => assertWorkOrderCanBeCancelled('COMPLETED', 'Reason')).toThrowError(/terminal/);
    });

    it('calculates parts, labor, and grand totals accurately', () => {
      const parts = [{ totalCost: 150.25 }, { totalCost: 49.75 }];
      const labor = [{ totalCost: 120.0 }, { totalCost: 80.5 }];
      const totals = calculateWorkOrderTotals(parts, labor);
      expect(totals.partsTotal).toBe(200.0);
      expect(totals.laborTotal).toBe(200.5);
      expect(totals.totalCost).toBe(400.5);
    });
  });

  describe('VehicleMaintenanceAvailability', () => {
    it('determines operational blocking correctly', () => {
      expect(
        isVehicleOperationallyBlocked({
          openBlockingRequestsCount: 0,
          activeBlockingWorkOrdersCount: 0,
        }),
      ).toBe(false);

      expect(
        isVehicleOperationallyBlocked({
          openBlockingRequestsCount: 1,
          activeBlockingWorkOrdersCount: 0,
        }),
      ).toBe(true);

      expect(
        isVehicleOperationallyBlocked({
          openBlockingRequestsCount: 0,
          activeBlockingWorkOrdersCount: 1,
        }),
      ).toBe(true);

      expect(() =>
        assertVehicleOperationallyAvailable({
          openBlockingRequestsCount: 0,
          activeBlockingWorkOrdersCount: 0,
        }),
      ).not.toThrow();

      expect(() =>
        assertVehicleOperationallyAvailable({
          openBlockingRequestsCount: 1,
          activeBlockingWorkOrdersCount: 0,
        }),
      ).toThrowError(/operationally blocked/);
    });
  });
});
