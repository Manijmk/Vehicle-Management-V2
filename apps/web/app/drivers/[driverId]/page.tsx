'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import {
  ApiClientError,
  assignmentApi,
  driverApi,
  vehicleApi,
  type CurrentUserResponse,
  type DriverRecord,
  type DriverStatusHistoryEntry,
  type VehicleDriverAssignmentRecord,
} from '../../../lib/api-client';

export default function DriverDetailPage() {
  const params = useParams();
  const driverId = params['driverId'] as string;

  const [driver, setDriver] = useState<DriverRecord | null>(null);
  const [history, setHistory] = useState<DriverStatusHistoryEntry[]>([]);
  const [currentAssignment, setCurrentAssignment] = useState<VehicleDriverAssignmentRecord | null>(null);
  const [assignmentHistory, setAssignmentHistory] = useState<VehicleDriverAssignmentRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit metadata state
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    employeeNumber: '',
    notes: '',
  });

  // Action / modal states
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null);

  // Suspend modal state
  const [isSuspending, setIsSuspending] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');

  // Deactivate modal state
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [deactivateReason, setDeactivateReason] = useState('');

  // License modal state
  const [isAddingLicense, setIsAddingLicense] = useState(false);
  const [licenseForm, setLicenseForm] = useState({
    licenseNumber: '',
    issuingCountry: 'US',
    issuingRegion: '',
    licenseClasses: 'B',
    issueDate: '',
    expiryDate: '',
    notes: '',
  });

  const loadData = useCallback(async () => {
    if (!driverId) return;
    try {
      setLoading(true);
      setError(null);
      setConflictMessage(null);
      setActionErrorMessage(null);

      const [d, h, u, curAsn, asnH] = await Promise.all([
        driverApi.fetchDriver(driverId),
        driverApi.fetchStatusHistory(driverId).catch(() => []),
        vehicleApi.fetchCurrentUser().catch(() => null),
        assignmentApi.fetchDriverCurrentAssignment(driverId).catch(() => null),
        assignmentApi.fetchDriverAssignmentHistory(driverId).catch(() => []),
      ]);
      setDriver(d);
      setHistory(h);
      setCurrentUser(u);
      setCurrentAssignment(curAsn);
      setAssignmentHistory(asnH);
      setEditData({
        firstName: d.firstName,
        lastName: d.lastName,
        email: d.email ?? '',
        phone: d.phone ?? '',
        employeeNumber: d.employeeNumber ?? '',
        notes: d.notes ?? '',
      });
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) {
        setError('Driver was not found in this organization.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load driver');
      }
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Permissions
  const permissions = currentUser?.permissions ?? [];
  const canUpdate = permissions.includes('driver.update');
  const canActivate = permissions.includes('driver.activate');
  const canSuspend = permissions.includes('driver.suspend');
  const canDeactivate = permissions.includes('driver.deactivate');
  const canManageLicense = permissions.includes('driver.license.manage');
  const canReadHistory = permissions.includes('driver.history.read');

  // Activate handler
  const handleActivate = async () => {
    if (!driver) return;
    try {
      setActionLoading('activating');
      setConflictMessage(null);
      setActionErrorMessage(null);
      await driverApi.activateDriver(driver.id, driver.version);
      await loadData();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'CONCURRENCY_CONFLICT') {
          setConflictMessage(
            'This driver was updated by another request. Please reload and try again.',
          );
        } else if (err.code === 'NO_VALID_DRIVER_LICENSE') {
          setActionErrorMessage(
            'Cannot activate driver: driver must have at least one valid, unexpired license.',
          );
        } else {
          setActionErrorMessage(err.message);
        }
      } else {
        setActionErrorMessage('An unexpected error occurred while activating driver.');
      }
    } finally {
      setActionLoading(null);
    }
  };

  // Suspend handler
  const handleSuspend = async () => {
    if (!driver || !suspendReason.trim()) return;
    try {
      setActionLoading('suspending');
      setConflictMessage(null);
      setActionErrorMessage(null);
      await driverApi.suspendDriver(driver.id, suspendReason.trim(), driver.version);
      setIsSuspending(false);
      setSuspendReason('');
      await loadData();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'CONCURRENCY_CONFLICT') {
        setConflictMessage(
          'This driver was updated by another request. Please reload and try again.',
        );
      } else {
        setActionErrorMessage(err instanceof Error ? err.message : 'Failed to suspend driver');
      }
    } finally {
      setActionLoading(null);
    }
  };

  // Deactivate handler
  const handleDeactivate = async () => {
    if (!driver || !deactivateReason.trim()) return;
    if (currentAssignment) {
      setActionErrorMessage(
        'Cannot deactivate driver: driver currently has an active vehicle assignment.',
      );
      setIsDeactivating(false);
      return;
    }
    try {
      setActionLoading('deactivating');
      setConflictMessage(null);
      setActionErrorMessage(null);
      await driverApi.deactivateDriver(driver.id, deactivateReason.trim(), driver.version);
      setIsDeactivating(false);
      setDeactivateReason('');
      await loadData();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'DRIVER_HAS_ACTIVE_ASSIGNMENT') {
        setActionErrorMessage(
          'Cannot deactivate driver: driver currently has an active vehicle assignment.',
        );
      } else if (err instanceof ApiClientError && err.code === 'CONCURRENCY_CONFLICT') {
        setConflictMessage(
          'This driver was updated by another request. Please reload and try again.',
        );
      } else {
        setActionErrorMessage(err instanceof Error ? err.message : 'Failed to deactivate driver');
      }
    } finally {
      setActionLoading(null);
    }
  };

  // Update profile handler
  const handleSaveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!driver) return;
    try {
      setActionLoading('saving');
      setConflictMessage(null);
      setActionErrorMessage(null);
      await driverApi.updateDriver(driver.id, {
        firstName: editData.firstName.trim(),
        lastName: editData.lastName.trim(),
        email: editData.email.trim() || null,
        phone: editData.phone.trim() || null,
        employeeNumber: editData.employeeNumber.trim() || null,
        notes: editData.notes.trim() || null,
        version: driver.version,
      });
      setIsEditing(false);
      await loadData();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'CONCURRENCY_CONFLICT') {
          setConflictMessage(
            'This driver was updated by another request. Please reload and try again.',
          );
        } else if (err.code === 'DRIVER_EMPLOYEE_NUMBER_EXISTS') {
          setActionErrorMessage('Another driver already uses this employee number.');
        } else {
          setActionErrorMessage(err.message);
        }
      } else {
        setActionErrorMessage('Failed to update driver profile.');
      }
    } finally {
      setActionLoading(null);
    }
  };

  // Add License handler
  const handleAddLicense = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!driver) return;
    try {
      setActionLoading('adding-license');
      setConflictMessage(null);
      setActionErrorMessage(null);
      const classes = licenseForm.licenseClasses
        .split(',')
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);

      await driverApi.addLicense(driver.id, {
        licenseNumber: licenseForm.licenseNumber.trim().toUpperCase(),
        issuingCountry: licenseForm.issuingCountry.trim().toUpperCase(),
        issuingRegion: licenseForm.issuingRegion.trim() || undefined,
        licenseClasses: classes,
        issueDate: new Date(licenseForm.issueDate).toISOString(),
        expiryDate: new Date(licenseForm.expiryDate).toISOString(),
        notes: licenseForm.notes.trim() || undefined,
      });

      setIsAddingLicense(false);
      setLicenseForm({
        licenseNumber: '',
        issuingCountry: 'US',
        issuingRegion: '',
        licenseClasses: 'B',
        issueDate: '',
        expiryDate: '',
        notes: '',
      });
      await loadData();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'DRIVER_LICENSE_EXISTS') {
          setActionErrorMessage(
            'This license number already exists for this country in the organization.',
          );
        } else if (err.code === 'INVALID_LICENSE_DATE_RANGE') {
          setActionErrorMessage('License issue date cannot be after expiry date.');
        } else {
          setActionErrorMessage(err.message);
        }
      } else {
        setActionErrorMessage('Failed to add driver license.');
      }
    } finally {
      setActionLoading(null);
    }
  };

  // Remove License handler
  const handleRemoveLicense = async (licenseId: string) => {
    if (!driver || !confirm('Are you sure you want to remove this driver license?')) return;
    try {
      setActionLoading(`removing-${licenseId}`);
      setConflictMessage(null);
      setActionErrorMessage(null);
      await driverApi.removeLicense(driver.id, licenseId);
      await loadData();
    } catch (err) {
      setActionErrorMessage(err instanceof Error ? err.message : 'Failed to remove license');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <main className="driver-page">
        <TenantHeader />
        <section className="panel empty-state" data-testid="loading-state">
          <h2>Loading driver details...</h2>
          <p>Connecting to fleet operations service</p>
        </section>
      </main>
    );
  }

  if (error || !driver) {
    return (
      <main className="driver-page">
        <TenantHeader />
        <section className="panel empty-state error-panel" role="alert" data-testid="error-state">
          <h2>Error</h2>
          <p>{error ?? 'Driver not found'}</p>
          <Link href="/drivers" className="secondary-action">
            Back to drivers
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="driver-page">
      <TenantHeader onAuthChange={() => void loadData()} />

      <div className="page-header">
        <div>
          <p className="eyebrow">Fleet operations / Driver profile</p>
          <h1>
            {driver.firstName} {driver.lastName}{' '}
            <span className="pagination-info">({driver.displayId})</span>
          </h1>
        </div>
        <div className="action-row">
          <Link href="/drivers" className="secondary-action">
            Back to drivers
          </Link>
        </div>
      </div>

      {conflictMessage ? (
        <div className="error-banner conflict-banner" role="alert" data-testid="conflict-banner">
          <p>{conflictMessage}</p>
          <button
            type="button"
            className="secondary-action compact-btn"
            onClick={() => void loadData()}
          >
            Reload latest data
          </button>
        </div>
      ) : null}

      {actionErrorMessage ? (
        <div className="error-banner" role="alert" data-testid="action-error-banner">
          <p>{actionErrorMessage}</p>
        </div>
      ) : null}

      {/* Driver Summary & Lifecycle Actions */}
      <section className="panel" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span
              className={`status-pill status-${driver.status.toLowerCase()}`}
              data-testid={`driver-status-badge-${driver.status.toLowerCase()}`}
            >
              {driver.status}
            </span>
            <span
              className={`status-pill ${driver.eligible ? 'status-eligible' : 'status-ineligible'}`}
              data-testid="driver-eligibility-badge"
              title={driver.eligibilityReasons?.join(', ')}
            >
              {driver.eligible ? 'Eligible' : 'Ineligible'}
            </span>
            {!driver.eligible &&
            driver.eligibilityReasons &&
            driver.eligibilityReasons.length > 0 ? (
              <span className="badge-reasons">({driver.eligibilityReasons.join(', ')})</span>
            ) : null}
          </div>

          {/* Action buttons */}
          <div className="action-row">
            {driver.status === 'DRAFT' && canActivate ? (
              <button
                type="button"
                className="primary-action compact-btn"
                disabled={actionLoading !== null}
                onClick={() => void handleActivate()}
                data-testid="activate-driver-button"
              >
                {actionLoading === 'activating' ? 'Activating...' : 'Activate Driver'}
              </button>
            ) : null}

            {driver.status === 'SUSPENDED' && canActivate ? (
              <button
                type="button"
                className="primary-action compact-btn"
                disabled={actionLoading !== null}
                onClick={() => void handleActivate()}
                data-testid="reactivate-driver-button"
              >
                {actionLoading === 'activating' ? 'Reactivating...' : 'Reactivate Driver'}
              </button>
            ) : null}

            {driver.status === 'ACTIVE' && canSuspend ? (
              <button
                type="button"
                className="secondary-action compact-btn"
                disabled={actionLoading !== null}
                onClick={() => setIsSuspending(true)}
                data-testid="suspend-driver-button"
              >
                Suspend Driver
              </button>
            ) : null}

            {driver.status !== 'INACTIVE' && canDeactivate ? (
              <button
                type="button"
                className="secondary-action compact-btn"
                style={{ color: '#b3261e' }}
                disabled={actionLoading !== null || Boolean(currentAssignment)}
                title={
                  currentAssignment
                    ? 'Cannot deactivate driver while actively assigned to a vehicle'
                    : undefined
                }
                onClick={() => setIsDeactivating(true)}
                data-testid="deactivate-driver-button"
              >
                Deactivate Driver
              </button>
            ) : null}

            {driver.status === 'INACTIVE' ? (
              <span className="terminal-notice" style={{ margin: 0 }}>
                Driver is permanently deactivated
              </span>
            ) : null}
          </div>
        </div>

        {/* Suspend Modal / Box */}
        {isSuspending ? (
          <div
            className="panel retire-modal"
            style={{ marginTop: '1rem' }}
            data-testid="suspend-modal"
          >
            <h3 className="warning-text">Suspend Driver</h3>
            <p>Provide a reason for suspending this driver from operational duty:</p>
            <textarea
              rows={2}
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="e.g. Temporary license suspension or medical leave"
              data-testid="suspend-reason-input"
              style={{ width: '100%', marginBottom: '0.75rem' }}
            />
            <div className="action-row">
              <button
                type="button"
                className="primary-action compact-btn"
                disabled={!suspendReason.trim() || actionLoading !== null}
                onClick={() => void handleSuspend()}
                data-testid="confirm-suspend-button"
              >
                Confirm Suspension
              </button>
              <button
                type="button"
                className="secondary-action compact-btn"
                onClick={() => setIsSuspending(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {/* Deactivate Modal / Box */}
        {isDeactivating ? (
          <div
            className="panel retire-modal"
            style={{ marginTop: '1rem' }}
            data-testid="deactivate-modal"
          >
            <h3 className="warning-text">Permanently Deactivate Driver</h3>
            <p>
              Warning: Deactivating a driver is a terminal operation. The driver cannot be
              reactivated.
            </p>
            <textarea
              rows={2}
              value={deactivateReason}
              onChange={(e) => setDeactivateReason(e.target.value)}
              placeholder="e.g. Employment ended / resigned"
              data-testid="deactivate-reason-input"
              style={{ width: '100%', marginBottom: '0.75rem' }}
            />
            <div className="action-row">
              <button
                type="button"
                className="primary-action compact-btn"
                style={{ background: '#b3261e', borderColor: '#b3261e' }}
                disabled={!deactivateReason.trim() || actionLoading !== null}
                onClick={() => void handleDeactivate()}
                data-testid="confirm-deactivate-button"
              >
                Confirm Deactivation
              </button>
              <button
                type="button"
                className="secondary-action compact-btn"
                onClick={() => setIsDeactivating(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {/* Driver Profile Details & Editing */}
      <section className="panel detail-grid" style={{ marginBottom: '1.5rem' }}>
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <h2>Driver Profile</h2>
            {canUpdate && !isEditing ? (
              <button
                type="button"
                className="secondary-action compact-btn"
                onClick={() => setIsEditing(true)}
                data-testid="edit-driver-button"
              >
                Edit details
              </button>
            ) : null}
          </div>

          {isEditing ? (
            <form
              onSubmit={handleSaveProfile}
              className="driver-form"
              style={{ padding: 0 }}
              data-testid="edit-driver-form"
            >
              <label>
                First Name *
                <input
                  type="text"
                  value={editData.firstName}
                  onChange={(e) => setEditData({ ...editData, firstName: e.target.value })}
                  data-testid="edit-first-name-input"
                  required
                />
              </label>

              <label>
                Last Name *
                <input
                  type="text"
                  value={editData.lastName}
                  onChange={(e) => setEditData({ ...editData, lastName: e.target.value })}
                  data-testid="edit-last-name-input"
                  required
                />
              </label>

              <label>
                Email
                <input
                  type="email"
                  value={editData.email}
                  onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                  data-testid="edit-email-input"
                />
              </label>

              <label>
                Phone
                <input
                  type="tel"
                  value={editData.phone}
                  onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                  data-testid="edit-phone-input"
                />
              </label>

              <label>
                Employee Number
                <input
                  type="text"
                  value={editData.employeeNumber}
                  onChange={(e) => setEditData({ ...editData, employeeNumber: e.target.value })}
                  data-testid="edit-employee-number-input"
                />
              </label>

              <label>
                Notes
                <textarea
                  rows={2}
                  value={editData.notes}
                  onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                  data-testid="edit-notes-input"
                />
              </label>

              <div className="action-row" style={{ gridColumn: '1 / -1', marginTop: '0.5rem' }}>
                <button
                  type="submit"
                  className="primary-action compact-btn"
                  disabled={actionLoading === 'saving'}
                  data-testid="save-driver-button"
                >
                  Save changes
                </button>
                <button
                  type="button"
                  className="secondary-action compact-btn"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <dl data-testid="driver-profile-details">
              <div>
                <dt>Display ID</dt>
                <dd data-testid="detail-display-id">{driver.displayId}</dd>
              </div>
              <div>
                <dt>Full Name</dt>
                <dd data-testid="detail-full-name">
                  {driver.firstName} {driver.lastName}
                </dd>
              </div>
              <div>
                <dt>Employee #</dt>
                <dd data-testid="detail-employee-number">{driver.employeeNumber || '—'}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd data-testid="detail-email">{driver.email || '—'}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd data-testid="detail-phone">{driver.phone || '—'}</dd>
              </div>
              <div>
                <dt>Notes</dt>
                <dd data-testid="detail-notes">{driver.notes || '—'}</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd data-testid="detail-version">{driver.version}</dd>
              </div>
            </dl>
          )}
        </div>

        {/* Status History Panel */}
        {canReadHistory ? (
          <div>
            <h2>Lifecycle Status History</h2>
            {history.length === 0 ? (
              <p className="pagination-info">No history recorded.</p>
            ) : (
              <ul className="history-list" data-testid="driver-history-list">
                {history.map((item) => (
                  <li key={item.id} data-testid={`history-item-${item.id}`}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span className="history-reason" style={{ fontWeight: 600 }}>
                        {item.fromStatus ?? 'INITIAL'} → {item.toStatus}
                      </span>
                      <span className="history-meta">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="history-reason" style={{ margin: '0.2rem 0' }}>
                      {item.reason}
                    </p>
                    <span className="history-meta">By: {item.changedBy}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </section>

      {/* License Management Section */}
      <section className="panel" style={{ padding: '1.25rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <h2>Licenses & Qualifications</h2>
          {canManageLicense && !isAddingLicense ? (
            <button
              type="button"
              className="primary-action compact-btn"
              onClick={() => setIsAddingLicense(true)}
              data-testid="add-license-button"
            >
              Add License
            </button>
          ) : null}
        </div>

        {/* Add License Form */}
        {isAddingLicense ? (
          <form
            onSubmit={handleAddLicense}
            className="driver-form panel"
            style={{ marginBottom: '1.5rem', background: '#fafcfa' }}
            data-testid="add-license-form"
          >
            <h3 style={{ gridColumn: '1 / -1', margin: '0 0 0.5rem' }}>Add Driver License</h3>

            <label>
              License Number *
              <input
                type="text"
                value={licenseForm.licenseNumber}
                onChange={(e) => setLicenseForm({ ...licenseForm, licenseNumber: e.target.value })}
                placeholder="e.g. DL-9812-345"
                data-testid="license-number-input"
                required
              />
            </label>

            <label>
              Issuing Country (2 or 3 letter ISO) *
              <input
                type="text"
                maxLength={3}
                value={licenseForm.issuingCountry}
                onChange={(e) =>
                  setLicenseForm({ ...licenseForm, issuingCountry: e.target.value.toUpperCase() })
                }
                placeholder="e.g. US or GB"
                data-testid="license-country-input"
                required
              />
            </label>

            <label>
              Issuing Region / State (optional)
              <input
                type="text"
                value={licenseForm.issuingRegion}
                onChange={(e) => setLicenseForm({ ...licenseForm, issuingRegion: e.target.value })}
                placeholder="e.g. CA or NY"
                data-testid="license-region-input"
              />
            </label>

            <label>
              License Classes / Categories (comma separated) *
              <input
                type="text"
                value={licenseForm.licenseClasses}
                onChange={(e) => setLicenseForm({ ...licenseForm, licenseClasses: e.target.value })}
                placeholder="e.g. B, C, CE"
                data-testid="license-classes-input"
                required
              />
            </label>

            <label>
              Issue Date *
              <input
                type="date"
                value={licenseForm.issueDate}
                onChange={(e) => setLicenseForm({ ...licenseForm, issueDate: e.target.value })}
                data-testid="license-issue-date-input"
                required
              />
            </label>

            <label>
              Expiry Date *
              <input
                type="date"
                value={licenseForm.expiryDate}
                onChange={(e) => setLicenseForm({ ...licenseForm, expiryDate: e.target.value })}
                data-testid="license-expiry-date-input"
                required
              />
            </label>

            <div className="action-row" style={{ gridColumn: '1 / -1', marginTop: '0.5rem' }}>
              <button
                type="submit"
                className="primary-action compact-btn"
                disabled={actionLoading === 'adding-license'}
                data-testid="save-license-button"
              >
                Save License
              </button>
              <button
                type="button"
                className="secondary-action compact-btn"
                onClick={() => setIsAddingLicense(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {/* License Table */}
        {!driver.licenses || driver.licenses.length === 0 ? (
          <div
            className="empty-state"
            data-testid="no-licenses-notice"
            style={{ padding: '1.5rem 0' }}
          >
            <p>No licenses recorded for this driver. Add a license to enable driver activation.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table data-testid="licenses-table">
              <thead>
                <tr>
                  <th>License Number</th>
                  <th>Country / Region</th>
                  <th>Classes</th>
                  <th>Issue Date</th>
                  <th>Expiry Date</th>
                  <th>Validity</th>
                  {canManageLicense ? <th>Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {driver.licenses.map((lic) => {
                  const isValid = lic.isValid ?? false;
                  return (
                    <tr key={lic.id} data-testid={`license-row-${lic.id}`}>
                      <td data-testid="license-cell-number" style={{ fontWeight: 600 }}>
                        {lic.licenseNumber}
                      </td>
                      <td>
                        {lic.issuingCountry}
                        {lic.issuingRegion ? ` - ${lic.issuingRegion}` : ''}
                      </td>
                      <td data-testid="license-cell-classes">{lic.licenseClasses.join(', ')}</td>
                      <td>{new Date(lic.issueDate).toLocaleDateString()}</td>
                      <td data-testid="license-cell-expiry">
                        {new Date(lic.expiryDate).toLocaleDateString()}
                      </td>
                      <td>
                        <span
                          className={`status-pill ${isValid ? 'status-eligible' : 'status-ineligible'}`}
                          data-testid={`license-validity-${lic.id}`}
                        >
                          {isValid ? 'Valid' : 'Expired'}
                        </span>
                      </td>
                      {canManageLicense ? (
                        <td>
                          <button
                            type="button"
                            className="secondary-action compact-btn"
                            style={{ color: '#b3261e' }}
                            disabled={actionLoading !== null}
                            onClick={() => void handleRemoveLicense(lic.id)}
                            data-testid={`remove-license-${lic.id}`}
                          >
                            Remove
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        className="panel"
        style={{ marginTop: '1.5rem', padding: '1.25rem' }}
        data-testid="driver-current-assignment-section"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Current Vehicle Assignment</h2>
          {!currentAssignment &&
          driver.status === 'ACTIVE' &&
          permissions.includes('assignment.create') ? (
            <Link
              href="/assignments/new"
              className="primary-action compact-btn"
              data-testid="assign-vehicle-link"
            >
              Assign vehicle
            </Link>
          ) : null}
        </div>
        {currentAssignment && currentAssignment.vehicle ? (
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
                <dt style={{ color: 'var(--muted)', fontWeight: 700 }}>Assigned Vehicle</dt>
                <dd style={{ margin: 0 }}>
                  <Link href={`/vehicles/${currentAssignment.vehicle.id}`} className="table-link">
                    <strong data-testid="assigned-vehicle-registration">
                      {currentAssignment.vehicle.registration}
                    </strong>
                  </Link>{' '}
                  ({currentAssignment.vehicle.displayId})
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
            No vehicle is currently assigned to this driver.
          </p>
        )}
      </section>

      <section
        className="panel"
        style={{ marginTop: '1.5rem', padding: '1.25rem' }}
        data-testid="driver-assignment-history-section"
      >
        <h2>Assignment History</h2>
        {assignmentHistory.length === 0 ? (
          <p style={{ marginTop: '0.75rem', color: 'var(--muted)' }}>
            No historical assignments recorded for this driver.
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
                  {item.vehicle ? item.vehicle.registration : 'Unknown Vehicle'} ({item.status})
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
