import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@vms/database';
import { DATABASE } from '../../../common/tokens.js';
import {
  type ComplianceAnalyticsReportData,
  type CostAnalyticsReportData,
  type CostCurrencySummary,
  type DashboardReportData,
  type FleetOverviewReportData,
  type FuelAnalyticsReportData,
  type IncidentAnalyticsReportData,
  type MaintenanceAnalyticsReportData,
  type ReportingRepository,
  type TelemetryAnalyticsReportData,
  type TripAnalyticsReportData,
  type VehicleUtilizationItem,
  type VehicleUtilizationReportData,
} from '../application/reporting.port.js';
import {
  calculateTripActiveOverlapSeconds,
  calculateTripTimeUtilizationPercent,
  type ReportTimeWindow,
  safeDivide,
  safePercentage,
} from '../domain/reporting-types.js';
import { FRESH_THRESHOLD_MS, STALE_THRESHOLD_MS } from '../../telemetry/domain/telemetry.js';

@Injectable()
export class PrismaReportingRepository implements ReportingRepository {
  constructor(@Inject(DATABASE) private readonly database: PrismaClient) {}

  async getOrganizationName(organizationId: string): Promise<string> {
    const org = await this.database.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    return org?.name ?? 'Organization';
  }

  async getFleetOverview(
    organizationId: string,
    window: ReportTimeWindow,
    permissions?: ReadonlySet<string>,
  ): Promise<FleetOverviewReportData> {
    const now = new Date();
    const freshCutoff = new Date(now.getTime() - FRESH_THRESHOLD_MS);
    const staleCutoff = new Date(now.getTime() - STALE_THRESHOLD_MS);

    const hasMaint = !permissions || permissions.has('maintenance.read');
    const hasComp = !permissions || permissions.has('compliance.read');
    const hasInc = !permissions || permissions.has('incident.read');
    const hasTelem = !permissions || permissions.has('telemetry.read');
    const hasTrip = !permissions || permissions.has('trip.read');

    const [
      totalVehicles,
      draftVehicles,
      activeVehicles,
      retiredVehicles,
      assignedVehicles,
      inProgressTripVehicles,
      blockingMaintenanceCount,
      blockingComplianceCount,
      blockingIncidentCount,
      freshTelemetryVehicles,
      staleTelemetryVehicles,
      tripsSummary,
    ] = await Promise.all([
      this.database.vehicle.count({ where: { organizationId } }),
      this.database.vehicle.count({ where: { organizationId, status: 'DRAFT' } }),
      this.database.vehicle.count({ where: { organizationId, status: 'ACTIVE' } }),
      this.database.vehicle.count({ where: { organizationId, status: 'RETIRED' } }),
      this.database.vehicleDriverAssignment.count({ where: { organizationId, status: 'ACTIVE' } }),
      hasTrip ? this.database.trip.count({ where: { organizationId, status: 'IN_PROGRESS' } }) : 0,
      hasMaint
        ? this.database.maintenanceRequest.count({
            where: {
              organizationId,
              blocksOperation: true,
              status: 'OPEN',
            },
          })
        : null,
      hasComp
        ? this.database.complianceDocument.count({
            where: {
              organizationId,
              status: 'ACTIVE',
              expiresOn: { lt: now },
            },
          })
        : null,
      hasInc
        ? this.database.incident.count({
            where: {
              organizationId,
              operationalImpact: { in: ['VEHICLE', 'BOTH'] },
              status: { in: ['REPORTED', 'INVESTIGATING'] },
            },
          })
        : null,
      hasTelem
        ? this.database.telemetryCurrentPosition.count({
            where: {
              organizationId,
              capturedAt: { gte: freshCutoff },
            },
          })
        : null,
      hasTelem
        ? this.database.telemetryCurrentPosition.count({
            where: {
              organizationId,
              capturedAt: { lt: freshCutoff, gte: staleCutoff },
            },
          })
        : null,
      hasTrip
        ? this.database.$queryRaw<
            { completed_count: bigint; total_distance: number | null }[]
          >(Prisma.sql`
            SELECT
              COUNT(*) as completed_count,
              COALESCE(SUM(CASE WHEN end_odometer_km IS NOT NULL AND start_odometer_km IS NOT NULL THEN (end_odometer_km - start_odometer_km) ELSE 0 END), 0) as total_distance
            FROM trips
            WHERE organization_id = ${organizationId}::uuid
              AND status = 'COMPLETED'
              AND actual_end_at >= ${window.from}
              AND actual_end_at < ${window.to}
          `)
        : null,
    ]);

    const completedTrips = tripsSummary ? Number(tripsSummary[0]?.completed_count ?? 0) : null;
    const totalDistance = tripsSummary ? Number(tripsSummary[0]?.total_distance ?? 0) : null;
    const unknownOrNoTelemetry =
      hasTelem && freshTelemetryVehicles !== null && staleTelemetryVehicles !== null
        ? Math.max(0, activeVehicles - freshTelemetryVehicles - staleTelemetryVehicles)
        : null;

    return {
      metadata: {
        reportKey: 'fleet-overview',
        from: window.from.toISOString(),
        to: window.to.toISOString(),
        timezone: 'UTC',
        generatedAt: now.toISOString(),
      },
      kpis: {
        totalVehicles,
        draftVehicles,
        activeVehicles,
        retiredVehicles,
        assignedVehicles,
        inProgressTripVehicles,
        blockingMaintenanceCount,
        blockingComplianceCount,
        blockingIncidentCount,
        freshTelemetryVehicles,
        staleTelemetryVehicles,
        unknownOrNoTelemetryVehicles: unknownOrNoTelemetry,
        completedTripsInPeriod: completedTrips,
        totalTripDistanceKmInPeriod: totalDistance,
      },
    };
  }

  async getVehicleUtilization(
    organizationId: string,
    window: ReportTimeWindow,
    filters?: {
      readonly vehicleId?: string;
      readonly sortBy?: string;
      readonly sortOrder?: string;
      readonly page?: number;
      readonly limit?: number;
    },
  ): Promise<VehicleUtilizationReportData> {
    const page = Math.max(1, filters?.page ?? 1);
    const limit = Math.max(1, Math.min(500, filters?.limit ?? 50));
    const now = new Date();

    // Query non-retired vehicles in tenant
    const vehiclesWhere: Prisma.VehicleWhereInput = {
      organizationId,
      status: { not: 'RETIRED' },
      ...(filters?.vehicleId ? { id: filters.vehicleId } : {}),
    };

    const vehicles = await this.database.vehicle.findMany({
      where: vehiclesWhere,
      select: {
        id: true,
        displayId: true,
        registration: true,
        model: true,
        status: true,
      },
      orderBy: { displayId: 'asc' },
    });

    if (vehicles.length === 0) {
      return {
        metadata: {
          reportKey: 'vehicle-utilization',
          from: window.from.toISOString(),
          to: window.to.toISOString(),
          timezone: 'UTC',
          generatedAt: now.toISOString(),
          totalCount: 0,
          page,
          limit,
        },
        summary: {
          totalVehiclesEvaluated: 0,
          totalDistanceKm: 0,
          totalCompletedTrips: 0,
          averageUtilizationPercent: null,
        },
        items: [],
      };
    }

    const vehicleIds = vehicles.map((v) => v.id);

    // Query all trips overlapping window for these vehicles
    // A trip overlaps [from, to) if actual_start_at < to AND (actual_end_at IS NULL OR actual_end_at > from)
    const overlappingTrips = await this.database.trip.findMany({
      where: {
        organizationId,
        vehicleId: { in: vehicleIds },
        status: { in: ['COMPLETED', 'IN_PROGRESS'] },
        actualStartAt: { lt: window.to },
        OR: [{ actualEndAt: null }, { actualEndAt: { gt: window.from } }],
      },
      select: {
        id: true,
        vehicleId: true,
        status: true,
        actualStartAt: true,
        actualEndAt: true,
        startOdometerKm: true,
        endOdometerKm: true,
      },
    });

    // Group trips by vehicleId and compute metrics in domain
    const tripsByVehicle = new Map<string, typeof overlappingTrips>();
    for (const trip of overlappingTrips) {
      const list = tripsByVehicle.get(trip.vehicleId) ?? [];
      list.push(trip);
      tripsByVehicle.set(trip.vehicleId, list);
    }

    const evaluatedItems: VehicleUtilizationItem[] = [];
    let sumDistance = 0;
    let sumCompletedTrips = 0;
    let sumUtilization = 0;

    for (const vehicle of vehicles) {
      const trips = tripsByVehicle.get(vehicle.id) ?? [];
      let vehicleDistance = 0;
      let completedCount = 0;
      let inProgressCount = 0;
      let activeSeconds = 0;
      const activeDaysSet = new Set<string>();

      for (const t of trips) {
        if (!t.actualStartAt) continue;

        if (t.status === 'COMPLETED') {
          completedCount++;
          if (t.endOdometerKm !== null && t.startOdometerKm !== null) {
            vehicleDistance += Math.max(0, t.endOdometerKm - t.startOdometerKm);
          }
        } else if (t.status === 'IN_PROGRESS') {
          inProgressCount++;
        }

        const overlap = calculateTripActiveOverlapSeconds(
          {
            actualStartAt: t.actualStartAt,
            actualEndAt: t.actualEndAt,
            status: t.status,
          },
          window.from,
          window.to,
          now,
        );

        activeSeconds += overlap;

        if (overlap > 0) {
          activeDaysSet.add(t.actualStartAt.toISOString().slice(0, 10));
        }
      }

      const utilPercent = calculateTripTimeUtilizationPercent(
        activeSeconds,
        window.durationSeconds,
      );

      sumDistance += vehicleDistance;
      sumCompletedTrips += completedCount;
      sumUtilization += utilPercent;

      evaluatedItems.push({
        vehicleId: vehicle.id,
        displayId: vehicle.displayId,
        registration: vehicle.registration,
        model: vehicle.model,
        status: vehicle.status,
        completedTripCount: completedCount,
        inProgressTripCount: inProgressCount,
        totalDistanceKm: vehicleDistance,
        activeDurationSeconds: activeSeconds,
        activeTripDays: activeDaysSet.size,
        averageTripDistanceKm: safeDivide(vehicleDistance, completedCount),
        tripTimeUtilizationPercent: utilPercent,
      });
    }

    // Sort items
    const sortBy = filters?.sortBy ?? 'distance';
    const sortOrder = filters?.sortOrder === 'asc' ? 1 : -1;

    evaluatedItems.sort((a, b) => {
      let diff = 0;
      if (sortBy === 'trips') diff = a.completedTripCount - b.completedTripCount;
      else if (sortBy === 'duration') diff = a.activeDurationSeconds - b.activeDurationSeconds;
      else if (sortBy === 'utilization')
        diff = a.tripTimeUtilizationPercent - b.tripTimeUtilizationPercent;
      else diff = a.totalDistanceKm - b.totalDistanceKm;

      if (diff === 0) return a.displayId.localeCompare(b.displayId);
      return diff * sortOrder;
    });

    const paginated = evaluatedItems.slice((page - 1) * limit, page * limit);
    const avgUtil =
      evaluatedItems.length > 0
        ? Math.round((sumUtilization / evaluatedItems.length) * 100) / 100
        : null;

    return {
      metadata: {
        reportKey: 'vehicle-utilization',
        from: window.from.toISOString(),
        to: window.to.toISOString(),
        timezone: 'UTC',
        generatedAt: now.toISOString(),
        totalCount: evaluatedItems.length,
        page,
        limit,
      },
      summary: {
        totalVehiclesEvaluated: evaluatedItems.length,
        totalDistanceKm: sumDistance,
        totalCompletedTrips: sumCompletedTrips,
        averageUtilizationPercent: avgUtil,
      },
      items: paginated,
    };
  }

  async getTripAnalytics(
    organizationId: string,
    window: ReportTimeWindow,
    filters?: {
      readonly vehicleId?: string;
      readonly driverId?: string;
      readonly status?: string;
    },
  ): Promise<TripAnalyticsReportData> {
    const now = new Date();

    // Query trip counts in period using cohort timestamp (actualStartAt ?? plannedStartAt ?? createdAt)
    // Filtered by organizationId and window
    const tripRows = await this.database.$queryRaw<
      {
        total_trips: bigint;
        draft_count: bigint;
        ready_count: bigint;
        in_progress_count: bigint;
        completed_count: bigint;
        cancelled_count: bigint;
        aborted_count: bigint;
        total_distance: number | null;
        total_duration: number | null;
      }[]
    >(Prisma.sql`
      SELECT
        COUNT(*) as total_trips,
        COUNT(*) FILTER (WHERE status = 'DRAFT') as draft_count,
        COUNT(*) FILTER (WHERE status = 'READY') as ready_count,
        COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') as in_progress_count,
        COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed_count,
        COUNT(*) FILTER (WHERE status = 'CANCELLED') as cancelled_count,
        COUNT(*) FILTER (WHERE status = 'ABORTED') as aborted_count,
        COALESCE(SUM(CASE WHEN status = 'COMPLETED' AND end_odometer_km IS NOT NULL AND start_odometer_km IS NOT NULL THEN (end_odometer_km - start_odometer_km) ELSE 0 END), 0) as total_distance,
        COALESCE(SUM(CASE WHEN status = 'COMPLETED' AND actual_end_at IS NOT NULL AND actual_start_at IS NOT NULL THEN EXTRACT(EPOCH FROM (actual_end_at - actual_start_at)) ELSE 0 END), 0) as total_duration
      FROM trips
      WHERE organization_id = ${organizationId}::uuid
        AND COALESCE(actual_start_at, planned_start_at, created_at) >= ${window.from}
        AND COALESCE(actual_start_at, planned_start_at, created_at) < ${window.to}
        ${filters?.vehicleId ? Prisma.sql`AND vehicle_id = ${filters.vehicleId}::uuid` : Prisma.empty}
        ${filters?.driverId ? Prisma.sql`AND driver_id = ${filters.driverId}::uuid` : Prisma.empty}
        ${filters?.status ? Prisma.sql`AND status = ${filters.status}::"TripStatus"` : Prisma.empty}
    `);

    const row = tripRows[0] ?? {
      total_trips: 0n,
      draft_count: 0n,
      ready_count: 0n,
      in_progress_count: 0n,
      completed_count: 0n,
      cancelled_count: 0n,
      aborted_count: 0n,
      total_distance: 0,
      total_duration: 0,
    };

    const completed = Number(row.completed_count);
    const cancelled = Number(row.cancelled_count);
    const aborted = Number(row.aborted_count);
    const terminalDenominator = completed + cancelled + aborted;
    const totalDistance = Number(row.total_distance ?? 0);
    const totalDuration = Number(row.total_duration ?? 0);

    // Time-series query
    const timeSeriesRows = await this.database.$queryRaw<
      {
        bucket_date: Date;
        trip_count: bigint;
        completed_count: bigint;
        distance_km: number | null;
      }[]
    >(Prisma.sql`
      SELECT
        DATE_TRUNC('day', COALESCE(actual_start_at, planned_start_at, created_at)) as bucket_date,
        COUNT(*) as trip_count,
        COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed_count,
        COALESCE(SUM(CASE WHEN status = 'COMPLETED' AND end_odometer_km IS NOT NULL AND start_odometer_km IS NOT NULL THEN (end_odometer_km - start_odometer_km) ELSE 0 END), 0) as distance_km
      FROM trips
      WHERE organization_id = ${organizationId}::uuid
        AND COALESCE(actual_start_at, planned_start_at, created_at) >= ${window.from}
        AND COALESCE(actual_start_at, planned_start_at, created_at) < ${window.to}
        ${filters?.vehicleId ? Prisma.sql`AND vehicle_id = ${filters.vehicleId}::uuid` : Prisma.empty}
        ${filters?.driverId ? Prisma.sql`AND driver_id = ${filters.driverId}::uuid` : Prisma.empty}
      GROUP BY DATE_TRUNC('day', COALESCE(actual_start_at, planned_start_at, created_at))
      ORDER BY bucket_date ASC
    `);

    // Top vehicles
    const vehicleBreakdown = await this.database.$queryRaw<
      {
        vehicle_id: string;
        display_id: string;
        trip_count: bigint;
        distance_km: number | null;
      }[]
    >(Prisma.sql`
      SELECT
        v.id as vehicle_id,
        v.display_id,
        COUNT(t.id) as trip_count,
        COALESCE(SUM(CASE WHEN t.status = 'COMPLETED' AND t.end_odometer_km IS NOT NULL AND t.start_odometer_km IS NOT NULL THEN (t.end_odometer_km - t.start_odometer_km) ELSE 0 END), 0) as distance_km
      FROM trips t
      JOIN vehicles v ON v.id = t.vehicle_id AND v.organization_id = t.organization_id
      WHERE t.organization_id = ${organizationId}::uuid
        AND COALESCE(t.actual_start_at, t.planned_start_at, t.created_at) >= ${window.from}
        AND COALESCE(t.actual_start_at, t.planned_start_at, t.created_at) < ${window.to}
      GROUP BY v.id, v.display_id
      ORDER BY trip_count DESC
      LIMIT 10
    `);

    // Driver summaries (objective operational measures only)
    const driverBreakdown = await this.database.$queryRaw<
      {
        driver_id: string;
        display_id: string;
        first_name: string;
        last_name: string;
        trip_count: bigint;
        completed_count: bigint;
        total_distance: number | null;
      }[]
    >(Prisma.sql`
      SELECT
        d.id as driver_id,
        d.display_id,
        d.first_name,
        d.last_name,
        COUNT(t.id) as trip_count,
        COUNT(t.id) FILTER (WHERE t.status = 'COMPLETED') as completed_count,
        COALESCE(SUM(CASE WHEN t.status = 'COMPLETED' AND t.end_odometer_km IS NOT NULL AND t.start_odometer_km IS NOT NULL THEN (t.end_odometer_km - t.start_odometer_km) ELSE 0 END), 0) as total_distance
      FROM trips t
      JOIN drivers d ON d.id = t.driver_id AND d.organization_id = t.organization_id
      WHERE t.organization_id = ${organizationId}::uuid
        AND COALESCE(t.actual_start_at, t.planned_start_at, t.created_at) >= ${window.from}
        AND COALESCE(t.actual_start_at, t.planned_start_at, t.created_at) < ${window.to}
      GROUP BY d.id, d.display_id, d.first_name, d.last_name
      ORDER BY trip_count DESC
      LIMIT 10
    `);

    return {
      metadata: {
        reportKey: 'trips',
        from: window.from.toISOString(),
        to: window.to.toISOString(),
        timezone: 'UTC',
        generatedAt: now.toISOString(),
      },
      counts: {
        totalTrips: Number(row.total_trips),
        draftCount: Number(row.draft_count),
        readyCount: Number(row.ready_count),
        inProgressCount: Number(row.in_progress_count),
        completedCount: completed,
        cancelledCount: cancelled,
        abortedCount: aborted,
      },
      rates: {
        terminalTripsDenominator: terminalDenominator,
        completionRatePercent: safePercentage(completed, terminalDenominator),
        cancellationRatePercent: safePercentage(cancelled, terminalDenominator),
        abortRatePercent: safePercentage(aborted, terminalDenominator),
      },
      metrics: {
        totalDistanceKm: totalDistance,
        averageDistanceKm: safeDivide(totalDistance, completed),
        totalDurationSeconds: totalDuration,
        averageDurationSeconds: safeDivide(totalDuration, completed),
      },
      timeSeries: timeSeriesRows.map((ts) => ({
        bucketDate: ts.bucket_date.toISOString().slice(0, 10),
        tripCount: Number(ts.trip_count),
        completedCount: Number(ts.completed_count),
        distanceKm: Number(ts.distance_km ?? 0),
      })),
      topVehicles: vehicleBreakdown.map((vb) => ({
        vehicleId: vb.vehicle_id,
        displayId: vb.display_id,
        tripCount: Number(vb.trip_count),
        distanceKm: Number(vb.distance_km ?? 0),
      })),
      driverSummaries: driverBreakdown.map((db) => ({
        driverId: db.driver_id,
        displayId: db.display_id,
        name: `${db.first_name} ${db.last_name}`.trim(),
        tripCount: Number(db.trip_count),
        completedCount: Number(db.completed_count),
        totalDistanceKm: Number(db.total_distance ?? 0),
      })),
    };
  }

  async getFuelAnalytics(
    organizationId: string,
    window: ReportTimeWindow,
    filters?: {
      readonly vehicleId?: string;
      readonly fuelType?: string;
    },
  ): Promise<FuelAnalyticsReportData> {
    const now = new Date();

    // POSTED fuel transactions only (VOIDED excluded)
    // Group spend by currency
    const spendRows = await this.database.$queryRaw<
      { currency_code: string; total_spend: number | null; tx_count: bigint }[]
    >(Prisma.sql`
      SELECT
        currency_code,
        SUM(total_amount) as total_spend,
        COUNT(*) as tx_count
      FROM fuel_transactions
      WHERE organization_id = ${organizationId}::uuid
        AND status = 'POSTED'
        AND occurred_at >= ${window.from}
        AND occurred_at < ${window.to}
        ${filters?.vehicleId ? Prisma.sql`AND vehicle_id = ${filters.vehicleId}::uuid` : Prisma.empty}
      GROUP BY currency_code
      ORDER BY currency_code ASC
    `);

    // Quantities grouped strictly by quantity_unit (NEVER add LITER + KWH)
    const quantityRows = await this.database.$queryRaw<
      { quantity_unit: string; total_quantity: number | null }[]
    >(Prisma.sql`
      SELECT
        quantity_unit,
        SUM(quantity) as total_quantity
      FROM fuel_transactions
      WHERE organization_id = ${organizationId}::uuid
        AND status = 'POSTED'
        AND occurred_at >= ${window.from}
        AND occurred_at < ${window.to}
        ${filters?.vehicleId ? Prisma.sql`AND vehicle_id = ${filters.vehicleId}::uuid` : Prisma.empty}
      GROUP BY quantity_unit
      ORDER BY quantity_unit ASC
    `);

    // Distribution by fuel_type
    const typeDistribution = await this.database.$queryRaw<
      { fuel_type: string; count: bigint; total_qty: number | null; quantity_unit: string }[]
    >(Prisma.sql`
      SELECT
        energy_type as fuel_type,
        COUNT(*) as count,
        SUM(quantity) as total_qty,
        quantity_unit
      FROM fuel_transactions
      WHERE organization_id = ${organizationId}::uuid
        AND status = 'POSTED'
        AND occurred_at >= ${window.from}
        AND occurred_at < ${window.to}
        ${filters?.vehicleId ? Prisma.sql`AND vehicle_id = ${filters.vehicleId}::uuid` : Prisma.empty}
        ${filters?.fuelType ? Prisma.sql`AND energy_type = ${filters.fuelType}::"FuelType"` : Prisma.empty}
      GROUP BY energy_type, quantity_unit
      ORDER BY count DESC
    `);

    // Anomalies count by code
    const anomalyRows = await this.database.$queryRaw<{ code: string; count: bigint }[]>(Prisma.sql`
      SELECT
        a.code,
        COUNT(a.id) as count
      FROM fuel_transaction_anomalies a
      JOIN fuel_transactions f ON f.id = a.fuel_transaction_id AND f.organization_id = a.organization_id
      WHERE a.organization_id = ${organizationId}::uuid
        AND f.status = 'POSTED'
        AND f.occurred_at >= ${window.from}
        AND f.occurred_at < ${window.to}
      GROUP BY a.code
      ORDER BY count DESC
    `);

    // Anomalies count by persisted severity
    const anomalySeverityRows = await this.database.$queryRaw<
      { severity: string; count: bigint }[]
    >(Prisma.sql`
      SELECT
        a.severity,
        COUNT(a.id) as count
      FROM fuel_transaction_anomalies a
      JOIN fuel_transactions f ON f.id = a.fuel_transaction_id AND f.organization_id = a.organization_id
      WHERE a.organization_id = ${organizationId}::uuid
        AND f.status = 'POSTED'
        AND f.occurred_at >= ${window.from}
        AND f.occurred_at < ${window.to}
      GROUP BY a.severity
      ORDER BY count DESC
    `);

    // Efficiency for LITER transactions where odometer distance evidence exists
    const literEfficiency = await this.database.$queryRaw<
      { tx_count: bigint; total_liters: number | null; total_dist: number | null }[]
    >(Prisma.sql`
      SELECT
        COUNT(*) as tx_count,
        SUM(quantity) as total_liters,
        SUM(CASE WHEN odometer_km IS NOT NULL THEN 0 ELSE 0 END) as total_dist
      FROM fuel_transactions
      WHERE organization_id = ${organizationId}::uuid
        AND status = 'POSTED'
        AND quantity_unit = 'LITER'
        AND occurred_at >= ${window.from}
        AND occurred_at < ${window.to}
    `);

    const effRow = literEfficiency[0] ?? { tx_count: 0n, total_liters: 0, total_dist: 0 };
    const totalLiters = Number(effRow.total_liters ?? 0);
    const totalDist = Number(effRow.total_dist ?? 0);

    // Time-series
    const timeSeries = await this.database.$queryRaw<
      { bucket_date: Date; currency_code: string; spend: number | null; tx_count: bigint }[]
    >(Prisma.sql`
      SELECT
        DATE_TRUNC('day', occurred_at) as bucket_date,
        currency_code,
        SUM(total_amount) as spend,
        COUNT(*) as tx_count
      FROM fuel_transactions
      WHERE organization_id = ${organizationId}::uuid
        AND status = 'POSTED'
        AND occurred_at >= ${window.from}
        AND occurred_at < ${window.to}
      GROUP BY DATE_TRUNC('day', occurred_at), currency_code
      ORDER BY bucket_date ASC, currency_code ASC
    `);

    return {
      metadata: {
        reportKey: 'fuel',
        from: window.from.toISOString(),
        to: window.to.toISOString(),
        timezone: 'UTC',
        generatedAt: now.toISOString(),
      },
      spendsByCurrency: spendRows.map((s) => ({
        currencyCode: s.currency_code,
        totalSpend: Number(s.total_spend ?? 0),
        transactionCount: Number(s.tx_count),
      })),
      quantitiesByUnit: quantityRows.map((q) => ({
        quantityUnit: q.quantity_unit,
        totalQuantity: Number(q.total_quantity ?? 0),
      })),
      fuelTypeDistribution: typeDistribution.map((t) => ({
        fuelType: t.fuel_type,
        count: Number(t.count),
        totalQuantity: Number(t.total_qty ?? 0),
        quantityUnit: t.quantity_unit,
      })),
      anomalies: anomalyRows.map((a) => ({
        anomalyCode: a.code,
        count: Number(a.count),
      })),
      anomaliesBySeverity: anomalySeverityRows.map((s) => ({
        severity: s.severity,
        count: Number(s.count),
      })),
      efficiency: {
        literTransactionsEvaluated: Number(effRow.tx_count),
        totalLiters,
        totalDistanceKm: totalDist,
        fleetKmLiter: safeDivide(totalDist, totalLiters),
      },
      timeSeries: timeSeries.map((ts) => ({
        bucketDate: ts.bucket_date.toISOString().slice(0, 10),
        currencyCode: ts.currency_code,
        spend: Number(ts.spend ?? 0),
        transactionCount: Number(ts.tx_count),
      })),
    };
  }

  async getCostAnalytics(
    organizationId: string,
    window: ReportTimeWindow,
    filters?: {
      readonly vehicleId?: string;
      readonly categoryId?: string;
      readonly currency?: string;
    },
  ): Promise<CostAnalyticsReportData> {
    const now = new Date();

    // 1. Authoritative trip distance in period for cost/km
    const tripDistRows = await this.database.$queryRaw<
      { total_distance: number | null }[]
    >(Prisma.sql`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'COMPLETED' AND end_odometer_km IS NOT NULL AND start_odometer_km IS NOT NULL THEN (end_odometer_km - start_odometer_km) ELSE 0 END), 0) as total_distance
      FROM trips
      WHERE organization_id = ${organizationId}::uuid
        AND status = 'COMPLETED'
        AND actual_end_at >= ${window.from}
        AND actual_end_at < ${window.to}
        ${filters?.vehicleId ? Prisma.sql`AND vehicle_id = ${filters.vehicleId}::uuid` : Prisma.empty}
    `);
    const authoritativeDistance = Number(tripDistRows[0]?.total_distance ?? 0);

    // 2. POSTED expenses by currency (DRAFT and VOIDED excluded)
    const expenseSummaries = await this.database.$queryRaw<
      { currency_code: string; total_expense: number | null; tx_count: bigint }[]
    >(Prisma.sql`
      SELECT
        currency_code,
        SUM(amount) as total_expense,
        COUNT(*) as tx_count
      FROM expenses
      WHERE organization_id = ${organizationId}::uuid
        AND status = 'POSTED'
        AND occurred_at >= ${window.from}
        AND occurred_at < ${window.to}
        ${filters?.vehicleId ? Prisma.sql`AND vehicle_id = ${filters.vehicleId}::uuid` : Prisma.empty}
        ${filters?.categoryId ? Prisma.sql`AND category_id = ${filters.categoryId}::uuid` : Prisma.empty}
        ${filters?.currency ? Prisma.sql`AND currency_code = ${filters.currency}` : Prisma.empty}
      GROUP BY currency_code
    `);

    // 3. POSTED fuel by currency (VOIDED excluded)
    const fuelSummaries = await this.database.$queryRaw<
      { currency_code: string; total_fuel: number | null; tx_count: bigint }[]
    >(Prisma.sql`
      SELECT
        currency_code,
        SUM(total_amount) as total_fuel,
        COUNT(*) as tx_count
      FROM fuel_transactions
      WHERE organization_id = ${organizationId}::uuid
        AND status = 'POSTED'
        AND occurred_at >= ${window.from}
        AND occurred_at < ${window.to}
        ${filters?.vehicleId ? Prisma.sql`AND vehicle_id = ${filters.vehicleId}::uuid` : Prisma.empty}
        ${filters?.currency ? Prisma.sql`AND currency_code = ${filters.currency}` : Prisma.empty}
      GROUP BY currency_code
    `);

    // Combine currencies strictly without FX
    const currencyMap = new Map<
      string,
      {
        expense: number;
        expenseCount: number;
        fuel: number;
        fuelCount: number;
      }
    >();

    for (const es of expenseSummaries) {
      const cur = es.currency_code;
      const existing = currencyMap.get(cur) ?? {
        expense: 0,
        expenseCount: 0,
        fuel: 0,
        fuelCount: 0,
      };
      existing.expense += Number(es.total_expense ?? 0);
      existing.expenseCount += Number(es.tx_count);
      currencyMap.set(cur, existing);
    }

    for (const fs of fuelSummaries) {
      const cur = fs.currency_code;
      const existing = currencyMap.get(cur) ?? {
        expense: 0,
        expenseCount: 0,
        fuel: 0,
        fuelCount: 0,
      };
      existing.fuel += Number(fs.total_fuel ?? 0);
      existing.fuelCount += Number(fs.tx_count);
      currencyMap.set(cur, existing);
    }

    const summariesByCurrency: CostCurrencySummary[] = [];
    for (const [currencyCode, values] of currencyMap.entries()) {
      const totalCost = values.expense + values.fuel;
      summariesByCurrency.push({
        currencyCode,
        totalExpenseAmount: values.expense,
        totalFuelAmount: values.fuel,
        totalCost,
        expenseTransactionCount: values.expenseCount,
        fuelTransactionCount: values.fuelCount,
        authoritativeDistanceKm: authoritativeDistance,
        costPerKm: safeDivide(totalCost, authoritativeDistance),
      });
    }

    // Sort by currencyCode
    summariesByCurrency.sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));

    // 4. Categories breakdown (with percentage within currency)
    const categoryRows = await this.database.$queryRaw<
      { category_id: string; category_name: string; currency_code: string; amount: number | null }[]
    >(Prisma.sql`
      SELECT
        c.id as category_id,
        c.name as category_name,
        e.currency_code as currency_code,
        SUM(e.amount) as amount
      FROM expenses e
      JOIN expense_categories c ON c.id = e.category_id AND c.organization_id = e.organization_id
      WHERE e.organization_id = ${organizationId}::uuid
        AND e.status = 'POSTED'
        AND e.occurred_at >= ${window.from}
        AND e.occurred_at < ${window.to}
        ${filters?.vehicleId ? Prisma.sql`AND e.vehicle_id = ${filters.vehicleId}::uuid` : Prisma.empty}
        ${filters?.currency ? Prisma.sql`AND e.currency_code = ${filters.currency}` : Prisma.empty}
      GROUP BY c.id, c.name, e.currency_code
      ORDER BY amount DESC
    `);

    const categories: CostAnalyticsReportData['categories'] = categoryRows.map((cr) => {
      const curSummary = summariesByCurrency.find((s) => s.currencyCode === cr.currency_code);
      const totalInCur = curSummary?.totalExpenseAmount ?? 0;
      const amt = Number(cr.amount ?? 0);
      const pct = safePercentage(amt, totalInCur) ?? 0;
      return {
        categoryId: cr.category_id,
        categoryName: cr.category_name,
        currencyCode: cr.currency_code,
        totalAmount: amt,
        percentageWithinCurrency: pct,
      };
    });

    // 5. Vehicle totals per currency
    const vehicleCostRows = await this.database.$queryRaw<
      {
        vehicle_id: string;
        display_id: string;
        registration: string;
        currency_code: string;
        fuel_amt: number | null;
        expense_amt: number | null;
      }[]
    >(Prisma.sql`
      WITH fuel_totals AS (
        SELECT vehicle_id, currency_code, SUM(total_amount) as fuel_amt
        FROM fuel_transactions
        WHERE organization_id = ${organizationId}::uuid
          AND status = 'POSTED'
          AND occurred_at >= ${window.from}
          AND occurred_at < ${window.to}
        GROUP BY vehicle_id, currency_code
      ),
      expense_totals AS (
        SELECT vehicle_id, currency_code, SUM(amount) as expense_amt
        FROM expenses
        WHERE organization_id = ${organizationId}::uuid
          AND status = 'POSTED'
          AND occurred_at >= ${window.from}
          AND occurred_at < ${window.to}
          AND vehicle_id IS NOT NULL
        GROUP BY vehicle_id, currency_code
      )
      SELECT
        v.id as vehicle_id,
        v.display_id,
        v.registration,
        COALESCE(f.currency_code, e.currency_code) as currency_code,
        COALESCE(f.fuel_amt, 0) as fuel_amt,
        COALESCE(e.expense_amt, 0) as expense_amt
      FROM vehicles v
      LEFT JOIN fuel_totals f ON f.vehicle_id = v.id
      LEFT JOIN expense_totals e ON e.vehicle_id = v.id AND (f.currency_code IS NULL OR e.currency_code = f.currency_code)
      WHERE v.organization_id = ${organizationId}::uuid
        AND (f.fuel_amt IS NOT NULL OR e.expense_amt IS NOT NULL)
      ORDER BY (COALESCE(f.fuel_amt, 0) + COALESCE(e.expense_amt, 0)) DESC
      LIMIT 20
    `);

    const vehicleTotals: CostAnalyticsReportData['vehicleTotals'] = vehicleCostRows.map((vr) => {
      const fAmt = Number(vr.fuel_amt ?? 0);
      const eAmt = Number(vr.expense_amt ?? 0);
      return {
        vehicleId: vr.vehicle_id,
        displayId: vr.display_id,
        registration: vr.registration,
        currencyCode: vr.currency_code,
        fuelAmount: fAmt,
        expenseAmount: eAmt,
        totalAmount: fAmt + eAmt,
      };
    });

    // 6. Time series per currency
    const timeSeriesRows = await this.database.$queryRaw<
      { bucket_date: Date; currency_code: string; total_cost: number | null }[]
    >(Prisma.sql`
      WITH daily_costs AS (
        SELECT DATE_TRUNC('day', occurred_at) as day, currency_code, SUM(total_amount) as cost
        FROM fuel_transactions
        WHERE organization_id = ${organizationId}::uuid
          AND status = 'POSTED'
          AND occurred_at >= ${window.from}
          AND occurred_at < ${window.to}
        GROUP BY DATE_TRUNC('day', occurred_at), currency_code
        UNION ALL
        SELECT DATE_TRUNC('day', occurred_at) as day, currency_code, SUM(amount) as cost
        FROM expenses
        WHERE organization_id = ${organizationId}::uuid
          AND status = 'POSTED'
          AND occurred_at >= ${window.from}
          AND occurred_at < ${window.to}
        GROUP BY DATE_TRUNC('day', occurred_at), currency_code
      )
      SELECT
        day as bucket_date,
        currency_code,
        SUM(cost) as total_cost
      FROM daily_costs
      GROUP BY day, currency_code
      ORDER BY bucket_date ASC, currency_code ASC
    `);

    return {
      metadata: {
        reportKey: 'costs',
        from: window.from.toISOString(),
        to: window.to.toISOString(),
        timezone: 'UTC',
        generatedAt: now.toISOString(),
      },
      summariesByCurrency,
      categories,
      vehicleTotals,
      timeSeries: timeSeriesRows.map((ts) => ({
        bucketDate: ts.bucket_date.toISOString().slice(0, 10),
        currencyCode: ts.currency_code,
        totalCost: Number(ts.total_cost ?? 0),
      })),
    };
  }

  async getMaintenanceAnalytics(
    organizationId: string,
    window: ReportTimeWindow,
    filters?: {
      readonly vehicleId?: string;
      readonly status?: string;
    },
  ): Promise<MaintenanceAnalyticsReportData> {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [
      requestsSummary,
      workOrdersSummary,
      cycleTimeRow,
      operationalCosts,
      upcomingSchedules,
      dueSchedules,
      overdueSchedules,
    ] = await Promise.all([
      this.database.$queryRaw<
        { status: string; count: bigint; blocking_count: bigint }[]
      >(Prisma.sql`
        SELECT
          status,
          COUNT(*) as count,
          COUNT(*) FILTER (WHERE blocks_operation = true) as blocking_count
        FROM maintenance_requests
        WHERE organization_id = ${organizationId}::uuid
          ${filters?.vehicleId ? Prisma.sql`AND vehicle_id = ${filters.vehicleId}::uuid` : Prisma.empty}
        GROUP BY status
      `),
      this.database.$queryRaw<
        { status: string; count: bigint; completed_in_period: bigint }[]
      >(Prisma.sql`
        SELECT
          status,
          COUNT(*) as count,
          COUNT(*) FILTER (WHERE status = 'COMPLETED' AND completed_at >= ${window.from} AND completed_at < ${window.to}) as completed_in_period
        FROM maintenance_work_orders
        WHERE organization_id = ${organizationId}::uuid
          ${filters?.vehicleId ? Prisma.sql`AND vehicle_id = ${filters.vehicleId}::uuid` : Prisma.empty}
        GROUP BY status
      `),
      this.database.$queryRaw<{ avg_hours: number | null }[]>(Prisma.sql`
        SELECT
          AVG(EXTRACT(EPOCH FROM (completed_at - COALESCE(opened_at, created_at))) / 3600) as avg_hours
        FROM maintenance_work_orders
        WHERE organization_id = ${organizationId}::uuid
          AND status = 'COMPLETED'
          AND completed_at >= ${window.from}
          AND completed_at < ${window.to}
      `),
      this.database.$queryRaw<{ part_cost: number | null; labor_cost: number | null }[]>(Prisma.sql`
        SELECT
          (SELECT COALESCE(SUM(quantity * unit_cost), 0)
           FROM maintenance_work_order_parts p
           JOIN maintenance_work_orders w ON w.id = p.work_order_id AND w.organization_id = p.organization_id
           WHERE p.organization_id = ${organizationId}::uuid
             AND w.status = 'COMPLETED'
             AND w.completed_at >= ${window.from}
             AND w.completed_at < ${window.to}) as part_cost,
          (SELECT COALESCE(SUM(hours * hourly_rate), 0)
           FROM maintenance_work_order_labor l
           JOIN maintenance_work_orders w ON w.id = l.work_order_id AND w.organization_id = l.organization_id
           WHERE l.organization_id = ${organizationId}::uuid
             AND w.status = 'COMPLETED'
             AND w.completed_at >= ${window.from}
             AND w.completed_at < ${window.to}) as labor_cost
      `),
      this.database.vehicleMaintenanceSchedule.count({
        where: {
          organizationId,
          nextDueAt: { gt: now, lte: in30Days },
        },
      }),
      this.database.vehicleMaintenanceSchedule.count({
        where: {
          organizationId,
          nextDueAt: { lte: now, gt: new Date(now.getTime() - 7 * 24 * 3600 * 1000) },
        },
      }),
      this.database.vehicleMaintenanceSchedule.count({
        where: {
          organizationId,
          nextDueAt: { lte: new Date(now.getTime() - 7 * 24 * 3600 * 1000) },
        },
      }),
    ]);

    let totalOpen = 0;
    let blockingCount = 0;
    const reqStatusList: { status: string; count: number }[] = [];

    for (const rs of requestsSummary) {
      const c = Number(rs.count);
      reqStatusList.push({ status: rs.status, count: c });
      if (rs.status === 'OPEN') {
        totalOpen += c;
        blockingCount += Number(rs.blocking_count);
      }
    }

    let completedInPeriod = 0;
    const woStatusList: { status: string; count: number }[] = [];
    for (const ws of workOrdersSummary) {
      woStatusList.push({ status: ws.status, count: Number(ws.count) });
      completedInPeriod += Number(ws.completed_in_period);
    }

    const partCost = Number(operationalCosts[0]?.part_cost ?? 0);
    const laborCost = Number(operationalCosts[0]?.labor_cost ?? 0);

    return {
      metadata: {
        reportKey: 'maintenance',
        from: window.from.toISOString(),
        to: window.to.toISOString(),
        timezone: 'UTC',
        generatedAt: now.toISOString(),
      },
      requests: {
        totalOpenRequests: totalOpen,
        blockingRequestsCount: blockingCount,
        requestsByStatus: reqStatusList,
      },
      workOrders: {
        completedInPeriodCount: completedInPeriod,
        workOrdersByStatus: woStatusList,
        averageCycleTimeHours: cycleTimeRow[0]?.avg_hours
          ? Math.round(Number(cycleTimeRow[0].avg_hours) * 10) / 10
          : null,
        operationalTotals: {
          totalPartCostOperational: partCost,
          totalLaborCostOperational: laborCost,
          totalWorkOrderOperationalCost: partCost + laborCost,
        },
      },
      preventiveSchedules: {
        upcomingCount: upcomingSchedules,
        dueCount: dueSchedules,
        overdueCount: overdueSchedules,
      },
    };
  }

  async getComplianceAnalytics(
    organizationId: string,
    window: ReportTimeWindow,
  ): Promise<ComplianceAnalyticsReportData> {
    const now = new Date();
    const refDateOnly = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    const [docTypes, activeDocs, activeVehicles, activeDrivers, periodUploads, periodRevocations] =
      await Promise.all([
        this.database.complianceDocumentType.findMany({
          where: { organizationId, status: 'ACTIVE' },
        }),
        this.database.complianceDocument.findMany({
          where: { organizationId, status: 'ACTIVE' },
        }),
        this.database.vehicle.findMany({
          where: { organizationId, status: 'ACTIVE' },
          select: { id: true },
        }),
        this.database.driver.findMany({
          where: { organizationId, status: 'ACTIVE' },
          select: { id: true },
        }),
        this.database.complianceDocument.count({
          where: { organizationId, createdAt: { gte: window.from, lt: window.to } },
        }),
        this.database.complianceDocument.count({
          where: {
            organizationId,
            status: 'REVOKED',
            updatedAt: { gte: window.from, lt: window.to },
          },
        }),
      ]);

    const docTypeMap = new Map(docTypes.map((dt) => [dt.id, dt]));

    // Documents by type and document expiry stats
    const countByTypeId = new Map<string, number>();
    let totalExpiredDocs = 0;
    let totalExpiringSoonDocs = 0;

    for (const doc of activeDocs) {
      countByTypeId.set(doc.documentTypeId, (countByTypeId.get(doc.documentTypeId) ?? 0) + 1);

      if (doc.expiresOn) {
        const expDateOnly = new Date(
          Date.UTC(
            doc.expiresOn.getUTCFullYear(),
            doc.expiresOn.getUTCMonth(),
            doc.expiresOn.getUTCDate(),
          ),
        );
        if (refDateOnly > expDateOnly) {
          totalExpiredDocs++;
        } else {
          const diffDays = Math.ceil(
            (expDateOnly.getTime() - refDateOnly.getTime()) / (1000 * 60 * 60 * 24),
          );
          const dt = docTypeMap.get(doc.documentTypeId);
          const warningDays = dt?.warningDaysBeforeExpiry ?? 30;
          if (diffDays <= warningDays) {
            totalExpiringSoonDocs++;
          }
        }
      }
    }

    const documentsByType = docTypes.map((dt) => ({
      typeCode: dt.code,
      typeName: dt.name,
      count: countByTypeId.get(dt.id) ?? 0,
    }));

    // Evaluate vehicle compliance
    const vehicleDocs = new Map<string, typeof activeDocs>();
    for (const doc of activeDocs) {
      if (doc.vehicleId) {
        const list = vehicleDocs.get(doc.vehicleId) ?? [];
        list.push(doc);
        vehicleDocs.set(doc.vehicleId, list);
      }
    }
    const vehicleTypes = docTypes.filter((t) => t.subjectType === 'VEHICLE');
    let vehicleCompliant = 0;
    let vehicleWarning = 0;
    let vehicleNonCompliant = 0;
    let vehicleBlocked = 0;
    let missingRequiredCount = 0;

    for (const v of activeVehicles) {
      const docs = vehicleDocs.get(v.id) ?? [];
      const docsByTypeId = new Map(docs.map((d) => [d.documentTypeId, d]));
      let hasMissingRequired = false;
      let hasExpiredRequired = false;
      let hasExpiringSoon = false;
      let isBlocked = false;

      for (const dt of vehicleTypes) {
        const doc = docsByTypeId.get(dt.id);
        if (!doc) {
          if (dt.required) {
            hasMissingRequired = true;
            missingRequiredCount++;
            if (dt.blocksOperation) isBlocked = true;
          }
        } else if (doc.expiresOn) {
          const expDateOnly = new Date(
            Date.UTC(
              doc.expiresOn.getUTCFullYear(),
              doc.expiresOn.getUTCMonth(),
              doc.expiresOn.getUTCDate(),
            ),
          );
          if (refDateOnly > expDateOnly) {
            if (dt.required) {
              hasExpiredRequired = true;
              if (dt.blocksOperation) isBlocked = true;
            }
          } else {
            const diffDays = Math.ceil(
              (expDateOnly.getTime() - refDateOnly.getTime()) / (1000 * 60 * 60 * 24),
            );
            if (diffDays <= dt.warningDaysBeforeExpiry) {
              hasExpiringSoon = true;
            }
          }
        }
      }

      if (hasMissingRequired || hasExpiredRequired) {
        vehicleNonCompliant++;
      } else if (hasExpiringSoon) {
        vehicleWarning++;
      } else {
        vehicleCompliant++;
      }
      if (isBlocked) {
        vehicleBlocked++;
      }
    }

    // Evaluate driver compliance
    const driverDocs = new Map<string, typeof activeDocs>();
    for (const doc of activeDocs) {
      if (doc.driverId) {
        const list = driverDocs.get(doc.driverId) ?? [];
        list.push(doc);
        driverDocs.set(doc.driverId, list);
      }
    }
    const driverTypes = docTypes.filter((t) => t.subjectType === 'DRIVER');
    let driverCompliant = 0;
    let driverWarning = 0;
    let driverNonCompliant = 0;
    let driverBlocked = 0;

    for (const d of activeDrivers) {
      const docs = driverDocs.get(d.id) ?? [];
      const docsByTypeId = new Map(docs.map((doc) => [doc.documentTypeId, doc]));
      let hasMissingRequired = false;
      let hasExpiredRequired = false;
      let hasExpiringSoon = false;
      let isBlocked = false;

      for (const dt of driverTypes) {
        const doc = docsByTypeId.get(dt.id);
        if (!doc) {
          if (dt.required) {
            hasMissingRequired = true;
            missingRequiredCount++;
            if (dt.blocksOperation) isBlocked = true;
          }
        } else if (doc.expiresOn) {
          const expDateOnly = new Date(
            Date.UTC(
              doc.expiresOn.getUTCFullYear(),
              doc.expiresOn.getUTCMonth(),
              doc.expiresOn.getUTCDate(),
            ),
          );
          if (refDateOnly > expDateOnly) {
            if (dt.required) {
              hasExpiredRequired = true;
              if (dt.blocksOperation) isBlocked = true;
            }
          } else {
            const diffDays = Math.ceil(
              (expDateOnly.getTime() - refDateOnly.getTime()) / (1000 * 60 * 60 * 24),
            );
            if (diffDays <= dt.warningDaysBeforeExpiry) {
              hasExpiringSoon = true;
            }
          }
        }
      }

      if (hasMissingRequired || hasExpiredRequired) {
        driverNonCompliant++;
      } else if (hasExpiringSoon) {
        driverWarning++;
      } else {
        driverCompliant++;
      }
      if (isBlocked) {
        driverBlocked++;
      }
    }

    return {
      metadata: {
        reportKey: 'compliance',
        from: window.from.toISOString(),
        to: window.to.toISOString(),
        timezone: 'UTC',
        generatedAt: now.toISOString(),
      },
      vehicleCompliance: {
        compliantCount: vehicleCompliant,
        warningCount: vehicleWarning,
        nonCompliantCount: vehicleNonCompliant,
        blockedCount: vehicleBlocked,
      },
      driverCompliance: {
        compliantCount: driverCompliant,
        warningCount: driverWarning,
        nonCompliantCount: driverNonCompliant,
        blockedCount: driverBlocked,
      },
      documents: {
        totalActiveDocuments: activeDocs.length,
        expiredCount: totalExpiredDocs,
        expiringSoonCount: totalExpiringSoonDocs,
        missingRequiredCount,
        documentsByType,
      },
      periodActivity: {
        uploadedCount: periodUploads,
        revokedCount: periodRevocations,
      },
    };
  }

  async getIncidentAnalytics(
    organizationId: string,
    window: ReportTimeWindow,
    filters?: {
      readonly type?: string;
      readonly severity?: string;
      readonly status?: string;
    },
  ): Promise<IncidentAnalyticsReportData> {
    const now = new Date();

    const [
      countsRow,
      typeRows,
      severityRows,
      statusRows,
      impactRows,
      resolutionDurations,
      timeSeries,
    ] = await Promise.all([
      this.database.$queryRaw<{ total: bigint; unresolved: bigint; blocking: bigint }[]>(Prisma.sql`
          SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status IN ('REPORTED', 'INVESTIGATING')) as unresolved,
            COUNT(*) FILTER (WHERE status IN ('REPORTED', 'INVESTIGATING') AND operational_impact IN ('VEHICLE', 'DRIVER', 'BOTH')) as blocking
          FROM incidents
          WHERE organization_id = ${organizationId}::uuid
            AND occurred_at >= ${window.from}
            AND occurred_at < ${window.to}
            ${filters?.type ? Prisma.sql`AND type = ${filters.type}::"IncidentType"` : Prisma.empty}
            ${filters?.severity ? Prisma.sql`AND severity = ${filters.severity}::"IncidentSeverity"` : Prisma.empty}
            ${filters?.status ? Prisma.sql`AND status = ${filters.status}::"IncidentStatus"` : Prisma.empty}
        `),
      this.database.$queryRaw<{ type: string; count: bigint }[]>(Prisma.sql`
          SELECT type, COUNT(*) as count
          FROM incidents
          WHERE organization_id = ${organizationId}::uuid
            AND occurred_at >= ${window.from}
            AND occurred_at < ${window.to}
          GROUP BY type
          ORDER BY count DESC
        `),
      this.database.$queryRaw<{ severity: string; count: bigint }[]>(Prisma.sql`
          SELECT severity, COUNT(*) as count
          FROM incidents
          WHERE organization_id = ${organizationId}::uuid
            AND occurred_at >= ${window.from}
            AND occurred_at < ${window.to}
          GROUP BY severity
          ORDER BY count DESC
        `),
      this.database.$queryRaw<{ status: string; count: bigint }[]>(Prisma.sql`
          SELECT status, COUNT(*) as count
          FROM incidents
          WHERE organization_id = ${organizationId}::uuid
            AND occurred_at >= ${window.from}
            AND occurred_at < ${window.to}
          GROUP BY status
          ORDER BY count DESC
        `),
      this.database.$queryRaw<{ impact: string; count: bigint }[]>(Prisma.sql`
          SELECT operational_impact as impact, COUNT(*) as count
          FROM incidents
          WHERE organization_id = ${organizationId}::uuid
            AND occurred_at >= ${window.from}
            AND occurred_at < ${window.to}
          GROUP BY operational_impact
          ORDER BY count DESC
        `),
      this.database.$queryRaw<
        {
          resolved_count: bigint;
          avg_res_hours: number | null;
          closed_count: bigint;
          avg_close_hours: number | null;
        }[]
      >(Prisma.sql`
          SELECT
            COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) as resolved_count,
            AVG(CASE WHEN resolved_at IS NOT NULL THEN EXTRACT(EPOCH FROM (resolved_at - occurred_at)) / 3600 ELSE NULL END) as avg_res_hours,
            COUNT(*) FILTER (WHERE closed_at IS NOT NULL) as closed_count,
            AVG(CASE WHEN closed_at IS NOT NULL AND resolved_at IS NOT NULL THEN EXTRACT(EPOCH FROM (closed_at - resolved_at)) / 3600 ELSE NULL END) as avg_close_hours
          FROM incidents
          WHERE organization_id = ${organizationId}::uuid
            AND occurred_at >= ${window.from}
            AND occurred_at < ${window.to}
        `),
      this.database.$queryRaw<{ bucket_date: Date; count: bigint }[]>(Prisma.sql`
          SELECT
            DATE_TRUNC('day', occurred_at) as bucket_date,
            COUNT(*) as count
          FROM incidents
          WHERE organization_id = ${organizationId}::uuid
            AND occurred_at >= ${window.from}
            AND occurred_at < ${window.to}
          GROUP BY DATE_TRUNC('day', occurred_at)
          ORDER BY bucket_date ASC
        `),
    ]);

    const cr = countsRow[0] ?? { total: 0n, unresolved: 0n, blocking: 0n };
    const dr = resolutionDurations[0] ?? {
      resolved_count: 0n,
      avg_res_hours: null,
      closed_count: 0n,
      avg_close_hours: null,
    };

    return {
      metadata: {
        reportKey: 'incidents',
        from: window.from.toISOString(),
        to: window.to.toISOString(),
        timezone: 'UTC',
        generatedAt: now.toISOString(),
      },
      counts: {
        totalIncidents: Number(cr.total),
        unresolvedCount: Number(cr.unresolved),
        unresolvedBlockingCount: Number(cr.blocking),
      },
      distributionByType: typeRows.map((t) => ({ type: t.type, count: Number(t.count) })),
      distributionBySeverity: severityRows.map((s) => ({
        severity: s.severity,
        count: Number(s.count),
      })),
      distributionByStatus: statusRows.map((s) => ({ status: s.status, count: Number(s.count) })),
      distributionByOperationalImpact: impactRows.map((i) => ({
        operationalImpact: i.impact,
        count: Number(i.count),
      })),
      resolutionDuration: {
        resolvedCount: Number(dr.resolved_count),
        averageResolutionHours: dr.avg_res_hours
          ? Math.round(Number(dr.avg_res_hours) * 10) / 10
          : null,
        closedCount: Number(dr.closed_count),
        averageClosureHours: dr.avg_close_hours
          ? Math.round(Number(dr.avg_close_hours) * 10) / 10
          : null,
      },
      timeSeries: timeSeries.map((ts) => ({
        bucketDate: ts.bucket_date.toISOString().slice(0, 10),
        incidentCount: Number(ts.count),
      })),
    };
  }

  async getTelemetryAnalytics(
    organizationId: string,
    window: ReportTimeWindow,
  ): Promise<TelemetryAnalyticsReportData> {
    const now = new Date();
    const freshCutoff = new Date(now.getTime() - FRESH_THRESHOLD_MS);
    const staleCutoff = new Date(now.getTime() - STALE_THRESHOLD_MS);

    const [
      deviceCounts,
      activeAssignments,
      freshVehicles,
      staleVehicles,
      totalCurrentPos,
      ingestionRows,
      coverageRows,
    ] = await Promise.all([
      this.database.telemetryDevice.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: { id: true },
      }),
      this.database.telemetryDeviceVehicleAssignment.count({
        where: { organizationId, unassignedAt: null },
      }),
      this.database.telemetryCurrentPosition.count({
        where: { organizationId, capturedAt: { gte: freshCutoff } },
      }),
      this.database.telemetryCurrentPosition.count({
        where: { organizationId, capturedAt: { lt: freshCutoff, gte: staleCutoff } },
      }),
      this.database.telemetryCurrentPosition.count({
        where: { organizationId },
      }),
      this.database.$queryRaw<
        { source: string; total_count: bigint; ooo_count: bigint }[]
      >(Prisma.sql`
        SELECT
          source,
          COUNT(*) as total_count,
          COUNT(*) FILTER (WHERE status = 'OUT_OF_ORDER') as ooo_count
        FROM telemetry_positions
        WHERE organization_id = ${organizationId}::uuid
          AND captured_at >= ${window.from}
          AND captured_at < ${window.to}
        GROUP BY source
      `),
      this.database.$queryRaw<{ total_trips: bigint; tracked_trips: bigint }[]>(Prisma.sql`
        SELECT
          COUNT(DISTINCT t.id) as total_trips,
          COUNT(DISTINCT tp.trip_id) as tracked_trips
        FROM trips t
        LEFT JOIN telemetry_positions tp ON tp.trip_id = t.id AND tp.organization_id = t.organization_id
        WHERE t.organization_id = ${organizationId}::uuid
          AND t.status IN ('COMPLETED', 'IN_PROGRESS')
          AND t.actual_start_at >= ${window.from}
          AND t.actual_start_at < ${window.to}
      `),
    ]);

    let totalDev = 0;
    let actDev = 0;
    let suspDev = 0;
    let retDev = 0;

    for (const d of deviceCounts) {
      const c = d._count.id;
      totalDev += c;
      if (d.status === 'ACTIVE') actDev = c;
      else if (d.status === 'SUSPENDED') suspDev = c;
      else if (d.status === 'INACTIVE') retDev = c;
    }

    let totalIngested = 0;
    let totalOoo = 0;
    const bySourceList: { source: string; count: number }[] = [];

    for (const ir of ingestionRows) {
      const c = Number(ir.total_count);
      totalIngested += c;
      totalOoo += Number(ir.ooo_count);
      bySourceList.push({ source: ir.source, count: c });
    }

    const covRow = coverageRows[0] ?? { total_trips: 0n, tracked_trips: 0n };
    const tripsInPeriod = Number(covRow.total_trips);
    const tripsWithTelemetry = Number(covRow.tracked_trips);

    return {
      metadata: {
        reportKey: 'telemetry',
        from: window.from.toISOString(),
        to: window.to.toISOString(),
        timezone: 'UTC',
        generatedAt: now.toISOString(),
      },
      devices: {
        totalDevices: totalDev,
        activeDevices: actDev,
        suspendedDevices: suspDev,
        inactiveDevices: retDev,
        activeAssignmentsCount: activeAssignments,
      },
      vehicleFreshness: {
        freshCount: freshVehicles,
        staleCount: staleVehicles,
        unknownCount: Math.max(0, totalCurrentPos - freshVehicles - staleVehicles),
      },
      ingestion: {
        totalPositionsIngested: totalIngested,
        outOfOrderCount: totalOoo,
        bySource: bySourceList,
      },
      trackingCoverage: {
        tripsInPeriod,
        tripsWithTelemetry,
        trackedTripCoveragePercent: safePercentage(tripsWithTelemetry, tripsInPeriod),
      },
    };
  }

  async getDashboardSummary(
    organizationId: string,
    window: ReportTimeWindow,
    permissions?: ReadonlySet<string>,
  ): Promise<DashboardReportData> {
    const hasTrip = !permissions || permissions.has('trip.read');
    const hasFinance =
      !permissions ||
      permissions.has('finance.read') ||
      (permissions.has('fuel.read') && permissions.has('expense.read'));
    const hasMaint = !permissions || permissions.has('maintenance.read');
    const hasComp = !permissions || permissions.has('compliance.read');
    const hasInc = !permissions || permissions.has('incident.read');
    const hasTelem = !permissions || permissions.has('telemetry.read');

    const [fleet, trips, costs, maintenance, compliance, incidents, telemetry] = await Promise.all([
      this.getFleetOverview(organizationId, window, permissions),
      hasTrip ? this.getTripAnalytics(organizationId, window) : null,
      hasFinance ? this.getCostAnalytics(organizationId, window) : null,
      hasMaint ? this.getMaintenanceAnalytics(organizationId, window) : null,
      hasComp ? this.getComplianceAnalytics(organizationId, window) : null,
      hasInc ? this.getIncidentAnalytics(organizationId, window) : null,
      hasTelem ? this.getTelemetryAnalytics(organizationId, window) : null,
    ]);

    return {
      metadata: {
        reportKey: 'dashboard',
        from: window.from.toISOString(),
        to: window.to.toISOString(),
        timezone: 'UTC',
        generatedAt: new Date().toISOString(),
      },
      fleetOverview: fleet.kpis,
      tripsSummary: trips
        ? {
            totalTrips: trips.counts.totalTrips,
            completedCount: trips.counts.completedCount,
            totalDistanceKm: trips.metrics.totalDistanceKm,
            completionRatePercent: trips.rates.completionRatePercent,
          }
        : null,
      costsSummary: costs ? costs.summariesByCurrency : null,
      maintenanceAlerts: maintenance
        ? {
            blockingRequestsCount: maintenance.requests.blockingRequestsCount,
            overdueSchedulesCount: maintenance.preventiveSchedules.overdueCount,
          }
        : null,
      complianceAlerts: compliance
        ? {
            nonCompliantVehicles: compliance.vehicleCompliance.nonCompliantCount,
            nonCompliantDrivers: compliance.driverCompliance.nonCompliantCount,
            expiredDocuments: compliance.documents.expiredCount,
          }
        : null,
      incidentAlerts: incidents
        ? {
            unresolvedCount: incidents.counts.unresolvedCount,
            unresolvedBlockingCount: incidents.counts.unresolvedBlockingCount,
          }
        : null,
      telemetryStatus: telemetry
        ? {
            freshVehicles: telemetry.vehicleFreshness.freshCount,
            staleVehicles: telemetry.vehicleFreshness.staleCount,
            trackedTripCoveragePercent: telemetry.trackingCoverage.trackedTripCoveragePercent,
          }
        : null,
    };
  }

  async recordExportAudit(
    organizationId: string,
    actorId: string,
    requestId: string,
    reportKey: string,
    format: string,
    from: Date,
    to: Date,
    rowCount: number,
  ): Promise<void> {
    await this.database.auditLog.create({
      data: {
        organizationId,
        actorId,
        action: 'REPORT_EXPORTED',
        entityType: 'Report',
        entityId: randomUUID(),
        beforeData: Prisma.JsonNull,
        afterData: {
          reportKey,
          format,
          from: from.toISOString(),
          to: to.toISOString(),
          rowCount,
        },
        requestId,
      },
    });
  }
}
