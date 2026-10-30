import { ApplicationError } from '../../foundation/domain/errors.js';
import type { MaintenancePriority } from './maintenance-request.js';

export type MaintenancePlanStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export const TERMINAL_PLAN_STATUSES = new Set<MaintenancePlanStatus>(['ARCHIVED']);

export function isTerminalPlanStatus(status: MaintenancePlanStatus): boolean {
  return TERMINAL_PLAN_STATUSES.has(status);
}

export function assertPlanCanBeActivated(
  currentStatus: MaintenancePlanStatus,
  intervalDays: number | null | undefined,
  intervalOdometerKm: number | null | undefined,
): void {
  if (currentStatus === 'ACTIVE') {
    return; // idempotent
  }
  if (currentStatus === 'ARCHIVED') {
    throw new ApplicationError(
      'INVALID_MAINTENANCE_PLAN_TRANSITION',
      'Cannot activate an archived maintenance plan',
    );
  }
  const hasDays = intervalDays !== null && intervalDays !== undefined && intervalDays > 0;
  const hasOdo =
    intervalOdometerKm !== null && intervalOdometerKm !== undefined && intervalOdometerKm > 0;
  if (!hasDays && !hasOdo) {
    throw new ApplicationError(
      'INVALID_MAINTENANCE_PLAN_TRANSITION',
      'Maintenance plan must define at least one valid trigger interval (days or odometer km) before activation',
    );
  }
}

export function assertPlanCanBeArchived(currentStatus: MaintenancePlanStatus): void {
  if (currentStatus === 'ARCHIVED') {
    return; // idempotent
  }
}

export function assertPlanCanBeEdited(currentStatus: MaintenancePlanStatus): void {
  if (currentStatus !== 'DRAFT') {
    throw new ApplicationError(
      'MAINTENANCE_PLAN_IMMUTABLE',
      `Cannot modify maintenance plan in ${currentStatus} status; plan parameters are immutable once activated`,
    );
  }
}

export interface MaintenancePlan {
  readonly id: string;
  readonly organizationId: string;
  readonly displayId: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: MaintenancePlanStatus;
  readonly intervalDays: number | null;
  readonly intervalOdometerKm: number | null;
  readonly defaultPriority: MaintenancePriority;
  readonly blocksOperationWhenDue: boolean;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}
