'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ReportControls } from '../../../components/report-controls';
import { TenantHeader } from '../../../components/tenant-header';
import { reportingApi, type ComplianceAnalyticsReport } from '../../../lib/api-client';

export default function ComplianceAnalyticsReportPage() {
  const [data, setData] = useState<ComplianceAnalyticsReport | null>(null);
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
      const res = await reportingApi.fetchComplianceAnalyticsReport({
        from: from || undefined,
        to: to || undefined,
      });
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load compliance analytics report');
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

  const vTotal = data
    ? data.vehicleCompliance.compliantCount +
      data.vehicleCompliance.warningCount +
      data.vehicleCompliance.nonCompliantCount
    : 0;
  const vPct =
    vTotal > 0 && data
      ? ((data.vehicleCompliance.compliantCount / vTotal) * 100).toFixed(0)
      : '100';

  const dTotal = data
    ? data.driverCompliance.compliantCount +
      data.driverCompliance.warningCount +
      data.driverCompliance.nonCompliantCount
    : 0;
  const dPct =
    dTotal > 0 && data ? ((data.driverCompliance.compliantCount / dTotal) * 100).toFixed(0) : '100';

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
          data-testid="compliance-report-title"
          style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0, color: '#111827' }}
        >
          Compliance & Document Expiry Analytics
        </h1>
        <p style={{ color: '#4b5563', margin: '0.35rem 0 0 0', fontSize: '0.95rem' }}>
          Derived operational compliance posture for vehicles and drivers, document expiration
          horizons, and audit readiness.
        </p>
      </div>

      <ReportControls
        reportKey="compliance"
        from={from}
        to={to}
        onDateChange={handleDateChange}
        exportTitle="Export Compliance"
      />

      {loading && (
        <div
          data-testid="loading-indicator"
          style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}
        >
          Loading compliance metrics...
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
          {/* Top KPI Cards: Vehicles & Drivers */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {/* Vehicle Compliance */}
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.5rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 600 }}>
                VEHICLE FLEET COMPLIANCE
              </div>
              <div
                style={{
                  fontSize: '2.5rem',
                  fontWeight: 700,
                  color: data.vehicleCompliance.nonCompliantCount > 0 ? '#dc2626' : '#15803d',
                  marginTop: '0.5rem',
                }}
              >
                {vPct}%
                <span
                  style={{
                    fontSize: '1rem',
                    fontWeight: 400,
                    color: '#6b7280',
                    marginLeft: '0.75rem',
                  }}
                >
                  compliant
                </span>
              </div>
              <div
                style={{ marginTop: '1rem', display: 'flex', gap: '1.5rem', fontSize: '0.875rem' }}
              >
                <div>
                  Total: <strong>{vTotal}</strong>
                </div>
                <div>
                  Compliant:{' '}
                  <strong style={{ color: '#15803d' }}>
                    {data.vehicleCompliance.compliantCount}
                  </strong>
                </div>
                <div>
                  Warning:{' '}
                  <strong style={{ color: '#ca8a04' }}>
                    {data.vehicleCompliance.warningCount}
                  </strong>
                </div>
                <div>
                  Non-Compliant:{' '}
                  <strong style={{ color: '#dc2626' }}>
                    {data.vehicleCompliance.nonCompliantCount}
                  </strong>
                </div>
              </div>
            </div>

            {/* Driver Compliance */}
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.5rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 600 }}>
                DRIVER WORKFORCE COMPLIANCE
              </div>
              <div
                style={{
                  fontSize: '2.5rem',
                  fontWeight: 700,
                  color: data.driverCompliance.nonCompliantCount > 0 ? '#dc2626' : '#15803d',
                  marginTop: '0.5rem',
                }}
              >
                {dPct}%
                <span
                  style={{
                    fontSize: '1rem',
                    fontWeight: 400,
                    color: '#6b7280',
                    marginLeft: '0.75rem',
                  }}
                >
                  compliant
                </span>
              </div>
              <div
                style={{ marginTop: '1rem', display: 'flex', gap: '1.5rem', fontSize: '0.875rem' }}
              >
                <div>
                  Total: <strong>{dTotal}</strong>
                </div>
                <div>
                  Compliant:{' '}
                  <strong style={{ color: '#15803d' }}>
                    {data.driverCompliance.compliantCount}
                  </strong>
                </div>
                <div>
                  Warning:{' '}
                  <strong style={{ color: '#ca8a04' }}>{data.driverCompliance.warningCount}</strong>
                </div>
                <div>
                  Non-Compliant:{' '}
                  <strong style={{ color: '#dc2626' }}>
                    {data.driverCompliance.nonCompliantCount}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Document Expiration Horizon */}
          <div
            style={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1.5rem',
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
              Active Document Expiration Horizon ({data.documents.totalActiveDocuments} Active
              Documents)
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
              }}
            >
              <div
                style={{
                  padding: '1rem',
                  backgroundColor: '#f0fdf4',
                  borderRadius: '6px',
                  border: '1px solid #bbf7d0',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600 }}>
                  TOTAL ACTIVE
                </div>
                <div
                  style={{
                    fontSize: '1.75rem',
                    fontWeight: 700,
                    color: '#15803d',
                    marginTop: '0.25rem',
                  }}
                >
                  {data.documents.totalActiveDocuments}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#166534', marginTop: '0.25rem' }}>
                  Managed under policy
                </div>
              </div>

              <div
                style={{
                  padding: '1rem',
                  backgroundColor: '#fefce8',
                  borderRadius: '6px',
                  border: '1px solid #fef08a',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#854d0e', fontWeight: 600 }}>
                  EXPIRING WITHIN 30 DAYS
                </div>
                <div
                  style={{
                    fontSize: '1.75rem',
                    fontWeight: 700,
                    color: '#ca8a04',
                    marginTop: '0.25rem',
                  }}
                >
                  {data.documents.expiringSoonCount}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#854d0e', marginTop: '0.25rem' }}>
                  Renewal required soon
                </div>
              </div>

              <div
                style={{
                  padding: '1rem',
                  backgroundColor: '#fef2f2',
                  borderRadius: '6px',
                  border: '1px solid #fecaca',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#991b1b', fontWeight: 600 }}>
                  EXPIRED
                </div>
                <div
                  style={{
                    fontSize: '1.75rem',
                    fontWeight: 700,
                    color: '#dc2626',
                    marginTop: '0.25rem',
                  }}
                >
                  {data.documents.expiredCount}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#991b1b', marginTop: '0.25rem' }}>
                  Immediate action needed
                </div>
              </div>
            </div>
          </div>

          {/* Historical Daily Reconstruction Disclaimer */}
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
            <strong>Methodology & Audit Disclaimer:</strong> Compliance states (COMPLIANT, WARNING,
            NON_COMPLIANT) reflect current active document policies, driver licenses, and expiration
            rules evaluated against registered assets. Historical point-in-time daily compliance
            snapshots are not stored and cannot be retroactively reconstructed without speculative
            policy rollback.
          </div>
        </div>
      )}
    </div>
  );
}
