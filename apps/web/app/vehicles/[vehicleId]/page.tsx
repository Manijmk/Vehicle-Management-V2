'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import {
  ApiClientError,
  assignmentApi,
  vehicleApi,
  type CurrentUserResponse,
  type FuelType,
  type VehicleDriverAssignmentRecord,
  type VehicleRecord,
  type VehicleStatusHistoryEntry,
  type VehicleType,
} from '../../../lib/api-client';

export default function VehicleDetailPage() {
  const params = useParams();
  const vehicleId = params['vehicleId'] as string;

  const [vehicle, setVehicle] = useState<VehicleRecord | null>(null);
  const [history, setHistory] = useState<VehicleStatusHistoryEntry[]>([]);
  const [currentAssignment, setCurrentAssignment] = useState<VehicleDriverAssignmentRecord | null>(null);
  const [assignmentHistory, setAssignmentHistory] = useState<VehicleDriverAssignmentRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit metadata state
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    model: '',
    year: 0,
    type: 'VAN' as VehicleType,
    fuelType: 'DIESEL' as FuelType,
    odometerKm: 0,
    notes: '',
  });

  // Retirement modal state
  const [isRetiring, setIsRetiring] = useState(false);
  const [retireReason, setRetireReason] = useState('');
  const [retireError, setRetireError] = useState<string | null>(null);

  // Action status / optimistic concurrency conflict
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!vehicleId) return;
    try {
      setLoading(true);
      setError(null);
      setConflictMessage(null);
      const [v, h, u, curAsn, asnH] = await Promise.all([
        vehicleApi.fetchVehicle(vehicleId),
        vehicleApi.fetchStatusHistory(vehicleId),
        vehicleApi.fetchCurrentUser().catch(() => null),
        assignmentApi.fetchVehicleCurrentAssignment(vehicleId).catch(() => null),
        assignmentApi.fetchVehicleAssignmentHistory(vehicleId).catch(() => []),
      ]);
      setVehicle(v);
      setHistory(h);
      setCurrentUser(u);
      setCurrentAssignment(curAsn);
      setAssignmentHistory(asnH);
      setEditData({
        model: v.model,
        year: v.year,
        type: v.type,
        fuelType: v.fuelType,
        odometerKm: v.odometerKm,
        notes: v.notes ?? '',
      });
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) {
        setError('Vehicle was not found in this organization.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load vehicle');
      }
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Permissions
  const permissions = currentUser?.permissions ?? [];
  const canUpdate = permissions.includes('vehicle.update');
  const canActivate = permissions.includes('vehicle.activate');
  const canRetire = permissions.includes('vehicle.retire');

  // Activate handler
  const handleActivate = async () => {
    if (!vehicle) return;
    try {
      setActionLoading('activating');
      setConflictMessage(null);
      await vehicleApi.activateVehicle(vehicle.id, vehicle.version);
      await loadData();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'CONCURRENCY_CONFLICT') {
        setConflictMessage(
          'Concurrency Conflict: Vehicle was modified by another request. Please reload.',
        );
      } else if (err instanceof ApiClientError && err.code === 'INVALID_VEHICLE_TRANSITION') {
        setConflictMessage(err.message);
      } else {
        setConflictMessage(err instanceof Error ? err.message : 'Activation failed');
      }
    } finally {
      setActionLoading(null);
    }
  };

  // Retire handler
  const handleRetire = async () => {
    if (!vehicle) return;
    if (currentAssignment) {
      setRetireError('Cannot retire vehicle: it currently has an active driver assignment.');
      return;
    }
    const reason = retireReason.trim();
    if (!reason) {
      setRetireError('Retirement reason is required');
      return;
    }

    try {
      setActionLoading('retiring');
      setRetireError(null);
      setConflictMessage(null);
      await vehicleApi.retireVehicle(vehicle.id, reason, vehicle.version);
      setIsRetiring(false);
      setRetireReason('');
      await loadData();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'VEHICLE_HAS_ACTIVE_ASSIGNMENT') {
        setRetireError('Cannot retire vehicle: it currently has an active driver assignment.');
      } else if (err instanceof ApiClientError && err.code === 'CONCURRENCY_CONFLICT') {
        setConflictMessage(
          'Concurrency Conflict: Vehicle was modified by another request. Please reload.',
        );
        setIsRetiring(false);
      } else if (err instanceof ApiClientError && err.code === 'INVALID_VEHICLE_TRANSITION') {
        setRetireError(err.message);
      } else {
        setRetireError(err instanceof Error ? err.message : 'Retirement failed');
      }
    } finally {
      setActionLoading(null);
    }
  };

  // Save metadata edit handler
  const handleSaveEdit = async () => {
    if (!vehicle) return;
    try {
      setActionLoading('saving');
      setConflictMessage(null);
      await vehicleApi.updateVehicle(vehicle.id, {
        model: editData.model.trim(),
        year: Number(editData.year),
        type: editData.type,
        fuelType: editData.fuelType,
        odometerKm: Number(editData.odometerKm),
        notes: editData.notes.trim() || undefined,
        version: vehicle.version,
      });
      setIsEditing(false);
      await loadData();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'CONCURRENCY_CONFLICT') {
        setConflictMessage(
          'Concurrency Conflict: Vehicle was modified by another request. Please reload.',
        );
      } else {
        setConflictMessage(err instanceof Error ? err.message : 'Update failed');
      }
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <main className="vehicle-page narrow">
        <TenantHeader />
        <div className="panel empty-state" data-testid="detail-loading">
          <h2>Loading vehicle details...</h2>
          <p>Connecting to fleet operations service</p>
        </div>
      </main>
    );
  }

  if (error || !vehicle) {
    return (
      <main className="vehicle-page narrow">
        <TenantHeader />
        <div className="panel empty-state" data-testid="detail-error">
          <h2>Vehicle Not Found</h2>
          <p>{error ?? 'The requested vehicle record is not available.'}</p>
          <Link href="/vehicles" className="primary-action">
            Back to vehicles
          </Link>
        </div>
      </main>
    );
  }

  const isDraft = vehicle.status === 'DRAFT';
  const isRetired = vehicle.status === 'RETIRED';

  return (
    <main className="vehicle-page narrow">
      <TenantHeader onAuthChange={() => void loadData()} />

      <div className="page-header compact">
        <div>
          <p className="eyebrow">Fleet operations</p>
          <h1 data-testid="vehicle-display-id-heading">{vehicle.displayId}</h1>
        </div>
        <div className="action-row">
          <Link href="/vehicles" className="secondary-action">
            Back to list
          </Link>

          {!isRetired && canUpdate ? (
            <button
              type="button"
              className="secondary-action"
              data-testid="edit-vehicle-btn"
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing ? 'Cancel Edit' : 'Edit vehicle'}
            </button>
          ) : null}

          {isDraft && canActivate ? (
            <button
              type="button"
              className="primary-action"
              data-testid="activate-vehicle-btn"
              disabled={Boolean(actionLoading)}
              onClick={() => void handleActivate()}
            >
              {actionLoading === 'activating' ? 'Activating...' : 'Activate'}
            </button>
          ) : null}

          {!isRetired && canRetire ? (
            <button
              type="button"
              className="secondary-action warning"
              data-testid="retire-vehicle-btn"
              disabled={Boolean(actionLoading) || Boolean(currentAssignment)}
              title={
                currentAssignment
                  ? 'Cannot retire vehicle while actively assigned to a driver'
                  : undefined
              }
              onClick={() => setIsRetiring(true)}
            >
              Retire
            </button>
          ) : null}
        </div>
      </div>

      {conflictMessage ? (
        <section
          className="panel empty-state conflict-banner"
          role="alert"
          data-testid="conflict-banner"
        >
          <h2>Version Conflict</h2>
          <p>{conflictMessage}</p>
          <button
            type="button"
            className="primary-action"
            data-testid="reload-vehicle-btn"
            onClick={() => void loadData()}
          >
            Reload latest data
          </button>
        </section>
      ) : null}

      {isRetired ? (
        <div className="terminal-notice" data-testid="terminal-status-notice">
          <strong>Terminal Status:</strong> This vehicle is retired. No further lifecycle
          transitions or metadata edits are permitted.
        </div>
      ) : null}

      {isEditing ? (
        <section className="panel" data-testid="edit-form-panel">
          <h2>Edit Vehicle Metadata</h2>
          <div className="vehicle-form">
            <label>
              Model
              <input
                value={editData.model}
                onChange={(e) => setEditData({ ...editData, model: e.target.value })}
                data-testid="edit-input-model"
              />
            </label>
            <label>
              Year
              <input
                type="number"
                value={editData.year}
                onChange={(e) => setEditData({ ...editData, year: Number(e.target.value) })}
                data-testid="edit-input-year"
              />
            </label>
            <label>
              Type
              <select
                value={editData.type}
                onChange={(e) => setEditData({ ...editData, type: e.target.value as VehicleType })}
                data-testid="edit-select-type"
              >
                <option value="CAR">Car</option>
                <option value="VAN">Van</option>
                <option value="TRUCK">Truck</option>
                <option value="BUS">Bus</option>
                <option value="MOTORCYCLE">Motorcycle</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label>
              Fuel type
              <select
                value={editData.fuelType}
                onChange={(e) => setEditData({ ...editData, fuelType: e.target.value as FuelType })}
                data-testid="edit-select-fuel-type"
              >
                <option value="PETROL">Petrol</option>
                <option value="DIESEL">Diesel</option>
                <option value="HYBRID">Hybrid</option>
                <option value="ELECTRIC">Electric</option>
                <option value="GAS">Gas</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label>
              Odometer (km)
              <input
                type="number"
                value={editData.odometerKm}
                onChange={(e) => setEditData({ ...editData, odometerKm: Number(e.target.value) })}
                data-testid="edit-input-odometer"
              />
            </label>
            <label>
              Notes
              <textarea
                value={editData.notes}
                onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                data-testid="edit-input-notes"
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="primary-action"
                disabled={Boolean(actionLoading)}
                data-testid="save-edit-btn"
                onClick={() => void handleSaveEdit()}
              >
                {actionLoading === 'saving' ? 'Saving...' : 'Save changes'}
              </button>
              <button
                type="button"
                className="secondary-action"
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {isRetiring ? (
        <section className="panel retire-modal" data-testid="retire-modal">
          <h2>Confirm Vehicle Retirement</h2>
          <p className="warning-text">
            Retirement is permanent and cannot be undone. Once retired, this vehicle cannot be
            reactivated or edited.
          </p>
          {retireError ? (
            <p className="error-text" data-testid="retire-error">
              {retireError}
            </p>
          ) : null}
          <label>
            Reason for retirement
            <textarea
              value={retireReason}
              onChange={(e) => setRetireReason(e.target.value)}
              placeholder="Provide a mandatory decommissioning or retirement justification"
              required
              data-testid="retire-reason-input"
            />
          </label>
          <div className="form-actions">
            <button
              type="button"
              className="secondary-action warning"
              disabled={Boolean(actionLoading)}
              data-testid="confirm-retire-btn"
              onClick={() => void handleRetire()}
            >
              {actionLoading === 'retiring' ? 'Retiring...' : 'Confirm retirement'}
            </button>
            <button
              type="button"
              className="secondary-action"
              onClick={() => {
                setIsRetiring(false);
                setRetireReason('');
                setRetireError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      <section className="panel detail-grid">
        <div>
          <h2>Overview</h2>
          <dl>
            <div>
              <dt>Registration</dt>
              <dd data-testid="detail-registration">{vehicle.registration}</dd>
            </div>
            <div>
              <dt>VIN</dt>
              <dd data-testid="detail-vin">{vehicle.vin}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd data-testid="detail-model">{vehicle.model}</dd>
            </div>
            <div>
              <dt>Year</dt>
              <dd data-testid="detail-year">{vehicle.year}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd data-testid="detail-type">{vehicle.type}</dd>
            </div>
            <div>
              <dt>Fuel</dt>
              <dd data-testid="detail-fuel">{vehicle.fuelType}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <span
                  className={`status-pill status-${vehicle.status.toLowerCase()}`}
                  data-testid="detail-status"
                >
                  {vehicle.status}
                </span>
              </dd>
            </div>
            <div>
              <dt>Odometer</dt>
              <dd data-testid="detail-odometer">{vehicle.odometerKm.toLocaleString()} km</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd data-testid="detail-version">{vehicle.version}</dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd data-testid="detail-notes">{vehicle.notes ?? '—'}</dd>
            </div>
          </dl>
        </div>

        <div>
          <h2>Status history</h2>
          {history.length === 0 ? (
            <p>No history records recorded.</p>
          ) : (
            <ul className="history-list" data-testid="status-history-list">
              {history.map((entry) => (
                <li key={entry.id} data-testid={`history-entry-${entry.id}`}>
                  <strong>
                    {entry.previousStatus ? `${entry.previousStatus} → ` : ''}
                    {entry.newStatus}
                  </strong>
                  <span className="history-reason">{entry.reason}</span>
                  <span className="history-meta">
                    {new Date(entry.createdAt).toLocaleString()} • Actor{' '}
                    {entry.changedBy.slice(0, 8)}...
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section
        className="panel"
        style={{ marginTop: '1.5rem' }}
        data-testid="vehicle-current-assignment-section"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Current Driver Assignment</h2>
          {!currentAssignment &&
          vehicle.status === 'ACTIVE' &&
          permissions.includes('assignment.create') ? (
            <Link
              href="/assignments/new"
              className="primary-action compact-btn"
              data-testid="assign-driver-link"
            >
              Assign driver
            </Link>
          ) : null}
        </div>
        {currentAssignment && currentAssignment.driver ? (
          <div style={{ marginTop: '1rem' }} data-testid="current-assignment-details">
            <dl>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '160px 1fr',
                  gap: '0.6rem',
                  paddingBottom: '0.5rem',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <dt style={{ color: 'var(--muted)', fontWeight: 700 }}>Assigned Driver</dt>
                <dd style={{ margin: 0 }}>
                  <Link href={`/drivers/${currentAssignment.driver.id}`} className="table-link">
                    <strong data-testid="assigned-driver-name">
                      {currentAssignment.driver.firstName} {currentAssignment.driver.lastName}
                    </strong>
                  </Link>{' '}
                  ({currentAssignment.driver.displayId})
                </dd>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '160px 1fr',
                  gap: '0.6rem',
                  paddingBottom: '0.5rem',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <dt style={{ color: 'var(--muted)', fontWeight: 700 }}>Driver Eligibility</dt>
                <dd style={{ margin: 0 }}>
                  {currentAssignment.driver.eligible ??
                  currentAssignment.driver.isOperationallyEligible ??
                  currentAssignment.driver.status === 'ACTIVE' ? (
                    <span
                      className="status-pill status-eligible"
                      data-testid="assigned-driver-eligibility"
                    >
                      Eligible
                    </span>
                  ) : (
                    <span
                      className="warning-badge"
                      title="Driver is not operationally eligible"
                      data-testid="assigned-driver-ineligible"
                    >
                      ⚠️ Ineligible Driver
                    </span>
                  )}
                </dd>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '160px 1fr',
                  gap: '0.6rem',
                  paddingBottom: '0.5rem',
                }}
              >
                <dt style={{ color: 'var(--muted)', fontWeight: 700 }}>Active Assignment</dt>
                <dd style={{ margin: 0 }}>
                  <Link
                    href={`/assignments/${currentAssignment.id}`}
                    className="table-link"
                    data-testid="active-assignment-link"
                  >
                    <strong>View Assignment ({currentAssignment.id.slice(0, 8)})</strong>
                  </Link>{' '}
                  (Started {new Date(currentAssignment.startedAt).toLocaleDateString()})
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <p
            style={{ marginTop: '0.75rem', color: 'var(--muted)' }}
            data-testid="no-active-assignment-msg"
          >
            No driver is currently assigned to this vehicle.
          </p>
        )}
      </section>

      <section
        className="panel"
        style={{ marginTop: '1.5rem' }}
        data-testid="vehicle-assignment-history-section"
      >
        <h2>Assignment History</h2>
        {assignmentHistory.length === 0 ? (
          <p style={{ marginTop: '0.75rem', color: 'var(--muted)' }}>
            No historical assignments recorded for this vehicle.
          </p>
        ) : (
          <ul
            className="history-list"
            style={{ marginTop: '1rem' }}
            data-testid="assignment-history-list"
          >
            {assignmentHistory.map((item) => (
              <li key={item.id} data-testid={`assignment-history-item-${item.id}`}>
                <strong>
                  <Link href={`/assignments/${item.id}`} className="table-link">
                    Assignment {item.id.slice(0, 8)}
                  </Link>{' '}
                  —{' '}
                  {item.driver
                    ? `${item.driver.firstName} ${item.driver.lastName}`
                    : 'Unknown Driver'}{' '}
                  ({item.status})
                </strong>
                <span className="history-meta">
                  {new Date(item.startedAt).toLocaleDateString()}
                  {item.endedAt
                    ? ` – ${new Date(item.endedAt).toLocaleDateString()}`
                    : ' (ongoing)'}
                  {item.endReason ? ` • Reason: ${item.endReason}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
