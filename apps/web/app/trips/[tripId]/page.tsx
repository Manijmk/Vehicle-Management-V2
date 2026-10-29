'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import {
  api,
  ApiClientError,
  tripApi,
  vehicleApi,
  type CurrentUserResponse,
  type InspectionRecord,
  type TripRecord,
  type TripStatusHistoryEntry,
} from '../../../lib/api-client';

export default function TripDetailPage() {
  const params = useParams();
  const tripId = params['tripId'] as string;

  const [trip, setTrip] = useState<TripRecord | null>(null);
  const [history, setHistory] = useState<TripStatusHistoryEntry[]>([]);
  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  // Action modals state
  const [isStarting, setIsStarting] = useState(false);
  const [startOdo, setStartOdo] = useState<number>(0);

  const [isCompleting, setIsCompleting] = useState(false);
  const [endOdo, setEndOdo] = useState<number>(0);
  const [completeNotes, setCompleteNotes] = useState('');

  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const [isAborting, setIsAborting] = useState(false);
  const [abortOdo, setAbortOdo] = useState<number>(0);
  const [abortReason, setAbortReason] = useState('');

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!tripId) return;
    try {
      setLoading(true);
      setError(null);
      setConflictMessage(null);
      const [t, hist, inspRes, user] = await Promise.all([
        tripApi.fetchTrip(tripId),
        tripApi.fetchTripStatusHistory(tripId).catch(() => []),
        api.fetchTripInspections(tripId).catch(() => ({ items: [], total: 0 })),
        vehicleApi.fetchCurrentUser().catch(() => null),
      ]);
      setTrip(t);
      setHistory(hist);
      setInspections(inspRes.items);
      setCurrentUser(user);

      const defaultOdo = t.vehicle?.odometerKm ?? t.startOdometerKm ?? 0;
      setStartOdo(defaultOdo);
      setEndOdo(t.startOdometerKm ?? defaultOdo);
      setAbortOdo(t.startOdometerKm ?? defaultOdo);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) {
        setError('Trip was not found in this organization.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load trip');
      }
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const permissions = currentUser?.permissions ?? [];
  const canReady = permissions.includes('trip.ready');
  const canStart = permissions.includes('trip.start');
  const canComplete = permissions.includes('trip.complete');
  const canCancel = permissions.includes('trip.cancel');
  const canAbort = permissions.includes('trip.abort');

  // Transition handlers
  const handleMarkReady = async () => {
    if (!trip) return;
    try {
      setActionLoading(true);
      setActionError(null);
      await tripApi.markTripReady(trip.id, { version: trip.version });
      await loadData();
    } catch (err) {
      handleMutationError(err, 'Failed to mark trip ready');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trip) return;
    try {
      setActionLoading(true);
      setActionError(null);
      await tripApi.startTrip(trip.id, {
        version: trip.version,
        startOdometerKm: Number(startOdo),
      });
      setIsStarting(false);
      await loadData();
    } catch (err) {
      handleMutationError(err, 'Failed to start trip');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trip) return;
    try {
      setActionLoading(true);
      setActionError(null);
      await tripApi.completeTrip(trip.id, {
        version: trip.version,
        endOdometerKm: Number(endOdo),
        notes: completeNotes.trim() || undefined,
      });
      setIsCompleting(false);
      await loadData();
    } catch (err) {
      handleMutationError(err, 'Failed to complete trip');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trip) return;
    try {
      setActionLoading(true);
      setActionError(null);
      await tripApi.cancelTrip(trip.id, {
        version: trip.version,
        cancelReason: cancelReason.trim() || undefined,
      });
      setIsCancelling(false);
      await loadData();
    } catch (err) {
      handleMutationError(err, 'Failed to cancel trip');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAbortTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trip) return;
    if (!abortReason.trim()) {
      setActionError('Reason for aborting trip is required.');
      return;
    }
    try {
      setActionLoading(true);
      setActionError(null);
      await tripApi.abortTrip(trip.id, {
        version: trip.version,
        endOdometerKm: Number(abortOdo),
        abortReason: abortReason.trim(),
      });
      setIsAborting(false);
      await loadData();
    } catch (err) {
      handleMutationError(err, 'Failed to abort trip');
    } finally {
      setActionLoading(false);
    }
  };

  const handleMutationError = (err: unknown, defaultMsg: string) => {
    if (err instanceof ApiClientError) {
      if (err.code === 'CONCURRENCY_CONFLICT') {
        setConflictMessage('This trip was modified concurrently by another user. Reloaded state.');
        void loadData();
      } else if (err.code === 'INVALID_START_ODOMETER') {
        setActionError('Start odometer reading cannot be less than vehicle current odometer.');
      } else if (err.code === 'INVALID_END_ODOMETER') {
        setActionError('End odometer reading cannot be less than start odometer reading.');
      } else if (err.code === 'VEHICLE_HAS_IN_PROGRESS_TRIP') {
        setActionError('Vehicle already has an in-progress trip.');
      } else if (err.code === 'DRIVER_HAS_IN_PROGRESS_TRIP') {
        setActionError('Driver already has an in-progress trip.');
      } else if (err.code === 'TRIP_DRIVER_NOT_ACTIVE') {
        setActionError('Driver is no longer active.');
      } else if (err.code === 'TRIP_DRIVER_NOT_ELIGIBLE') {
        setActionError('Driver is no longer operationally eligible (valid license required).');
      } else {
        setActionError(err.message || defaultMsg);
      }
    } else {
      setActionError(err instanceof Error ? err.message : defaultMsg);
    }
  };

  if (loading) {
    return (
      <main className="vehicle-page narrow">
        <TenantHeader />
        <p className="loading-state">Loading trip details...</p>
      </main>
    );
  }

  if (error || !trip) {
    return (
      <main className="vehicle-page narrow">
        <TenantHeader />
        <div className="breadcrumb">
          <Link href="/trips">&larr; Back to Trips</Link>
        </div>
        <div className="error-banner" role="alert" data-testid="error-banner">
          {error ?? 'Trip not found.'}
        </div>
      </main>
    );
  }

  const isTerminal =
    trip.status === 'COMPLETED' || trip.status === 'CANCELLED' || trip.status === 'ABORTED';

  const latestPreTrip = inspections
    .filter((i) => i.type === 'PRE_TRIP' && i.status === 'COMPLETED')
    .sort(
      (a, b) =>
        new Date(b.completedAt ?? b.createdAt).getTime() -
        new Date(a.completedAt ?? a.createdAt).getTime(),
    )[0];

  const hasPostTrip = inspections.some((i) => i.type === 'POST_TRIP' && i.status === 'COMPLETED');

  const statusClass =
    trip.status === 'COMPLETED'
      ? 'status-pill active'
      : trip.status === 'IN_PROGRESS'
        ? 'status-pill active'
        : trip.status === 'READY'
          ? 'status-pill'
          : isTerminal
            ? 'status-pill suspended'
            : 'status-pill draft';

  return (
    <main className="vehicle-page">
      <TenantHeader onAuthChange={() => void loadData()} />

      <div className="breadcrumb">
        <Link href="/trips">&larr; Back to Trips</Link>
      </div>

      <div className="page-header">
        <div>
          <p className="eyebrow">Trip detail</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h1 data-testid="trip-display-id">{trip.displayId}</h1>
            <span className={statusClass} data-testid="trip-status">
              {trip.status}
            </span>
          </div>
        </div>

        <div className="actions" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {trip.status === 'DRAFT' && canReady ? (
            <button
              type="button"
              className="primary-action"
              onClick={() => void handleMarkReady()}
              disabled={actionLoading}
              data-testid="mark-ready-btn"
            >
              {actionLoading ? 'Updating...' : 'Mark Ready'}
            </button>
          ) : null}

          {trip.status === 'READY' && canStart ? (
            <button
              type="button"
              className="primary-action"
              onClick={() => {
                setStartOdo(trip.vehicle?.odometerKm ?? 0);
                setIsStarting(true);
                setActionError(null);
              }}
              data-testid="start-trip-btn"
            >
              Start Trip
            </button>
          ) : null}

          {trip.status === 'IN_PROGRESS' && canComplete ? (
            <button
              type="button"
              className="primary-action"
              onClick={() => {
                setEndOdo(trip.startOdometerKm ?? trip.vehicle?.odometerKm ?? 0);
                setIsCompleting(true);
                setActionError(null);
              }}
              data-testid="complete-trip-btn"
            >
              Complete Trip
            </button>
          ) : null}

          {trip.status === 'IN_PROGRESS' && canAbort ? (
            <button
              type="button"
              className="secondary-action danger"
              onClick={() => {
                setAbortOdo(trip.startOdometerKm ?? trip.vehicle?.odometerKm ?? 0);
                setIsAborting(true);
                setActionError(null);
              }}
              data-testid="abort-trip-btn"
            >
              Abort Trip
            </button>
          ) : null}

          {(trip.status === 'DRAFT' || trip.status === 'READY') && canCancel ? (
            <button
              type="button"
              className="secondary-action danger"
              onClick={() => {
                setIsCancelling(true);
                setActionError(null);
              }}
              data-testid="cancel-trip-btn"
            >
              Cancel Trip
            </button>
          ) : null}
        </div>
      </div>

      {conflictMessage ? (
        <div className="error-banner warning" role="status" data-testid="conflict-banner">
          {conflictMessage}
        </div>
      ) : null}

      {actionError ? (
        <div className="error-banner" role="alert" data-testid="action-error-banner">
          {actionError}
        </div>
      ) : null}

      {/* Milestone 6: Pre-Trip Inspection Gate Card */}
      {trip.status === 'READY' && (
        <div
          data-testid="pre-trip-gate-card"
          style={{
            padding: '1rem',
            borderRadius: '6px',
            marginBottom: '1.5rem',
            border:
              latestPreTrip?.result === 'PASS'
                ? '1px solid #86efac'
                : latestPreTrip?.result === 'FAIL'
                  ? '1px solid #f87171'
                  : '1px solid #fde047',
            background:
              latestPreTrip?.result === 'PASS'
                ? '#f0fdf4'
                : latestPreTrip?.result === 'FAIL'
                  ? '#fef2f2'
                  : '#fefce8',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: '0.9375rem',
                  color:
                    latestPreTrip?.result === 'PASS'
                      ? '#166534'
                      : latestPreTrip?.result === 'FAIL'
                        ? '#991b1b'
                        : '#854d0e',
                }}
              >
                {latestPreTrip?.result === 'PASS'
                  ? 'Pre-Trip Inspection: PASS'
                  : latestPreTrip?.result === 'FAIL'
                    ? 'Pre-Trip Inspection: FAILED'
                    : 'Pre-Trip Inspection Required'}
              </div>
              <div style={{ fontSize: '0.8125rem', marginTop: '0.25rem', color: '#475569' }}>
                {latestPreTrip?.result === 'PASS'
                  ? `Safety verified (${latestPreTrip.displayId}). Trip is authorized to start.`
                  : latestPreTrip?.result === 'FAIL'
                    ? `Defect detected on ${latestPreTrip.displayId}. A passing re-inspection is required before this trip can start.`
                    : 'A completed and passing pre-trip inspection is required before departure.'}
              </div>
            </div>

            {(!latestPreTrip || latestPreTrip.result === 'FAIL') && (
              <Link
                href={`/inspections/new?tripId=${trip.id}&vehicleId=${trip.vehicleId}&type=PRE_TRIP`}
                className="primary-action"
                data-testid={
                  latestPreTrip?.result === 'FAIL'
                    ? 'start-reinspection-btn'
                    : 'start-pre-trip-inspection-btn'
                }
                style={{ textDecoration: 'none', padding: '0.4rem 0.8rem', fontSize: '0.875rem' }}
              >
                {latestPreTrip?.result === 'FAIL'
                  ? 'Start Re-inspection'
                  : 'Start Pre-Trip Inspection'}
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Milestone 6: Post-Trip Inspection Gate Card */}
      {trip.status === 'IN_PROGRESS' && (
        <div
          data-testid="post-trip-gate-card"
          style={{
            padding: '1rem',
            borderRadius: '6px',
            marginBottom: '1.5rem',
            border: hasPostTrip ? '1px solid #86efac' : '1px solid #93c5fd',
            background: hasPostTrip ? '#f0fdf4' : '#eff6ff',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: '0.9375rem',
                  color: hasPostTrip ? '#166534' : '#1e40af',
                }}
              >
                {hasPostTrip ? 'Post-Trip Inspection Completed' : 'Post-Trip Inspection Required'}
              </div>
              <div style={{ fontSize: '0.8125rem', marginTop: '0.25rem', color: '#475569' }}>
                {hasPostTrip
                  ? 'Post-trip inspection recorded. Trip can now be completed.'
                  : 'A post-trip inspection must be submitted before this trip can be completed.'}
              </div>
            </div>

            {!hasPostTrip && (
              <Link
                href={`/inspections/new?tripId=${trip.id}&vehicleId=${trip.vehicleId}&type=POST_TRIP`}
                className="primary-action"
                data-testid="start-post-trip-inspection-btn"
                style={{ textDecoration: 'none', padding: '0.4rem 0.8rem', fontSize: '0.875rem' }}
              >
                Start Post-Trip Inspection
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Milestone 6: Pre-Trip Inspection Gate Card */}
      {trip.status === 'READY' && (
        <div
          data-testid="pre-trip-gate-card"
          style={{
            padding: '1rem',
            borderRadius: '6px',
            marginBottom: '1.5rem',
            border:
              latestPreTrip?.result === 'PASS'
                ? '1px solid #86efac'
                : latestPreTrip?.result === 'FAIL'
                  ? '1px solid #f87171'
                  : '1px solid #fde047',
            background:
              latestPreTrip?.result === 'PASS'
                ? '#f0fdf4'
                : latestPreTrip?.result === 'FAIL'
                  ? '#fef2f2'
                  : '#fefce8',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: '0.9375rem',
                  color:
                    latestPreTrip?.result === 'PASS'
                      ? '#166534'
                      : latestPreTrip?.result === 'FAIL'
                        ? '#991b1b'
                        : '#854d0e',
                }}
              >
                {latestPreTrip?.result === 'PASS'
                  ? 'Pre-Trip Inspection: PASS'
                  : latestPreTrip?.result === 'FAIL'
                    ? 'Pre-Trip Inspection: FAILED'
                    : 'Pre-Trip Inspection Required'}
              </div>
              <div style={{ fontSize: '0.8125rem', marginTop: '0.25rem', color: '#475569' }}>
                {latestPreTrip?.result === 'PASS'
                  ? `Safety verified (${latestPreTrip.displayId}). Trip is authorized to start.`
                  : latestPreTrip?.result === 'FAIL'
                    ? `Defect detected on ${latestPreTrip.displayId}. A passing re-inspection is required before this trip can start.`
                    : 'A completed and passing pre-trip inspection is required before departure.'}
              </div>
            </div>

            {(!latestPreTrip || latestPreTrip.result === 'FAIL') && (
              <Link
                href={`/inspections/new?tripId=${trip.id}&vehicleId=${trip.vehicleId}&type=PRE_TRIP`}
                className="primary-action"
                data-testid={
                  latestPreTrip?.result === 'FAIL'
                    ? 'start-reinspection-btn'
                    : 'start-pre-trip-inspection-btn'
                }
                style={{ textDecoration: 'none', padding: '0.4rem 0.8rem', fontSize: '0.875rem' }}
              >
                {latestPreTrip?.result === 'FAIL' ? 'Start Re-inspection' : 'Start Pre-Trip Inspection'}
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Milestone 6: Post-Trip Inspection Gate Card */}
      {trip.status === 'IN_PROGRESS' && (
        <div
          data-testid="post-trip-gate-card"
          style={{
            padding: '1rem',
            borderRadius: '6px',
            marginBottom: '1.5rem',
            border: hasPostTrip ? '1px solid #86efac' : '1px solid #93c5fd',
            background: hasPostTrip ? '#f0fdf4' : '#eff6ff',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: '0.9375rem',
                  color: hasPostTrip ? '#166534' : '#1e40af',
                }}
              >
                {hasPostTrip ? 'Post-Trip Inspection Completed' : 'Post-Trip Inspection Required'}
              </div>
              <div style={{ fontSize: '0.8125rem', marginTop: '0.25rem', color: '#475569' }}>
                {hasPostTrip
                  ? 'Post-trip inspection recorded. Trip can now be completed.'
                  : 'A post-trip inspection must be submitted before this trip can be completed.'}
              </div>
            </div>

            {!hasPostTrip && (
              <Link
                href={`/inspections/new?tripId=${trip.id}&vehicleId=${trip.vehicleId}&type=POST_TRIP`}
                className="primary-action"
                data-testid="start-post-trip-inspection-btn"
                style={{ textDecoration: 'none', padding: '0.4rem 0.8rem', fontSize: '0.875rem' }}
              >
                Start Post-Trip Inspection
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Start Modal */}
      {isStarting ? (
        <div className="panel retire-modal" data-testid="start-modal">
          <h2>Start Trip</h2>
          <p>
            Verify the vehicle odometer reading before commencing the journey. The recorded start
            odometer must be at least the current vehicle odometer ({trip.vehicle?.odometerKm ?? 0}{' '}
            km).
          </p>
          <form onSubmit={handleStartTrip}>
            <div className="form-group">
              <label htmlFor="startOdo">Start Odometer (km) *</label>
              <input
                id="startOdo"
                type="number"
                min={trip.vehicle?.odometerKm ?? 0}
                value={startOdo}
                onChange={(e) => setStartOdo(Number(e.target.value))}
                required
                data-testid="start-odometer-input"
              />
            </div>
            <div className="form-actions">
              <button
                type="submit"
                className="primary-action"
                disabled={actionLoading}
                data-testid="confirm-start-btn"
              >
                {actionLoading ? 'Starting...' : 'Confirm Start'}
              </button>
              <button
                type="button"
                className="secondary-action"
                onClick={() => setIsStarting(false)}
              >
                Dismiss
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Complete Modal */}
      {isCompleting ? (
        <div className="panel retire-modal" data-testid="complete-modal">
          <h2>Complete Trip</h2>
          <p>
            Record the final odometer reading upon completion. The vehicle&apos;s authoritative
            odometer will be updated to this value atomically.
          </p>
          <form onSubmit={handleCompleteTrip}>
            <div className="form-group">
              <label htmlFor="endOdo">
                End Odometer (km) * (min {trip.startOdometerKm ?? 0} km)
              </label>
              <input
                id="endOdo"
                type="number"
                min={trip.startOdometerKm ?? 0}
                value={endOdo}
                onChange={(e) => setEndOdo(Number(e.target.value))}
                required
                data-testid="end-odometer-input"
              />
            </div>
            <div className="form-group">
              <label htmlFor="completeNotes">Completion Notes</label>
              <input
                id="completeNotes"
                type="text"
                value={completeNotes}
                onChange={(e) => setCompleteNotes(e.target.value)}
                placeholder="Operational journey notes, cargo handover status, etc."
                data-testid="complete-notes-input"
              />
            </div>
            <div className="form-actions">
              <button
                type="submit"
                className="primary-action"
                disabled={actionLoading}
                data-testid="confirm-complete-btn"
              >
                {actionLoading ? 'Completing...' : 'Confirm Complete'}
              </button>
              <button
                type="button"
                className="secondary-action"
                onClick={() => setIsCompleting(false)}
              >
                Dismiss
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Cancel Modal */}
      {isCancelling ? (
        <div className="panel retire-modal" data-testid="cancel-modal">
          <h2>Cancel Trip</h2>
          <p>
            Are you sure you want to cancel this planned trip? Cancellation is terminal and does not
            affect vehicle odometer readings.
          </p>
          <form onSubmit={handleCancelTrip}>
            <div className="form-group">
              <label htmlFor="cancelReason">Cancellation Reason</label>
              <input
                id="cancelReason"
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason for cancellation (order cancelled, rescheduling, etc.)"
                maxLength={500}
                data-testid="cancel-reason-input"
              />
            </div>
            <div className="form-actions">
              <button
                type="submit"
                className="primary-action danger"
                disabled={actionLoading}
                data-testid="confirm-cancel-btn"
              >
                {actionLoading ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
              <button
                type="button"
                className="secondary-action"
                onClick={() => setIsCancelling(false)}
              >
                Dismiss
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Abort Modal */}
      {isAborting ? (
        <div className="panel retire-modal" data-testid="abort-modal">
          <h2>Abort In-Progress Trip</h2>
          <p>
            An aborted trip records premature termination due to operational disruption. You must
            provide the end odometer reading reached before interruption and a reason. The vehicle
            odometer will be updated accordingly.
          </p>
          <form onSubmit={handleAbortTrip}>
            <div className="form-group">
              <label htmlFor="abortOdo">
                End Odometer (km) * (min {trip.startOdometerKm ?? 0} km)
              </label>
              <input
                id="abortOdo"
                type="number"
                min={trip.startOdometerKm ?? 0}
                value={abortOdo}
                onChange={(e) => setAbortOdo(Number(e.target.value))}
                required
                data-testid="abort-odometer-input"
              />
            </div>
            <div className="form-group">
              <label htmlFor="abortReason">Abort Reason *</label>
              <input
                id="abortReason"
                type="text"
                value={abortReason}
                onChange={(e) => setAbortReason(e.target.value)}
                placeholder="Reason for abort (breakdown, weather closure, dispatch recall)"
                maxLength={500}
                required
                data-testid="abort-reason-input"
              />
            </div>
            <div className="form-actions">
              <button
                type="submit"
                className="primary-action danger"
                disabled={actionLoading}
                data-testid="confirm-abort-btn"
              >
                {actionLoading ? 'Aborting...' : 'Confirm Abort'}
              </button>
              <button
                type="button"
                className="secondary-action"
                onClick={() => setIsAborting(false)}
              >
                Dismiss
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Detail Grid */}
      <div className="detail-grid">
        <section className="panel" aria-label="Route and operational information">
          <h2>Route & Purpose</h2>
          <dl className="property-list">
            <div>
              <dt>Origin</dt>
              <dd data-testid="trip-origin">{trip.origin}</dd>
            </div>
            <div>
              <dt>Destination</dt>
              <dd data-testid="trip-destination">{trip.destination}</dd>
            </div>
            {trip.purpose ? (
              <div>
                <dt>Purpose</dt>
                <dd data-testid="trip-purpose">{trip.purpose}</dd>
              </div>
            ) : null}
            {trip.cancelReason ? (
              <div>
                <dt>Cancellation Reason</dt>
                <dd style={{ color: '#b91c1c' }} data-testid="trip-cancel-reason">
                  {trip.cancelReason}
                </dd>
              </div>
            ) : null}
            {trip.abortReason ? (
              <div>
                <dt>Abort Reason</dt>
                <dd style={{ color: '#b91c1c' }} data-testid="trip-abort-reason">
                  {trip.abortReason}
                </dd>
              </div>
            ) : null}
            {trip.notes ? (
              <div>
                <dt>Operational Notes</dt>
                <dd data-testid="trip-notes">{trip.notes}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="panel" aria-label="Assigned resources">
          <h2>Resources</h2>
          <dl className="property-list">
            <div>
              <dt>Administrative Assignment</dt>
              <dd>
                <Link
                  href={`/assignments/${trip.assignmentId}`}
                  className="table-link"
                  data-testid="trip-assignment-link"
                >
                  {trip.assignmentId.slice(0, 8)}... ({trip.assignment?.status ?? 'VIEW'})
                </Link>
              </dd>
            </div>
            <div>
              <dt>Vehicle</dt>
              <dd>
                {trip.vehicle ? (
                  <Link
                    href={`/vehicles/${trip.vehicle.id}`}
                    className="table-link"
                    data-testid="trip-vehicle-link"
                  >
                    {trip.vehicle.displayId} ({trip.vehicle.registration}) &bull;{' '}
                    {trip.vehicle.model}
                  </Link>
                ) : (
                  trip.vehicleId
                )}
              </dd>
            </div>
            <div>
              <dt>Driver</dt>
              <dd>
                {trip.driver ? (
                  <Link
                    href={`/drivers/${trip.driver.id}`}
                    className="table-link"
                    data-testid="trip-driver-link"
                  >
                    {trip.driver.displayId} ({trip.driver.firstName} {trip.driver.lastName})
                  </Link>
                ) : (
                  trip.driverId
                )}
              </dd>
            </div>
          </dl>
        </section>

        <section className="panel" aria-label="Odometer and telemetry">
          <h2>Odometer & Mileage</h2>
          <dl className="property-list">
            <div>
              <dt>Start Odometer</dt>
              <dd data-testid="trip-start-odo">
                {trip.startOdometerKm !== null && trip.startOdometerKm !== undefined
                  ? `${trip.startOdometerKm} km`
                  : 'Pending departure'}
              </dd>
            </div>
            <div>
              <dt>End Odometer</dt>
              <dd data-testid="trip-end-odo">
                {trip.endOdometerKm !== null && trip.endOdometerKm !== undefined
                  ? `${trip.endOdometerKm} km`
                  : 'Pending completion'}
              </dd>
            </div>
            <div>
              <dt>Distance Travelled</dt>
              <dd data-testid="trip-distance">
                {trip.distanceKm !== null && trip.distanceKm !== undefined
                  ? `${trip.distanceKm} km`
                  : '&mdash;'}
              </dd>
            </div>
            <div>
              <dt>Current Vehicle Odometer</dt>
              <dd>{trip.vehicle?.odometerKm ?? 0} km</dd>
            </div>
          </dl>
        </section>

        <section className="panel" aria-label="Schedule and timestamps">
          <h2>Schedule & Timing</h2>
          <dl className="property-list">
            {trip.plannedStartAt ? (
              <div>
                <dt>Planned Departure</dt>
                <dd>{new Date(trip.plannedStartAt).toLocaleString()}</dd>
              </div>
            ) : null}
            {trip.plannedEndAt ? (
              <div>
                <dt>Planned Return</dt>
                <dd>{new Date(trip.plannedEndAt).toLocaleString()}</dd>
              </div>
            ) : null}
            <div>
              <dt>Actual Departure</dt>
              <dd data-testid="trip-actual-start">
                {trip.actualStartAt ? new Date(trip.actualStartAt).toLocaleString() : '&mdash;'}
              </dd>
            </div>
            <div>
              <dt>Actual Arrival</dt>
              <dd data-testid="trip-actual-end">
                {trip.actualEndAt ? new Date(trip.actualEndAt).toLocaleString() : '&mdash;'}
              </dd>
            </div>
            <div>
              <dt>Record Version</dt>
              <dd data-testid="trip-version">{trip.version}</dd>
            </div>
          </dl>
        </section>
      </div>

      {/* Status History Section */}
      <section
        className="panel"
        aria-label="Lifecycle Status History"
        style={{ marginTop: '2rem' }}
      >
        <h2>Lifecycle Status History</h2>
        {history.length === 0 ? (
          <p className="loading-state">No status transitions recorded yet.</p>
        ) : (
          <table className="data-table" data-testid="trip-history-table">
            <thead>
              <tr>
                <th scope="col">From Status</th>
                <th scope="col">To Status</th>
                <th scope="col">Reason / Notes</th>
                <th scope="col">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr key={entry.id} data-testid={`history-entry-${entry.id}`}>
                  <td>{entry.fromStatus ?? 'INITIAL'}</td>
                  <td>
                    <strong>{entry.toStatus}</strong>
                  </td>
                  <td>{entry.reason ?? '&mdash;'}</td>
                  <td>{new Date(entry.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Trip Inspections Section */}
      <section className="panel" aria-label="Trip Inspections" style={{ marginTop: '2rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <h2>Trip Inspections ({inspections.length})</h2>
          <Link
            href={`/inspections/new?tripId=${trip.id}&vehicleId=${trip.vehicleId}`}
            className="secondary-action"
            data-testid="add-trip-inspection-link"
            style={{ textDecoration: 'none', fontSize: '0.875rem' }}
          >
            + Add Inspection
          </Link>
        </div>

        {inspections.length === 0 ? (
          <p className="loading-state">No inspections recorded for this trip.</p>
        ) : (
          <table className="data-table" data-testid="trip-inspections-table">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Type</th>
                <th scope="col">Template</th>
                <th scope="col">Status</th>
                <th scope="col">Result</th>
                <th scope="col">Created At</th>
              </tr>
            </thead>
            <tbody>
              {inspections.map((i) => (
                <tr key={i.id} data-testid={`trip-inspection-row-${i.id}`}>
                  <td>
                    <Link
                      href={`/inspections/${i.id}`}
                      className="table-link"
                      data-testid={`trip-inspection-link-${i.id}`}
                    >
                      {i.displayId}
                    </Link>
                  </td>
                  <td>{i.type}</td>
                  <td>{i.template?.name ?? '—'}</td>
                  <td>{i.status}</td>
                  <td>
                    {i.result ? (
                      <span
                        style={{
                          fontWeight: 600,
                          color: i.result === 'PASS' ? '#166534' : '#991b1b',
                        }}
                      >
                        {i.result}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{new Date(i.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Trip Inspections Section */}
      <section
        className="panel"
        aria-label="Trip Inspections"
        style={{ marginTop: '2rem' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2>Trip Inspections ({inspections.length})</h2>
          <Link
            href={`/inspections/new?tripId=${trip.id}&vehicleId=${trip.vehicleId}`}
            className="secondary-action"
            data-testid="add-trip-inspection-link"
            style={{ textDecoration: 'none', fontSize: '0.875rem' }}
          >
            + Add Inspection
          </Link>
        </div>

        {inspections.length === 0 ? (
          <p className="loading-state">No inspections recorded for this trip.</p>
        ) : (
          <table className="data-table" data-testid="trip-inspections-table">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Type</th>
                <th scope="col">Template</th>
                <th scope="col">Status</th>
                <th scope="col">Result</th>
                <th scope="col">Created At</th>
              </tr>
            </thead>
            <tbody>
              {inspections.map((i) => (
                <tr key={i.id} data-testid={`trip-inspection-row-${i.id}`}>
                  <td>
                    <Link href={`/inspections/${i.id}`} className="table-link" data-testid={`trip-inspection-link-${i.id}`}>
                      {i.displayId}
                    </Link>
                  </td>
                  <td>{i.type}</td>
                  <td>{i.template?.name ?? '—'}</td>
                  <td>{i.status}</td>
                  <td>
                    {i.result ? (
                      <span style={{ fontWeight: 600, color: i.result === 'PASS' ? '#166534' : '#991b1b' }}>
                        {i.result}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{new Date(i.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
