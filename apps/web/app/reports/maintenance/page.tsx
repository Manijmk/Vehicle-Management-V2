'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ReportControls } from '../../../components/report-controls';
import { TenantHeader } from '../../../components/tenant-header';
import { reportingApi, type MaintenanceAnalyticsReport } from '../../../lib/api-client';

export default function MaintenanceAnalyticsReportPage() {
  const [data, setData] = useState<MaintenanceAnalyticsReport | null>(null);
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
      const res = await reportingApi.fetchMaintenanceAnalyticsReport({
        from: from || undefined,
        to: to || undefined,
      });
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load maintenance analytics report');
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
          data-testid="maintenance-report-title"
          style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0, color: '#111827' }}
        >
          Maintenance Health Analytics
        </h1>
        <p style={{ color: '#4b5563', margin: '0.35rem 0 0 0', fontSize: '0.95rem' }}>
          Work order lifecycle, service cycle times, blocking maintenance requests, parts & labor
          operational costs, and PM schedule compliance.
        </p>
      </div>

      <ReportControls
        reportKey="maintenance"
        from={from}
        to={to}
        onDateChange={handleDateChange}
        exportTitle="Export Maintenance"
      />

      {loading && (
        <div
          data-testid="loading-indicator"
          style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}
        >
          Loading maintenance metrics...
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
          {/* Top KPI row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
            }}
          >
            {/* Open & Blocking Requests */}
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
                MAINTENANCE REQUESTS
              </div>
              <div
                style={{
                  fontSize: '2rem',
                  fontWeight: 700,
                  color: '#111827',
                  marginTop: '0.25rem',
                }}
              >
                {data.requests.totalOpenRequests}
                <span
                  style={{
                    fontSize: '0.85rem',
                    color: '#6b7280',
                    fontWeight: 400,
                    marginLeft: '0.5rem',
                  }}
                >
                  open
                </span>
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                Blocking Fleet Operations:{' '}
                <strong
                  style={{ color: data.requests.blockingRequestsCount > 0 ? '#dc2626' : '#16a34a' }}
                >
                  {data.requests.blockingRequestsCount}
                </strong>
              </div>
            </div>

            {/* Cycle Time */}
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
                AVG WORK ORDER CYCLE TIME
              </div>
              <div
                style={{
                  fontSize: '2rem',
                  fontWeight: 700,
                  color: '#2563eb',
                  marginTop: '0.25rem',
                }}
              >
                {data.workOrders.averageCycleTimeHours !== null
                  ? `${data.workOrders.averageCycleTimeHours.toFixed(1)} hrs`
                  : 'N/A'}
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#4b5563' }}>
                Based on {data.workOrders.completedInPeriodCount} completed work orders
              </div>
            </div>

            {/* Parts & Labor Operational Costs */}
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
                OPERATIONAL SERVICE COSTS
              </div>
              <div
                style={{
                  fontSize: '2rem',
                  fontWeight: 700,
                  color: '#111827',
                  marginTop: '0.25rem',
                }}
              >
                $
                {data.workOrders.operationalTotals.totalWorkOrderOperationalCost.toLocaleString(
                  undefined,
                  { minimumFractionDigits: 2 },
                )}
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#4b5563' }}>
                Parts: ${data.workOrders.operationalTotals.totalPartCostOperational.toFixed(2)} |
                Labor: ${data.workOrders.operationalTotals.totalLaborCostOperational.toFixed(2)}
              </div>
            </div>

            {/* Preventive Maintenance Schedules */}
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
                PREVENTIVE SCHEDULES
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a' }}>
                    {data.preventiveSchedules.upcomingCount}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Upcoming</div>
                </div>
                <div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ca8a04' }}>
                    {data.preventiveSchedules.dueCount}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Due Now</div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: '1.5rem',
                      fontWeight: 700,
                      color: data.preventiveSchedules.overdueCount > 0 ? '#dc2626' : '#16a34a',
                    }}
                  >
                    {data.preventiveSchedules.overdueCount}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Overdue</div>
                </div>
              </div>
            </div>
          </div>

          {/* Work Orders by Status Breakdown */}
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
              Work Order Status Breakdown
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '1rem',
              }}
            >
              {data.workOrders.workOrdersByStatus.map((st) => (
                <div
                  key={st.status}
                  style={{
                    padding: '1rem',
                    backgroundColor: '#f9fafb',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb',
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>
                    {st.status}
                  </div>
                  <div
                    style={{
                      fontSize: '1.5rem',
                      fontWeight: 700,
                      color: '#111827',
                      marginTop: '0.25rem',
                    }}
                  >
                    {st.count}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Operational vs Finance distinction note */}
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
            <strong>Operational vs. Ledger Accounting Distinction:</strong> Work order parts and
            labor figures represent internal operational service estimates and workshop receipts.
            General ledger entries and vendor invoices are formally tracked and audited in the{' '}
            <em>Finance & Expenses</em> module.
          </div>
        </div>
      )}
    </div>
  );
}
