import type { InspectionItemSeverity, InspectionType } from '../domain/inspection-template.js';
import type {
  InspectionResponseResult,
  InspectionResult,
  InspectionStatus,
} from '../domain/inspection.js';
import type { InspectionMutationMetadata } from './inspection-template.repository.js';

export const INSPECTION_REPOSITORY = Symbol('INSPECTION_REPOSITORY');

export interface InspectionResponseDetail {
  readonly id: string;
  readonly templateItemId: string;
  readonly category: string;
  readonly prompt: string;
  readonly description?: string | null;
  readonly required: boolean;
  readonly severity: InspectionItemSeverity;
  readonly sortOrder: number;
  readonly response: InspectionResponseResult;
  readonly comment?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface InspectionDetail {
  readonly id: string;
  readonly organizationId: string;
  readonly displayId: string;
  readonly templateId: string;
  readonly template: {
    readonly id: string;
    readonly name: string;
    readonly type: InspectionType;
    readonly version: number;
  };
  readonly type: InspectionType;
  readonly vehicleId: string;
  readonly vehicle: {
    readonly id: string;
    readonly displayId: string;
    readonly registration: string;
    readonly model: string;
    readonly type: string;
    readonly odometerKm: number;
    readonly status: string;
  };
  readonly driverId?: string | null;
  readonly driver?: {
    readonly id: string;
    readonly displayId: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly status: string;
  } | null;
  readonly assignmentId?: string | null;
  readonly tripId?: string | null;
  readonly trip?: {
    readonly id: string;
    readonly displayId: string;
    readonly status: string;
    readonly origin: string;
    readonly destination: string;
  } | null;
  readonly status: InspectionStatus;
  readonly result?: InspectionResult | null;
  readonly hasCriticalFailure: boolean;
  readonly startedAt?: string | null;
  readonly completedAt?: string | null;
  readonly cancelledAt?: string | null;
  readonly cancelReason?: string | null;
  readonly performedBy?: string | null;
  readonly notes?: string | null;
  readonly version: number;
  readonly responses: readonly InspectionResponseDetail[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateInspectionInput {
  readonly organizationId: string;
  readonly templateId: string;
  readonly type: InspectionType;
  readonly vehicleId?: string | undefined;
  readonly tripId?: string | null | undefined;
  readonly notes?: string | null | undefined;
  readonly metadata: InspectionMutationMetadata;
}

export interface StartInspectionInput {
  readonly organizationId: string;
  readonly inspectionId: string;
  readonly version: number;
  readonly metadata: InspectionMutationMetadata;
}

export interface SaveInspectionResponsesInput {
  readonly organizationId: string;
  readonly inspectionId: string;
  readonly version: number;
  readonly responses: readonly {
    readonly templateItemId: string;
    readonly response: InspectionResponseResult;
    readonly comment?: string | null | undefined;
  }[];
  readonly metadata: InspectionMutationMetadata;
}

export interface CompleteInspectionInput {
  readonly organizationId: string;
  readonly inspectionId: string;
  readonly version: number;
  readonly metadata: InspectionMutationMetadata;
}

export interface CancelInspectionInput {
  readonly organizationId: string;
  readonly inspectionId: string;
  readonly version: number;
  readonly cancelReason: string;
  readonly metadata: InspectionMutationMetadata;
}

export interface ListInspectionsFilter {
  readonly type?: InspectionType | undefined;
  readonly status?: InspectionStatus | undefined;
  readonly result?: InspectionResult | undefined;
  readonly vehicleId?: string | undefined;
  readonly driverId?: string | undefined;
  readonly tripId?: string | undefined;
  readonly hasCriticalFailure?: boolean | undefined;
  readonly search?: string | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

export interface PaginatedInspections {
  readonly items: readonly InspectionDetail[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface InspectionRepository {
  createInspection(input: CreateInspectionInput): Promise<InspectionDetail>;
  getInspection(organizationId: string, inspectionId: string): Promise<InspectionDetail>;
  listInspections(
    organizationId: string,
    filter?: ListInspectionsFilter | undefined,
  ): Promise<PaginatedInspections>;
  startInspection(input: StartInspectionInput): Promise<InspectionDetail>;
  saveResponses(input: SaveInspectionResponsesInput): Promise<InspectionDetail>;
  completeInspection(input: CompleteInspectionInput): Promise<InspectionDetail>;
  cancelInspection(input: CancelInspectionInput): Promise<InspectionDetail>;
  getInspectionsForVehicle(
    organizationId: string,
    vehicleId: string,
    limit?: number | undefined,
    offset?: number | undefined,
  ): Promise<PaginatedInspections>;
  getInspectionsForTrip(
    organizationId: string,
    tripId: string,
    limit?: number | undefined,
    offset?: number | undefined,
  ): Promise<PaginatedInspections>;
  getInspectionsForDriver(
    organizationId: string,
    driverId: string,
    limit?: number | undefined,
    offset?: number | undefined,
  ): Promise<PaginatedInspections>;
}
