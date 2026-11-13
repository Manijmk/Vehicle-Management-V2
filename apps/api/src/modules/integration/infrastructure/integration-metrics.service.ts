import { Injectable } from '@nestjs/common';

export interface IntegrationMetricObservation {
  readonly metricName: string;
  readonly labels: Record<string, string>;
  readonly value: number;
  readonly timestamp: Date;
}

@Injectable()
export class IntegrationMetricsService {
  private readonly observations: IntegrationMetricObservation[] = [];
  private readonly counters = new Map<string, number>();

  recordWebhookDelivery(status: string, eventType: string, durationMs: number): void {
    const key = `webhook_delivery:${status}:${eventType}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);

    this.observations.push({
      metricName: 'integrations_webhook_delivery_duration_ms',
      labels: { status, event_type: eventType },
      value: durationMs,
      timestamp: new Date(),
    });
  }

  recordTelematicsIngested(count: number, outcome: 'success' | 'duplicate' | 'error'): void {
    const key = `telematics_events:${outcome}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + count);
  }

  recordFuelCardImport(rows: number, outcome: 'preview' | 'success' | 'error'): void {
    const key = `fuelcard_imports:${outcome}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + rows);
  }

  recordAccountingExport(rows: number, format: string): void {
    const key = `accounting_exports:${format}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + rows);
  }

  getMetricsSummary(): { counters: Record<string, number>; recentObservations: number } {
    return {
      counters: Object.fromEntries(this.counters.entries()),
      recentObservations: this.observations.length,
    };
  }
}
