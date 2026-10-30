import { ApplicationError } from '../../foundation/domain/errors.js';

export interface VehicleMaintenanceBlockingContext {
  readonly openBlockingRequestsCount: number;
  readonly activeBlockingWorkOrdersCount: number;
}

export function isVehicleOperationallyBlocked(context: VehicleMaintenanceBlockingContext): boolean {
  return context.openBlockingRequestsCount > 0 || context.activeBlockingWorkOrdersCount > 0;
}

export function assertVehicleOperationallyAvailable(
  context: VehicleMaintenanceBlockingContext,
): void {
  if (isVehicleOperationallyBlocked(context)) {
    throw new ApplicationError(
      'VEHICLE_BLOCKED_BY_MAINTENANCE',
      'Vehicle is operationally blocked due to open critical maintenance requests or active work orders',
    );
  }
}
