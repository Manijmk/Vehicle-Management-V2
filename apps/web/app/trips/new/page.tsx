'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import {
  ApiClientError,
  assignmentApi,
  tripApi,
  type CreateTripInput,
  type VehicleDriverAssignmentRecord,
} from '../../../lib/api-client';

function CreateTripContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const preselectedAssignmentId = searchParams.get('assignmentId') ?? '';

  const [assignments, setAssignments] = useState<VehicleDriverAssignmentRecord[]>([]);
  const [assignmentId, setAssignmentId] = useState(preselectedAssignmentId);
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [purpose, setPurpose] = useState('');
  const [plannedStartAt, setPlannedStartAt] = useState('');
  const [plannedEndAt, setPlannedEndAt] = useState('');
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAssignments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await assignmentApi.fetchAssignments({ status: 'ACTIVE', limit: 100 });
      setAssignments(res.items);

      if (!assignmentId && res.items.length > 0 && !preselectedAssignmentId) {
        setAssignmentId(res.items[0]?.id ?? '');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load active assignments');
    } finally {
      setLoading(false);
    }
  }, [preselectedAssignmentId, assignmentId]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!assignmentId) {
      setError('Please select an active vehicle-driver assignment.');
      return;
    }
    if (!origin.trim() || !destination.trim()) {
      setError('Origin and destination are required.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const payload: CreateTripInput = {
        assignmentId,
        origin: origin.trim(),
        destination: destination.trim(),
      };
      if (purpose.trim()) payload.purpose = purpose.trim();
      if (plannedStartAt) payload.plannedStartAt = new Date(plannedStartAt).toISOString();
      if (plannedEndAt) payload.plannedEndAt = new Date(plannedEndAt).toISOString();
      if (notes.trim()) payload.notes = notes.trim();

      const trip = await tripApi.createTrip(payload);
      router.push(`/trips/${trip.id}`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'TRIP_ASSIGNMENT_NOT_ACTIVE') {
          setError('Selected assignment is not currently active.');
        } else if (err.code === 'TRIP_PLANNING_INVALID') {
          setError('Invalid planning window: planned end time must be after planned start time.');
        } else {
          setError(err.message || 'Failed to create trip');
        }
      } else {
        setError(err instanceof Error ? err.message : 'Failed to create trip');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const selectedAssignment = assignments.find((a) => a.id === assignmentId);

  return (
    <main className="vehicle-page narrow">
      <TenantHeader onAuthChange={() => void loadAssignments()} />

      <div className="breadcrumb">
        <Link href="/trips">&larr; Back to Trips</Link>
      </div>

      <div className="page-header">
        <div>
          <p className="eyebrow">Trip planning</p>
          <h1>Plan new trip</h1>
        </div>
      </div>

      {error ? (
        <div className="error-banner" role="alert" data-testid="error-banner">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="loading-state">Loading candidate assignments...</p>
      ) : assignments.length === 0 ? (
        <div className="empty-state" data-testid="no-assignments-message">
          <p>
            No active vehicle-driver assignments found. A trip requires an active administrative
            assignment pairing an eligible driver with an active vehicle.
          </p>
          <div style={{ marginTop: '1rem' }}>
            <Link href="/assignments/new" className="primary-action">
              Create an assignment first &rarr;
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="vehicle-form" data-testid="create-trip-form">
          <div className="form-group">
            <label htmlFor="assignmentId">Active Assignment *</label>
            <select
              id="assignmentId"
              value={assignmentId}
              onChange={(e) => setAssignmentId(e.target.value)}
              required
              data-testid="assignment-select"
            >
              {assignments.map((asn) => {
                const vDisplay = asn.vehicle
                  ? `${asn.vehicle.displayId} (${asn.vehicle.registration})`
                  : asn.vehicleId.slice(0, 8);
                const dDisplay = asn.driver
                  ? `${asn.driver.displayId} (${asn.driver.firstName} ${asn.driver.lastName})`
                  : asn.driverId.slice(0, 8);
                return (
                  <option key={asn.id} value={asn.id}>
                    {vDisplay} paired with {dDisplay}
                  </option>
                );
              })}
            </select>
          </div>

          {selectedAssignment ? (
            <div
              style={{
                background: 'var(--surface, #f8f9fa)',
                border: '1px solid var(--line, #e2e8f0)',
                borderRadius: '0.5rem',
                padding: '0.85rem 1.25rem',
                fontSize: '0.85rem',
                marginBottom: '1rem',
              }}
              data-testid="selected-assignment-summary"
            >
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Assignment Summary</div>
              <div>
                <strong>Vehicle:</strong> {selectedAssignment.vehicle?.displayId} (
                {selectedAssignment.vehicle?.registration}) &bull; Status:{' '}
                {selectedAssignment.vehicle?.status}
              </div>
              <div>
                <strong>Driver:</strong> {selectedAssignment.driver?.displayId} (
                {selectedAssignment.driver?.firstName} {selectedAssignment.driver?.lastName}) &bull;{' '}
                {selectedAssignment.driver?.eligible ? (
                  <span style={{ color: '#047857' }}>Eligible &bull; License Valid</span>
                ) : (
                  <span style={{ color: '#b91c1c' }}>Not eligible</span>
                )}
              </div>
            </div>
          ) : null}

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="origin">Origin *</label>
              <input
                id="origin"
                type="text"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="e.g. Central Depot, Terminal 4"
                maxLength={200}
                required
                data-testid="origin-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="destination">Destination *</label>
              <input
                id="destination"
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="e.g. Customer Warehouse, Site B"
                maxLength={200}
                required
                data-testid="destination-input"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="purpose">Purpose</label>
            <input
              id="purpose"
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Scheduled inventory delivery, parts pickup"
              maxLength={500}
              data-testid="purpose-input"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="plannedStartAt">Planned Departure</label>
              <input
                id="plannedStartAt"
                type="datetime-local"
                value={plannedStartAt}
                onChange={(e) => setPlannedStartAt(e.target.value)}
                data-testid="planned-start-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="plannedEndAt">Planned Return</label>
              <input
                id="plannedEndAt"
                type="datetime-local"
                value={plannedEndAt}
                onChange={(e) => setPlannedEndAt(e.target.value)}
                data-testid="planned-end-input"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Operational instructions, cargo details, or route instructions"
              maxLength={500}
              rows={3}
              data-testid="notes-input"
            />
          </div>

          <div className="form-actions">
            <button
              type="submit"
              className="primary-action"
              disabled={submitting}
              data-testid="submit-trip-btn"
            >
              {submitting ? 'Creating trip...' : 'Create Draft Trip'}
            </button>
            <Link href="/trips" className="secondary-action">
              Cancel
            </Link>
          </div>
        </form>
      )}
    </main>
  );
}

export default function CreateTripPage() {
  return (
    <Suspense
      fallback={
        <main className="vehicle-page narrow">
          <TenantHeader />
          <p className="loading-state">Loading trip planner...</p>
        </main>
      }
    >
      <CreateTripContent />
    </Suspense>
  );
}
