import { ApplicationError } from '../../foundation/domain/errors.js';

export type MaintenanceRequestSource = 'MANUAL' | 'INSPECTION' | 'PREVENTIVE';
export type MaintenancePriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
export type MaintenanceRequestStatus = 'OPEN' | 'CONVERTED' | 'CANCELLED';

export const TERMINAL_REQUEST_STATUSES = new Set<MaintenanceRequestStatus>([
  'CONVERTED',
  'CANCELLED',
]);

export function isTerminalRequestStatus(status: MaintenanceRequestStatus): boolean {
  return TERMINAL_REQUEST_STATUSES.has(status);
}

export function assertRequestCanBeConverted(currentStatus: MaintenanceRequestStatus): void {
  if (currentStatus === 'CONVERTED') {
    throw new ApplicationError(
      'MAINTENANCE_REQUEST_ALREADY_CONVERTED',
      'Maintenance request has already been converted to a work order',
    );
  }
  if (currentStatus === 'CANCELLED') {
    throw new ApplicationError(
      'MAINTENANCE_REQUEST_ALREADY_TERMINAL',
      'Cannot convert a cancelled maintenance request',
    );
  }
}

export function assertRequestCanBeCancelled(
  currentStatus: MaintenanceRequestStatus,
  cancelReason: string,
): void {
  if (isTerminalRequestStatus(currentStatus)) {
    throw new ApplicationError(
      'MAINTENANCE_REQUEST_ALREADY_TERMINAL',
      `Cannot cancel maintenance request already in terminal status ${currentStatus}`,
    );
  }
  if (!cancelReason || cancelReason.trim().length < 3) {
    throw new ApplicationError(
      'INVALID_MAINTENANCE_REQUEST_TRANSITION',
      'Cancel reason is required and must be at least 3 characters',
    );
  }
}

export interface MaintenanceRequest {
  readonly id: string;
  readonly organizationId: string;
  readonly displayId: string;
  readonly vehicleId: string;
  readonly sourceType: MaintenanceRequestSource;
  readonly sourceInspectionId: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly priority: MaintenancePriority;
  readonly blocksOperation: boolean;
  readonly status: MaintenanceRequestStatus;
  readonly convertedWorkOrderId: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}
