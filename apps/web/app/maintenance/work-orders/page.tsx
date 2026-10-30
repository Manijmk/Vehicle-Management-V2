'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import {
  maintenanceApi,
  vehicleApi,
  type CurrentUserResponse,
  type MaintenancePriority,
  type MaintenanceWorkOrderRecord,
  type MaintenanceWorkOrderStatus,
} from '../../../lib/api-client';

export default function MaintenanceWorkOrdersPage() {
  const [workOrders, setWorkOrders] = useState<MaintenanceWorkOrderRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<'ALL' | MaintenanceWorkOrderStatus>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | MaintenancePriority>('ALL');
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [res, user] = await Promise.all([
        maintenanceApi.fetchWorkOrders({
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          priority: priorityFilter !== 'ALL' ? priorityFilter : undefined,
          search: search.trim() ? search.trim() : undefined,
          limit: 100,
        }),
        vehicleApi.fetchCurrentUser().catch(() => null),
      ]);
      setWorkOrders(res.items);
      setCurrentUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load work orders');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, search]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const canCreate = Boolean(currentUser?.permissions.includes('maintenance.work-order.create'));

  return (
    <div
      className="maintenance-work-orders-page"
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
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 600 }}>
            Maintenance Work Orders
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280' }}>
            Execute repair jobs, track technician tasks, log parts & labor, and close maintenance
          </p>
        </div>
        {canCreate && (
          <Link
            href="/maintenance/work-orders/new"
            style={{
              padding: '0.5rem 1rem',
              background: '#2563eb',
              border: '1px solid #1d4ed8',
              borderRadius: '6px',
              textDecoration: 'none',
              color: '#fff',
              fontWeight: 500,
            }}
            data-testid="btn-create-work-order"
          >
            + New Work Order
          </Link>
        )}
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

      {/* Filter Toolbar */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1.5rem',
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#4b5563',
              marginBottom: '0.25rem',
            }}
          >
            Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | MaintenanceWorkOrderStatus)}
            style={{ padding: '0.4rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
            data-testid="filter-status"
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#4b5563',
              marginBottom: '0.25rem',
            }}
          >
            Priority
          </label>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as 'ALL' | MaintenancePriority)}
            style={{ padding: '0.4rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
            data-testid="filter-priority"
          >
            <option value="ALL">All Priorities</option>
            <option value="LOW">Low</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </div>

        <div style={{ flex: 1, minWidth: '200px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#4b5563',
              marginBottom: '0.25rem',
            }}
          >
            Search
          </label>
          <input
            type="text"
            placeholder="Search by ID or title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '0.4rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
            }}
            data-testid="search-work-orders"
          />
        </div>
      </div>

      {/* Work Orders Table */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            Loading work orders...
          </div>
        ) : workOrders.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            No work orders found matching criteria.
          </div>
        ) : (
          <table
            style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}
            data-testid="table-work-orders"
          >
            <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Display ID</th>
                <th style={{ padding: '0.75rem 1rem' }}>Vehicle</th>
                <th style={{ padding: '0.75rem 1rem' }}>Title</th>
                <th style={{ padding: '0.75rem 1rem' }}>Priority</th>
                <th style={{ padding: '0.75rem 1rem' }}>Blocks Trip?</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem' }}>Vendor</th>
                <th style={{ padding: '0.75rem 1rem' }}>Total Cost</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {workOrders.map((wo) => (
                <tr
                  key={wo.id}
                  style={{ borderBottom: '1px solid #f3f4f6' }}
                  data-testid={`work-order-row-${wo.displayId}`}
                >
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{wo.displayId}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <Link
                      href={`/vehicles/${wo.vehicleId}`}
                      style={{ color: '#2563eb', textDecoration: 'none' }}
                    >
                      {wo.vehicleDisplayId ?? wo.vehicleRegistration ?? wo.vehicleId}
                    </Link>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>{wo.title}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background:
                          wo.priority === 'CRITICAL'
                            ? '#fee2e2'
                            : wo.priority === 'HIGH'
                              ? '#ffedd5'
                              : '#f3f4f6',
                        color:
                          wo.priority === 'CRITICAL'
                            ? '#b91c1c'
                            : wo.priority === 'HIGH'
                              ? '#c2410c'
                              : '#374151',
                      }}
                    >
                      {wo.priority}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {wo.blocksOperation ? (
                      <span
                        style={{ color: '#dc2626', fontWeight: 600, fontSize: '0.875rem' }}
                        data-testid={`badge-blocking-${wo.displayId}`}
                      >
                        BLOCKING
                      </span>
                    ) : (
                      <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>No</span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background:
                          wo.status === 'COMPLETED'
                            ? '#dcfce7'
                            : wo.status === 'IN_PROGRESS'
                              ? '#dbeafe'
                              : wo.status === 'OPEN'
                                ? '#fef3c7'
                                : '#f3f4f6',
                        color:
                          wo.status === 'COMPLETED'
                            ? '#15803d'
                            : wo.status === 'IN_PROGRESS'
                              ? '#1d4ed8'
                              : wo.status === 'OPEN'
                                ? '#b45309'
                                : '#6b7280',
                      }}
                      data-testid={`badge-status-${wo.displayId}`}
                    >
                      {wo.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>
                    {wo.vendorName ?? 'Internal Depot'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                    ${(wo.totalCost / 100).toFixed(2)}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    <Link
                      href={`/maintenance/work-orders/${wo.id}`}
                      style={{
                        padding: '0.3rem 0.75rem',
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        borderRadius: '4px',
                        textDecoration: 'none',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                      }}
                      data-testid={`btn-view-${wo.displayId}`}
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
    </div>
  );
}
