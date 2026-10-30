export const OPERATIONAL_COMPLIANCE_GATE = Symbol('OPERATIONAL_COMPLIANCE_GATE');

export interface OperationalComplianceGate {
  assertVehicleCompliance(vehicleId: string, organizationId: string): Promise<void>;
  assertDriverCompliance(driverId: string, organizationId: string): Promise<void>;
  isVehicleBlocked(vehicleId: string, organizationId: string): Promise<boolean>;
  isDriverBlocked(driverId: string, organizationId: string): Promise<boolean>;
}
