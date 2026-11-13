'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ReportControls } from '../../components/report-controls';
import { TenantHeader } from '../../components/tenant-header';
import { reportingApi, type DashboardReport } from '../../lib/api-client';

export default function ReportsDashboardPage() {
  const [data, setData] = useState<DashboardReport | null>(null);
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
      const res = await reportingApi.fetchDashboardReport({
        from: from || undefined,
        to: to || undefined,
      });
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load executive dashboard');
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
        <h1
          data-testid="reports-title"
          style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0, color: '#111827' }}
        >
          Executive Fleet & Operations Dashboard
        </h1>
        <p style={{ color: '#4b5563', margin: '0.35rem 0 0 0', fontSize: '0.95rem' }}>
          Consolidated, tenant-isolated operational metrics, financial health, vehicle utilization,
          and safety analytics.
        </p>
      </div>

      <ReportControls
        reportKey="dashboard"
        from={from}
        to={to}
        onDateChange={handleDateChange}
        exportTitle="Executive Summary"
      />

      {loading && (
        <div
          data-testid="loading-indicator"
          style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}
        >
          Loading dashboard metrics...
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
        <div
          data-testid="reports-dashboard"
          style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}
        >
          {/* Top KPI Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {/* Fleet Overview Card */}
            <div
              data-testid="kpi-fleet"
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#4b5563' }}>
                  FLEET OVERVIEW
                </span>
                <Link href="/reports/utilization" style={{ fontSize: '0.75rem', color: '#2563eb' }}>
                  Details &rarr;
                </Link>
              </div>
              <div
                style={{ fontSize: '2rem', fontWeight: 700, color: '#111827', marginTop: '0.5rem' }}
              >
                {data.fleetOverview.totalVehicles}
                <span
                  style={{
                    fontSize: '0.875rem',
                    fontWeight: 400,
                    color: '#6b7280',
                    marginLeft: '0.5rem',
                  }}
                >
                  Total Vehicles
                </span>
              </div>
              <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#374151' }}>
                <div>
                  Active in fleet: <strong>{data.fleetOverview.activeVehicles}</strong> (Draft:{' '}
                  {data.fleetOverview.draftVehicles}, Retired: {data.fleetOverview.retiredVehicles})
                </div>
                <div>
                  Assigned to drivers: <strong>{data.fleetOverview.assignedVehicles}</strong>
                </div>
                <div>
                  In-progress trips: <strong>{data.fleetOverview.inProgressTripVehicles}</strong>
                </div>
              </div>
            </div>

            {/* Trips Performance Card */}
            <div
              data-testid="kpi-trips"
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#4b5563' }}>
                  TRIPS & DISTANCE
                </span>
                <Link href="/reports/trips" style={{ fontSize: '0.75rem', color: '#2563eb' }}>
                  Details &rarr;
                </Link>
              </div>
              {data.tripsSummary ? (
                <>
                  <div
                    style={{
                      fontSize: '2rem',
                      fontWeight: 700,
                      color: '#111827',
                      marginTop: '0.5rem',
                    }}
                  >
                    {data.tripsSummary.totalTrips}
                    <span
                      style={{
                        fontSize: '0.875rem',
                        fontWeight: 400,
                        color: '#6b7280',
                        marginLeft: '0.5rem',
                      }}
                    >
                      Total Trips
                    </span>
                  </div>
                  <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#374151' }}>
                    <div>
                      Completed: <strong>{data.tripsSummary.completedCount}</strong> (
                      {data.tripsSummary.completionRatePercent !== null
                        ? `${data.tripsSummary.completionRatePercent}%`
                        : 'N/A'}
                      )
                    </div>
                    <div>
                      Distance:{' '}
                      <strong>{data.tripsSummary.totalDistanceKm.toLocaleString()} km</strong>
                    </div>
                  </div>
                </>
              ) : (
                <div
                  style={{
                    marginTop: '1rem',
                    color: '#9ca3af',
                    fontStyle: 'italic',
                    fontSize: '0.875rem',
                  }}
                >
                  Requires trip.read permission
                </div>
              )}
            </div>

            {/* Maintenance Health Card */}
            <div
              data-testid="kpi-maintenance"
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#4b5563' }}>
                  MAINTENANCE ALERTS
                </span>
                <Link href="/reports/maintenance" style={{ fontSize: '0.75rem', color: '#2563eb' }}>
                  Details &rarr;
                </Link>
              </div>
              {data.maintenanceAlerts ? (
                <>
                  <div
                    style={{
                      fontSize: '2rem',
                      fontWeight: 700,
                      color:
                        data.maintenanceAlerts.blockingRequestsCount > 0 ? '#dc2626' : '#111827',
                      marginTop: '0.5rem',
                    }}
                  >
                    {data.maintenanceAlerts.blockingRequestsCount}
                    <span
                      style={{
                        fontSize: '0.875rem',
                        fontWeight: 400,
                        color: '#6b7280',
                        marginLeft: '0.5rem',
                      }}
                    >
                      Blocking Requests
                    </span>
                  </div>
                  <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#374151' }}>
                    <div>
                      Overdue PM Schedules:{' '}
                      <strong
                        style={{
                          color:
                            data.maintenanceAlerts.overdueSchedulesCount > 0
                              ? '#dc2626'
                              : '#16a34a',
                        }}
                      >
                        {data.maintenanceAlerts.overdueSchedulesCount}
                      </strong>
                    </div>
                  </div>
                </>
              ) : (
                <div
                  style={{
                    marginTop: '1rem',
                    color: '#9ca3af',
                    fontStyle: 'italic',
                    fontSize: '0.875rem',
                  }}
                >
                  Requires maintenance.read permission
                </div>
              )}
            </div>

            {/* Compliance Card */}
            <div
              data-testid="kpi-compliance"
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#4b5563' }}>
                  COMPLIANCE ALERTS
                </span>
                <Link href="/reports/compliance" style={{ fontSize: '0.75rem', color: '#2563eb' }}>
                  Details &rarr;
                </Link>
              </div>
              {data.complianceAlerts ? (
                <>
                  <div
                    style={{
                      fontSize: '2rem',
                      fontWeight: 700,
                      color: data.complianceAlerts.nonCompliantVehicles > 0 ? '#dc2626' : '#16a34a',
                      marginTop: '0.5rem',
                    }}
                  >
                    {data.complianceAlerts.nonCompliantVehicles}
                    <span
                      style={{
                        fontSize: '0.875rem',
                        fontWeight: 400,
                        color: '#6b7280',
                        marginLeft: '0.5rem',
                      }}
                    >
                      Non-Compliant Vehicles
                    </span>
                  </div>
                  <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#374151' }}>
                    <div>
                      Non-compliant drivers:{' '}
                      <strong>{data.complianceAlerts.nonCompliantDrivers}</strong>
                    </div>
                    <div>
                      Expired documents: <strong>{data.complianceAlerts.expiredDocuments}</strong>
                    </div>
                  </div>
                </>
              ) : (
                <div
                  style={{
                    marginTop: '1rem',
                    color: '#9ca3af',
                    fontStyle: 'italic',
                    fontSize: '0.875rem',
                  }}
                >
                  Requires compliance.read permission
                </div>
              )}
            </div>
          </div>

          {/* Financial Overview & Multi-Currency Cards */}
          <div
            data-testid="kpi-costs"
            style={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1.5rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: '#111827' }}>
                  Financial Expenses & Fuel Spend
                </h2>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                  Strictly partitioned by currency with zero FX conversions. Only POSTED
                  transactions are included.
                </p>
              </div>
              <Link
                href="/reports/costs"
                style={{ fontSize: '0.875rem', color: '#2563eb', fontWeight: 500 }}
              >
                View Full Cost Analysis &rarr;
              </Link>
            </div>

            {!data.costsSummary ? (
              <p style={{ color: '#9ca3af', fontStyle: 'italic', margin: '1rem 0' }}>
                Requires finance.read permission to view financial metrics.
              </p>
            ) : data.costsSummary.length === 0 ? (
              <p style={{ color: '#9ca3af', fontStyle: 'italic', margin: '1rem 0' }}>
                No posted expenses or fuel transactions in this period.
              </p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '1rem',
                }}
              >
                {data.costsSummary.map((curr) => (
                  <div
                    key={curr.currencyCode}
                    data-testid={`currency-${curr.currencyCode}`}
                    style={{
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      padding: '1rem',
                      backgroundColor: '#f9fafb',
                    }}
                  >
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1f2937' }}>
                      Currency: {curr.currencyCode}
                    </div>
                    <div
                      style={{
                        marginTop: '0.5rem',
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        color: '#047857',
                      }}
                    >
                      {curr.totalCost.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      {curr.currencyCode}
                    </div>
                    <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#4b5563' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Fuel Spend:</span>
                        <strong>
                          {curr.totalFuelAmount.toFixed(2)} {curr.currencyCode}
                        </strong>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginTop: '0.25rem',
                        }}
                      >
                        <span>Other Expenses:</span>
                        <strong>
                          {curr.totalExpenseAmount.toFixed(2)} {curr.currencyCode}
                        </strong>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginTop: '0.25rem',
                        }}
                      >
                        <span>Cost per km:</span>
                        <strong>
                          {curr.costPerKm !== null
                            ? `${curr.costPerKm.toFixed(3)} ${curr.currencyCode}/km`
                            : 'N/A'}
                        </strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Secondary Grid: Incidents & Telemetry */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {/* Safety & Incidents */}
            <div
              data-testid="kpi-incidents"
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: '#111827' }}>
                  Safety & Incidents
                </h3>
                <Link href="/reports/incidents" style={{ fontSize: '0.75rem', color: '#2563eb' }}>
                  Details &rarr;
                </Link>
              </div>
              {data.incidentAlerts ? (
                <>
                  <div
                    style={{
                      fontSize: '2rem',
                      fontWeight: 700,
                      color: '#111827',
                      marginTop: '0.5rem',
                    }}
                  >
                    {data.incidentAlerts.unresolvedCount}
                    <span
                      style={{
                        fontSize: '0.875rem',
                        fontWeight: 400,
                        color: '#6b7280',
                        marginLeft: '0.5rem',
                      }}
                    >
                      Unresolved Incidents
                    </span>
                  </div>
                  <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#374151' }}>
                    <div>
                      Blocking Fleet Operations:{' '}
                      <strong
                        style={{
                          color:
                            data.incidentAlerts.unresolvedBlockingCount > 0 ? '#dc2626' : '#16a34a',
                        }}
                      >
                        {data.incidentAlerts.unresolvedBlockingCount}
                      </strong>
                    </div>
                  </div>
                </>
              ) : (
                <div
                  style={{
                    marginTop: '1rem',
                    color: '#9ca3af',
                    fontStyle: 'italic',
                    fontSize: '0.875rem',
                  }}
                >
                  Requires incident.read permission
                </div>
              )}
            </div>

            {/* Telemetry Tracking */}
            <div
              data-testid="kpi-telemetry"
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: '#111827' }}>
                  Telemetry & GPS
                </h3>
                <Link href="/reports/telemetry" style={{ fontSize: '0.75rem', color: '#2563eb' }}>
                  Details &rarr;
                </Link>
              </div>
              {data.telemetryStatus ? (
                <>
                  <div
                    style={{
                      fontSize: '2rem',
                      fontWeight: 700,
                      color: '#111827',
                      marginTop: '0.5rem',
                    }}
                  >
                    {data.telemetryStatus.freshVehicles}
                    <span
                      style={{
                        fontSize: '0.875rem',
                        fontWeight: 400,
                        color: '#16a34a',
                        marginLeft: '0.5rem',
                      }}
                    >
                      Fresh Vehicles (&lt;2m)
                    </span>
                  </div>
                  <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#374151' }}>
                    <div>
                      Stale Vehicles:{' '}
                      <strong style={{ color: '#ca8a04' }}>
                        {data.telemetryStatus.staleVehicles}
                      </strong>
                    </div>
                    <div>
                      Tracked Trip Coverage:{' '}
                      <strong>
                        {data.telemetryStatus.trackedTripCoveragePercent !== null
                          ? `${data.telemetryStatus.trackedTripCoveragePercent}%`
                          : 'N/A'}
                      </strong>
                    </div>
                  </div>
                </>
              ) : (
                <div
                  style={{
                    marginTop: '1rem',
                    color: '#9ca3af',
                    fontStyle: 'italic',
                    fontSize: '0.875rem',
                  }}
                >
                  Requires telemetry.read permission
                </div>
              )}
            </div>
          </div>

          {/* Drill-down Navigation Card Section */}
          <div style={{ marginTop: '1rem' }}>
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                marginBottom: '1rem',
                color: '#111827',
              }}
            >
              Explore Detailed Reports
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '1rem',
              }}
            >
              <Link
                href="/reports/utilization"
                data-testid="link-utilization"
                style={{
                  display: 'block',
                  padding: '1.25rem',
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div style={{ fontWeight: 600, color: '#1d4ed8' }}>Vehicle Utilization &rarr;</div>
                <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.35rem' }}>
                  Clipped trip durations, active vehicle days, and mileage utilization per asset.
                </div>
              </Link>

              <Link
                href="/reports/trips"
                data-testid="link-trips"
                style={{
                  display: 'block',
                  padding: '1.25rem',
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div style={{ fontWeight: 600, color: '#1d4ed8' }}>Trip Analytics &rarr;</div>
                <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.35rem' }}>
                  Completion rates with terminal denominators, distance trends, and driver
                  throughput.
                </div>
              </Link>

              <Link
                href="/reports/costs"
                data-testid="link-costs"
                style={{
                  display: 'block',
                  padding: '1.25rem',
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div style={{ fontWeight: 600, color: '#1d4ed8' }}>Costs & Fuel &rarr;</div>
                <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.35rem' }}>
                  Multi-currency partitioned expenses, unit-segregated fuel, and cost per km.
                </div>
              </Link>

              <Link
                href="/reports/maintenance"
                data-testid="link-maintenance"
                style={{
                  display: 'block',
                  padding: '1.25rem',
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div style={{ fontWeight: 600, color: '#1d4ed8' }}>Maintenance Health &rarr;</div>
                <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.35rem' }}>
                  Work orders, cycle times, blocking requests, and preventive maintenance
                  compliance.
                </div>
              </Link>

              <Link
                href="/reports/compliance"
                data-testid="link-compliance"
                style={{
                  display: 'block',
                  padding: '1.25rem',
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div style={{ fontWeight: 600, color: '#1d4ed8' }}>
                  Compliance & Documents &rarr;
                </div>
                <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.35rem' }}>
                  Current fleet compliance status, expired documents, and upcoming expirations.
                </div>
              </Link>

              <Link
                href="/reports/incidents"
                data-testid="link-incidents"
                style={{
                  display: 'block',
                  padding: '1.25rem',
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div style={{ fontWeight: 600, color: '#1d4ed8' }}>Incident Analytics &rarr;</div>
                <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.35rem' }}>
                  Incident types, severity distribution, operational impact, and resolution cycle
                  times.
                </div>
              </Link>

              <Link
                href="/reports/telemetry"
                data-testid="link-telemetry"
                style={{
                  display: 'block',
                  padding: '1.25rem',
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div style={{ fontWeight: 600, color: '#1d4ed8' }}>Telemetry Health &rarr;</div>
                <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.35rem' }}>
                  Device status, freshness, ingestion rates, and GPS-tracked trip coverage.
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
