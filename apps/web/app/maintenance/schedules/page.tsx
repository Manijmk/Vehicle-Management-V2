'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import {
  maintenanceApi,
  vehicleApi,
  type CurrentUserResponse,
  type ScheduleDueState,
  type VehicleMaintenanceScheduleRecord,
} from '../../../lib/api-client';

export default function MaintenanceSchedulesPage() {
  const router = useRouter();
  const [schedules, setSchedules] = useState<VehicleMaintenanceScheduleRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dueStateFilter, setDueStateFilter] = useState<'ALL' | ScheduleDueState>('ALL');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [res, user] = await Promise.all([
        maintenanceApi.fetchSchedules({
          dueState: dueStateFilter !== 'ALL' ? dueStateFilter : undefined,
          limit: 100,
        }),
        vehicleApi.fetchCurrentUser().catch(() => null),
      ]);
      setSchedules(res.items);
      setCurrentUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  }, [dueStateFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const canManageWorkOrder = Boolean(
    currentUser?.permissions.includes('maintenance.work-order.manage'),
  );

  const handleCreateWorkOrder = async (schedule: VehicleMaintenanceScheduleRecord) => {
    try {
      setActionId(schedule.id);
      setError(null);
      const wo = await maintenanceApi.createWorkOrderFromSchedule(schedule.id, schedule.version);
      router.push(`/maintenance/work-orders/${wo.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate work order from schedule');
      setActionId(null);
    }
  };

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
            Vehicle Maintenance Schedules
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280' }}>
            Track recurring service intervals and due states across your fleet.
          </p>
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
            Due State
          </label>
          <select
            value={dueStateFilter}
            onChange={(e) => setDueStateFilter(e.target.value as 'ALL' | ScheduleDueState)}
            style={{ padding: '0.4rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
            data-testid="filter-schedule-due-state"
          >
            <option value="ALL">All Due States</option>
            <option value="UPCOMING">Upcoming</option>
            <option value="DUE">Due Now</option>
            <option value="OVERDUE">Overdue</option>
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
            Loading schedules...
          </div>
        ) : schedules.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            No maintenance schedules found.
          </div>
        ) : (
          <table
            style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}
            data-testid="table-schedules"
          >
            <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th
                  style={{
                    padding: '0.75rem 1rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#4b5563',
                  }}
                >
                  VEHICLE
                </th>
                <th
                  style={{
                    padding: '0.75rem 1rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#4b5563',
                  }}
                >
                  PLAN
                </th>
                <th
                  style={{
                    padding: '0.75rem 1rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#4b5563',
                  }}
                >
                  DUE STATE
                </th>
                <th
                  style={{
                    padding: '0.75rem 1rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#4b5563',
                  }}
                >
                  NEXT DUE DATE
                </th>
                <th
                  style={{
                    padding: '0.75rem 1rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#4b5563',
                  }}
                >
                  NEXT DUE KM
                </th>
                <th
                  style={{
                    padding: '0.75rem 1rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#4b5563',
                  }}
                >
                  LAST PERFORMED
                </th>
                <th
                  style={{
                    padding: '0.75rem 1rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#4b5563',
                    textAlign: 'right',
                  }}
                >
                  ACTIONS
                </th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <Link
                      href={`/vehicles/${s.vehicleId}`}
                      style={{ fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}
                    >
                      {s.vehicleDisplayId || s.vehicleRegistration || s.vehicleId}
                    </Link>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <Link
                      href={`/maintenance/plans/${s.maintenancePlanId}`}
                      style={{ color: '#374151', textDecoration: 'none', fontWeight: 500 }}
                    >
                      {s.planName || 'Maintenance Plan'}
                    </Link>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background:
                          s.dueState === 'OVERDUE'
                            ? '#fee2e2'
                            : s.dueState === 'DUE'
                              ? '#fef3c7'
                              : '#ecfdf5',
                        color:
                          s.dueState === 'OVERDUE'
                            ? '#b91c1c'
                            : s.dueState === 'DUE'
                              ? '#b45309'
                              : '#047857',
                      }}
                      data-testid={`badge-due-state-${s.id}`}
                    >
                      {s.dueState}
                    </span>
                  </td>
                  <td
                    style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}
                    data-testid={`cell-next-due-date-${s.id}`}
                  >
                    {s.nextDueAt ? new Date(s.nextDueAt).toLocaleDateString() : 'N/A'}
                  </td>
                  <td
                    style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}
                    data-testid={`cell-next-due-km-${s.id}`}
                  >
                    {s.nextDueOdometerKm ? `${s.nextDueOdometerKm.toLocaleString()} km` : 'N/A'}
                  </td>
                  <td
                    style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#6b7280' }}
                    data-testid={`cell-last-performed-${s.id}`}
                  >
                    {s.lastCompletedAt ? new Date(s.lastCompletedAt).toLocaleDateString() : 'Never'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    {canManageWorkOrder && (
                      <button
                        type="button"
                        disabled={actionId === s.id || Boolean(s.activeWorkOrderId)}
                        onClick={() => handleCreateWorkOrder(s)}
                        style={{
                          padding: '0.35rem 0.75rem',
                          background: s.activeWorkOrderId ? '#9ca3af' : '#2563eb',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: s.activeWorkOrderId ? 'not-allowed' : 'pointer',
                        }}
                        data-testid={`btn-create-wo-from-sched-${s.id}`}
                      >
                        {actionId === s.id
                          ? 'Generating...'
                          : s.activeWorkOrderId
                            ? 'Active WO in Progress'
                            : 'Create Work Order'}
                      </button>
                    )}
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
