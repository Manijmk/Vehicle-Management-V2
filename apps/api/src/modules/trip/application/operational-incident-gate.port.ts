export const OPERATIONAL_INCIDENT_GATE = Symbol('OPERATIONAL_INCIDENT_GATE');

export interface OperationalIncidentGate {
  assertVehicleIncidentAvailability(vehicleId: string, organizationId: string): Promise<void>;
  assertDriverIncidentAvailability(driverId: string, organizationId: string): Promise<void>;
  isVehicleBlockedByIncident(vehicleId: string, organizationId: string): Promise<boolean>;
  isDriverBlockedByIncident(driverId: string, organizationId: string): Promise<boolean>;
}
