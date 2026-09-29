export const ACTIVE_VEHICLE_ASSIGNMENT_READER = Symbol('ACTIVE_VEHICLE_ASSIGNMENT_READER');

export interface ActiveVehicleAssignmentReader {
  hasActiveAssignment(organizationId: string, vehicleId: string): Promise<boolean>;
}
