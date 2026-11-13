'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ReportControls } from '../../../components/report-controls';
import { TenantHeader } from '../../../components/tenant-header';
import { reportingApi, type TelemetryAnalyticsReport } from '../../../lib/api-client';

export default function TelemetryAnalyticsReportPage() {
  const [data, setData] = useState<TelemetryAnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0] ?? '';
  });
  const [to, setTo] = useState(() => {
    return new Date().toISOString().split('T')[0] ?? '';
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await reportingApi.fetchTelemetryAnalyticsReport({
        from: from || undefined,
        to: to || undefined,
      });
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load telemetry analytics report');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleDateChange = (newFrom: string, newTo: string) => {
    setFrom(newFrom);
    setTo(newTo);
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
      <TenantHeader onAuthChange={loadData} />

      <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}
        >
          <Link
            href="/reports"
            style={{ fontSize: '0.875rem', color: '#2563eb', textDecoration: 'none' }}
          >
            &larr; Reports Dashboard
          </Link>
        </div>
        <h1
          data-testid="telemetry-report-title"
          style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0, color: '#111827' }}
        >
          Telemetry & GPS Health Analytics
        </h1>
        <p style={{ color: '#4b5563', margin: '0.35rem 0 0 0', fontSize: '0.95rem' }}>
          Tracking device operational health, position freshness, ingestion status distributions,
          and GPS trip tracking coverage.
        </p>
      </div>

      <ReportControls
        reportKey="telemetry"
        from={from}
        to={to}
        onDateChange={handleDateChange}
        exportTitle="Export Telemetry"
      />

      {loading && (
        <div
          data-testid="loading-indicator"
          style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}
        >
          Loading telemetry analytics...
        </div>
      )}

      {error && (
        <div
          data-testid="error-message"
          style={{
            padding: '1rem',
            backgroundColor: '#fee2e2',
            border: '1px solid #f87171',
            borderRadius: '8px',
            color: '#b91c1c',
            marginBottom: '1.5rem',
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Top KPI Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '1rem',
            }}
          >
            {/* Device Inventory */}
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
                DEVICE FLEET
              </div>
              <div
                style={{
                  fontSize: '2rem',
                  fontWeight: 700,
                  color: '#111827',
                  marginTop: '0.25rem',
                }}
              >
                {data.devices.totalDevices}
                <span
                  style={{
                    fontSize: '0.85rem',
                    color: '#6b7280',
                    fontWeight: 400,
                    marginLeft: '0.5rem',
                  }}
                >
                  devices
                </span>
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#4b5563' }}>
                Active: <strong>{data.devices.activeDevices}</strong> | Suspended:{' '}
                <strong>{data.devices.suspendedDevices}</strong>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#4b5563', marginTop: '0.2rem' }}>
                Active vehicle assignments: <strong>{data.devices.activeAssignmentsCount}</strong>
              </div>
            </div>

            {/* Freshness Card */}
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
                POSITION FRESHNESS
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#16a34a' }}>
                    {data.vehicleFreshness.freshCount}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Fresh (&lt;2m)</div>
                </div>
                <div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#ca8a04' }}>
                    {data.vehicleFreshness.staleCount}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Stale (2-60m)</div>
                </div>
                <div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#6b7280' }}>
                    {data.vehicleFreshness.unknownCount}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Unknown (&gt;60m)</div>
                </div>
              </div>
            </div>

            {/* Ingestion Volume */}
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
                INGESTED POSITIONS
              </div>
              <div
                style={{
                  fontSize: '2rem',
                  fontWeight: 700,
                  color: '#111827',
                  marginTop: '0.25rem',
                }}
              >
                {data.ingestion.totalPositionsIngested.toLocaleString()}
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#4b5563' }}>
                Out of order arrivals: <strong>{data.ingestion.outOfOrderCount}</strong>
              </div>
            </div>

            {/* Trip Tracking Coverage */}
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
                TRACKED TRIP COVERAGE
              </div>
              <div
                style={{
                  fontSize: '2rem',
                  fontWeight: 700,
                  color: '#2563eb',
                  marginTop: '0.25rem',
                }}
              >
                {data.trackingCoverage.trackedTripCoveragePercent !== null
                  ? `${data.trackingCoverage.trackedTripCoveragePercent}%`
                  : 'N/A'}
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#4b5563' }}>
                {data.trackingCoverage.tripsWithTelemetry} of {data.trackingCoverage.tripsInPeriod}{' '}
                trips tracked
              </div>
            </div>
          </div>

          {/* Quick link back to live fleet map */}
          <div
            style={{
              padding: '1.25rem',
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, color: '#1e40af' }}>Live Fleet Map View</div>
              <div style={{ fontSize: '0.85rem', color: '#3b82f6', marginTop: '0.2rem' }}>
                View current real-time GPS locations and vehicle coordinates on the interactive live
                fleet map.
              </div>
            </div>
            <Link
              href="/telemetry"
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#2563eb',
                color: '#fff',
                borderRadius: '6px',
                textDecoration: 'none',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              Open Fleet Map &rarr;
            </Link>
          </div>

          {/* Methodology & Authoritative Odometer Disclosure */}
          <div
            style={{
              padding: '1rem',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '0.8rem',
              color: '#64748b',
            }}
          >
            <strong>Telemetry Freshness & GPS Mileage Disclosure:</strong> GPS positions are
            ingested into high-frequency historical tables and projected onto vehicle current
            positions. The GPS odometer is an observational indicator and is NOT authoritative
            vehicle mileage. Authoritative mileage remains governed by inspection-verified and
            trip-completed vehicle odometers.
          </div>
        </div>
      )}
    </div>
  );
}
