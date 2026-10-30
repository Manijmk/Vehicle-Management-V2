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
  driverApi,
  tripApi,
  vehicleApi,
  type ComplianceDocumentTypeRecord,
  type CurrentUserResponse,
  type DriverRecord,
  type DriverStatusHistoryEntry,
  type InspectionRecord,
  type SubjectComplianceResponse,
  type TripRecord,
  type VehicleDriverAssignmentRecord,
} from '../../../lib/api-client';

export default function DriverDetailPage() {
  const params = useParams();
  const driverId = params['driverId'] as string;

  const [driver, setDriver] = useState<DriverRecord | null>(null);
  const [history, setHistory] = useState<DriverStatusHistoryEntry[]>([]);
  const [currentAssignment, setCurrentAssignment] = useState<VehicleDriverAssignmentRecord | null>(
    null,
  );
  const [assignmentHistory, setAssignmentHistory] = useState<VehicleDriverAssignmentRecord[]>([]);
  const [currentTrip, setCurrentTrip] = useState<TripRecord | null>(null);
  const [tripHistory, setTripHistory] = useState<TripRecord[]>([]);
  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
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

  // Compliance state
  const [complianceData, setComplianceData] = useState<SubjectComplianceResponse | null>(null);
  const [driverDocTypes, setDriverDocTypes] = useState<ComplianceDocumentTypeRecord[]>([]);
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

  const loadData = useCallback(async () => {
    if (!driverId) return;
    try {
      setLoading(true);
      setError(null);
      setConflictMessage(null);
      setActionErrorMessage(null);

      const [d, h, u, curAsn, asnH, curTrip, tripH, inspRes, compRes, docTypesRes] =
        await Promise.all([
          driverApi.fetchDriver(driverId),
          driverApi.fetchStatusHistory(driverId).catch(() => []),
          vehicleApi.fetchCurrentUser().catch(() => null),
          assignmentApi.fetchDriverCurrentAssignment(driverId).catch(() => null),
          assignmentApi.fetchDriverAssignmentHistory(driverId).catch(() => []),
          tripApi.fetchDriverCurrentTrip(driverId).catch(() => null),
          tripApi
            .fetchDriverTripHistory(driverId, 20)
            .then((res) => res.items)
            .catch(() => []),
          api
            .fetchDriverInspections(driverId, 20)
            .then((res) => res.items)
            .catch(() => []),
          complianceApi.fetchDriverCompliance(driverId).catch(() => null),
          complianceApi
            .fetchDocumentTypes({ subjectType: 'DRIVER', status: 'ACTIVE' })
            .catch(() => ({ items: [], total: 0 })),
        ]);
      setDriver(d);
      setHistory(h);
      setCurrentUser(u);
      setCurrentAssignment(curAsn);
      setAssignmentHistory(asnH);
      setCurrentTrip(curTrip);
      setTripHistory(tripH);
      setInspections(inspRes);
      setComplianceData(compRes);
      setDriverDocTypes(docTypesRes.items);
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
      setActionErrorMessage('Cannot deactivate driver while an active vehicle assignment exists.');
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
          'Cannot deactivate driver while an active vehicle assignment exists.',
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

      await complianceApi.uploadDriverDocument(driverId, formData);
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
                disabled={actionLoading !== null}
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

      {/* Driver Regulatory Compliance Section (distinct from Driver License) */}
      <section
        className="panel"
        style={{ marginTop: '1.5rem', padding: '1.25rem' }}
        data-testid="driver-compliance-section"
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
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h2 style={{ margin: 0 }}>Regulatory Compliance & Documents</h2>
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
                  data-testid="driver-compliance-status"
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
                  data-testid="driver-blocked-badge"
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
                  data-testid="driver-unblocked-badge"
                >
                  CLEAR FOR DISPATCH
                </span>
              )}
            </div>
            <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: '0.25rem 0 0 0' }}>
              Medical fitness, background checks, and certifications. Canonical driver licenses are
              managed in the Driver License section above.
            </p>
          </div>

          {permissions.includes('compliance.document.upload') && (
            <button
              type="button"
              onClick={() => {
                setShowUploadDocModal(true);
                setUploadError(null);
                if (driverDocTypes[0] && !uploadDocTypeId) {
                  setUploadDocTypeId(driverDocTypes[0].id);
                }
              }}
              className="secondary-action"
              style={{ fontSize: '0.875rem', cursor: 'pointer' }}
              data-testid="btn-upload-driver-doc"
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
            data-testid="driver-compliance-blocked-banner"
          >
            <strong>Operational Dispatch Blocked:</strong> Driver cannot be assigned or dispatched
            on trips due to compliance:
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
              No document requirements configured for drivers.
            </p>
          ) : (
            <table
              className="data-table"
              style={{ width: '100%', marginTop: '0.5rem' }}
              data-testid="driver-compliance-requirements-table"
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
                  data-testid={`driver-doc-item-${doc.displayId}`}
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
              Upload Driver Compliance Document
            </h3>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
              Upload an official certification file (PDF, PNG, or JPEG, max 10MB) for{' '}
              {driver.firstName} {driver.lastName}.
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
                  {driverDocTypes.map((dt) => (
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
                  placeholder="e.g. MED-2026-999"
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
                <dt style={{ color: 'var(--muted)', fontWeight: 700 }}>Assigned Vehicle</dt>
                <dd style={{ margin: 0 }}>
                  <Link href={`/vehicles/${currentAssignment.vehicle.id}`} className="table-link">
                    <strong data-testid="assigned-vehicle-display">
                      {currentAssignment.vehicle.displayId}
                    </strong>{' '}
                    <span data-testid="assigned-vehicle-registration">
                      {currentAssignment.vehicle.registration}
                    </span>
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
            data-testid="assignment-history-table"
          >
            {assignmentHistory.map((item) => (
              <li key={item.id} data-testid={`assignment-history-item-${item.id}`}>
                <strong>
                  <Link href={`/assignments/${item.id}`} className="table-link">
                    Assignment {item.id.slice(0, 8)}
                  </Link>{' '}
                  —{' '}
                  {item.vehicle
                    ? `${item.vehicle.displayId} (${item.vehicle.registration})`
                    : 'Unknown Vehicle'}{' '}
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
        style={{ marginTop: '1.5rem', padding: '1.25rem' }}
        data-testid="driver-current-trip-section"
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
                <dt style={{ color: 'var(--muted)', fontWeight: 700 }}>Vehicle</dt>
                <dd style={{ margin: 0 }}>
                  {currentTrip.vehicle ? (
                    <Link href={`/vehicles/${currentTrip.vehicle.id}`} className="table-link">
                      {currentTrip.vehicle.displayId} ({currentTrip.vehicle.registration})
                    </Link>
                  ) : (
                    currentTrip.vehicleId.slice(0, 8)
                  )}
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
            No active in-progress trip for this driver.
          </p>
        )}
      </section>

      <section
        className="panel"
        style={{ marginTop: '1.5rem', padding: '1.25rem' }}
        data-testid="driver-trip-history-section"
      >
        <h2>Trip History</h2>
        {tripHistory.length === 0 ? (
          <p style={{ marginTop: '0.75rem', color: 'var(--muted)' }}>
            No trips recorded for this driver.
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
        style={{ marginTop: '1.5rem', padding: '1.25rem' }}
        data-testid="driver-inspection-history-section"
      >
        <h2>Inspection History</h2>
        {inspections.length === 0 ? (
          <p style={{ marginTop: '0.75rem', color: 'var(--muted)' }}>
            No inspections associated with this driver.
          </p>
        ) : (
          <table
            className="data-table"
            data-testid="driver-inspections-table"
            style={{ marginTop: '1rem', width: '100%' }}
          >
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Type</th>
                <th scope="col">Template</th>
                <th scope="col">Vehicle</th>
                <th scope="col">Status</th>
                <th scope="col">Result</th>
                <th scope="col">Date</th>
              </tr>
            </thead>
            <tbody>
              {inspections.map((item) => (
                <tr key={item.id} data-testid={`driver-inspection-row-${item.id}`}>
                  <td>
                    <Link href={`/inspections/${item.id}`} className="table-link">
                      {item.displayId}
                    </Link>
                  </td>
                  <td>{item.type}</td>
                  <td>{item.template?.name ?? '—'}</td>
                  <td>{item.vehicle?.displayId ?? '—'}</td>
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
    </main>
  );
}
