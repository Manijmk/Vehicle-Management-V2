import { Injectable } from '@nestjs/common';

export interface IngestionDurationMetricParams {
  readonly source: string;
  readonly endpoint: string;
  readonly outcome: 'success' | 'error' | 'duplicate' | 'out_of_order';
  readonly durationSeconds: number;
}

export interface IngestedTotalMetricParams {
  readonly source: string;
  readonly status: string;
}

export interface RejectedTotalMetricParams {
  readonly reason: string;
}

export interface CurrentPositionUpdateMetricParams {
  readonly outcome: 'updated' | 'stale_skipped' | 'duplicate_skipped';
}

export interface BatchSizeMetricParams {
  readonly source: string;
  readonly endpoint: string;
  readonly size: number;
}

export interface MetricObservation {
  readonly metricName: string;
  readonly labels: Record<string, string>;
  readonly value: number;
  readonly timestamp: Date;
}

@Injectable()
export class TelemetryMetricsService {
  // Low-cardinality in-memory metric collections suitable for OpenTelemetry/Prometheus scrapers
  private readonly durationObservations: MetricObservation[] = [];
  private readonly batchSizeObservations: MetricObservation[] = [];
  private readonly ingestedCounters = new Map<string, number>();
  private readonly rejectedCounters = new Map<string, number>();
  private readonly currentPositionUpdateCounters = new Map<string, number>();

  // High-cardinality fields (orgId, vehicleId, deviceId, tripId, providerMessageId)
  // are strictly prohibited from all labels.
  recordIngestionDuration(params: IngestionDurationMetricParams): void {
    this.durationObservations.push({
      metricName: 'telemetry_ingestion_duration_seconds',
      labels: {
        source: params.source,
        endpoint: params.endpoint,
        outcome: params.outcome,
      },
      value: params.durationSeconds,
      timestamp: new Date(),
    });

    // Bound in-memory log to prevent unbounded growth during extended runs
    if (this.durationObservations.length > 1000) {
      this.durationObservations.splice(0, this.durationObservations.length - 1000);
    }
  }

  incrementIngested(params: IngestedTotalMetricParams): void {
    const key = `source=${params.source},status=${params.status}`;
    const current = this.ingestedCounters.get(key) ?? 0;
    this.ingestedCounters.set(key, current + 1);
  }

  incrementRejected(params: RejectedTotalMetricParams): void {
    const key = `reason=${params.reason}`;
    const current = this.rejectedCounters.get(key) ?? 0;
    this.rejectedCounters.set(key, current + 1);
  }

  incrementCurrentPositionUpdated(params: CurrentPositionUpdateMetricParams): void {
    const key = `outcome=${params.outcome}`;
    const current = this.currentPositionUpdateCounters.get(key) ?? 0;
    this.currentPositionUpdateCounters.set(key, current + 1);
  }

  recordBatchSize(params: BatchSizeMetricParams): void {
    this.batchSizeObservations.push({
      metricName: 'telemetry_batch_size',
      labels: {
        source: params.source,
        endpoint: params.endpoint,
      },
      value: params.size,
      timestamp: new Date(),
    });

    if (this.batchSizeObservations.length > 500) {
      this.batchSizeObservations.splice(0, this.batchSizeObservations.length - 500);
    }
  }

  getMetricsSnapshot() {
    return {
      durations: [...this.durationObservations],
      batchSizes: [...this.batchSizeObservations],
      ingestedTotals: Object.fromEntries(this.ingestedCounters.entries()),
      rejectedTotals: Object.fromEntries(this.rejectedCounters.entries()),
      currentPositionUpdates: Object.fromEntries(this.currentPositionUpdateCounters.entries()),
    };
  }

  reset(): void {
    this.durationObservations.length = 0;
    this.batchSizeObservations.length = 0;
    this.ingestedCounters.clear();
    this.rejectedCounters.clear();
    this.currentPositionUpdateCounters.clear();
  }
}
