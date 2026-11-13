import { Inject, Injectable } from '@nestjs/common';
import { ApplicationError } from '../../foundation/domain/errors.js';
import { normalizeReportTimeWindow } from '../domain/reporting-types.js';
import { generateCsvContent } from '../infrastructure/csv/csv-exporter.js';
import { SimplePdfRenderer } from '../infrastructure/pdf/simple-pdf-renderer.js';
import { ReportingMetricsService } from './reporting-metrics.service.js';
import {
  type ComplianceAnalyticsReportData,
  type CostAnalyticsReportData,
  type DashboardReportData,
  type FleetOverviewReportData,
  type FuelAnalyticsReportData,
  type IncidentAnalyticsReportData,
  type MaintenanceAnalyticsReportData,
  REPORTING_REPOSITORY,
  type ReportingRepository,
  type TelemetryAnalyticsReportData,
  type TripAnalyticsReportData,
  type VehicleUtilizationReportData,
} from './reporting.port.js';

export interface ExportResult {
  readonly content: Buffer;
  readonly contentType: string;
  readonly filename: string;
}

@Injectable()
export class ReportingService {
  private readonly pdfRenderer = new SimplePdfRenderer();

  constructor(
    @Inject(REPORTING_REPOSITORY) private readonly repository: ReportingRepository,
    @Inject(ReportingMetricsService) private readonly metricsService: ReportingMetricsService,
  ) {}

  async getFleetOverview(
    organizationId: string,
    fromStr?: string,
    toStr?: string,
    permissions?: ReadonlySet<string>,
  ): Promise<FleetOverviewReportData> {
    const t0 = performance.now();
    const window = normalizeReportTimeWindow(fromStr, toStr);
    try {
      const data = await this.repository.getFleetOverview(organizationId, window, permissions);
      const durationSeconds = (performance.now() - t0) / 1000;
      this.metricsService.recordQueryDuration({
        reportKey: 'fleet-overview',
        outcome: 'success',
        durationSeconds,
      });
      this.metricsService.incrementQueriesTotal({
        reportKey: 'fleet-overview',
        outcome: 'success',
      });
      return data;
    } catch (err) {
      this.metricsService.incrementQueriesTotal({ reportKey: 'fleet-overview', outcome: 'error' });
      throw err;
    }
  }

  async getVehicleUtilization(
    organizationId: string,
    fromStr?: string,
    toStr?: string,
    filters?: {
      readonly vehicleId?: string | undefined;
      readonly sortBy?: string | undefined;
      readonly sortOrder?: string | undefined;
      readonly page?: number | undefined;
      readonly limit?: number | undefined;
    },
  ): Promise<VehicleUtilizationReportData> {
    const t0 = performance.now();
    const window = normalizeReportTimeWindow(fromStr, toStr);
    try {
      const data = await this.repository.getVehicleUtilization(organizationId, window, filters);
      const durationSeconds = (performance.now() - t0) / 1000;
      this.metricsService.recordQueryDuration({
        reportKey: 'vehicle-utilization',
        outcome: 'success',
        durationSeconds,
      });
      this.metricsService.incrementQueriesTotal({
        reportKey: 'vehicle-utilization',
        outcome: 'success',
      });
      return data;
    } catch (err) {
      this.metricsService.incrementQueriesTotal({
        reportKey: 'vehicle-utilization',
        outcome: 'error',
      });
      throw err;
    }
  }

  async getTripAnalytics(
    organizationId: string,
    fromStr?: string,
    toStr?: string,
    filters?: {
      readonly vehicleId?: string | undefined;
      readonly driverId?: string | undefined;
      readonly status?: string | undefined;
    },
  ): Promise<TripAnalyticsReportData> {
    const t0 = performance.now();
    const window = normalizeReportTimeWindow(fromStr, toStr);
    try {
      const data = await this.repository.getTripAnalytics(organizationId, window, filters);
      const durationSeconds = (performance.now() - t0) / 1000;
      this.metricsService.recordQueryDuration({
        reportKey: 'trips',
        outcome: 'success',
        durationSeconds,
      });
      this.metricsService.incrementQueriesTotal({ reportKey: 'trips', outcome: 'success' });
      return data;
    } catch (err) {
      this.metricsService.incrementQueriesTotal({ reportKey: 'trips', outcome: 'error' });
      throw err;
    }
  }

  async getFuelAnalytics(
    organizationId: string,
    fromStr?: string,
    toStr?: string,
    filters?: {
      readonly vehicleId?: string | undefined;
      readonly fuelType?: string | undefined;
    },
  ): Promise<FuelAnalyticsReportData> {
    const t0 = performance.now();
    const window = normalizeReportTimeWindow(fromStr, toStr);
    try {
      const data = await this.repository.getFuelAnalytics(organizationId, window, filters);
      const durationSeconds = (performance.now() - t0) / 1000;
      this.metricsService.recordQueryDuration({
        reportKey: 'fuel',
        outcome: 'success',
        durationSeconds,
      });
      this.metricsService.incrementQueriesTotal({ reportKey: 'fuel', outcome: 'success' });
      return data;
    } catch (err) {
      this.metricsService.incrementQueriesTotal({ reportKey: 'fuel', outcome: 'error' });
      throw err;
    }
  }

  async getCostAnalytics(
    organizationId: string,
    fromStr?: string,
    toStr?: string,
    filters?: {
      readonly vehicleId?: string | undefined;
      readonly categoryId?: string | undefined;
      readonly currency?: string | undefined;
    },
  ): Promise<CostAnalyticsReportData> {
    const t0 = performance.now();
    const window = normalizeReportTimeWindow(fromStr, toStr);
    try {
      const data = await this.repository.getCostAnalytics(organizationId, window, filters);
      const durationSeconds = (performance.now() - t0) / 1000;
      this.metricsService.recordQueryDuration({
        reportKey: 'costs',
        outcome: 'success',
        durationSeconds,
      });
      this.metricsService.incrementQueriesTotal({ reportKey: 'costs', outcome: 'success' });
      return data;
    } catch (err) {
      this.metricsService.incrementQueriesTotal({ reportKey: 'costs', outcome: 'error' });
      throw err;
    }
  }

  async getMaintenanceAnalytics(
    organizationId: string,
    fromStr?: string,
    toStr?: string,
    filters?: {
      readonly vehicleId?: string | undefined;
      readonly status?: string | undefined;
    },
  ): Promise<MaintenanceAnalyticsReportData> {
    const t0 = performance.now();
    const window = normalizeReportTimeWindow(fromStr, toStr);
    try {
      const data = await this.repository.getMaintenanceAnalytics(organizationId, window, filters);
      const durationSeconds = (performance.now() - t0) / 1000;
      this.metricsService.recordQueryDuration({
        reportKey: 'maintenance',
        outcome: 'success',
        durationSeconds,
      });
      this.metricsService.incrementQueriesTotal({ reportKey: 'maintenance', outcome: 'success' });
      return data;
    } catch (err) {
      this.metricsService.incrementQueriesTotal({ reportKey: 'maintenance', outcome: 'error' });
      throw err;
    }
  }

  async getComplianceAnalytics(
    organizationId: string,
    fromStr?: string,
    toStr?: string,
  ): Promise<ComplianceAnalyticsReportData> {
    const t0 = performance.now();
    const window = normalizeReportTimeWindow(fromStr, toStr);
    try {
      const data = await this.repository.getComplianceAnalytics(organizationId, window);
      const durationSeconds = (performance.now() - t0) / 1000;
      this.metricsService.recordQueryDuration({
        reportKey: 'compliance',
        outcome: 'success',
        durationSeconds,
      });
      this.metricsService.incrementQueriesTotal({ reportKey: 'compliance', outcome: 'success' });
      return data;
    } catch (err) {
      this.metricsService.incrementQueriesTotal({ reportKey: 'compliance', outcome: 'error' });
      throw err;
    }
  }

  async getIncidentAnalytics(
    organizationId: string,
    fromStr?: string,
    toStr?: string,
    filters?: {
      readonly type?: string | undefined;
      readonly severity?: string | undefined;
      readonly status?: string | undefined;
    },
  ): Promise<IncidentAnalyticsReportData> {
    const t0 = performance.now();
    const window = normalizeReportTimeWindow(fromStr, toStr);
    try {
      const data = await this.repository.getIncidentAnalytics(organizationId, window, filters);
      const durationSeconds = (performance.now() - t0) / 1000;
      this.metricsService.recordQueryDuration({
        reportKey: 'incidents',
        outcome: 'success',
        durationSeconds,
      });
      this.metricsService.incrementQueriesTotal({ reportKey: 'incidents', outcome: 'success' });
      return data;
    } catch (err) {
      this.metricsService.incrementQueriesTotal({ reportKey: 'incidents', outcome: 'error' });
      throw err;
    }
  }

  async getTelemetryAnalytics(
    organizationId: string,
    fromStr?: string,
    toStr?: string,
  ): Promise<TelemetryAnalyticsReportData> {
    const t0 = performance.now();
    const window = normalizeReportTimeWindow(fromStr, toStr);
    try {
      const data = await this.repository.getTelemetryAnalytics(organizationId, window);
      const durationSeconds = (performance.now() - t0) / 1000;
      this.metricsService.recordQueryDuration({
        reportKey: 'telemetry',
        outcome: 'success',
        durationSeconds,
      });
      this.metricsService.incrementQueriesTotal({ reportKey: 'telemetry', outcome: 'success' });
      return data;
    } catch (err) {
      this.metricsService.incrementQueriesTotal({ reportKey: 'telemetry', outcome: 'error' });
      throw err;
    }
  }

  async getDashboardSummary(
    organizationId: string,
    fromStr?: string,
    toStr?: string,
    permissions?: ReadonlySet<string>,
  ): Promise<DashboardReportData> {
    const t0 = performance.now();
    const window = normalizeReportTimeWindow(fromStr, toStr);
    try {
      const data = await this.repository.getDashboardSummary(organizationId, window, permissions);
      const durationSeconds = (performance.now() - t0) / 1000;
      this.metricsService.recordQueryDuration({
        reportKey: 'dashboard',
        outcome: 'success',
        durationSeconds,
      });
      this.metricsService.incrementQueriesTotal({ reportKey: 'dashboard', outcome: 'success' });
      return data;
    } catch (err) {
      this.metricsService.incrementQueriesTotal({ reportKey: 'dashboard', outcome: 'error' });
      throw err;
    }
  }

  async exportReport(
    organizationId: string,
    actorId: string,
    requestId: string,
    reportKey: string,
    format: string,
    fromStr?: string,
    toStr?: string,
    filters?: Record<string, string | undefined>,
    permissions?: ReadonlySet<string>,
  ): Promise<ExportResult> {
    const t0 = performance.now();
    const VALID_REPORT_KEYS = new Set([
      'fleet-overview',
      'vehicle-utilization',
      'trips',
      'fuel',
      'costs',
      'maintenance',
      'compliance',
      'incidents',
      'telemetry',
      'dashboard',
    ]);
    if (!VALID_REPORT_KEYS.has(reportKey)) {
      throw new ApplicationError('REPORT_NOT_FOUND', `Report "${reportKey}" does not exist`);
    }

    if (format !== 'csv' && format !== 'pdf') {
      throw new ApplicationError(
        'REPORT_UNSUPPORTED_FORMAT',
        `Unsupported export format "${format}". Only "csv" and "pdf" are supported`,
      );
    }

    const window = normalizeReportTimeWindow(fromStr, toStr);
    const fromDateStr = window.from.toISOString().slice(0, 10);
    const toDateStr = window.to.toISOString().slice(0, 10);
    const orgName = await this.repository.getOrganizationName(organizationId);

    try {
      let contentBuffer: Buffer;
      let rowCount = 0;
      const baseFilename = `${reportKey}-${fromDateStr}-to-${toDateStr}`;

      if (format === 'csv') {
        const csvData = await this.buildCsvExport(
          organizationId,
          reportKey,
          window,
          filters,
          permissions,
        );
        rowCount = csvData.rowCount;
        contentBuffer = Buffer.from(csvData.csvString, 'utf-8');
      } else {
        contentBuffer = await this.buildPdfExport(
          organizationId,
          orgName,
          reportKey,
          window,
          filters,
          permissions,
        );
        rowCount = 1;
      }

      const durationSeconds = (performance.now() - t0) / 1000;
      this.metricsService.recordExportDuration({
        reportKey,
        format,
        outcome: 'success',
        durationSeconds,
      });
      this.metricsService.incrementExportsTotal({ reportKey, format, outcome: 'success' });

      // Audit log the export
      await this.repository.recordExportAudit(
        organizationId,
        actorId,
        requestId,
        reportKey,
        format,
        window.from,
        window.to,
        rowCount,
      );

      return {
        content: contentBuffer,
        contentType: format === 'csv' ? 'text/csv; charset=utf-8' : 'application/pdf',
        filename: `${baseFilename}.${format}`,
      };
    } catch (err) {
      this.metricsService.incrementExportsTotal({
        reportKey,
        format: format as 'csv' | 'pdf',
        outcome: 'error',
      });
      throw err;
    }
  }

  private async buildCsvExport(
    organizationId: string,
    reportKey: string,
    window: ReturnType<typeof normalizeReportTimeWindow>,
    filters?: Record<string, string | undefined>,
    permissions?: ReadonlySet<string>,
  ): Promise<{ csvString: string; rowCount: number }> {
    let headers: string[] = [];
    let rows: (string | number | boolean | null | undefined)[][] = [];

    switch (reportKey) {
      case 'fleet-overview': {
        const data = await this.repository.getFleetOverview(organizationId, window, permissions);
        headers = ['Metric', 'Value'];
        rows = [
          ['Total Vehicles', data.kpis.totalVehicles],
          ['Draft Vehicles', data.kpis.draftVehicles],
          ['Active Vehicles', data.kpis.activeVehicles],
          ['Retired Vehicles', data.kpis.retiredVehicles],
          ['Assigned Vehicles', data.kpis.assignedVehicles],
          ['In Progress Trip Vehicles', data.kpis.inProgressTripVehicles],
          ['Blocking Maintenance', data.kpis.blockingMaintenanceCount ?? '—'],
          ['Blocking Compliance', data.kpis.blockingComplianceCount ?? '—'],
          ['Blocking Incidents', data.kpis.blockingIncidentCount ?? '—'],
          ['Fresh Telemetry Vehicles', data.kpis.freshTelemetryVehicles ?? '—'],
          ['Stale Telemetry Vehicles', data.kpis.staleTelemetryVehicles ?? '—'],
          ['Unknown / No Telemetry', data.kpis.unknownOrNoTelemetryVehicles ?? '—'],
          ['Completed Trips', data.kpis.completedTripsInPeriod ?? '—'],
          ['Total Trip Distance (km)', data.kpis.totalTripDistanceKmInPeriod ?? '—'],
        ];
        break;
      }

      case 'vehicle-utilization': {
        const data = await this.repository.getVehicleUtilization(
          organizationId,
          window,
          filters?.vehicleId ? { vehicleId: filters.vehicleId, limit: 10000 } : { limit: 10000 },
        );
        headers = [
          'Display ID',
          'Registration',
          'Model',
          'Status',
          'Completed Trips',
          'In-Progress Trips',
          'Total Distance (km)',
          'Active Duration (hours)',
          'Active Days',
          'Avg Trip Distance (km)',
          'Trip Time Utilization (%)',
        ];
        rows = data.items.map((item) => [
          item.displayId,
          item.registration,
          item.model,
          item.status,
          item.completedTripCount,
          item.inProgressTripCount,
          item.totalDistanceKm,
          Math.round((item.activeDurationSeconds / 3600) * 10) / 10,
          item.activeTripDays,
          item.averageTripDistanceKm,
          item.tripTimeUtilizationPercent,
        ]);
        break;
      }

      case 'trips': {
        const data = await this.repository.getTripAnalytics(organizationId, window, filters);
        headers = ['Bucket Date', 'Total Trips', 'Completed Trips', 'Distance (km)'];
        rows = data.timeSeries.map((ts) => [
          ts.bucketDate,
          ts.tripCount,
          ts.completedCount,
          ts.distanceKm,
        ]);
        break;
      }

      case 'costs': {
        const data = await this.repository.getCostAnalytics(organizationId, window, filters);
        headers = [
          'Category / Vehicle',
          'Currency',
          'Fuel Amount',
          'Expense Amount',
          'Total Amount',
        ];
        rows = data.vehicleTotals.map((vt) => [
          `${vt.displayId} (${vt.registration})`,
          vt.currencyCode,
          vt.fuelAmount,
          vt.expenseAmount,
          vt.totalAmount,
        ]);
        break;
      }

      case 'fuel': {
        const data = await this.repository.getFuelAnalytics(organizationId, window, filters);
        headers = ['Fuel Type', 'Transaction Count', 'Total Quantity', 'Quantity Unit'];
        rows = data.fuelTypeDistribution.map((ft) => [
          ft.fuelType,
          ft.count,
          ft.totalQuantity,
          ft.quantityUnit,
        ]);
        break;
      }

      case 'maintenance': {
        const data = await this.repository.getMaintenanceAnalytics(organizationId, window, filters);
        headers = ['Metric / Work Order Status', 'Count'];
        rows = [
          ['Total Open Requests', data.requests.totalOpenRequests],
          ['Blocking Requests', data.requests.blockingRequestsCount],
          ...data.workOrders.workOrdersByStatus.map((wo) => [`Status: ${wo.status}`, wo.count]),
          ['Upcoming Preventive Schedules', data.preventiveSchedules.upcomingCount],
          ['Due Preventive Schedules', data.preventiveSchedules.dueCount],
          ['Overdue Preventive Schedules', data.preventiveSchedules.overdueCount],
        ];
        break;
      }

      case 'compliance': {
        const data = await this.repository.getComplianceAnalytics(organizationId, window);
        headers = ['Document Type', 'Active Count'];
        rows = data.documents.documentsByType.map((d) => [d.typeName, d.count]);
        break;
      }

      case 'incidents': {
        const data = await this.repository.getIncidentAnalytics(organizationId, window, filters);
        headers = ['Incident Type', 'Count'];
        rows = data.distributionByType.map((t) => [t.type, t.count]);
        break;
      }

      case 'telemetry': {
        const data = await this.repository.getTelemetryAnalytics(organizationId, window);
        headers = ['Telemetry Metric', 'Value'];
        rows = [
          ['Total Registered Devices', data.devices.totalDevices],
          ['Active Devices', data.devices.activeDevices],
          ['Suspended Devices', data.devices.suspendedDevices],
          ['Inactive Devices', data.devices.inactiveDevices],
          ['Active Assignments', data.devices.activeAssignmentsCount],
          ['Fresh Vehicles (<2m)', data.vehicleFreshness.freshCount],
          ['Stale Vehicles (2m-60m)', data.vehicleFreshness.staleCount],
          ['Unknown / No Position (>60m)', data.vehicleFreshness.unknownCount],
          ['Positions Ingested', data.ingestion.totalPositionsIngested],
          ['Out Of Order Positions', data.ingestion.outOfOrderCount],
          ['Tracked Trips', data.trackingCoverage.tripsWithTelemetry],
          ['Tracked Trip Coverage (%)', data.trackingCoverage.trackedTripCoveragePercent ?? '—'],
        ];
        break;
      }

      case 'dashboard': {
        const data = await this.repository.getDashboardSummary(organizationId, window, permissions);
        headers = ['Category / Metric', 'Value'];
        rows = [
          ['Total Vehicles', data.fleetOverview.totalVehicles],
          ['Active Vehicles', data.fleetOverview.activeVehicles],
          ['Draft Vehicles', data.fleetOverview.draftVehicles],
          ['Retired Vehicles', data.fleetOverview.retiredVehicles],
          ['Assigned Vehicles', data.fleetOverview.assignedVehicles],
          ['In Progress Trip Vehicles', data.fleetOverview.inProgressTripVehicles],
          ['Completed Trips (Period)', data.tripsSummary ? data.tripsSummary.completedCount : '—'],
          ['Total Trip Distance km', data.tripsSummary ? data.tripsSummary.totalDistanceKm : '—'],
          [
            'Trip Completion Rate (%)',
            data.tripsSummary?.completionRatePercent !== null &&
            data.tripsSummary?.completionRatePercent !== undefined
              ? `${data.tripsSummary.completionRatePercent}%`
              : '—',
          ],
          [
            'Blocking Maintenance Requests',
            data.maintenanceAlerts ? data.maintenanceAlerts.blockingRequestsCount : '—',
          ],
          [
            'Overdue Maintenance Schedules',
            data.maintenanceAlerts ? data.maintenanceAlerts.overdueSchedulesCount : '—',
          ],
          [
            'Non-Compliant Vehicles',
            data.complianceAlerts ? data.complianceAlerts.nonCompliantVehicles : '—',
          ],
          [
            'Non-Compliant Drivers',
            data.complianceAlerts ? data.complianceAlerts.nonCompliantDrivers : '—',
          ],
          [
            'Expired Compliance Documents',
            data.complianceAlerts ? data.complianceAlerts.expiredDocuments : '—',
          ],
          ['Unresolved Incidents', data.incidentAlerts ? data.incidentAlerts.unresolvedCount : '—'],
          [
            'Blocking Incidents',
            data.incidentAlerts ? data.incidentAlerts.unresolvedBlockingCount : '—',
          ],
          [
            'Fresh Telemetry Vehicles',
            data.telemetryStatus ? data.telemetryStatus.freshVehicles : '—',
          ],
          [
            'Stale Telemetry Vehicles',
            data.telemetryStatus ? data.telemetryStatus.staleVehicles : '—',
          ],
          [
            'Tracked Trip Coverage (%)',
            data.telemetryStatus?.trackedTripCoveragePercent !== null &&
            data.telemetryStatus?.trackedTripCoveragePercent !== undefined
              ? `${data.telemetryStatus.trackedTripCoveragePercent}%`
              : '—',
          ],
        ];
        break;
      }

      default:
        throw new ApplicationError('REPORT_NOT_FOUND', `Report "${reportKey}" does not exist`);
    }

    const csvString = generateCsvContent({ headers, rows });
    return { csvString, rowCount: rows.length };
  }

  private async buildPdfExport(
    organizationId: string,
    organizationName: string,
    reportKey: string,
    window: ReturnType<typeof normalizeReportTimeWindow>,
    filters?: Record<string, string | undefined>,
    permissions?: ReadonlySet<string>,
  ): Promise<Buffer> {
    const fromStr = window.from.toISOString().slice(0, 10);
    const toStr = window.to.toISOString().slice(0, 10);
    const dateRange = `${fromStr} to ${toStr} (UTC)`;
    const generatedAt = new Date().toISOString();

    switch (reportKey) {
      case 'fleet-overview': {
        const data = await this.repository.getFleetOverview(organizationId, window, permissions);
        return this.pdfRenderer.renderSummaryPdf({
          reportTitle: 'Fleet Overview Executive Report',
          organizationName,
          dateRange,
          generatedAt,
          kpis: [
            { label: 'Total Vehicles', value: String(data.kpis.totalVehicles) },
            { label: 'Draft Vehicles', value: String(data.kpis.draftVehicles) },
            { label: 'Active Vehicles', value: String(data.kpis.activeVehicles) },
            { label: 'Retired Vehicles', value: String(data.kpis.retiredVehicles) },
            { label: 'Assigned Vehicles', value: String(data.kpis.assignedVehicles) },
            { label: 'Completed Trips', value: String(data.kpis.completedTripsInPeriod ?? 'N/A') },
            {
              label: 'Trip Distance (km)',
              value: String(data.kpis.totalTripDistanceKmInPeriod ?? 'N/A'),
            },
            { label: 'Fresh Telemetry', value: String(data.kpis.freshTelemetryVehicles ?? 'N/A') },
            {
              label: 'Blocking Maintenance',
              value: String(data.kpis.blockingMaintenanceCount ?? 'N/A'),
            },
            {
              label: 'Blocking Compliance',
              value: String(data.kpis.blockingComplianceCount ?? 'N/A'),
            },
            {
              label: 'Blocking Incidents',
              value: String(data.kpis.blockingIncidentCount ?? 'N/A'),
            },
          ],
        });
      }

      case 'vehicle-utilization': {
        const data = await this.repository.getVehicleUtilization(
          organizationId,
          window,
          filters?.vehicleId ? { vehicleId: filters.vehicleId, limit: 100 } : { limit: 100 },
        );
        return this.pdfRenderer.renderSummaryPdf({
          reportTitle: 'Vehicle Utilization Summary Report',
          organizationName,
          dateRange,
          generatedAt,
          kpis: [
            { label: 'Vehicles Evaluated', value: String(data.summary.totalVehiclesEvaluated) },
            { label: 'Total Distance (km)', value: String(data.summary.totalDistanceKm) },
            { label: 'Completed Trips', value: String(data.summary.totalCompletedTrips) },
            {
              label: 'Avg Utilization',
              value: `${data.summary.averageUtilizationPercent ?? 0}%`,
            },
          ],
          sections: [
            {
              title: 'Vehicle Operational Metrics (Top 20)',
              headers: [
                'Vehicle',
                'Registration',
                'Status',
                'Trips',
                'Distance (km)',
                'Hours',
                'Util %',
              ],
              rows: data.items
                .slice(0, 20)
                .map((v) => [
                  v.displayId,
                  v.registration,
                  v.status,
                  String(v.completedTripCount),
                  String(v.totalDistanceKm),
                  String(Math.round((v.activeDurationSeconds / 3600) * 10) / 10),
                  `${v.tripTimeUtilizationPercent}%`,
                ]),
            },
          ],
        });
      }

      case 'trips': {
        const data = await this.repository.getTripAnalytics(organizationId, window, filters);
        return this.pdfRenderer.renderSummaryPdf({
          reportTitle: 'Trip Analytics Summary Report',
          organizationName,
          dateRange,
          generatedAt,
          kpis: [
            { label: 'Total Trips', value: String(data.counts.totalTrips) },
            { label: 'Completed Trips', value: String(data.counts.completedCount) },
            { label: 'Total Distance (km)', value: String(data.metrics.totalDistanceKm) },
            {
              label: 'Completion Rate',
              value:
                data.rates.completionRatePercent !== null
                  ? `${data.rates.completionRatePercent}%`
                  : 'N/A',
            },
          ],
        });
      }

      case 'dashboard': {
        const data = await this.repository.getDashboardSummary(organizationId, window, permissions);
        return this.pdfRenderer.renderSummaryPdf({
          reportTitle: 'Executive Dashboard Report',
          organizationName,
          dateRange,
          generatedAt,
          kpis: [
            { label: 'Total Vehicles', value: String(data.fleetOverview.totalVehicles) },
            { label: 'Active Vehicles', value: String(data.fleetOverview.activeVehicles) },
            { label: 'Completed Trips', value: String(data.tripsSummary?.completedCount ?? 'N/A') },
            { label: 'Distance (km)', value: String(data.tripsSummary?.totalDistanceKm ?? 'N/A') },
            {
              label: 'Blocking Maintenance',
              value: String(data.maintenanceAlerts?.blockingRequestsCount ?? 'N/A'),
            },
            {
              label: 'Blocking Incidents',
              value: String(data.incidentAlerts?.unresolvedBlockingCount ?? 'N/A'),
            },
          ],
        });
      }

      default:
        throw new ApplicationError(
          'REPORT_UNSUPPORTED_FORMAT',
          `PDF summary export is not supported for "${reportKey}". Use "csv" export for detailed tabular data.`,
        );
    }
  }
}
