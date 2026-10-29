import type { TripStatus } from '../domain/trip.js';

export const TRIP_REPOSITORY = Symbol('TRIP_REPOSITORY');

export interface TripMutationMetadata {
  readonly actorId: string;
  readonly requestId: string;
  readonly ipAddress: string;
  readonly userAgent: string;
}

export interface TripVehicleSummary {
  readonly id: string;
  readonly displayId: string;
  readonly registration: string;
  readonly vin: string;
  readonly model: string;
  readonly status: string;
  readonly odometerKm: number;
}

export interface TripDriverSummary {
  readonly id: string;
  readonly displayId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly status: string;
  readonly eligible?: boolean;
}

export interface TripAssignmentSummary {
  readonly id: string;
  readonly status: string;
}

export interface TripRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly displayId: string;
  readonly assignmentId: string;
  readonly vehicleId: string;
  readonly driverId: string;
  readonly status: TripStatus;
  readonly origin: string;
  readonly destination: string;
  readonly purpose: string | null;
  readonly plannedStartAt: Date | null;
  readonly plannedEndAt: Date | null;
  readonly actualStartAt: Date | null;
  readonly actualEndAt: Date | null;
  readonly startOdometerKm: number | null;
  readonly endOdometerKm: number | null;
  readonly distanceKm: number | null;
  readonly cancelReason: string | null;
  readonly abortReason: string | null;
  readonly notes: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export interface TripDetail extends TripRecord {
  readonly vehicle: TripVehicleSummary;
  readonly driver: TripDriverSummary;
  readonly assignment: TripAssignmentSummary;
}

export interface TripStatusHistoryEntry {
  readonly id: string;
  readonly organizationId: string;
  readonly tripId: string;
  readonly fromStatus: TripStatus | null;
  readonly toStatus: TripStatus;
  readonly reason: string | null;
  readonly changedBy: string;
  readonly requestId: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
}

export interface CreateTripInput {
  readonly organizationId: string;
  readonly assignmentId: string;
  readonly origin: string;
  readonly destination: string;
  readonly purpose?: string | null | undefined;
  readonly plannedStartAt?: Date | null | undefined;
  readonly plannedEndAt?: Date | null | undefined;
  readonly notes?: string | null | undefined;
  readonly metadata: TripMutationMetadata;
}

export interface UpdateTripInput {
  readonly organizationId: string;
  readonly tripId: string;
  readonly origin?: string | undefined;
  readonly destination?: string | undefined;
  readonly purpose?: string | null | undefined;
  readonly plannedStartAt?: Date | null | undefined;
  readonly plannedEndAt?: Date | null | undefined;
  readonly notes?: string | null | undefined;
  readonly version: number;
  readonly metadata: TripMutationMetadata;
}

export interface MarkTripReadyInput {
  readonly organizationId: string;
  readonly tripId: string;
  readonly version: number;
  readonly metadata: TripMutationMetadata;
}

export interface StartTripInput {
  readonly organizationId: string;
  readonly tripId: string;
  readonly startOdometerKm: number;
  readonly version: number;
  readonly metadata: TripMutationMetadata;
}

export interface CompleteTripInput {
  readonly organizationId: string;
  readonly tripId: string;
  readonly endOdometerKm: number;
  readonly notes?: string | undefined;
  readonly version: number;
  readonly metadata: TripMutationMetadata;
}

export interface CancelTripInput {
  readonly organizationId: string;
  readonly tripId: string;
  readonly cancelReason?: string | undefined;
  readonly version: number;
  readonly metadata: TripMutationMetadata;
}

export interface AbortTripInput {
  readonly organizationId: string;
  readonly tripId: string;
  readonly endOdometerKm: number;
  readonly abortReason: string;
  readonly version: number;
  readonly metadata: TripMutationMetadata;
}

export interface ListTripsFilter {
  readonly status?: TripStatus | undefined;
  readonly vehicleId?: string | undefined;
  readonly driverId?: string | undefined;
  readonly assignmentId?: string | undefined;
  readonly search?: string | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

export interface PaginatedTrips {
  readonly items: TripDetail[];
  readonly total: number;
}

export interface TripRepository {
  createTrip(input: CreateTripInput): Promise<TripDetail>;
  getTrip(organizationId: string, tripId: string): Promise<TripDetail>;
  listTrips(organizationId: string, filter?: ListTripsFilter): Promise<PaginatedTrips>;
  updateTrip(input: UpdateTripInput): Promise<TripDetail>;
  markTripReady(input: MarkTripReadyInput): Promise<TripDetail>;
  startTrip(input: StartTripInput): Promise<TripDetail>;
  completeTrip(input: CompleteTripInput): Promise<TripDetail>;
  cancelTrip(input: CancelTripInput): Promise<TripDetail>;
  abortTrip(input: AbortTripInput): Promise<TripDetail>;
  getStatusHistory(organizationId: string, tripId: string): Promise<TripStatusHistoryEntry[]>;
  getCurrentTripForVehicle(organizationId: string, vehicleId: string): Promise<TripDetail | null>;
  getTripsForVehicle(
    organizationId: string,
    vehicleId: string,
    limit?: number,
    offset?: number,
  ): Promise<PaginatedTrips>;
  getCurrentTripForDriver(organizationId: string, driverId: string): Promise<TripDetail | null>;
  getTripsForDriver(
    organizationId: string,
    driverId: string,
    limit?: number,
    offset?: number,
  ): Promise<PaginatedTrips>;
  getTripsForAssignment(
    organizationId: string,
    assignmentId: string,
    limit?: number,
    offset?: number,
  ): Promise<PaginatedTrips>;
  hasNonTerminalTripForAssignment(organizationId: string, assignmentId: string): Promise<boolean>;
}
