'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ReportControls } from '../../../components/report-controls';
import { TenantHeader } from '../../../components/tenant-header';
import { reportingApi, type IncidentAnalyticsReport } from '../../../lib/api-client';

export default function IncidentAnalyticsReportPage() {
  const [data, setData] = useState<IncidentAnalyticsReport | null>(null);
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
      const res = await reportingApi.fetchIncidentAnalyticsReport({
        from: from || undefined,
        to: to || undefined,
      });
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load incident analytics report');
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
          data-testid="incidents-report-title"
          style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0, color: '#111827' }}
        >
          Incident & Safety Analytics
        </h1>
        <p style={{ color: '#4b5563', margin: '0.35rem 0 0 0', fontSize: '0.95rem' }}>
          Safety occurrences, operational vehicle and driver impacts, severity distributions, and
          incident resolution cycle times.
        </p>
      </div>

      <ReportControls
        reportKey="incidents"
        from={from}
        to={to}
        onDateChange={handleDateChange}
        exportTitle="Export Incidents"
      />

      {loading && (
        <div
          data-testid="loading-indicator"
          style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}
        >
          Loading safety and incident metrics...
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
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
            }}
          >
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
                TOTAL INCIDENTS
              </div>
              <div
                style={{
                  fontSize: '2rem',
                  fontWeight: 700,
                  color: '#111827',
                  marginTop: '0.25rem',
                }}
              >
                {data.counts.totalIncidents}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem' }}>
                In selected reporting window
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
                ACTIVE / UNRESOLVED
              </div>
              <div
                style={{
                  fontSize: '2rem',
                  fontWeight: 700,
                  color: data.counts.unresolvedCount > 0 ? '#d97706' : '#15803d',
                  marginTop: '0.25rem',
                }}
              >
                {data.counts.unresolvedCount}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Requiring review or investigation
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
                BLOCKING OPERATIONS
              </div>
              <div
                style={{
                  fontSize: '2rem',
                  fontWeight: 700,
                  color: data.counts.unresolvedBlockingCount > 0 ? '#dc2626' : '#15803d',
                  marginTop: '0.25rem',
                }}
              >
                {data.counts.unresolvedBlockingCount}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Grounded vehicle or driver
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
                AVG RESOLUTION TIME
              </div>
              <div
                style={{
                  fontSize: '2rem',
                  fontWeight: 700,
                  color: '#2563eb',
                  marginTop: '0.25rem',
                }}
              >
                {data.resolutionDuration.averageResolutionHours !== null
                  ? `${data.resolutionDuration.averageResolutionHours.toFixed(1)} hrs`
                  : 'N/A'}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Avg closure:{' '}
                {data.resolutionDuration.averageClosureHours !== null
                  ? `${data.resolutionDuration.averageClosureHours.toFixed(1)} hrs`
                  : 'N/A'}
              </div>
            </div>
          </div>

          {/* Two-column breakdowns: Types & Operational Impact */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {/* By Incident Type */}
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
                  fontSize: '1rem',
                  fontWeight: 600,
                  margin: '0 0 1rem 0',
                  color: '#111827',
                }}
              >
                Incidents by Type
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {data.distributionByType.map((t) => (
                  <div
                    key={t.type}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '0.5rem 0.75rem',
                      backgroundColor: '#f9fafb',
                      borderRadius: '4px',
                      fontSize: '0.875rem',
                      border: '1px solid #f3f4f6',
                    }}
                  >
                    <span style={{ fontWeight: 500, color: '#374151' }}>{t.type}</span>
                    <strong style={{ color: '#111827' }}>{t.count}</strong>
                  </div>
                ))}
              </div>
            </div>

            {/* By Operational Impact */}
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
                  fontSize: '1rem',
                  fontWeight: 600,
                  margin: '0 0 1rem 0',
                  color: '#111827',
                }}
              >
                Operational Impact Distribution
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {data.distributionByOperationalImpact.map((o) => (
                  <div
                    key={o.operationalImpact}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '0.5rem 0.75rem',
                      backgroundColor: '#f9fafb',
                      borderRadius: '4px',
                      fontSize: '0.875rem',
                      border: '1px solid #f3f4f6',
                    }}
                  >
                    <span style={{ fontWeight: 500, color: '#374151' }}>
                      {o.operationalImpact === 'NONE'
                        ? 'No Fleet Disruption'
                        : o.operationalImpact === 'VEHICLE'
                          ? 'Vehicle Grounded'
                          : o.operationalImpact === 'DRIVER'
                            ? 'Driver Suspended'
                            : 'Both Vehicle & Driver Grounded'}
                    </span>
                    <strong
                      style={{ color: o.operationalImpact === 'NONE' ? '#15803d' : '#dc2626' }}
                    >
                      {o.count}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Severity & Status grids */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {/* Severity Distribution */}
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <h3
                style={{
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  margin: '0 0 0.75rem 0',
                  color: '#111827',
                }}
              >
                Severity Distribution
              </h3>
              <div
                style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}
              >
                {data.distributionBySeverity.map((s) => (
                  <div
                    key={s.severity}
                    style={{
                      padding: '0.75rem',
                      backgroundColor: s.severity === 'CRITICAL' ? '#fef2f2' : '#f9fafb',
                      border: s.severity === 'CRITICAL' ? '1px solid #fecaca' : '1px solid #e5e7eb',
                      borderRadius: '6px',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>
                      {s.severity}
                    </div>
                    <div
                      style={{
                        fontSize: '1.25rem',
                        fontWeight: 700,
                        color: s.severity === 'CRITICAL' ? '#dc2626' : '#111827',
                        marginTop: '0.25rem',
                      }}
                    >
                      {s.count}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Status Distribution */}
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <h3
                style={{
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  margin: '0 0 0.75rem 0',
                  color: '#111827',
                }}
              >
                Lifecycle Status Distribution
              </h3>
              <div
                style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}
              >
                {data.distributionByStatus.map((st) => (
                  <div
                    key={st.status}
                    style={{
                      padding: '0.5rem',
                      backgroundColor: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                    }}
                  >
                    <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 600 }}>
                      {st.status}
                    </div>
                    <div
                      style={{
                        fontSize: '1.1rem',
                        fontWeight: 700,
                        color: '#111827',
                        marginTop: '0.2rem',
                      }}
                    >
                      {st.count}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
