'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import {
  maintenanceApi,
  vehicleApi,
  type CurrentUserResponse,
  type MaintenancePriority,
  type MaintenanceRequestRecord,
  type MaintenanceRequestStatus,
} from '../../../lib/api-client';

export default function MaintenanceRequestsPage() {
  const [requests, setRequests] = useState<MaintenanceRequestRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<'ALL' | MaintenanceRequestStatus>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | MaintenancePriority>('ALL');
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [res, user] = await Promise.all([
        maintenanceApi.fetchRequests({
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          priority: priorityFilter !== 'ALL' ? priorityFilter : undefined,
          search: search.trim() ? search.trim() : undefined,
          limit: 100,
        }),
        vehicleApi.fetchCurrentUser().catch(() => null),
      ]);
      setRequests(res.items);
      setCurrentUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, search]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const canCreate = Boolean(currentUser?.permissions.includes('maintenance.request.create'));

  return (
    <div
      className="maintenance-requests-page"
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
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 600 }}>Maintenance Requests</h1>
          <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280' }}>
            Reported defects, driver inspection failures, and pending work intake
          </p>
        </div>
        {canCreate && (
          <Link
            href="/maintenance/requests/new"
            style={{
              padding: '0.5rem 1rem',
              background: '#2563eb',
              border: '1px solid #1d4ed8',
              borderRadius: '6px',
              textDecoration: 'none',
              color: '#fff',
              fontWeight: 500,
            }}
            data-testid="btn-create-request"
          >
            + New Request
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
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | MaintenanceRequestStatus)}
            style={{ padding: '0.4rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
            data-testid="filter-status"
          >
            <option value="ALL">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="CONVERTED">Converted to Work Order</option>
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
            data-testid="search-requests"
          />
        </div>
      </div>

      {/* Requests Table */}
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
            Loading requests...
          </div>
        ) : requests.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            No maintenance requests found matching criteria.
          </div>
        ) : (
          <table
            style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}
            data-testid="table-requests"
          >
            <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Display ID</th>
                <th style={{ padding: '0.75rem 1rem' }}>Vehicle</th>
                <th style={{ padding: '0.75rem 1rem' }}>Title</th>
                <th style={{ padding: '0.75rem 1rem' }}>Priority</th>
                <th style={{ padding: '0.75rem 1rem' }}>Blocks Ops?</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem' }}>Source</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr
                  key={r.id}
                  style={{ borderBottom: '1px solid #f3f4f6' }}
                  data-testid={`request-row-${r.displayId}`}
                >
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{r.displayId}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <Link
                      href={`/vehicles/${r.vehicleId}`}
                      style={{ color: '#2563eb', textDecoration: 'none' }}
                    >
                      {r.vehicleDisplayId ?? r.vehicleRegistration ?? r.vehicleId}
                    </Link>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>{r.title}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background:
                          r.priority === 'CRITICAL'
                            ? '#fee2e2'
                            : r.priority === 'HIGH'
                              ? '#ffedd5'
                              : '#f3f4f6',
                        color:
                          r.priority === 'CRITICAL'
                            ? '#b91c1c'
                            : r.priority === 'HIGH'
                              ? '#c2410c'
                              : '#374151',
                      }}
                    >
                      {r.priority}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {r.blocksOperation ? (
                      <span
                        style={{ color: '#dc2626', fontWeight: 600, fontSize: '0.875rem' }}
                        data-testid={`badge-blocking-${r.displayId}`}
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
                          r.status === 'OPEN'
                            ? '#eff6ff'
                            : r.status === 'CONVERTED'
                              ? '#dcfce7'
                              : '#f3f4f6',
                        color:
                          r.status === 'OPEN'
                            ? '#1d4ed8'
                            : r.status === 'CONVERTED'
                              ? '#15803d'
                              : '#6b7280',
                      }}
                      data-testid={`badge-status-${r.displayId}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                    {r.sourceInspectionId ? (
                      <Link
                        href={`/inspections/${r.sourceInspectionId}`}
                        style={{ color: '#2563eb', textDecoration: 'none' }}
                      >
                        {r.sourceInspectionDisplayId ?? 'Inspection'}
                      </Link>
                    ) : (
                      r.sourceType
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    <Link
                      href={`/maintenance/requests/${r.id}`}
                      style={{
                        padding: '0.3rem 0.75rem',
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        borderRadius: '4px',
                        textDecoration: 'none',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                      }}
                      data-testid={`btn-view-${r.displayId}`}
                    >
                      View Details
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
