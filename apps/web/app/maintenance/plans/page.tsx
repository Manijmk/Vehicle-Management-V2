'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import {
  maintenanceApi,
  vehicleApi,
  type CurrentUserResponse,
  type MaintenancePlanRecord,
  type MaintenancePlanStatus,
} from '../../../lib/api-client';

export default function MaintenancePlansPage() {
  const [plans, setPlans] = useState<MaintenancePlanRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | MaintenancePlanStatus>('ALL');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [res, user] = await Promise.all([
        maintenanceApi.fetchPlans({
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          limit: 100,
        }),
        vehicleApi.fetchCurrentUser().catch(() => null),
      ]);
      setPlans(res.items);
      setCurrentUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const canManage = Boolean(currentUser?.permissions.includes('maintenance.plan.manage'));

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
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
            Preventive Maintenance Plans
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280' }}>
            Pre-configured interval triggers for periodic services (mileage & calendar schedules)
          </p>
        </div>
        {canManage && (
          <Link
            href="/maintenance/plans/new"
            style={{
              padding: '0.5rem 1rem',
              background: '#2563eb',
              border: '1px solid #1d4ed8',
              borderRadius: '6px',
              textDecoration: 'none',
              color: '#fff',
              fontWeight: 500,
            }}
            data-testid="btn-create-plan"
          >
            + New Preventive Plan
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

      {/* Filter */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1.5rem',
          display: 'flex',
          gap: '1rem',
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
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | MaintenancePlanStatus)}
            style={{ padding: '0.4rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
            data-testid="filter-plan-status"
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Active (Assignable)</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
      </div>

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
            Loading plans...
          </div>
        ) : plans.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            No preventive plans found.
          </div>
        ) : (
          <table
            style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}
            data-testid="table-plans"
          >
            <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Display ID</th>
                <th style={{ padding: '0.75rem 1rem' }}>Plan Name</th>
                <th style={{ padding: '0.75rem 1rem' }}>Calendar Interval</th>
                <th style={{ padding: '0.75rem 1rem' }}>Odometer Interval</th>
                <th style={{ padding: '0.75rem 1rem' }}>Default Priority</th>
                <th style={{ padding: '0.75rem 1rem' }}>Blocks Ops When Due?</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr
                  key={p.id}
                  style={{ borderBottom: '1px solid #f3f4f6' }}
                  data-testid={`plan-row-${p.displayId}`}
                >
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{p.displayId}</td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>{p.name}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {p.intervalDays ? `${p.intervalDays} days` : '—'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {p.intervalOdometerKm ? `${p.intervalOdometerKm} km` : '—'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>{p.defaultPriority}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {p.blocksOperationWhenDue ? (
                      <span style={{ color: '#dc2626', fontWeight: 600, fontSize: '0.875rem' }}>
                        YES
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
                          p.status === 'ACTIVE'
                            ? '#dcfce7'
                            : p.status === 'DRAFT'
                              ? '#fef3c7'
                              : '#f3f4f6',
                        color:
                          p.status === 'ACTIVE'
                            ? '#15803d'
                            : p.status === 'DRAFT'
                              ? '#b45309'
                              : '#6b7280',
                      }}
                      data-testid={`badge-status-${p.displayId}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    <Link
                      href={`/maintenance/plans/${p.id}`}
                      style={{
                        padding: '0.3rem 0.75rem',
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        borderRadius: '4px',
                        textDecoration: 'none',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                      }}
                      data-testid={`btn-view-${p.displayId}`}
                    >
                      View Plan &rarr;
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
