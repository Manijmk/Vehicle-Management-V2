import { Inject, Injectable } from '@nestjs/common';

import {
  TRIP_REPOSITORY,
  type AbortTripInput,
  type CancelTripInput,
  type CompleteTripInput,
  type CreateTripInput,
  type ListTripsFilter,
  type MarkTripReadyInput,
  type PaginatedTrips,
  type StartTripInput,
  type TripDetail,
  type TripRepository,
  type TripStatusHistoryEntry,
  type UpdateTripInput,
} from './trip.repository.js';

@Injectable()
export class TripService {
  constructor(
    @Inject(TRIP_REPOSITORY)
    private readonly repository: TripRepository,
  ) {}

  async createTrip(input: CreateTripInput): Promise<TripDetail> {
    return this.repository.createTrip(input);
  }

  async getTrip(organizationId: string, tripId: string): Promise<TripDetail> {
    return this.repository.getTrip(organizationId, tripId);
  }

  async listTrips(organizationId: string, filter?: ListTripsFilter): Promise<PaginatedTrips> {
    return this.repository.listTrips(organizationId, filter);
  }

  async updateTrip(input: UpdateTripInput): Promise<TripDetail> {
    return this.repository.updateTrip(input);
  }

  async markTripReady(input: MarkTripReadyInput): Promise<TripDetail> {
    return this.repository.markTripReady(input);
  }

  async startTrip(input: StartTripInput): Promise<TripDetail> {
    return this.repository.startTrip(input);
  }

  async completeTrip(input: CompleteTripInput): Promise<TripDetail> {
    return this.repository.completeTrip(input);
  }

  async cancelTrip(input: CancelTripInput): Promise<TripDetail> {
    return this.repository.cancelTrip(input);
  }

  async abortTrip(input: AbortTripInput): Promise<TripDetail> {
    return this.repository.abortTrip(input);
  }

  async getStatusHistory(
    organizationId: string,
    tripId: string,
  ): Promise<TripStatusHistoryEntry[]> {
    return this.repository.getStatusHistory(organizationId, tripId);
  }

  async getCurrentTripForVehicle(
    organizationId: string,
    vehicleId: string,
  ): Promise<TripDetail | null> {
    return this.repository.getCurrentTripForVehicle(organizationId, vehicleId);
  }

  async getTripsForVehicle(
    organizationId: string,
    vehicleId: string,
    limit?: number,
    offset?: number,
  ): Promise<PaginatedTrips> {
    return this.repository.getTripsForVehicle(organizationId, vehicleId, limit, offset);
  }

  async getCurrentTripForDriver(
    organizationId: string,
    driverId: string,
  ): Promise<TripDetail | null> {
    return this.repository.getCurrentTripForDriver(organizationId, driverId);
  }

  async getTripsForDriver(
    organizationId: string,
    driverId: string,
    limit?: number,
    offset?: number,
  ): Promise<PaginatedTrips> {
    return this.repository.getTripsForDriver(organizationId, driverId, limit, offset);
  }

  async getTripsForAssignment(
    organizationId: string,
    assignmentId: string,
    limit?: number,
    offset?: number,
  ): Promise<PaginatedTrips> {
    return this.repository.getTripsForAssignment(organizationId, assignmentId, limit, offset);
  }
}
