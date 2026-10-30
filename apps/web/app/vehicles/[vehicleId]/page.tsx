'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import {
  api,
  ApiClientError,
  assignmentApi,
  complianceApi,
  financeApi,
  maintenanceApi,
  tripApi,
  vehicleApi,
  type ComplianceDocumentTypeRecord,
  type CurrentUserResponse,
  type FuelType,
  type InspectionRecord,
  type MaintenancePlanRecord,
  type SubjectComplianceResponse,
  type TripRecord,
  type VehicleDriverAssignmentRecord,
  type VehicleFinanceSummaryResponse,
  type VehicleMaintenanceScheduleRecord,
  type VehicleMaintenanceSummary,
  type VehicleRecord,
  type VehicleStatusHistoryEntry,
  type VehicleType,
} from '../../../lib/api-client';

export default function VehicleDetailPage() {
  const params = useParams();
  const vehicleId = params['vehicleId'] as string;

  const [vehicle, setVehicle] = useState<VehicleRecord | null>(null);
  const [history, setHistory] = useState<VehicleStatusHistoryEntry[]>([]);
  const [currentAssignment, setCurrentAssignment] = useState<VehicleDriverAssignmentRecord | null>(
    null,
  );
  const [assignmentHistory, setAssignmentHistory] = useState<VehicleDriverAssignmentRecord[]>([]);
  const [currentTrip, setCurrentTrip] = useState<TripRecord | null>(null);
  const [tripHistory, setTripHistory] = useState<TripRecord[]>([]);
  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
  const [vehicleFinance, setVehicleFinance] = useState<VehicleFinanceSummaryResponse | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Maintenance state
  const [maintenanceSummary, setMaintenanceSummary] = useState<VehicleMaintenanceSummary | null>(
    null,
  );
  const [maintenanceSchedules, setMaintenanceSchedules] = useState<
    VehicleMaintenanceScheduleRecord[]
  >([]);
  const [activePlans, setActivePlans] = useState<MaintenancePlanRecord[]>([]);
  const [showAssignPlanModal, setShowAssignPlanModal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [maintenanceActionLoading, setMaintenanceActionLoading] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);

  // Compliance state
  const [complianceData, setComplianceData] = useState<SubjectComplianceResponse | null>(null);
  const [vehicleDocTypes, setVehicleDocTypes] = useState<ComplianceDocumentTypeRecord[]>([]);
  const [showUploadDocModal, setShowUploadDocModal] = useState(false);
  const [uploadDocTypeId, setUploadDocTypeId] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDocNumber, setUploadDocNumber] = useState('');
  const [uploadIssuer, setUploadIssuer] = useState('');
  const [uploadIssuedOn, setUploadIssuedOn] = useState('');
  const [uploadExpiresOn, setUploadExpiresOn] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadSubmitting, setUploadSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
      const [
        v,
        h,
        u,
        curAsn,
        asnH,
        curTrip,
        tripH,
        inspRes,
        mSummary,
        mSchedules,
        plansRes,
        compRes,
        docTypesRes,
        finRes,
      ] = await Promise.all([
        vehicleApi.fetchVehicle(vehicleId),
        vehicleApi.fetchStatusHistory(vehicleId),
        vehicleApi.fetchCurrentUser().catch(() => null),
        assignmentApi.fetchVehicleCurrentAssignment(vehicleId).catch(() => null),
        assignmentApi.fetchVehicleAssignmentHistory(vehicleId).catch(() => []),
        tripApi.fetchVehicleCurrentTrip(vehicleId).catch(() => null),
        tripApi
          .fetchVehicleTripHistory(vehicleId, 20)
          .then((res) => res.items)
          .catch(() => []),
        api
          .fetchVehicleInspections(vehicleId, 20)
          .then((res) => res.items)
          .catch(() => []),
        maintenanceApi.fetchVehicleMaintenance(vehicleId).catch(() => null),
        maintenanceApi.fetchVehicleSchedules(vehicleId).catch(() => ({ items: [], total: 0 })),
        maintenanceApi.fetchPlans({ status: 'ACTIVE', limit: 100 }).catch(() => ({ items: [] })),
        complianceApi.fetchVehicleCompliance(vehicleId).catch(() => null),
        complianceApi
          .fetchDocumentTypes({ subjectType: 'VEHICLE', status: 'ACTIVE' })
          .catch(() => ({ items: [], total: 0 })),
        financeApi.fetchVehicleFinance(vehicleId).catch(() => null),
      ]);
      setVehicle(v);
      setHistory(h);
      setCurrentUser(u);
      setCurrentAssignment(curAsn);
      setAssignmentHistory(asnH);
      setCurrentTrip(curTrip);
      setTripHistory(tripH);
      setInspections(inspRes);
      setMaintenanceSummary(mSummary);
      setMaintenanceSchedules(mSchedules?.items ?? []);
      setActivePlans(plansRes.items);
      setComplianceData(compRes);
      setVehicleDocTypes(docTypesRes.items);
      setVehicleFinance(finRes);
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

  const handleRetire = async () => {
    if (!vehicle) return;
    if (currentAssignment) {
      setRetireError('Cannot retire vehicle while it has an active driver assignment.');
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
        setRetireError('Cannot retire vehicle while it has an active driver assignment.');
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

  const handleAssignPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlanId || !vehicle) return;
    try {
      setMaintenanceActionLoading(true);
      setMaintenanceError(null);
      await maintenanceApi.createVehicleSchedule(vehicle.id, {
        maintenancePlanId: selectedPlanId,
      });
      setShowAssignPlanModal(false);
      setSelectedPlanId('');
      await loadData();
    } catch (err) {
      setMaintenanceError(err instanceof Error ? err.message : 'Failed to assign plan');
    } finally {
      setMaintenanceActionLoading(false);
    }
  };

  const handleUploadComplianceDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadDocTypeId || !uploadFile) {
      setUploadError('Document type and file are required.');
      return;
    }
    try {
      setUploadSubmitting(true);
      setUploadError(null);
      const formData = new FormData();
      formData.append('documentTypeId', uploadDocTypeId);
      formData.append('file', uploadFile);
      if (uploadDocNumber) formData.append('documentNumber', uploadDocNumber);
      if (uploadIssuer) formData.append('issuingAuthority', uploadIssuer);
      if (uploadIssuedOn) formData.append('issuedOn', uploadIssuedOn);
      if (uploadExpiresOn) formData.append('expiresOn', uploadExpiresOn);
      if (uploadNotes) formData.append('notes', uploadNotes);

      await complianceApi.uploadVehicleDocument(vehicleId, formData);
      setShowUploadDocModal(false);
      setUploadDocTypeId('');
      setUploadFile(null);
      setUploadDocNumber('');
      setUploadIssuer('');
      setUploadIssuedOn('');
      setUploadExpiresOn('');
      setUploadNotes('');
      await loadData();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload compliance document');
    } finally {
      setUploadSubmitting(false);
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
              disabled={Boolean(actionLoading)}
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

      {maintenanceSummary?.isOperationallyBlocked ? (
        <section
          style={{
            background: '#fee2e2',
            border: '1px solid #ef4444',
            color: '#991b1b',
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1.5rem',
          }}
          data-testid="vehicle-maintenance-blocked-banner"
        >
          <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
            ⚠️ Vehicle Operationally Blocked by Maintenance
          </div>
          <div style={{ fontSize: '0.875rem' }}>
            This vehicle has active blocking maintenance ({maintenanceSummary.openRequests.length}{' '}
            active blocking request(s), {maintenanceSummary.activeWorkOrders.length} blocking work
            order(s)). It cannot be dispatched on trips until maintenance is completed or cancelled.
          </div>
        </section>
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
              <dt>Operational Readiness</dt>
              <dd>
                {maintenanceSummary?.isOperationallyBlocked ? (
                  <span
                    style={{
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      background: '#fee2e2',
                      color: '#b91c1c',
                    }}
                    data-testid="badge-operational-status"
                  >
                    BLOCKED (MAINTENANCE)
                  </span>
                ) : (
                  <span
                    style={{
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      background: '#d1fae5',
                      color: '#065f46',
                    }}
                    data-testid="badge-operational-status"
                  >
                    OPERATIONALLY READY
                  </span>
                )}
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
          <div style={{ marginTop: '1rem' }} data-testid="current-assignment-card">
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
                <dt style={{ color: 'var(--muted)', fontWeight: 700 }}>Assignment Status</dt>
                <dd style={{ margin: 0 }}>
                  <span
                    className={`status-pill status-${currentAssignment.status.toLowerCase()}`}
                    data-testid="assignment-status-badge"
                  >
                    {currentAssignment.status}
                  </span>
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
                  {(currentAssignment.driver.eligible ??
                  currentAssignment.driver.isOperationallyEligible ??
                  currentAssignment.driver.status === 'ACTIVE') ? (
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
            data-testid="no-active-assignment-text"
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
            data-testid="assignment-history-table"
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

      <section
        className="panel"
        style={{ marginTop: '1.5rem' }}
        data-testid="vehicle-current-trip-section"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Current In-Progress Trip</h2>
          {!currentTrip && currentAssignment && permissions.includes('trip.create') ? (
            <Link
              href={`/trips/new?assignmentId=${currentAssignment.id}`}
              className="primary-action compact-btn"
              data-testid="plan-trip-link"
            >
              Plan new trip
            </Link>
          ) : null}
        </div>
        {currentTrip ? (
          <div style={{ marginTop: '1rem' }} data-testid="current-trip-card">
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
                <dt style={{ color: 'var(--muted)', fontWeight: 700 }}>Trip ID</dt>
                <dd style={{ margin: 0 }}>
                  <Link href={`/trips/${currentTrip.id}`} className="table-link">
                    <strong data-testid="current-trip-display-id">{currentTrip.displayId}</strong>
                  </Link>
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
                <dt style={{ color: 'var(--muted)', fontWeight: 700 }}>Route</dt>
                <dd style={{ margin: 0 }} data-testid="current-trip-route">
                  <strong>{currentTrip.origin}</strong> &rarr; {currentTrip.destination}
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
                <dt style={{ color: 'var(--muted)', fontWeight: 700 }}>Status</dt>
                <dd style={{ margin: 0 }}>
                  <span className="status-pill active" data-testid="current-trip-status">
                    {currentTrip.status}
                  </span>
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
                <dt style={{ color: 'var(--muted)', fontWeight: 700 }}>Start Odometer</dt>
                <dd style={{ margin: 0 }} data-testid="current-trip-start-odo">
                  {currentTrip.startOdometerKm} km
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <p
            style={{ marginTop: '0.75rem', color: 'var(--muted)' }}
            data-testid="no-active-trip-text"
          >
            No active in-progress trip for this vehicle.
          </p>
        )}
      </section>

      <section
        className="panel"
        style={{ marginTop: '1.5rem' }}
        data-testid="vehicle-trip-history-section"
      >
        <h2>Trip History</h2>
        {tripHistory.length === 0 ? (
          <p style={{ marginTop: '0.75rem', color: 'var(--muted)' }}>
            No trips recorded for this vehicle.
          </p>
        ) : (
          <ul
            className="history-list"
            style={{ marginTop: '1rem' }}
            data-testid="trip-history-list"
          >
            {tripHistory.map((item) => (
              <li key={item.id} data-testid={`trip-history-item-${item.id}`}>
                <strong>
                  <Link href={`/trips/${item.id}`} className="table-link">
                    {item.displayId}
                  </Link>{' '}
                  &bull; {item.origin} &rarr; {item.destination} ({item.status})
                </strong>
                <span className="history-meta">
                  {item.distanceKm !== null && item.distanceKm !== undefined
                    ? `${item.distanceKm} km travelled`
                    : item.startOdometerKm !== null
                      ? `Started at ${item.startOdometerKm} km`
                      : 'Planned'}{' '}
                  &bull; {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="panel"
        style={{ marginTop: '1.5rem' }}
        data-testid="vehicle-inspection-history-section"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Inspection History</h2>
          <Link
            href={`/inspections/new?vehicleId=${vehicle.id}`}
            className="secondary-action"
            data-testid="add-vehicle-inspection-btn"
            style={{ textDecoration: 'none', fontSize: '0.875rem' }}
          >
            + New Inspection
          </Link>
        </div>
        {inspections.length === 0 ? (
          <p style={{ marginTop: '0.75rem', color: 'var(--muted)' }}>
            No inspections recorded for this vehicle.
          </p>
        ) : (
          <table
            className="data-table"
            data-testid="vehicle-inspections-table"
            style={{ marginTop: '1rem', width: '100%' }}
          >
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Type</th>
                <th scope="col">Template</th>
                <th scope="col">Status</th>
                <th scope="col">Result</th>
                <th scope="col">Date</th>
              </tr>
            </thead>
            <tbody>
              {inspections.map((item) => (
                <tr key={item.id} data-testid={`vehicle-inspection-row-${item.id}`}>
                  <td>
                    <Link href={`/inspections/${item.id}`} className="table-link">
                      {item.displayId}
                    </Link>
                  </td>
                  <td>{item.type}</td>
                  <td>{item.template?.name ?? '—'}</td>
                  <td>{item.status}</td>
                  <td>
                    {item.result ? (
                      <span
                        style={{
                          fontWeight: 600,
                          color: item.result === 'PASS' ? '#166534' : '#991b1b',
                        }}
                      >
                        {item.result}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{new Date(item.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Maintenance & Service Schedules */}
      <section
        className="panel"
        style={{ marginTop: '1.5rem' }}
        data-testid="vehicle-maintenance-section"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Maintenance & Service Schedules</h2>
          {permissions.includes('maintenance.plan.manage') && (
            <button
              type="button"
              onClick={() => setShowAssignPlanModal(true)}
              className="secondary-action"
              style={{ fontSize: '0.875rem', cursor: 'pointer' }}
              data-testid="btn-assign-maintenance-plan"
            >
              + Assign Preventive Plan
            </button>
          )}
        </div>

        {maintenanceError && (
          <div
            style={{
              background: '#fee2e2',
              border: '1px solid #ef4444',
              color: '#b91c1c',
              padding: '0.75rem',
              borderRadius: '6px',
              marginTop: '1rem',
            }}
          >
            {maintenanceError}
          </div>
        )}

        <h3
          style={{ fontSize: '1rem', marginTop: '1rem', marginBottom: '0.5rem', color: '#4b5563' }}
        >
          Assigned Preventive Plans
        </h3>
        {maintenanceSchedules.length === 0 ? (
          <p style={{ marginTop: '0.5rem', color: 'var(--muted)' }}>
            No preventive maintenance plans assigned to this vehicle.
          </p>
        ) : (
          <table
            className="data-table"
            style={{ marginTop: '0.5rem', width: '100%' }}
            data-testid="table-vehicle-schedules"
          >
            <thead>
              <tr>
                <th scope="col">Plan</th>
                <th scope="col">Due State</th>
                <th scope="col">Next Due Date</th>
                <th scope="col">Next Due Km</th>
                <th scope="col">Last Performed</th>
              </tr>
            </thead>
            <tbody>
              {maintenanceSchedules.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link href={`/maintenance/plans/${s.maintenancePlanId}`} className="table-link">
                      {s.planName || 'Maintenance Plan'}
                    </Link>
                  </td>
                  <td>
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
                      data-testid={`badge-schedule-due-state-${s.id}`}
                    >
                      {s.dueState}
                    </span>
                  </td>
                  <td data-testid={`cell-vehicle-sched-due-date-${s.id}`}>
                    {s.nextDueAt ? new Date(s.nextDueAt).toLocaleDateString() : 'N/A'}
                  </td>
                  <td data-testid={`cell-vehicle-sched-due-km-${s.id}`}>
                    {s.nextDueOdometerKm ? `${s.nextDueOdometerKm.toLocaleString()} km` : 'N/A'}
                  </td>
                  <td data-testid={`cell-vehicle-sched-last-performed-${s.id}`}>
                    {s.lastCompletedAt ? new Date(s.lastCompletedAt).toLocaleDateString() : 'Never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
          <Link
            href={`/maintenance/requests?vehicleId=${vehicle.id}`}
            className="table-link"
            style={{ fontSize: '0.875rem' }}
          >
            View Maintenance Requests for this vehicle &rarr;
          </Link>
          <Link
            href={`/maintenance/work-orders?vehicleId=${vehicle.id}`}
            className="table-link"
            style={{ fontSize: '0.875rem' }}
          >
            View Work Orders for this vehicle &rarr;
          </Link>
        </div>
      </section>

      {/* Vehicle Compliance & Documents Section */}
      <section
        className="panel"
        style={{ marginTop: '1.5rem' }}
        data-testid="vehicle-compliance-section"
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h2 style={{ margin: 0 }}>Compliance & Documents</h2>
            {complianceData ? (
              <span
                style={{
                  padding: '0.25rem 0.6rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  background:
                    complianceData.evaluation.overallState === 'COMPLIANT'
                      ? '#dcfce7'
                      : complianceData.evaluation.overallState === 'WARNING'
                        ? '#fef9c3'
                        : '#fee2e2',
                  color:
                    complianceData.evaluation.overallState === 'COMPLIANT'
                      ? '#166534'
                      : complianceData.evaluation.overallState === 'WARNING'
                        ? '#854d0e'
                        : '#991b1b',
                }}
                data-testid="vehicle-compliance-status"
              >
                {complianceData.evaluation.overallState}
              </span>
            ) : null}
            {complianceData?.evaluation.operationallyBlocked ? (
              <span
                style={{
                  padding: '0.2rem 0.5rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  background: '#fee2e2',
                  color: '#991b1b',
                }}
                data-testid="vehicle-blocked-badge"
              >
                DISPATCH BLOCKED
              </span>
            ) : (
              <span
                style={{
                  padding: '0.2rem 0.5rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  background: '#dcfce7',
                  color: '#166534',
                }}
                data-testid="vehicle-unblocked-badge"
              >
                CLEAR FOR DISPATCH
              </span>
            )}
          </div>

          {permissions.includes('compliance.document.upload') && (
            <button
              type="button"
              onClick={() => {
                setShowUploadDocModal(true);
                setUploadError(null);
                if (vehicleDocTypes[0] && !uploadDocTypeId) {
                  setUploadDocTypeId(vehicleDocTypes[0].id);
                }
              }}
              className="secondary-action"
              style={{ fontSize: '0.875rem', cursor: 'pointer' }}
              data-testid="btn-upload-vehicle-doc"
            >
              + Upload Compliance Document
            </button>
          )}
        </div>

        {/* Operational Blocking Alert */}
        {complianceData?.evaluation.operationallyBlocked && (
          <div
            style={{
              marginTop: '1rem',
              padding: '1rem',
              background: '#fee2e2',
              border: '1px solid #ef4444',
              borderRadius: '6px',
              color: '#991b1b',
            }}
            data-testid="vehicle-compliance-blocked-banner"
          >
            <strong>Operational Dispatch Blocked:</strong> This vehicle cannot be marked READY or
            dispatched on trips.
            <ul style={{ margin: '0.5rem 0 0 0', paddingLeft: '1.25rem' }}>
              {complianceData.evaluation.blockingReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Requirements Checklist */}
        <div style={{ marginTop: '1.25rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>
            Compliance Requirements Checklist
          </h3>

          {!complianceData || complianceData.evaluation.requirements.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>
              No document requirements configured for vehicles.
            </p>
          ) : (
            <table
              className="data-table"
              style={{ width: '100%', marginTop: '0.5rem' }}
              data-testid="vehicle-compliance-requirements-table"
            >
              <thead>
                <tr>
                  <th scope="col">Requirement</th>
                  <th scope="col">Code</th>
                  <th scope="col">Policy</th>
                  <th scope="col">Status</th>
                  <th scope="col">Active Document</th>
                  <th scope="col">Expires On</th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {complianceData.evaluation.requirements.map((req) => (
                  <tr
                    key={req.documentTypeId}
                    data-testid={`requirement-row-${req.documentTypeCode}`}
                  >
                    <td>
                      <strong>{req.documentTypeName}</strong>
                    </td>
                    <td>
                      <code>{req.documentTypeCode}</code>
                    </td>
                    <td>
                      {req.required ? (
                        <span
                          style={{
                            color: req.blocksOperation ? '#dc2626' : '#4b5563',
                            fontWeight: req.blocksOperation ? 600 : 400,
                          }}
                        >
                          {req.blocksOperation ? 'Mandatory (Blocks Dispatch)' : 'Required'}
                        </span>
                      ) : (
                        <span style={{ color: '#6b7280' }}>Optional</span>
                      )}
                    </td>
                    <td>
                      <span
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background:
                            req.derivedState === 'VALID'
                              ? '#dcfce7'
                              : req.derivedState === 'EXPIRING_SOON'
                                ? '#fef9c3'
                                : '#fee2e2',
                          color:
                            req.derivedState === 'VALID'
                              ? '#166534'
                              : req.derivedState === 'EXPIRING_SOON'
                                ? '#854d0e'
                                : '#991b1b',
                        }}
                        data-testid={`req-status-${req.documentTypeCode}`}
                      >
                        {req.derivedState}
                      </span>
                    </td>
                    <td>
                      {req.activeDocument ? (
                        <Link
                          href={`/compliance/documents/${req.activeDocument.id}`}
                          className="table-link"
                          data-testid={`active-doc-link-${req.documentTypeCode}`}
                        >
                          {req.activeDocument.documentNumber || req.activeDocument.displayId}
                        </Link>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>None uploaded</span>
                      )}
                    </td>
                    <td>
                      {req.activeDocument?.expiresOn ? (
                        new Date(req.activeDocument.expiresOn).toLocaleDateString()
                      ) : (
                        <span style={{ color: '#9ca3af' }}>&mdash;</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {permissions.includes('compliance.document.upload') && (
                        <button
                          type="button"
                          onClick={() => {
                            setUploadDocTypeId(req.documentTypeId);
                            setUploadError(null);
                            setShowUploadDocModal(true);
                          }}
                          style={{
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.75rem',
                            background: '#fff',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            color: '#2563eb',
                          }}
                          data-testid={`btn-upload-for-${req.documentTypeCode}`}
                        >
                          {req.activeDocument ? 'Replace' : 'Upload'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Active Documents List */}
        {complianceData && complianceData.activeDocuments.length > 0 && (
          <div style={{ marginTop: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>
              Active Verified Documents
            </h3>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              {complianceData.activeDocuments.map((doc) => (
                <li
                  key={doc.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.6rem 0.75rem',
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                  }}
                  data-testid={`vehicle-doc-item-${doc.displayId}`}
                >
                  <div>
                    <Link
                      href={`/compliance/documents/${doc.id}`}
                      style={{ fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}
                    >
                      {doc.displayId}
                    </Link>
                    {doc.documentNumber ? ` (${doc.documentNumber})` : ''} &bull;{' '}
                    <span style={{ color: '#6b7280' }}>
                      {doc.originalFileName} ({(doc.sizeBytes / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                      {doc.expiresOn
                        ? `Expires: ${new Date(doc.expiresOn).toLocaleDateString()}`
                        : 'No expiry'}
                    </span>
                    <Link
                      href={`/compliance/documents/${doc.id}`}
                      style={{ color: '#2563eb', fontSize: '0.75rem', fontWeight: 500 }}
                    >
                      Manage &rarr;
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Upload Compliance Document Modal */}
      {showUploadDocModal && (
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
          data-testid="modal-upload-compliance-doc"
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
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: 600 }}>
              Upload Vehicle Compliance Document
            </h3>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
              Upload an official document file (PDF, PNG, or JPEG, max 10MB) for {vehicle.displayId}
              .
            </p>

            {uploadError && (
              <div
                style={{
                  padding: '0.75rem',
                  marginBottom: '1rem',
                  background: '#fee2e2',
                  border: '1px solid #ef4444',
                  borderRadius: '6px',
                  color: '#991b1b',
                  fontSize: '0.875rem',
                }}
                data-testid="upload-error-message"
              >
                {uploadError}
              </div>
            )}

            <form onSubmit={handleUploadComplianceDoc}>
              <div style={{ marginBottom: '1rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    marginBottom: '0.25rem',
                  }}
                >
                  Document Type *
                </label>
                <select
                  required
                  value={uploadDocTypeId}
                  onChange={(e) => setUploadDocTypeId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                  }}
                  data-testid="select-doc-type"
                >
                  <option value="">-- Choose document type --</option>
                  {vehicleDocTypes.map((dt) => (
                    <option key={dt.id} value={dt.id}>
                      {dt.name} ({dt.code})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    marginBottom: '0.25rem',
                  }}
                >
                  File *
                </label>
                <input
                  type="file"
                  required
                  accept=".pdf,application/pdf,image/png,image/jpeg"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  style={{ width: '100%' }}
                  data-testid="input-doc-file"
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    marginBottom: '0.25rem',
                  }}
                >
                  Document Number
                </label>
                <input
                  type="text"
                  value={uploadDocNumber}
                  onChange={(e) => setUploadDocNumber(e.target.value)}
                  placeholder="e.g. REG-2026-999"
                  style={{
                    width: '100%',
                    padding: '0.4rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                  }}
                  data-testid="input-doc-number"
                />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.75rem',
                  marginBottom: '1rem',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      marginBottom: '0.25rem',
                    }}
                  >
                    Issued On
                  </label>
                  <input
                    type="date"
                    value={uploadIssuedOn}
                    onChange={(e) => setUploadIssuedOn(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.4rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                    }}
                    data-testid="input-doc-issued-on"
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      marginBottom: '0.25rem',
                    }}
                  >
                    Expires On
                  </label>
                  <input
                    type="date"
                    value={uploadExpiresOn}
                    onChange={(e) => setUploadExpiresOn(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.4rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                    }}
                    data-testid="input-doc-expires-on"
                  />
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.75rem',
                  marginTop: '1.25rem',
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowUploadDocModal(false)}
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
                  disabled={uploadSubmitting || !uploadFile || !uploadDocTypeId}
                  style={{
                    padding: '0.5rem 1.25rem',
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  data-testid="btn-submit-upload-doc"
                >
                  {uploadSubmitting ? 'Uploading...' : 'Upload & Verify'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Plan Modal */}
      {showAssignPlanModal && (
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
              Assign Preventive Maintenance Plan
            </h3>
            <form onSubmit={handleAssignPlan}>
              <div style={{ marginBottom: '1rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    marginBottom: '0.25rem',
                  }}
                >
                  Select Plan *
                </label>
                <select
                  required
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                  }}
                  data-testid="select-assign-plan"
                >
                  <option value="">-- Choose active plan --</option>
                  {activePlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.displayId})
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowAssignPlanModal(false)}
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
                  disabled={maintenanceActionLoading || !selectedPlanId}
                  style={{
                    padding: '0.5rem 1.25rem',
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  data-testid="btn-submit-assign-plan"
                >
                  {maintenanceActionLoading ? 'Assigning...' : 'Assign Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Vehicle Finance & Fuel Economy Section */}
      <section
        style={{
          marginTop: '2rem',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1.5rem',
          background: '#fff',
        }}
        data-testid="section-vehicle-finance"
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
              Vehicle Finance & Fuel Economy
            </h2>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
              Lifetime refueling consumption, calculated fuel economy, and operational expense
              attributions.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Link
              href="/fuel/new"
              style={{
                padding: '0.4rem 0.8rem',
                background: '#2563eb',
                color: '#fff',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: 500,
                textDecoration: 'none',
              }}
              data-testid="btn-vehicle-log-fuel"
            >
              + Log Fuel
            </Link>
            <Link
              href="/expenses/new"
              style={{
                padding: '0.4rem 0.8rem',
                background: '#059669',
                color: '#fff',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: 500,
                textDecoration: 'none',
              }}
              data-testid="btn-vehicle-record-expense"
            >
              + Add Expense
            </Link>
          </div>
        </div>

        {vehicleFinance && (
          <>
            {/* Efficiency KPI Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem',
              }}
              data-testid="vehicle-fuel-efficiency"
            >
              <div
                style={{
                  background: '#f9fafb',
                  padding: '1rem',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                }}
              >
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                  }}
                >
                  Total Fuel
                </span>
                <div
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: '#111827',
                    marginTop: '0.25rem',
                  }}
                >
                  {(vehicleFinance.efficiency?.totalQuantity ?? 0).toFixed(1)} LITERS
                </div>
                <div style={{ fontSize: '0.75rem', color: '#4b5563', marginTop: '0.25rem' }}>
                  Total Cost:{' '}
                  {(vehicleFinance.efficiency?.currencySpend?.[0]?.totalAmount ?? 0).toFixed(2)}{' '}
                  {vehicleFinance.efficiency?.currencySpend?.[0]?.currencyCode || 'USD'}
                </div>
              </div>

              <div
                style={{
                  background: '#f9fafb',
                  padding: '1rem',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                }}
              >
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                  }}
                >
                  Logged Distance
                </span>
                <div
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: '#111827',
                    marginTop: '0.25rem',
                  }}
                >
                  {vehicleFinance.efficiency?.totalDistanceKm ?? 0} km
                </div>
                <div style={{ fontSize: '0.75rem', color: '#4b5563', marginTop: '0.25rem' }}>
                  Between refuel points
                </div>
              </div>

              <div
                style={{
                  background: '#f9fafb',
                  padding: '1rem',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                }}
              >
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                  }}
                >
                  Fuel Economy
                </span>
                <div
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: '#111827',
                    marginTop: '0.25rem',
                  }}
                  data-testid="metric-km-per-unit"
                >
                  {vehicleFinance.efficiency?.averageKmPerUnit !== null &&
                  vehicleFinance.efficiency?.averageKmPerUnit !== undefined
                    ? `${vehicleFinance.efficiency.averageKmPerUnit.toFixed(2)} km/L`
                    : 'N/A'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#4b5563', marginTop: '0.25rem' }}>
                  {vehicleFinance.efficiency?.averageUnitsPer100Km !== null &&
                  vehicleFinance.efficiency?.averageUnitsPer100Km !== undefined
                    ? `${vehicleFinance.efficiency.averageUnitsPer100Km.toFixed(2)} L/100km`
                    : 'Requires ≥2 odometer logs'}
                </div>
              </div>

              <div
                style={{
                  background: '#f9fafb',
                  padding: '1rem',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                }}
              >
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                  }}
                >
                  Cost / km
                </span>
                <div
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: '#111827',
                    marginTop: '0.25rem',
                  }}
                  data-testid="metric-cost-per-km"
                >
                  {vehicleFinance.efficiency?.currencySpend?.[0]?.averageCostPerKm !== null &&
                  vehicleFinance.efficiency?.currencySpend?.[0]?.averageCostPerKm !== undefined
                    ? `${vehicleFinance.efficiency.currencySpend[0].averageCostPerKm.toFixed(3)} ${vehicleFinance.efficiency.currencySpend[0].currencyCode}/km`
                    : 'N/A'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#4b5563', marginTop: '0.25rem' }}>
                  Fuel expense rate
                </div>
              </div>
            </div>

            {/* Recent Fuel Transactions */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                Recent Fuel Transactions ({vehicleFinance.recentFuelTransactions?.length ?? 0})
              </h3>
              {!vehicleFinance.recentFuelTransactions ||
              vehicleFinance.recentFuelTransactions.length === 0 ? (
                <p style={{ color: '#6b7280', fontStyle: 'italic', fontSize: '0.875rem' }}>
                  No fuel transactions recorded for this vehicle.
                </p>
              ) : (
                <div
                  style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                >
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '0.8125rem',
                      textAlign: 'left',
                    }}
                  >
                    <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      <tr>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Display ID</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Date</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Quantity</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Total</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Odometer</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vehicleFinance.recentFuelTransactions.slice(0, 5).map((ft) => (
                        <tr key={ft.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>
                            <Link
                              href={`/fuel/${ft.id}`}
                              style={{ color: '#2563eb', textDecoration: 'none' }}
                            >
                              {ft.displayId}
                            </Link>
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>
                            {new Date(ft.occurredAt).toLocaleDateString()}
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>
                            {ft.quantity} {ft.quantityUnit}
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>
                            {ft.totalAmount.toFixed(2)} {ft.currencyCode}
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>
                            {ft.odometerKm !== null ? `${ft.odometerKm} km` : '-'}
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>
                            <span
                              style={{
                                padding: '0.15rem 0.4rem',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                background: ft.status === 'POSTED' ? '#dcfce7' : '#f3f4f6',
                                color: ft.status === 'POSTED' ? '#166534' : '#6b7280',
                              }}
                            >
                              {ft.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Recent Expenses */}
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                Attributed Expenses ({vehicleFinance.recentExpenses?.length ?? 0})
              </h3>
              {!vehicleFinance.recentExpenses || vehicleFinance.recentExpenses.length === 0 ? (
                <p style={{ color: '#6b7280', fontStyle: 'italic', fontSize: '0.875rem' }}>
                  No expenses directly attributed to this vehicle.
                </p>
              ) : (
                <div
                  style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                >
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '0.8125rem',
                      textAlign: 'left',
                    }}
                  >
                    <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      <tr>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Display ID</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Category</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Description</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Amount</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vehicleFinance.recentExpenses.slice(0, 5).map((ex) => (
                        <tr key={ex.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>
                            <Link
                              href={`/expenses/${ex.id}`}
                              style={{ color: '#2563eb', textDecoration: 'none' }}
                            >
                              {ex.displayId}
                            </Link>
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>
                            {ex.category?.name || 'Expense'}
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>{ex.description}</td>
                          <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>
                            {ex.amount.toFixed(2)} {ex.currencyCode}
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>
                            <span
                              style={{
                                padding: '0.15rem 0.4rem',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                background: ex.status === 'POSTED' ? '#dcfce7' : '#fef3c7',
                                color: ex.status === 'POSTED' ? '#166534' : '#92400e',
                              }}
                            >
                              {ex.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
