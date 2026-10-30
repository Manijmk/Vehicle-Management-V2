'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../../../components/tenant-header';
import {
  maintenanceApi,
  vehicleApi,
  type CurrentUserResponse,
  type MaintenancePlanRecord,
  type VehicleMaintenanceScheduleRecord,
  type VehicleRecord,
} from '../../../../lib/api-client';

export default function MaintenancePlanDetailPage() {
  const params = useParams<{ planId: string }>();
  const planId = params.planId;

  const [plan, setPlan] = useState<MaintenancePlanRecord | null>(null);
  const [schedules, setSchedules] = useState<VehicleMaintenanceScheduleRecord[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Assign vehicle modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [planRes, schedRes, user, vehRes] = await Promise.all([
        maintenanceApi.fetchPlan(planId),
        maintenanceApi
          .fetchSchedules({ maintenancePlanId: planId, limit: 100 })
          .catch(() => ({ items: [] })),
        vehicleApi.fetchCurrentUser().catch(() => null),
        vehicleApi.fetchVehicles().catch(() => []),
      ]);
      setPlan(planRes);
      setSchedules(schedRes.items);
      setCurrentUser(user);
      setVehicles(vehRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plan');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const canManage = Boolean(currentUser?.permissions.includes('maintenance.plan.manage'));

  const handleActivate = async () => {
    if (!plan) return;
    try {
      setActionLoading(true);
      setError(null);
      const updated = await maintenanceApi.activatePlan(plan.id, plan.version);
      setPlan(updated);
      setSuccess('Plan activated successfully. Vehicles can now be assigned.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate plan');
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchive = async () => {
    if (!plan) return;
    try {
      setActionLoading(true);
      setError(null);
      const updated = await maintenanceApi.archivePlan(plan.id, plan.version);
      setPlan(updated);
      setSuccess('Plan archived. No new schedules can be assigned.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive plan');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicleId || !plan) return;
    try {
      setActionLoading(true);
      setError(null);
      await maintenanceApi.createVehicleSchedule(selectedVehicleId, {
        maintenancePlanId: plan.id,
      });
      setShowAssignModal(false);
      setSelectedVehicleId('');
      setSuccess('Vehicle assigned to plan successfully.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign vehicle');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
        <TenantHeader />
        <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
          Loading plan details...
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
        <TenantHeader />
        <div style={{ padding: '3rem', textAlign: 'center', color: '#b91c1c' }}>
          Plan not found or error loading plan.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      <TenantHeader onAuthChange={loadData} />

      <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <Link
          href="/maintenance/plans"
          style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.875rem' }}
        >
          &larr; Back to Preventive Plans
        </Link>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginTop: '0.5rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 600 }}>{plan.name}</h1>
              <span style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 }}>
                ({plan.displayId})
              </span>
              <span
                style={{
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  background:
                    plan.status === 'ACTIVE'
                      ? '#d1fae5'
                      : plan.status === 'ARCHIVED'
                        ? '#f3f4f6'
                        : '#fef3c7',
                  color:
                    plan.status === 'ACTIVE'
                      ? '#065f46'
                      : plan.status === 'ARCHIVED'
                        ? '#4b5563'
                        : '#92400e',
                }}
                data-testid="badge-plan-status"
              >
                {plan.status}
              </span>
            </div>
            <p style={{ margin: '0.25rem 0 0 0', color: '#4b5563' }}>
              {plan.description || 'No description provided.'}
            </p>
          </div>

          {canManage && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {plan.status === 'DRAFT' && (
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleActivate}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#059669',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  data-testid="btn-activate-plan"
                >
                  Activate Plan
                </button>
              )}
              {plan.status === 'ACTIVE' && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowAssignModal(true)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#2563eb',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    data-testid="btn-open-assign-modal"
                  >
                    + Assign Vehicle
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleArchive}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#4b5563',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    data-testid="btn-archive-plan"
                  >
                    Archive Plan
                  </button>
                </>
              )}
            </div>
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

      {success && (
        <div
          style={{
            background: '#d1fae5',
            border: '1px solid #10b981',
            color: '#065f46',
            padding: '1rem',
            borderRadius: '6px',
            marginBottom: '1.5rem',
          }}
        >
          {success}
        </div>
      )}

      {/* Plan Settings Card */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1.5rem',
          marginBottom: '1.5rem',
        }}
      >
        <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.125rem', fontWeight: 600 }}>
          Interval Triggers & Policy
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }}>
          <div>
            <div
              style={{
                fontSize: '0.75rem',
                color: '#6b7280',
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              Calendar Interval
            </div>
            <div style={{ fontSize: '1.125rem', fontWeight: 600, marginTop: '0.25rem' }}>
              {plan.intervalDays ? `${plan.intervalDays} days` : 'None'}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: '0.75rem',
                color: '#6b7280',
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              Odometer Interval
            </div>
            <div style={{ fontSize: '1.125rem', fontWeight: 600, marginTop: '0.25rem' }}>
              {plan.intervalOdometerKm ? `${plan.intervalOdometerKm.toLocaleString()} km` : 'None'}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: '0.75rem',
                color: '#6b7280',
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              Default Priority
            </div>
            <div style={{ fontSize: '1.125rem', fontWeight: 600, marginTop: '0.25rem' }}>
              {plan.defaultPriority}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: '0.75rem',
                color: '#6b7280',
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              Blocks When Due
            </div>
            <div
              style={{
                fontSize: '1.125rem',
                fontWeight: 600,
                marginTop: '0.25rem',
                color: plan.blocksOperationWhenDue ? '#dc2626' : '#4b5563',
              }}
            >
              {plan.blocksOperationWhenDue ? 'YES (Operational Block)' : 'No'}
            </div>
          </div>
        </div>
      </div>

      {/* Assigned Vehicles Schedules */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>
            Assigned Vehicle Schedules ({schedules.length})
          </h2>
        </div>

        {schedules.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            No vehicles currently assigned to this plan.
          </div>
        ) : (
          <table
            style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}
            data-testid="table-plan-schedules"
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
                    data-testid={`cell-plan-sched-due-date-${s.id}`}
                  >
                    {s.nextDueAt ? new Date(s.nextDueAt).toLocaleDateString() : 'N/A'}
                  </td>
                  <td
                    style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}
                    data-testid={`cell-plan-sched-due-km-${s.id}`}
                  >
                    {s.nextDueOdometerKm ? `${s.nextDueOdometerKm.toLocaleString()} km` : 'N/A'}
                  </td>
                  <td
                    style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#6b7280' }}
                    data-testid={`cell-plan-sched-last-performed-${s.id}`}
                  >
                    {s.lastCompletedAt ? new Date(s.lastCompletedAt).toLocaleDateString() : 'Never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Assign Vehicle Modal */}
      {showAssignModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '480px',
            }}
          >
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: 600 }}>
              Assign Vehicle to {plan.name}
            </h3>
            <form onSubmit={handleAssignVehicle}>
              <div style={{ marginBottom: '1rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    marginBottom: '0.25rem',
                  }}
                >
                  Select Vehicle *
                </label>
                <select
                  required
                  value={selectedVehicleId}
                  onChange={(e) => setSelectedVehicleId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                  }}
                  data-testid="select-assign-vehicle"
                >
                  <option value="">-- Choose a vehicle --</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.displayId} — {v.model} ({v.vin})
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    background: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !selectedVehicleId}
                  style={{
                    padding: '0.5rem 1.25rem',
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  data-testid="btn-submit-assign-vehicle"
                >
                  {actionLoading ? 'Assigning...' : 'Assign Vehicle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
