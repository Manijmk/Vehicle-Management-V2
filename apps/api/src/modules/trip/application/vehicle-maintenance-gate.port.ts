export const VEHICLE_MAINTENANCE_GATE = Symbol('VEHICLE_MAINTENANCE_GATE');

export interface VehicleMaintenanceGate {
  assertOperationallyAvailable(vehicleId: string, organizationId: string): Promise<void>;
  isOperationallyAvailable(vehicleId: string, organizationId: string): Promise<boolean>;
}
