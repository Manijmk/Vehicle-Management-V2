import type { AssignmentRecord, AssignmentStatus } from '../domain/assignment.js';

export const ASSIGNMENT_REPOSITORY = Symbol('ASSIGNMENT_REPOSITORY');

export interface AssignmentMutationMetadata {
  readonly actorId: string;
  readonly requestId: string;
  readonly ipAddress: string;
  readonly userAgent: string;
}

export interface AssignmentVehicleSummary {
  readonly id: string;
  readonly displayId: string;
  readonly registration: string;
  readonly vin: string;
  readonly status: string;
}

export interface AssignmentDriverSummary {
  readonly id: string;
  readonly displayId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly status: string;
  readonly eligible?: boolean;
  readonly isOperationallyEligible?: boolean;
}

export interface AssignmentDetail extends AssignmentRecord {
  readonly vehicle: AssignmentVehicleSummary;
  readonly driver: AssignmentDriverSummary;
}

export interface CreateAssignmentInput {
  readonly organizationId: string;
  readonly vehicleId: string;
  readonly driverId: string;
  readonly startedAt?: Date;
  readonly notes?: string | null;
  readonly metadata: AssignmentMutationMetadata;
}

export interface EndAssignmentInput {
  readonly organizationId: string;
  readonly assignmentId: string;
  readonly endedAt?: Date;
  readonly endReason: string;
  readonly version: number;
  readonly metadata: AssignmentMutationMetadata;
}

export interface ListAssignmentsFilter {
  readonly status?: AssignmentStatus;
  readonly vehicleId?: string;
  readonly driverId?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface PaginatedAssignments {
  readonly items: AssignmentDetail[];
  readonly total: number;
}

export interface AssignmentRepository {
  createAssignment(input: CreateAssignmentInput): Promise<AssignmentDetail>;
  endAssignment(input: EndAssignmentInput): Promise<AssignmentDetail>;
  getAssignment(organizationId: string, assignmentId: string): Promise<AssignmentDetail>;
  listAssignments(
    organizationId: string,
    filter?: ListAssignmentsFilter,
  ): Promise<PaginatedAssignments>;
  getCurrentAssignmentForVehicle(
    organizationId: string,
    vehicleId: string,
  ): Promise<AssignmentDetail | null>;
  getCurrentAssignmentForDriver(
    organizationId: string,
    driverId: string,
  ): Promise<AssignmentDetail | null>;
  getVehicleAssignmentHistory(
    organizationId: string,
    vehicleId: string,
  ): Promise<AssignmentDetail[]>;
  getDriverAssignmentHistory(
    organizationId: string,
    driverId: string,
  ): Promise<AssignmentDetail[]>;
}
