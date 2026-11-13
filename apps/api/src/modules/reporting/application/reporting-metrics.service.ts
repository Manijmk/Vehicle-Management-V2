import { Injectable } from '@nestjs/common';

export interface ReportQueryDurationMetricParams {
  readonly reportKey: string;
  readonly outcome: 'success' | 'error';
  readonly durationSeconds: number;
}

export interface ReportQueriesTotalMetricParams {
  readonly reportKey: string;
  readonly outcome: 'success' | 'error';
}

export interface ReportExportDurationMetricParams {
  readonly reportKey: string;
  readonly format: 'csv' | 'pdf';
  readonly outcome: 'success' | 'error';
  readonly durationSeconds: number;
}

export interface ReportExportsTotalMetricParams {
  readonly reportKey: string;
  readonly format: 'csv' | 'pdf';
  readonly outcome: 'success' | 'error';
}

export interface ReportingMetricObservation {
  readonly metricName: string;
  readonly labels: Record<string, string>;
  readonly value: number;
  readonly timestamp: Date;
}

@Injectable()
export class ReportingMetricsService {
  // In-memory bounded collections suitable for OpenTelemetry/Prometheus scraping
  private readonly durationObservations: ReportingMetricObservation[] = [];
  private readonly exportDurationObservations: ReportingMetricObservation[] = [];
  private readonly queryCounters = new Map<string, number>();
  private readonly exportCounters = new Map<string, number>();

  // Strictly low-cardinality: no orgId, vehicleId, driverId, userId allowed.
  recordQueryDuration(params: ReportQueryDurationMetricParams): void {
    this.durationObservations.push({
      metricName: 'report_query_duration_seconds',
      labels: {
        reportKey: params.reportKey,
        outcome: params.outcome,
      },
      value: params.durationSeconds,
      timestamp: new Date(),
    });

    if (this.durationObservations.length > 1000) {
      this.durationObservations.splice(0, this.durationObservations.length - 1000);
    }
  }

  incrementQueriesTotal(params: ReportQueriesTotalMetricParams): void {
    const key = `reportKey=${params.reportKey},outcome=${params.outcome}`;
    const current = this.queryCounters.get(key) ?? 0;
    this.queryCounters.set(key, current + 1);
  }

  recordExportDuration(params: ReportExportDurationMetricParams): void {
    this.exportDurationObservations.push({
      metricName: 'report_export_duration_seconds',
      labels: {
        reportKey: params.reportKey,
        format: params.format,
        outcome: params.outcome,
      },
      value: params.durationSeconds,
      timestamp: new Date(),
    });

    if (this.exportDurationObservations.length > 1000) {
      this.exportDurationObservations.splice(0, this.exportDurationObservations.length - 1000);
    }
  }

  incrementExportsTotal(params: ReportExportsTotalMetricParams): void {
    const key = `reportKey=${params.reportKey},format=${params.format},outcome=${params.outcome}`;
    const current = this.exportCounters.get(key) ?? 0;
    this.exportCounters.set(key, current + 1);
  }

  // Diagnostic accessors
  getQueryDurationObservations(): readonly ReportingMetricObservation[] {
    return this.durationObservations;
  }

  getExportDurationObservations(): readonly ReportingMetricObservation[] {
    return this.exportDurationObservations;
  }

  getQueryCount(reportKey: string, outcome: 'success' | 'error'): number {
    return this.queryCounters.get(`reportKey=${reportKey},outcome=${outcome}`) ?? 0;
  }

  getExportCount(reportKey: string, format: 'csv' | 'pdf', outcome: 'success' | 'error'): number {
    return (
      this.exportCounters.get(`reportKey=${reportKey},format=${format},outcome=${outcome}`) ?? 0
    );
  }
}
