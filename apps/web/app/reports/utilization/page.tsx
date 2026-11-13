'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ReportControls } from '../../../components/report-controls';
import { TenantHeader } from '../../../components/tenant-header';
import { reportingApi, type VehicleUtilizationReport } from '../../../lib/api-client';

export default function VehicleUtilizationReportPage() {
  const [data, setData] = useState<VehicleUtilizationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Default to last 30 days
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
      const res = await reportingApi.fetchVehicleUtilizationReport({
        from: from || undefined,
        to: to || undefined,
      });
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load vehicle utilization report');
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
          data-testid="utilization-title"
          style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0, color: '#111827' }}
        >
          Vehicle Utilization Report
        </h1>
        <p style={{ color: '#4b5563', margin: '0.35rem 0 0 0', fontSize: '0.95rem' }}>
          Operational trip duration, active days, mileage accumulation, and time utilization percent
          per vehicle asset.
        </p>
      </div>

      <ReportControls
        reportKey="vehicle-utilization"
        from={from}
        to={to}
        onDateChange={handleDateChange}
        exportTitle="Export Utilization"
      />

      {loading && (
        <div
          data-testid="loading-indicator"
          style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}
        >
          Loading utilization metrics...
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
          {/* Summary KPIs */}
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
                VEHICLES EVALUATED
              </div>
              <div
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  color: '#111827',
                  marginTop: '0.25rem',
                }}
              >
                {data.summary.totalVehiclesEvaluated}
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
                FLEET AVG UTILIZATION
              </div>
              <div
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  color: '#2563eb',
                  marginTop: '0.25rem',
                }}
              >
                {data.summary.averageUtilizationPercent !== null
                  ? `${data.summary.averageUtilizationPercent}%`
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
                {data.summary.totalDistanceKm.toLocaleString()} km
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
                COMPLETED TRIPS
              </div>
              <div
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  color: '#111827',
                  marginTop: '0.25rem',
                }}
              >
                {data.summary.totalCompletedTrips}
              </div>
            </div>
          </div>

          {/* Table */}
          <div
            style={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ overflowX: 'auto' }}>
              <table
                data-testid="utilization-table"
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  fontSize: '0.875rem',
                }}
              >
                <thead>
                  <tr
                    style={{
                      backgroundColor: '#f9fafb',
                      borderBottom: '1px solid #e5e7eb',
                      color: '#4b5563',
                    }}
                  >
                    <th style={{ padding: '0.75rem 1rem' }}>Display ID</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Registration</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Model</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Completed Trips</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Active Days</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Active Hours</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Distance (km)</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Utilization %</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}
                      >
                        No vehicles found for the selected reporting window.
                      </td>
                    </tr>
                  ) : (
                    data.items.map((v) => (
                      <tr
                        key={v.vehicleId}
                        data-testid="utilization-row"
                        style={{ borderBottom: '1px solid #f3f4f6' }}
                      >
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#111827' }}>
                          <Link
                            href={`/vehicles/${v.vehicleId}`}
                            style={{ color: '#2563eb', textDecoration: 'none' }}
                          >
                            {v.displayId}
                          </Link>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>{v.registration}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>{v.model}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span
                            style={{
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              backgroundColor: v.status === 'ACTIVE' ? '#dcfce7' : '#f3f4f6',
                              color: v.status === 'ACTIVE' ? '#15803d' : '#6b7280',
                              fontSize: '0.75rem',
                            }}
                          >
                            {v.status}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          {v.completedTripCount}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          {v.activeTripDays}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          {(v.activeDurationSeconds / 3600).toFixed(1)}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          {v.totalDistanceKm.toLocaleString()}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          <span
                            style={{
                              fontWeight: 600,
                              color: v.tripTimeUtilizationPercent > 20 ? '#15803d' : '#374151',
                            }}
                          >
                            {v.tripTimeUtilizationPercent}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Formula disclosure note */}
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
            <strong>Utilization Methodology:</strong> Trip time utilization is computed as{' '}
            <code>(Active Trip Duration within Window / Window Duration) * 100</code>. Trips that
            span the start or end of the reporting window are clipped to the exact boundary{' '}
            <code>[max(tripStart, reportFrom), min(tripEnd, reportTo)]</code>. In-progress trips are
            evaluated up to the report end time or current timestamp.
          </div>
        </div>
      )}
    </div>
  );
}
