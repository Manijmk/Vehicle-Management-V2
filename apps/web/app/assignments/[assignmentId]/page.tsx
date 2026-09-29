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
  type VehicleDriverAssignmentRecord,
} from '../../../lib/api-client';

export default function AssignmentDetailPage() {
  const params = useParams();
  const assignmentId = params['assignmentId'] as string;

  const [assignment, setAssignment] = useState<VehicleDriverAssignmentRecord | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // End modal state
  const [isEnding, setIsEnding] = useState(false);
  const [endReason, setEndReason] = useState('');
  const [endError, setEndError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!assignmentId) return;
    try {
      setLoading(true);
      setError(null);
      setConflictMessage(null);
      const [asn, user] = await Promise.all([
        assignmentApi.fetchAssignment(assignmentId),
        vehicleApi.fetchCurrentUser().catch(() => null),
      ]);
      setAssignment(asn);
      setCurrentUser(user);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) {
        setError('Assignment was not found in this organization.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load assignment');
      }
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const permissions = currentUser?.permissions ?? [];
  const canEnd = permissions.includes('assignment.end');

  const handleEndAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignment) return;
    if (!endReason.trim()) {
      setEndError('Reason for ending assignment is required.');
      return;
    }

    try {
      setActionLoading(true);
      setEndError(null);
      setConflictMessage(null);
      await assignmentApi.endAssignment(assignment.id, {
        version: assignment.version,
        reason: endReason.trim(),
      });
      setIsEnding(false);
      setEndReason('');
      await loadData();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'CONCURRENCY_CONFLICT') {
        setConflictMessage(
          'This assignment was modified concurrently by another user. Reloading latest state.',
        );
        setIsEnding(false);
        await loadData();
      } else {
        setEndError(err instanceof Error ? err.message : 'Failed to end assignment');
      }
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="vehicle-page narrow">
        <TenantHeader />
        <p className="loading-state">Loading assignment details...</p>
      </main>
    );
  }

  if (error || !assignment) {
    return (
      <main className="vehicle-page narrow">
        <TenantHeader />
        <div className="action-error" data-testid="error-banner">
          {error ?? 'Assignment not found'}
        </div>
        <Link href="/assignments" className="secondary-action">
          Back to assignments
        </Link>
      </main>
    );
  }

  const isEligible =
    assignment.driver?.eligible ?? assignment.driver?.isOperationallyEligible ?? false;

  return (
    <main className="vehicle-page narrow">
      <TenantHeader onAuthChange={() => void loadData()} />

      <div className="page-header">
        <div>
          <p className="eyebrow">Fleet operations</p>
          <h1>Assignment Details</h1>
        </div>
        <div className="header-actions">
          <Link href="/assignments" className="secondary-action">
            All assignments
          </Link>
          {assignment.status === 'ACTIVE' && canEnd ? (
            <button
              type="button"
              className="danger-action"
              onClick={() => {
                setEndReason('');
                setEndError(null);
                setIsEnding(true);
              }}
              data-testid="end-assignment-button"
            >
              End assignment
            </button>
          ) : null}
        </div>
      </div>

      {conflictMessage ? (
        <div className="action-error" data-testid="conflict-banner">
          {conflictMessage}
        </div>
      ) : null}

      <section className="panel" aria-label="Assignment overview">
        <div className="detail-grid">
          <div>
            <span className="label">Status</span>
            <div>
              <span
                className={`badge status-${assignment.status.toLowerCase()}`}
                data-testid={`assignment-status-badge-${assignment.status.toLowerCase()}`}
              >
                {assignment.status}
              </span>
            </div>
          </div>

          <div>
            <span className="label">Operational Eligibility</span>
            <div>
              {assignment.status === 'ACTIVE' ? (
                <span
                  className={`badge ${isEligible ? 'badge-eligible' : 'badge-ineligible'}`}
                  data-testid="driver-eligibility-badge"
                >
                  {isEligible ? 'Eligible' : 'Ineligible'}
                </span>
              ) : (
                <span className="badge muted">—</span>
              )}
            </div>
          </div>

          <div>
            <span className="label">Vehicle</span>
            <div data-testid="detail-vehicle">
              <Link href={`/vehicles/${assignment.vehicleId}`} className="entity-link">
                {assignment.vehicle
                  ? `${assignment.vehicle.displayId} (${assignment.vehicle.registration})`
                  : assignment.vehicleId}
              </Link>
            </div>
          </div>

          <div>
            <span className="label">Driver</span>
            <div data-testid="detail-driver">
              <Link href={`/drivers/${assignment.driverId}`} className="entity-link">
                {assignment.driver
                  ? `${assignment.driver.firstName} ${assignment.driver.lastName} (${assignment.driver.displayId})`
                  : assignment.driverId}
              </Link>
            </div>
          </div>

          <div>
            <span className="label">Started At</span>
            <span className="value" data-testid="detail-started-at">
              {new Date(assignment.startedAt).toLocaleString()}
            </span>
          </div>

          <div>
            <span className="label">Ended At</span>
            <span className="value" data-testid="detail-ended-at">
              {assignment.endedAt ? new Date(assignment.endedAt).toLocaleString() : '—'}
            </span>
          </div>

          {assignment.endReason ? (
            <div className="full-width">
              <span className="label">End Reason</span>
              <span className="value" data-testid="detail-end-reason">
                {assignment.endReason}
              </span>
            </div>
          ) : null}

          {assignment.notes ? (
            <div className="full-width">
              <span className="label">Notes</span>
              <span className="value" data-testid="detail-notes">
                {assignment.notes}
              </span>
            </div>
          ) : null}

          <div>
            <span className="label">Version</span>
            <span className="value" data-testid="detail-version">
              {assignment.version}
            </span>
          </div>
        </div>
      </section>

      {/* End Assignment Modal */}
      {isEnding ? (
        <div className="modal-backdrop" data-testid="end-modal">
          <div className="modal-content">
            <h2>End assignment</h2>
            <p>
              Are you sure you want to end this vehicle-driver pairing? This action is terminal and
              will release both the vehicle and driver for future assignments.
            </p>

            {endError ? (
              <div className="action-error" data-testid="end-error-banner">
                {endError}
              </div>
            ) : null}

            <form onSubmit={handleEndAssignment}>
              <label>
                Reason for ending *
                <input
                  type="text"
                  value={endReason}
                  onChange={(e) => setEndReason(e.target.value)}
                  placeholder="e.g. Shift ended normally, Maintenance handoff"
                  data-testid="end-reason-input"
                  required
                  autoFocus
                />
              </label>

              <div className="modal-actions">
                <button
                  type="submit"
                  className="danger-action"
                  disabled={actionLoading}
                  data-testid="confirm-end-button"
                >
                  {actionLoading ? 'Ending...' : 'End assignment'}
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => setIsEnding(false)}
                  disabled={actionLoading}
                  data-testid="cancel-end-button"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
