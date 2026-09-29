'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import {
  ApiClientError,
  assignmentApi,
  driverApi,
  vehicleApi,
  type CreateAssignmentInput,
  type DriverRecord,
  type VehicleRecord,
} from '../../../lib/api-client';

function CreateAssignmentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const preselectedVehicleId = searchParams.get('vehicleId') ?? '';
  const preselectedDriverId = searchParams.get('driverId') ?? '';

  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [vehicleId, setVehicleId] = useState(preselectedVehicleId);
  const [driverId, setDriverId] = useState(preselectedDriverId);
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCandidates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [vRes, dRes] = await Promise.all([
        vehicleApi.fetchVehicles(),
        driverApi.fetchDrivers({ status: 'ACTIVE', limit: 100 }),
      ]);
      const activeVehicles = vRes.filter((v) => v.status === 'ACTIVE');
      setVehicles(activeVehicles);
      setDrivers(dRes.items);

      if (!vehicleId && activeVehicles.length > 0 && !preselectedVehicleId) {
        setVehicleId(activeVehicles[0]?.id ?? '');
      }
      if (!driverId && dRes.items.length > 0 && !preselectedDriverId) {
        setDriverId(dRes.items[0]?.id ?? '');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fleet data');
    } finally {
      setLoading(false);
    }
  }, [preselectedVehicleId, preselectedDriverId, vehicleId, driverId]);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!vehicleId || !driverId) {
      setError('Please select both a vehicle and a driver.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const payload: CreateAssignmentInput = {
        vehicleId,
        driverId,
      };
      if (notes.trim()) {
        payload.notes = notes.trim();
      }
      const assignment = await assignmentApi.createAssignment(payload);
      router.push(`/assignments/${assignment.id}`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'VEHICLE_ALREADY_ASSIGNED') {
          setError('Selected vehicle already has an active assignment.');
        } else if (err.code === 'DRIVER_ALREADY_ASSIGNED') {
          setError('Selected driver already has an active assignment.');
        } else if (err.code === 'DRIVER_NOT_ELIGIBLE') {
          setError(
            'Selected driver is not operationally eligible (must have a valid, unexpired license).',
          );
        } else if (err.code === 'VEHICLE_NOT_ACTIVE') {
          setError('Only active vehicles can be assigned.');
        } else if (err.code === 'DRIVER_NOT_ACTIVE') {
          setError('Only active drivers can be assigned.');
        } else {
          setError(err.message || 'Failed to create assignment');
        }
      } else {
        setError(err instanceof Error ? err.message : 'Failed to create assignment');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const selectedDriver = drivers.find((d) => d.id === driverId);
  const isDriverEligible = selectedDriver?.eligible ?? false;

  return (
    <main className="vehicle-page narrow">
      <TenantHeader onAuthChange={() => void loadCandidates()} />

      <div className="page-header">
        <div>
          <p className="eyebrow">Fleet operations</p>
          <h1>Create assignment</h1>
        </div>
        <Link href="/assignments" className="secondary-action" data-testid="cancel-button">
          Back to assignments
        </Link>
      </div>

      {error ? (
        <div className="action-error" data-testid="action-error-banner">
          {error}
        </div>
      ) : null}

      <section className="panel" aria-label="Assignment form section">
        {loading ? (
          <p className="loading-state">Loading active fleet candidates...</p>
        ) : (
          <form onSubmit={handleSubmit} className="form-grid" data-testid="create-assignment-form">
            <label>
              Select Active Vehicle *
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                data-testid="vehicle-select"
                required
              >
                <option value="">-- Choose active vehicle --</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.displayId} - {v.model} ({v.registration})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Select Active Driver *
              <select
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                data-testid="driver-select"
                required
              >
                <option value="">-- Choose active driver --</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.firstName} {d.lastName} ({d.displayId})
                    {d.eligible ? ' [Eligible]' : ' [Ineligible]'}
                  </option>
                ))}
              </select>
            </label>

            {selectedDriver && !isDriverEligible ? (
              <div className="warning-banner" data-testid="driver-eligibility-warning">
                <strong>Warning:</strong> Selected driver does not currently have a valid unexpired license. Assignment creation will be rejected.
              </div>
            ) : null}

            <label>
              Assignment Notes
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Operational purpose, shift schedule, or vehicle handoff notes"
                rows={3}
                data-testid="notes-input"
              />
            </label>

            <div className="form-actions">
              <button
                type="submit"
                className="primary-action"
                disabled={submitting}
                data-testid="submit-assignment-button"
              >
                {submitting ? 'Assigning...' : 'Create assignment'}
              </button>
              <Link href="/assignments" className="secondary-action">
                Cancel
              </Link>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}

export default function CreateAssignmentPage() {
  return (
    <Suspense fallback={<p className="loading-state">Loading page...</p>}>
      <CreateAssignmentContent />
    </Suspense>
  );
}
