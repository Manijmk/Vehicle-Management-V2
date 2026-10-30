import { Inject, Injectable } from '@nestjs/common';

import {
  INSPECTION_REPOSITORY,
  type CancelInspectionInput,
  type CompleteInspectionInput,
  type CreateInspectionInput,
  type InspectionDetail,
  type InspectionRepository,
  type ListInspectionsFilter,
  type PaginatedInspections,
  type SaveInspectionResponsesInput,
  type StartInspectionInput,
} from './inspection.repository.js';

@Injectable()
export class InspectionService {
  constructor(
    @Inject(INSPECTION_REPOSITORY)
    private readonly repository: InspectionRepository,
  ) {}

  async createInspection(input: CreateInspectionInput): Promise<InspectionDetail> {
    return this.repository.createInspection(input);
  }

  async getInspection(organizationId: string, inspectionId: string): Promise<InspectionDetail> {
    return this.repository.getInspection(organizationId, inspectionId);
  }

  async listInspections(
    organizationId: string,
    filter?: ListInspectionsFilter,
  ): Promise<PaginatedInspections> {
    return this.repository.listInspections(organizationId, filter);
  }

  async startInspection(input: StartInspectionInput): Promise<InspectionDetail> {
    return this.repository.startInspection(input);
  }

  async saveResponses(input: SaveInspectionResponsesInput): Promise<InspectionDetail> {
    return this.repository.saveResponses(input);
  }

  async completeInspection(input: CompleteInspectionInput): Promise<InspectionDetail> {
    return this.repository.completeInspection(input);
  }

  async cancelInspection(input: CancelInspectionInput): Promise<InspectionDetail> {
    return this.repository.cancelInspection(input);
  }

  async getInspectionsForVehicle(
    organizationId: string,
    vehicleId: string,
    limit?: number,
    offset?: number,
  ): Promise<PaginatedInspections> {
    return this.repository.getInspectionsForVehicle(organizationId, vehicleId, limit, offset);
  }

  async getInspectionsForTrip(
    organizationId: string,
    tripId: string,
    limit?: number,
    offset?: number,
  ): Promise<PaginatedInspections> {
    return this.repository.getInspectionsForTrip(organizationId, tripId, limit, offset);
  }

  async getInspectionsForDriver(
    organizationId: string,
    driverId: string,
    limit?: number,
    offset?: number,
  ): Promise<PaginatedInspections> {
    return this.repository.getInspectionsForDriver(organizationId, driverId, limit, offset);
  }
}
