import type { ReportTimeWindow } from '../domain/reporting-types.js';

export interface FleetOverviewReportData {
  readonly metadata: {
    readonly reportKey: 'fleet-overview';
    readonly from: string;
    readonly to: string;
    readonly timezone: 'UTC';
    readonly generatedAt: string;
  };
  readonly kpis: {
    readonly totalVehicles: number;
    readonly draftVehicles: number;
    readonly activeVehicles: number;
    readonly retiredVehicles: number;
    readonly assignedVehicles: number;
    readonly inProgressTripVehicles: number;
    readonly blockingMaintenanceCount: number | null;
    readonly blockingComplianceCount: number | null;
    readonly blockingIncidentCount: number | null;
    readonly freshTelemetryVehicles: number | null;
    readonly staleTelemetryVehicles: number | null;
    readonly unknownOrNoTelemetryVehicles: number | null;
    readonly completedTripsInPeriod: number | null;
    readonly totalTripDistanceKmInPeriod: number | null;
  };
}

export interface VehicleUtilizationItem {
  readonly vehicleId: string;
  readonly displayId: string;
  readonly registration: string;
  readonly model: string;
  readonly status: string;
  readonly completedTripCount: number;
  readonly inProgressTripCount: number;
  readonly totalDistanceKm: number;
  readonly activeDurationSeconds: number;
  readonly activeTripDays: number;
  readonly averageTripDistanceKm: number | null;
  readonly tripTimeUtilizationPercent: number;
}

export interface VehicleUtilizationReportData {
  readonly metadata: {
    readonly reportKey: 'vehicle-utilization';
    readonly from: string;
    readonly to: string;
    readonly timezone: 'UTC';
    readonly generatedAt: string;
    readonly totalCount: number;
    readonly page: number;
    readonly limit: number;
  };
  readonly summary: {
    readonly totalVehiclesEvaluated: number;
    readonly totalDistanceKm: number;
    readonly totalCompletedTrips: number;
    readonly averageUtilizationPercent: number | null;
  };
  readonly items: readonly VehicleUtilizationItem[];
}

export interface TripAnalyticsReportData {
  readonly metadata: {
    readonly reportKey: 'trips';
    readonly from: string;
    readonly to: string;
    readonly timezone: 'UTC';
    readonly generatedAt: string;
  };
  readonly counts: {
    readonly totalTrips: number;
    readonly draftCount: number;
    readonly readyCount: number;
    readonly inProgressCount: number;
    readonly completedCount: number;
    readonly cancelledCount: number;
    readonly abortedCount: number;
  };
  readonly rates: {
    readonly terminalTripsDenominator: number;
    readonly completionRatePercent: number | null;
    readonly cancellationRatePercent: number | null;
    readonly abortRatePercent: number | null;
  };
  readonly metrics: {
    readonly totalDistanceKm: number;
    readonly averageDistanceKm: number | null;
    readonly totalDurationSeconds: number;
    readonly averageDurationSeconds: number | null;
  };
  readonly timeSeries: readonly {
    readonly bucketDate: string;
    readonly tripCount: number;
    readonly completedCount: number;
    readonly distanceKm: number;
  }[];
  readonly topVehicles: readonly {
    readonly vehicleId: string;
    readonly displayId: string;
    readonly tripCount: number;
    readonly distanceKm: number;
  }[];
  readonly driverSummaries: readonly {
    readonly driverId: string;
    readonly displayId: string;
    readonly name: string;
    readonly tripCount: number;
    readonly completedCount: number;
    readonly totalDistanceKm: number;
  }[];
}

export interface FuelCurrencySpend {
  readonly currencyCode: string;
  readonly totalSpend: number;
  readonly transactionCount: number;
}

export interface FuelQuantityTotal {
  readonly quantityUnit: string;
  readonly totalQuantity: number;
}

export interface FuelAnalyticsReportData {
  readonly metadata: {
    readonly reportKey: 'fuel';
    readonly from: string;
    readonly to: string;
    readonly timezone: 'UTC';
    readonly generatedAt: string;
  };
  readonly spendsByCurrency: readonly FuelCurrencySpend[];
  readonly quantitiesByUnit: readonly FuelQuantityTotal[];
  readonly fuelTypeDistribution: readonly {
    readonly fuelType: string;
    readonly count: number;
    readonly totalQuantity: number;
    readonly quantityUnit: string;
  }[];
  readonly anomalies: readonly {
    readonly anomalyCode: string;
    readonly count: number;
  }[];
  readonly anomaliesBySeverity: readonly {
    readonly severity: string;
    readonly count: number;
  }[];
  readonly efficiency: {
    readonly literTransactionsEvaluated: number;
    readonly totalLiters: number;
    readonly totalDistanceKm: number;
    readonly fleetKmLiter: number | null;
  };
  readonly timeSeries: readonly {
    readonly bucketDate: string;
    readonly currencyCode: string;
    readonly spend: number;
    readonly transactionCount: number;
  }[];
}

export interface CostCategoryTotal {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly currencyCode: string;
  readonly totalAmount: number;
  readonly percentageWithinCurrency: number;
}

export interface CostVehicleTotal {
  readonly vehicleId: string;
  readonly displayId: string;
  readonly registration: string;
  readonly currencyCode: string;
  readonly fuelAmount: number;
  readonly expenseAmount: number;
  readonly totalAmount: number;
}

export interface CostCurrencySummary {
  readonly currencyCode: string;
  readonly totalExpenseAmount: number;
  readonly totalFuelAmount: number;
  readonly totalCost: number;
  readonly expenseTransactionCount: number;
  readonly fuelTransactionCount: number;
  readonly authoritativeDistanceKm: number;
  readonly costPerKm: number | null;
}

export interface CostAnalyticsReportData {
  readonly metadata: {
    readonly reportKey: 'costs';
    readonly from: string;
    readonly to: string;
    readonly timezone: 'UTC';
    readonly generatedAt: string;
  };
  readonly summariesByCurrency: readonly CostCurrencySummary[];
  readonly categories: readonly CostCategoryTotal[];
  readonly vehicleTotals: readonly CostVehicleTotal[];
  readonly timeSeries: readonly {
    readonly bucketDate: string;
    readonly currencyCode: string;
    readonly totalCost: number;
  }[];
}

export interface MaintenanceAnalyticsReportData {
  readonly metadata: {
    readonly reportKey: 'maintenance';
    readonly from: string;
    readonly to: string;
    readonly timezone: 'UTC';
    readonly generatedAt: string;
  };
  readonly requests: {
    readonly totalOpenRequests: number;
    readonly blockingRequestsCount: number;
    readonly requestsByStatus: readonly {
      readonly status: string;
      readonly count: number;
    }[];
  };
  readonly workOrders: {
    readonly completedInPeriodCount: number;
    readonly workOrdersByStatus: readonly {
      readonly status: string;
      readonly count: number;
    }[];
    readonly averageCycleTimeHours: number | null;
    readonly operationalTotals: {
      readonly totalPartCostOperational: number;
      readonly totalLaborCostOperational: number;
      readonly totalWorkOrderOperationalCost: number;
    };
  };
  readonly preventiveSchedules: {
    readonly upcomingCount: number;
    readonly dueCount: number;
    readonly overdueCount: number;
  };
}

export interface ComplianceAnalyticsReportData {
  readonly metadata: {
    readonly reportKey: 'compliance';
    readonly from: string;
    readonly to: string;
    readonly timezone: 'UTC';
    readonly generatedAt: string;
  };
  readonly vehicleCompliance: {
    readonly compliantCount: number;
    readonly warningCount: number;
    readonly nonCompliantCount: number;
    readonly blockedCount: number;
  };
  readonly driverCompliance: {
    readonly compliantCount: number;
    readonly warningCount: number;
    readonly nonCompliantCount: number;
    readonly blockedCount: number;
  };
  readonly documents: {
    readonly totalActiveDocuments: number;
    readonly expiredCount: number;
    readonly expiringSoonCount: number;
    readonly missingRequiredCount: number;
    readonly documentsByType: readonly {
      readonly typeCode: string;
      readonly typeName: string;
      readonly count: number;
    }[];
  };
  readonly periodActivity: {
    readonly uploadedCount: number;
    readonly revokedCount: number;
  };
}

export interface IncidentAnalyticsReportData {
  readonly metadata: {
    readonly reportKey: 'incidents';
    readonly from: string;
    readonly to: string;
    readonly timezone: 'UTC';
    readonly generatedAt: string;
  };
  readonly counts: {
    readonly totalIncidents: number;
    readonly unresolvedCount: number;
    readonly unresolvedBlockingCount: number;
  };
  readonly distributionByType: readonly {
    readonly type: string;
    readonly count: number;
  }[];
  readonly distributionBySeverity: readonly {
    readonly severity: string;
    readonly count: number;
  }[];
  readonly distributionByStatus: readonly {
    readonly status: string;
    readonly count: number;
  }[];
  readonly distributionByOperationalImpact: readonly {
    readonly operationalImpact: string;
    readonly count: number;
  }[];
  readonly resolutionDuration: {
    readonly resolvedCount: number;
    readonly averageResolutionHours: number | null;
    readonly closedCount: number;
    readonly averageClosureHours: number | null;
  };
  readonly timeSeries: readonly {
    readonly bucketDate: string;
    readonly incidentCount: number;
  }[];
}

export interface TelemetryAnalyticsReportData {
  readonly metadata: {
    readonly reportKey: 'telemetry';
    readonly from: string;
    readonly to: string;
    readonly timezone: 'UTC';
    readonly generatedAt: string;
  };
  readonly devices: {
    readonly totalDevices: number;
    readonly activeDevices: number;
    readonly suspendedDevices: number;
    readonly inactiveDevices: number;
    readonly activeAssignmentsCount: number;
  };
  readonly vehicleFreshness: {
    readonly freshCount: number;
    readonly staleCount: number;
    readonly unknownCount: number;
  };
  readonly ingestion: {
    readonly totalPositionsIngested: number;
    readonly outOfOrderCount: number;
    readonly bySource: readonly {
      readonly source: string;
      readonly count: number;
    }[];
  };
  readonly trackingCoverage: {
    readonly tripsInPeriod: number;
    readonly tripsWithTelemetry: number;
    readonly trackedTripCoveragePercent: number | null;
  };
}

export interface DashboardReportData {
  readonly metadata: {
    readonly reportKey: 'dashboard';
    readonly from: string;
    readonly to: string;
    readonly timezone: 'UTC';
    readonly generatedAt: string;
  };
  readonly fleetOverview: FleetOverviewReportData['kpis'];
  readonly tripsSummary: {
    readonly totalTrips: number;
    readonly completedCount: number;
    readonly totalDistanceKm: number;
    readonly completionRatePercent: number | null;
  } | null;
  readonly costsSummary: readonly CostCurrencySummary[] | null;
  readonly maintenanceAlerts: {
    readonly blockingRequestsCount: number;
    readonly overdueSchedulesCount: number;
  } | null;
  readonly complianceAlerts: {
    readonly nonCompliantVehicles: number;
    readonly nonCompliantDrivers: number;
    readonly expiredDocuments: number;
  } | null;
  readonly incidentAlerts: {
    readonly unresolvedCount: number;
    readonly unresolvedBlockingCount: number;
  } | null;
  readonly telemetryStatus: {
    readonly freshVehicles: number;
    readonly staleVehicles: number;
    readonly trackedTripCoveragePercent: number | null;
  } | null;
}

export const REPORTING_REPOSITORY = Symbol('REPORTING_REPOSITORY');

export interface ReportingRepository {
  getFleetOverview(
    organizationId: string,
    window: ReportTimeWindow,
    permissions?: ReadonlySet<string>,
  ): Promise<FleetOverviewReportData>;
  getVehicleUtilization(
    organizationId: string,
    window: ReportTimeWindow,
    filters?: {
      readonly vehicleId?: string | undefined;
      readonly sortBy?: string | undefined;
      readonly sortOrder?: string | undefined;
      readonly page?: number | undefined;
      readonly limit?: number | undefined;
    },
  ): Promise<VehicleUtilizationReportData>;
  getTripAnalytics(
    organizationId: string,
    window: ReportTimeWindow,
    filters?: {
      readonly vehicleId?: string | undefined;
      readonly driverId?: string | undefined;
      readonly status?: string | undefined;
    },
  ): Promise<TripAnalyticsReportData>;
  getFuelAnalytics(
    organizationId: string,
    window: ReportTimeWindow,
    filters?: {
      readonly vehicleId?: string | undefined;
      readonly fuelType?: string | undefined;
    },
  ): Promise<FuelAnalyticsReportData>;
  getCostAnalytics(
    organizationId: string,
    window: ReportTimeWindow,
    filters?: {
      readonly vehicleId?: string | undefined;
      readonly categoryId?: string | undefined;
      readonly currency?: string | undefined;
    },
  ): Promise<CostAnalyticsReportData>;
  getMaintenanceAnalytics(
    organizationId: string,
    window: ReportTimeWindow,
    filters?: {
      readonly vehicleId?: string | undefined;
      readonly status?: string | undefined;
    },
  ): Promise<MaintenanceAnalyticsReportData>;
  getComplianceAnalytics(
    organizationId: string,
    window: ReportTimeWindow,
  ): Promise<ComplianceAnalyticsReportData>;
  getIncidentAnalytics(
    organizationId: string,
    window: ReportTimeWindow,
    filters?: {
      readonly type?: string | undefined;
      readonly severity?: string | undefined;
      readonly status?: string | undefined;
    },
  ): Promise<IncidentAnalyticsReportData>;
  getTelemetryAnalytics(
    organizationId: string,
    window: ReportTimeWindow,
  ): Promise<TelemetryAnalyticsReportData>;
  getDashboardSummary(
    organizationId: string,
    window: ReportTimeWindow,
    permissions?: ReadonlySet<string>,
  ): Promise<DashboardReportData>;
  recordExportAudit(
    organizationId: string,
    actorId: string,
    requestId: string,
    reportKey: string,
    format: string,
    from: Date,
    to: Date,
    rowCount: number,
  ): Promise<void>;
  getOrganizationName(organizationId: string): Promise<string>;
}
