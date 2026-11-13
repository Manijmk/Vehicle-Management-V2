'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ReportControls } from '../../../components/report-controls';
import { TenantHeader } from '../../../components/tenant-header';
import { reportingApi, type TripAnalyticsReport } from '../../../lib/api-client';

export default function TripAnalyticsReportPage() {
  const [data, setData] = useState<TripAnalyticsReport | null>(null);
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
      const res = await reportingApi.fetchTripAnalyticsReport({
        from: from || undefined,
        to: to || undefined,
      });
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load trip analytics report');
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
          data-testid="trips-report-title"
          style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0, color: '#111827' }}
        >
          Trip Analytics Report
        </h1>
        <p style={{ color: '#4b5563', margin: '0.35rem 0 0 0', fontSize: '0.95rem' }}>
          Operational throughput, terminal completion rate, cancellation analysis, distance trends,
          and asset metrics.
        </p>
      </div>

      <ReportControls
        reportKey="trips"
        from={from}
        to={to}
        onDateChange={handleDateChange}
        exportTitle="Export Trips"
      />

      {loading && (
        <div
          data-testid="loading-indicator"
          style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}
        >
          Loading trip analytics...
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
          {/* Headline Metrics Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
            }}
          >
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1rem',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
                TOTAL TRIPS
              </div>
              <div
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  color: '#111827',
                  marginTop: '0.25rem',
                }}
              >
                {data.counts.totalTrips}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem' }}>
                {data.counts.completedCount} completed, {data.counts.inProgressCount} in progress
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1rem',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
                TERMINAL COMPLETION RATE
              </div>
              <div
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  color: '#15803d',
                  marginTop: '0.25rem',
                }}
              >
                {data.rates.completionRatePercent !== null
                  ? `${data.rates.completionRatePercent}%`
                  : 'N/A'}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Cancellation rate:{' '}
                {data.rates.cancellationRatePercent !== null
                  ? `${data.rates.cancellationRatePercent}%`
                  : 'N/A'}
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1rem',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
                TOTAL DISTANCE
              </div>
              <div
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  color: '#111827',
                  marginTop: '0.25rem',
                }}
              >
                {data.metrics.totalDistanceKm.toLocaleString()} km
              </div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Avg per trip: {data.metrics.averageDistanceKm ?? 'N/A'} km
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1rem',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
                AVG DURATION
              </div>
              <div
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  color: '#111827',
                  marginTop: '0.25rem',
                }}
              >
                {data.metrics.averageDurationSeconds !== null
                  ? `${(data.metrics.averageDurationSeconds / 60).toFixed(0)} min`
                  : 'N/A'}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Total hours: {(data.metrics.totalDurationSeconds / 3600).toFixed(1)}
              </div>
            </div>
          </div>

          {/* Status Breakdown Section */}
          <div
            style={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1.25rem',
            }}
          >
            <h2
              style={{
                fontSize: '1.1rem',
                fontWeight: 600,
                margin: '0 0 1rem 0',
                color: '#111827',
              }}
            >
              Trips Breakdown by Operational Status
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '0.75rem',
              }}
            >
              <div
                style={{
                  padding: '0.75rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  backgroundColor: '#f9fafb',
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280' }}>
                  COMPLETED
                </div>
                <div
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: '#15803d',
                    marginTop: '0.25rem',
                  }}
                >
                  {data.counts.completedCount}
                </div>
              </div>
              <div
                style={{
                  padding: '0.75rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  backgroundColor: '#f9fafb',
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280' }}>
                  IN PROGRESS
                </div>
                <div
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: '#2563eb',
                    marginTop: '0.25rem',
                  }}
                >
                  {data.counts.inProgressCount}
                </div>
              </div>
              <div
                style={{
                  padding: '0.75rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  backgroundColor: '#f9fafb',
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280' }}>READY</div>
                <div
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: '#0891b2',
                    marginTop: '0.25rem',
                  }}
                >
                  {data.counts.readyCount}
                </div>
              </div>
              <div
                style={{
                  padding: '0.75rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  backgroundColor: '#f9fafb',
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280' }}>DRAFT</div>
                <div
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: '#4b5563',
                    marginTop: '0.25rem',
                  }}
                >
                  {data.counts.draftCount}
                </div>
              </div>
              <div
                style={{
                  padding: '0.75rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  backgroundColor: '#f9fafb',
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280' }}>
                  CANCELLED
                </div>
                <div
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: '#ca8a04',
                    marginTop: '0.25rem',
                  }}
                >
                  {data.counts.cancelledCount}
                </div>
              </div>
              <div
                style={{
                  padding: '0.75rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  backgroundColor: '#f9fafb',
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280' }}>
                  ABORTED
                </div>
                <div
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: '#dc2626',
                    marginTop: '0.25rem',
                  }}
                >
                  {data.counts.abortedCount}
                </div>
              </div>
            </div>
          </div>

          {/* Two Columns: Drivers Summary & Top Vehicles */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {/* Top Drivers */}
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
                overflow: 'hidden',
              }}
            >
              <h3
                style={{
                  fontSize: '1rem',
                  fontWeight: 600,
                  margin: '0 0 0.75rem 0',
                  color: '#111827',
                }}
              >
                Driver Performance Summary
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr
                      style={{
                        backgroundColor: '#f9fafb',
                        borderBottom: '1px solid #e5e7eb',
                        color: '#4b5563',
                      }}
                    >
                      <th style={{ padding: '0.5rem', textAlign: 'left' }}>Driver</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Total Trips</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Completed</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Distance (km)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.driverSummaries.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          style={{ padding: '1rem', textAlign: 'center', color: '#9ca3af' }}
                        >
                          No driver trip data.
                        </td>
                      </tr>
                    ) : (
                      data.driverSummaries.map((d) => (
                        <tr key={d.driverId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '0.5rem', fontWeight: 500 }}>
                            <Link
                              href={`/drivers/${d.driverId}`}
                              style={{ color: '#2563eb', textDecoration: 'none' }}
                            >
                              {d.name} ({d.displayId})
                            </Link>
                          </td>
                          <td style={{ padding: '0.5rem', textAlign: 'right' }}>{d.tripCount}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                            {d.completedCount}
                          </td>
                          <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                            {d.totalDistanceKm.toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top Vehicles */}
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
                overflow: 'hidden',
              }}
            >
              <h3
                style={{
                  fontSize: '1rem',
                  fontWeight: 600,
                  margin: '0 0 0.75rem 0',
                  color: '#111827',
                }}
              >
                Top Vehicles by Distance
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr
                      style={{
                        backgroundColor: '#f9fafb',
                        borderBottom: '1px solid #e5e7eb',
                        color: '#4b5563',
                      }}
                    >
                      <th style={{ padding: '0.5rem', textAlign: 'left' }}>Vehicle</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Trips</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Distance (km)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topVehicles.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          style={{ padding: '1rem', textAlign: 'center', color: '#9ca3af' }}
                        >
                          No vehicle trip data.
                        </td>
                      </tr>
                    ) : (
                      data.topVehicles.map((v) => (
                        <tr key={v.vehicleId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '0.5rem', fontWeight: 500 }}>
                            <Link
                              href={`/vehicles/${v.vehicleId}`}
                              style={{ color: '#2563eb', textDecoration: 'none' }}
                            >
                              {v.displayId}
                            </Link>
                          </td>
                          <td style={{ padding: '0.5rem', textAlign: 'right' }}>{v.tripCount}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                            {v.distanceKm.toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Methodology note */}
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
            <strong>Terminal Completion Formula:</strong>{' '}
            <code>Completion Rate = Completed Trips / (Completed + Cancelled + Aborted) * 100</code>
            . Draft, Ready, and In-Progress trips are deliberately excluded from the denominator to
            avoid penalizing currently scheduled or running dispatches.
          </div>
        </div>
      )}
    </div>
  );
}
