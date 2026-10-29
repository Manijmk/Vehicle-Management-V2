export const ASSIGNMENT_TRIP_ACTIVITY_READER = Symbol('ASSIGNMENT_TRIP_ACTIVITY_READER');

export interface AssignmentTripActivityReader {
  hasNonTerminalTrip(organizationId: string, assignmentId: string): Promise<boolean>;
}
