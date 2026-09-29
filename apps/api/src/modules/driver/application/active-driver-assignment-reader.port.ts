export const ACTIVE_DRIVER_ASSIGNMENT_READER = Symbol('ACTIVE_DRIVER_ASSIGNMENT_READER');

export interface ActiveDriverAssignmentReader {
  hasActiveAssignment(organizationId: string, driverId: string): Promise<boolean>;
}
