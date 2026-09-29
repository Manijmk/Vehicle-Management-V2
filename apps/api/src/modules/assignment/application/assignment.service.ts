import { Inject, Injectable } from '@nestjs/common';

import {
  ASSIGNMENT_REPOSITORY,
  type AssignmentDetail,
  type AssignmentRepository,
  type CreateAssignmentInput,
  type EndAssignmentInput,
  type ListAssignmentsFilter,
  type PaginatedAssignments,
} from './assignment.repository.js';

@Injectable()
export class AssignmentService {
  constructor(
    @Inject(ASSIGNMENT_REPOSITORY)
    private readonly repository: AssignmentRepository,
  ) {}

  createAssignment(input: CreateAssignmentInput): Promise<AssignmentDetail> {
    return this.repository.createAssignment(input);
  }

  endAssignment(input: EndAssignmentInput): Promise<AssignmentDetail> {
    return this.repository.endAssignment(input);
  }

  getAssignment(organizationId: string, assignmentId: string): Promise<AssignmentDetail> {
    return this.repository.getAssignment(organizationId, assignmentId);
  }

  listAssignments(
    organizationId: string,
    filter?: ListAssignmentsFilter,
  ): Promise<PaginatedAssignments> {
    return this.repository.listAssignments(organizationId, filter);
  }

  getCurrentAssignmentForVehicle(
    organizationId: string,
    vehicleId: string,
  ): Promise<AssignmentDetail | null> {
    return this.repository.getCurrentAssignmentForVehicle(organizationId, vehicleId);
  }

  getCurrentAssignmentForDriver(
    organizationId: string,
    driverId: string,
  ): Promise<AssignmentDetail | null> {
    return this.repository.getCurrentAssignmentForDriver(organizationId, driverId);
  }

  getVehicleAssignmentHistory(
    organizationId: string,
    vehicleId: string,
  ): Promise<AssignmentDetail[]> {
    return this.repository.getVehicleAssignmentHistory(organizationId, vehicleId);
  }

  getDriverAssignmentHistory(
    organizationId: string,
    driverId: string,
  ): Promise<AssignmentDetail[]> {
    return this.repository.getDriverAssignmentHistory(organizationId, driverId);
  }
}
