import { ApplicationError } from '../../foundation/domain/errors.js';
import type { MaintenancePriority } from './maintenance-request.js';

export type MaintenanceWorkOrderStatus =
  'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type WorkOrderTaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';

export const TERMINAL_WORK_ORDER_STATUSES = new Set<MaintenanceWorkOrderStatus>([
  'COMPLETED',
  'CANCELLED',
]);

export function isTerminalWorkOrderStatus(status: MaintenanceWorkOrderStatus): boolean {
  return TERMINAL_WORK_ORDER_STATUSES.has(status);
}

const ALLOWED_WORK_ORDER_TRANSITIONS: Record<
  MaintenanceWorkOrderStatus,
  readonly MaintenanceWorkOrderStatus[]
> = {
  DRAFT: ['OPEN', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function assertWorkOrderTransition(
  currentStatus: MaintenanceWorkOrderStatus,
  targetStatus: MaintenanceWorkOrderStatus,
): void {
  if (isTerminalWorkOrderStatus(currentStatus)) {
    throw new ApplicationError(
      'WORK_ORDER_ALREADY_TERMINAL',
      `Cannot transition work order from terminal status ${currentStatus} to ${targetStatus}`,
    );
  }

  const allowed = ALLOWED_WORK_ORDER_TRANSITIONS[currentStatus];
  if (!allowed.includes(targetStatus)) {
    throw new ApplicationError(
      'INVALID_WORK_ORDER_TRANSITION',
      `Cannot transition work order from ${currentStatus} to ${targetStatus}`,
    );
  }
}

export function assertWorkOrderCanBeCompleted(
  currentStatus: MaintenanceWorkOrderStatus,
  tasks: readonly { status: WorkOrderTaskStatus }[],
  completionNotes: string | null | undefined,
  completionOdometer: number | null | undefined,
  currentVehicleOdometer: number,
): void {
  assertWorkOrderTransition(currentStatus, 'COMPLETED');

  const incompleteTasks = tasks.filter((t) => t.status !== 'COMPLETED' && t.status !== 'SKIPPED');
  if (incompleteTasks.length > 0) {
    throw new ApplicationError(
      'WORK_ORDER_TASKS_INCOMPLETE',
      `Cannot complete work order with ${incompleteTasks.length} pending or in-progress task(s). All tasks must be completed or skipped.`,
    );
  }

  if (!completionNotes || completionNotes.trim().length === 0) {
    throw new ApplicationError(
      'WORK_ORDER_COMPLETION_NOTES_REQUIRED',
      'Completion notes are mandatory when completing a work order',
    );
  }

  if (completionOdometer !== null && completionOdometer !== undefined) {
    if (completionOdometer < currentVehicleOdometer) {
      throw new ApplicationError(
        'WORK_ORDER_ODOMETER_INVALID',
        `Completion odometer reading (${completionOdometer} km) cannot be less than current vehicle odometer (${currentVehicleOdometer} km)`,
      );
    }
  }
}

export function assertWorkOrderCanBeCancelled(
  currentStatus: MaintenanceWorkOrderStatus,
  cancelReason: string,
): void {
  assertWorkOrderTransition(currentStatus, 'CANCELLED');

  if (!cancelReason || cancelReason.trim().length < 3) {
    throw new ApplicationError(
      'INVALID_WORK_ORDER_TRANSITION',
      'Cancel reason is required and must be at least 3 characters',
    );
  }
}

export interface WorkOrderTask {
  readonly id: string;
  readonly organizationId: string;
  readonly workOrderId: string;
  readonly description: string;
  readonly status: WorkOrderTaskStatus;
  readonly sortOrder: number;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface WorkOrderPart {
  readonly id: string;
  readonly organizationId: string;
  readonly workOrderId: string;
  readonly description: string;
  readonly partNumber: string | null;
  readonly quantity: number;
  readonly unitCost: number;
  readonly totalCost: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface WorkOrderLabor {
  readonly id: string;
  readonly organizationId: string;
  readonly workOrderId: string;
  readonly description: string;
  readonly hours: number;
  readonly hourlyRate: number;
  readonly totalCost: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function calculateWorkOrderTotals(
  parts: readonly { readonly totalCost: number }[],
  labor: readonly { readonly totalCost: number }[],
): { partsTotal: number; laborTotal: number; totalCost: number } {
  const partsTotal = parts.reduce((sum, p) => sum + (Number(p.totalCost) || 0), 0);
  const laborTotal = labor.reduce((sum, l) => sum + (Number(l.totalCost) || 0), 0);
  const totalCost = partsTotal + laborTotal;

  return {
    partsTotal: Math.round(partsTotal * 100) / 100,
    laborTotal: Math.round(laborTotal * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
  };
}

export interface MaintenanceWorkOrder {
  readonly id: string;
  readonly organizationId: string;
  readonly displayId: string;
  readonly vehicleId: string;
  readonly maintenanceRequestId: string | null;
  readonly maintenanceScheduleId: string | null;
  readonly vendorId: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly priority: MaintenancePriority;
  readonly blocksOperation: boolean;
  readonly status: MaintenanceWorkOrderStatus;
  readonly openedAt: Date | null;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly cancelReason: string | null;
  readonly completionNotes: string | null;
  readonly odometerAtOpen: number | null;
  readonly odometerAtCompletion: number | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
  readonly tasks?: readonly WorkOrderTask[];
  readonly parts?: readonly WorkOrderPart[];
  readonly labor?: readonly WorkOrderLabor[];
}
