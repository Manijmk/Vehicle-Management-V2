export type ScheduleDueState = 'UPCOMING' | 'DUE' | 'OVERDUE';

export interface VehicleMaintenanceSchedule {
  readonly id: string;
  readonly organizationId: string;
  readonly vehicleId: string;
  readonly maintenancePlanId: string;
  readonly lastCompletedAt: Date | null;
  readonly lastCompletedOdometerKm: number | null;
  readonly nextDueAt: Date | null;
  readonly nextDueOdometerKm: number | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export function deriveScheduleDueState(
  schedule: {
    readonly nextDueAt: Date | null;
    readonly nextDueOdometerKm: number | null;
  },
  currentVehicleOdometerKm: number,
  now: Date = new Date(),
): ScheduleDueState {
  const odoOverdue =
    schedule.nextDueOdometerKm !== null && currentVehicleOdometerKm > schedule.nextDueOdometerKm;
  const dateOverdue = schedule.nextDueAt !== null && now.getTime() > schedule.nextDueAt.getTime();

  if (odoOverdue || dateOverdue) {
    return 'OVERDUE';
  }

  const odoDue =
    schedule.nextDueOdometerKm !== null && currentVehicleOdometerKm >= schedule.nextDueOdometerKm;
  const dateDue = schedule.nextDueAt !== null && now.getTime() >= schedule.nextDueAt.getTime();

  if (odoDue || dateDue) {
    return 'DUE';
  }

  return 'UPCOMING';
}

export function calculateInitialDueThresholds(
  plan: {
    readonly intervalDays: number | null | undefined;
    readonly intervalOdometerKm: number | null | undefined;
  },
  vehicleOdometerKm: number,
  assignedAt: Date = new Date(),
): { nextDueAt: Date | null; nextDueOdometerKm: number | null } {
  const nextDueAt =
    plan.intervalDays && plan.intervalDays > 0
      ? new Date(assignedAt.getTime() + plan.intervalDays * 86400000)
      : null;
  const nextDueOdometerKm =
    plan.intervalOdometerKm && plan.intervalOdometerKm > 0
      ? vehicleOdometerKm + plan.intervalOdometerKm
      : null;

  return { nextDueAt, nextDueOdometerKm };
}

export function calculateResetDueThresholds(
  plan: {
    readonly intervalDays: number | null | undefined;
    readonly intervalOdometerKm: number | null | undefined;
  },
  completionOdometerKm: number,
  completedAt: Date = new Date(),
): {
  lastCompletedAt: Date;
  lastCompletedOdometerKm: number;
  nextDueAt: Date | null;
  nextDueOdometerKm: number | null;
} {
  const nextDueAt =
    plan.intervalDays && plan.intervalDays > 0
      ? new Date(completedAt.getTime() + plan.intervalDays * 86400000)
      : null;
  const nextDueOdometerKm =
    plan.intervalOdometerKm && plan.intervalOdometerKm > 0
      ? completionOdometerKm + plan.intervalOdometerKm
      : null;

  return {
    lastCompletedAt: completedAt,
    lastCompletedOdometerKm: completionOdometerKm,
    nextDueAt,
    nextDueOdometerKm,
  };
}
