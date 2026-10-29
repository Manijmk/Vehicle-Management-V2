export const TRIP_INSPECTION_GATE = Symbol('TRIP_INSPECTION_GATE');

export interface LatestPreTripInspectionSummary {
  readonly id: string;
  readonly status: string;
  readonly result: string | null;
  readonly completedAt: Date | null;
}

export interface TripInspectionGate {
  getLatestPreTripInspection(
    organizationId: string,
    tripId: string,
  ): Promise<LatestPreTripInspectionSummary | null>;

  hasCompletedPostTripInspection(organizationId: string, tripId: string): Promise<boolean>;
}
