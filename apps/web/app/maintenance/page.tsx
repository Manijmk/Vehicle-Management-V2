'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../components/tenant-header';
import {
  maintenanceApi,
  vehicleApi,
  type CurrentUserResponse,
  type MaintenanceDashboardSummary,
  type MaintenanceRequestRecord,
  type MaintenanceWorkOrderRecord,
} from '../../lib/api-client';

export default function MaintenanceDashboardPage() {
  const [dashboard, setDashboard] = useState<MaintenanceDashboardSummary | null>(null);
  const [recentRequests, setRecentRequests] = useState<MaintenanceRequestRecord[]>([]);
  const [recentWorkOrders, setRecentWorkOrders] = useState<MaintenanceWorkOrderRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [dash, reqs, orders, user] = await Promise.all([
        maintenanceApi.fetchDashboard(),
        maintenanceApi.fetchRequests({ status: 'OPEN', limit: 5 }),
        maintenanceApi.fetchWorkOrders({ limit: 5 }),
        vehicleApi.fetchCurrentUser().catch(() => null),
      ]);
      setDashboard(dash);
      setRecentRequests(reqs.items);
      setRecentWorkOrders(orders.items);
      setCurrentUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load maintenance dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const canCreateRequest = Boolean(currentUser?.permissions.includes('maintenance.request.create'));
  const canCreateWorkOrder = Boolean(
    currentUser?.permissions.includes('maintenance.work-order.manage'),
  );

  return (
    <div
      className="maintenance-page"
      style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}
    >
      <TenantHeader onAuthChange={loadData} />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '1.5rem',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 600 }}>Fleet Maintenance</h1>
          <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280' }}>
            Work orders, preventive schedules, inspection defects, and operational readiness
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {canCreateRequest && (
            <Link
              href="/maintenance/requests/new"
              className="btn btn-secondary"
              style={{
                padding: '0.5rem 1rem',
                background: '#f3f4f6',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                textDecoration: 'none',
                color: '#374151',
                fontWeight: 500,
              }}
              data-testid="btn-new-request"
            >
              + New Request
            </Link>
          )}
          {canCreateWorkOrder && (
            <Link
              href="/maintenance/work-orders/new"
              className="btn btn-primary"
              style={{
                padding: '0.5rem 1rem',
                background: '#2563eb',
                border: '1px solid #1d4ed8',
                borderRadius: '6px',
                textDecoration: 'none',
                color: '#fff',
                fontWeight: 500,
              }}
              data-testid="btn-new-work-order"
            >
              + New Work Order
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            background: '#fee2e2',
            border: '1px solid #ef4444',
            color: '#b91c1c',
            padding: '1rem',
            borderRadius: '6px',
            marginBottom: '1.5rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid #e5e7eb',
          paddingBottom: '0.75rem',
          marginBottom: '1.5rem',
        }}
      >
        <Link
          href="/maintenance"
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            background: '#eff6ff',
            color: '#1d4ed8',
            fontWeight: 600,
            textDecoration: 'none',
          }}
          data-testid="tab-dashboard"
        >
          Dashboard
        </Link>
        <Link
          href="/maintenance/requests"
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            color: '#4b5563',
            textDecoration: 'none',
          }}
          data-testid="tab-requests"
        >
          Requests
        </Link>
        <Link
          href="/maintenance/work-orders"
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            color: '#4b5563',
            textDecoration: 'none',
          }}
          data-testid="tab-work-orders"
        >
          Work Orders
        </Link>
        <Link
          href="/maintenance/schedules"
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            color: '#4b5563',
            textDecoration: 'none',
          }}
          data-testid="tab-schedules"
        >
          Schedules
        </Link>
        <Link
          href="/maintenance/plans"
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            color: '#4b5563',
            textDecoration: 'none',
          }}
          data-testid="tab-plans"
        >
          Plans
        </Link>
        <Link
          href="/maintenance/vendors"
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            color: '#4b5563',
            textDecoration: 'none',
          }}
          data-testid="tab-vendors"
        >
          Vendors
        </Link>
      </div>

      {/* KPI Metrics Grid */}
      {loading && !dashboard ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
          Loading maintenance metrics...
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem',
              marginBottom: '2rem',
            }}
          >
            <div
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
              data-testid="metric-blocked-vehicles"
            >
              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Blocked Vehicles</span>
              <div
                style={{
                  fontSize: '1.875rem',
                  fontWeight: 700,
                  color: dashboard?.blockedVehiclesCount ? '#dc2626' : '#16a34a',
                  marginTop: '0.25rem',
                }}
              >
                {dashboard?.blockedVehiclesCount ?? 0}
              </div>
            </div>

            <div
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
              data-testid="metric-open-requests"
            >
              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Open Requests</span>
              <div
                style={{
                  fontSize: '1.875rem',
                  fontWeight: 700,
                  color: '#111827',
                  marginTop: '0.25rem',
                }}
              >
                {dashboard?.openRequestsCount ?? 0}
              </div>
            </div>

            <div
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
              data-testid="metric-critical-requests"
            >
              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Critical Defects</span>
              <div
                style={{
                  fontSize: '1.875rem',
                  fontWeight: 700,
                  color: dashboard?.criticalRequestsCount ? '#ea580c' : '#111827',
                  marginTop: '0.25rem',
                }}
              >
                {dashboard?.criticalRequestsCount ?? 0}
              </div>
            </div>

            <div
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
              data-testid="metric-in-progress-orders"
            >
              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Active Work Orders</span>
              <div
                style={{
                  fontSize: '1.875rem',
                  fontWeight: 700,
                  color: '#2563eb',
                  marginTop: '0.25rem',
                }}
              >
                {(dashboard?.openWorkOrdersCount ?? 0) +
                  (dashboard?.inProgressWorkOrdersCount ?? 0)}
              </div>
            </div>

            <div
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
              data-testid="metric-due-schedules"
            >
              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Preventive Due</span>
              <div
                style={{
                  fontSize: '1.875rem',
                  fontWeight: 700,
                  color: dashboard?.overdueSchedulesCount ? '#dc2626' : '#d97706',
                  marginTop: '0.25rem',
                }}
              >
                {(dashboard?.dueSchedulesCount ?? 0) + (dashboard?.overdueSchedulesCount ?? 0)}
              </div>
            </div>
          </div>

          {/* Operational Blocking Alert Banner */}
          {(dashboard?.blockedVehiclesCount ?? 0) > 0 && (
            <div
              style={{
                background: '#fff1f2',
                border: '1px solid #fecdd3',
                borderRadius: '8px',
                padding: '1rem 1.25rem',
                marginBottom: '2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              data-testid="operational-block-banner"
            >
              <div>
                <strong style={{ color: '#9f1239' }}>Operational Notice:</strong>{' '}
                <span style={{ color: '#be123c' }}>
                  {dashboard?.blockedVehiclesCount} vehicle(s) currently blocked from trip dispatch
                  due to critical defects or active blocking work orders.
                </span>
              </div>
              <Link
                href="/maintenance/requests?blocksOperation=true"
                style={{ color: '#be123c', fontWeight: 600, fontSize: '0.875rem' }}
              >
                View Blocked Requests &rarr;
              </Link>
            </div>
          )}

          {/* Recent Open Requests */}
          <div
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1.5rem',
              marginBottom: '2rem',
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
              <h2 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 600 }}>
                Open Maintenance Requests
              </h2>
              <Link
                href="/maintenance/requests"
                style={{ fontSize: '0.875rem', color: '#2563eb', textDecoration: 'none' }}
              >
                View all ({dashboard?.openRequestsCount ?? 0}) &rarr;
              </Link>
            </div>

            {recentRequests.length === 0 ? (
              <p style={{ color: '#6b7280', margin: 0 }}>No open maintenance requests.</p>
            ) : (
              <table
                style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}
                data-testid="table-dashboard-requests"
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid #e5e7eb',
                      color: '#6b7280',
                      fontSize: '0.875rem',
                    }}
                  >
                    <th style={{ padding: '0.75rem 0.5rem' }}>ID</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Vehicle</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Title</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Priority</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Blocks Trip?</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Source</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRequests.map((req) => (
                    <tr
                      key={req.id}
                      style={{ borderBottom: '1px solid #f3f4f6' }}
                      data-testid={`request-row-${req.displayId}`}
                    >
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>
                        {req.displayId}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        {req.vehicleDisplayId ?? req.vehicleId}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>{req.title}</td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <span
                          style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background:
                              req.priority === 'CRITICAL'
                                ? '#fee2e2'
                                : req.priority === 'HIGH'
                                  ? '#ffedd5'
                                  : '#f3f4f6',
                            color:
                              req.priority === 'CRITICAL'
                                ? '#b91c1c'
                                : req.priority === 'HIGH'
                                  ? '#c2410c'
                                  : '#374151',
                          }}
                        >
                          {req.priority}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        {req.blocksOperation ? (
                          <span style={{ color: '#dc2626', fontWeight: 600, fontSize: '0.875rem' }}>
                            YES
                          </span>
                        ) : (
                          <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>No</span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: '0.75rem 0.5rem',
                          fontSize: '0.875rem',
                          color: '#6b7280',
                        }}
                      >
                        {req.sourceType}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                        <Link
                          href={`/maintenance/requests/${req.id}`}
                          style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}
                          data-testid={`view-request-${req.displayId}`}
                        >
                          View &rarr;
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Active Work Orders */}
          <div
            style={{
              background: '#fff',
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
              <h2 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 600 }}>
                Recent Work Orders
              </h2>
              <Link
                href="/maintenance/work-orders"
                style={{ fontSize: '0.875rem', color: '#2563eb', textDecoration: 'none' }}
              >
                View all &rarr;
              </Link>
            </div>

            {recentWorkOrders.length === 0 ? (
              <p style={{ color: '#6b7280', margin: 0 }}>No recent work orders found.</p>
            ) : (
              <table
                style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}
                data-testid="table-dashboard-orders"
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid #e5e7eb',
                      color: '#6b7280',
                      fontSize: '0.875rem',
                    }}
                  >
                    <th style={{ padding: '0.75rem 0.5rem' }}>ID</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Vehicle</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Title</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Vendor</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Total Cost</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recentWorkOrders.map((order) => (
                    <tr
                      key={order.id}
                      style={{ borderBottom: '1px solid #f3f4f6' }}
                      data-testid={`order-row-${order.displayId}`}
                    >
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>
                        {order.displayId}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        {order.vehicleDisplayId ?? order.vehicleId}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>{order.title}</td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <span
                          style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background:
                              order.status === 'COMPLETED'
                                ? '#dcfce7'
                                : order.status === 'IN_PROGRESS'
                                  ? '#dbeafe'
                                  : '#fef3c7',
                            color:
                              order.status === 'COMPLETED'
                                ? '#15803d'
                                : order.status === 'IN_PROGRESS'
                                  ? '#1d4ed8'
                                  : '#b45309',
                          }}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        {order.vendorName ?? 'Internal'}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500 }}>
                        ${(order.totalCost / 100).toFixed(2)}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                        <Link
                          href={`/maintenance/work-orders/${order.id}`}
                          style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}
                          data-testid={`view-order-${order.displayId}`}
                        >
                          Manage &rarr;
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
