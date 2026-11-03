'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import {
  driverApi,
  incidentApi,
  tripApi,
  vehicleApi,
  type DriverRecord,
  type IncidentOperationalImpact,
  type IncidentSeverity,
  type IncidentType,
  type TripRecord,
  type VehicleRecord,
} from '../../../lib/api-client';

export default function NewIncidentPage() {
  const router = useRouter();

  // Form fields
  const [type, setType] = useState<IncidentType>('ACCIDENT');
  const [severity, setSeverity] = useState<IncidentSeverity>('HIGH');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => {
    const now = new Date();
    // format as YYYY-MM-DDTHH:MM
    return now.toISOString().slice(0, 16);
  });
  const [locationText, setLocationText] = useState('');
  const [operationalImpact, setOperationalImpact] = useState<IncidentOperationalImpact>('NONE');

  // Associations
  const [associationMode, setAssociationMode] = useState<'standalone' | 'trip'>('standalone');
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [tripId, setTripId] = useState('');

  // Dropdown lists
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [trips, setTrips] = useState<TripRecord[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadOptions() {
      try {
        const [vehs, drvs, trps] = await Promise.all([
          vehicleApi.fetchVehicles().catch(() => []),
          driverApi
            .fetchDrivers()
            .then((r) => r.items)
            .catch(() => []),
          tripApi
            .fetchTrips()
            .then((r) => r.items)
            .catch(() => []),
        ]);
        setVehicles(vehs);
        setDrivers(drvs);
        setTrips(trps);
      } catch {
        // ignore option load errors
      }
    }
    void loadOptions();
  }, []);

  const handleTripChange = (selectedTripId: string) => {
    setTripId(selectedTripId);
    if (!selectedTripId) {
      setVehicleId('');
      setDriverId('');
      return;
    }
    const foundTrip = trips.find((t) => t.id === selectedTripId);
    if (foundTrip) {
      setVehicleId(foundTrip.vehicleId);
      setDriverId(foundTrip.driverId);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!title.trim() || title.trim().length < 3) {
      setError('Title must be at least 3 characters.');
      return;
    }
    if (!description.trim() || description.trim().length < 3) {
      setError('Description must be at least 3 characters.');
      return;
    }
    if (associationMode === 'trip' && !tripId) {
      setError('Please select a trip or switch to Standalone mode.');
      return;
    }
    if (associationMode === 'standalone' && !vehicleId && !driverId) {
      setError('At least one subject (Vehicle or Driver) is required for an incident report.');
      return;
    }
    if (operationalImpact === 'VEHICLE' && !vehicleId) {
      setError('Vehicle must be specified when operational impact affects Vehicle.');
      return;
    }
    if (operationalImpact === 'DRIVER' && !driverId) {
      setError('Driver must be specified when operational impact affects Driver.');
      return;
    }
    if (operationalImpact === 'BOTH' && (!vehicleId || !driverId)) {
      setError('Both Vehicle and Driver must be specified when operational impact affects Both.');
      return;
    }

    try {
      setLoading(true);
      const payload = {
        type,
        severity,
        title: title.trim(),
        description: description.trim(),
        occurredAt: new Date(occurredAt).toISOString(),
        locationText: locationText.trim() || undefined,
        operationalImpact,
        ...(associationMode === 'trip' && tripId ? { tripId } : {}),
        ...(vehicleId ? { vehicleId } : {}),
        ...(driverId ? { driverId } : {}),
      };

      const res = await incidentApi.createIncident(payload);
      router.push(`/incidents/${res.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create incident report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1.5rem' }}>
      <TenantHeader />

      <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <Link
          href="/incidents"
          style={{ color: '#4b5563', textDecoration: 'none', fontSize: '0.875rem' }}
        >
          &larr; Back to Incidents
        </Link>
        <h1
          style={{ fontSize: '1.875rem', fontWeight: 700, margin: '0.5rem 0 0 0' }}
          data-testid="new-incident-title"
        >
          Report New Incident
        </h1>
        <p style={{ color: '#4b5563', margin: '0.25rem 0 0 0' }}>
          Record safety occurrences, collisions, breakdowns, and traffic violations with optional
          dispatch operational gating.
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: '#fee2e2',
            color: '#b91c1c',
            borderRadius: '6px',
            marginBottom: '1rem',
          }}
          data-testid="form-error"
        >
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1.5rem',
        }}
        data-testid="new-incident-form"
      >
        {/* Type & Severity */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            marginBottom: '1rem',
          }}
        >
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
              Incident Type *
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as IncidentType)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              data-testid="input-type"
            >
              <option value="ACCIDENT">Accident / Collision</option>
              <option value="BREAKDOWN">Breakdown / Mechanical Failure</option>
              <option value="VIOLATION">Traffic / Safety Violation</option>
              <option value="DAMAGE">Vehicle Damage</option>
              <option value="THEFT">Theft / Break-in</option>
              <option value="SAFETY">Safety Hazard / Near Miss</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
              Severity Level *
            </label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              data-testid="input-severity"
            >
              <option value="LOW">Low (Minor cosmetic / informational)</option>
              <option value="MEDIUM">Medium (Moderate damage / minor delay)</option>
              <option value="HIGH">High (Substantial damage / safety concern)</option>
              <option value="CRITICAL">
                Critical (Severe accident / disablement / injury hazard)
              </option>
            </select>
          </div>
        </div>

        {/* Title */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
            Incident Title *
          </label>
          <input
            type="text"
            required
            placeholder="Brief summary of the incident"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
            }}
            data-testid="input-title"
          />
        </div>

        {/* Narrative Description */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
            Detailed Narrative Description *
          </label>
          <textarea
            required
            rows={4}
            placeholder="Describe what occurred, environmental factors, parties involved, visible damage, etc."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
            }}
            data-testid="input-description"
          />
        </div>

        {/* Occurred At & Location */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            marginBottom: '1rem',
          }}
        >
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
              Date & Time Occurred *
            </label>
            <input
              type="datetime-local"
              required
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              data-testid="input-occurred-at"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
              Location / Cross Streets
            </label>
            <input
              type="text"
              placeholder="e.g. Highway 101 Northbound near Exit 42"
              value={locationText}
              onChange={(e) => setLocationText(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              data-testid="input-location"
            />
          </div>
        </div>

        {/* Operational Gating Impact */}
        <div
          style={{
            marginBottom: '1.5rem',
            padding: '1rem',
            background: '#fef3c7',
            borderRadius: '6px',
            border: '1px solid #fde68a',
          }}
        >
          <label
            style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem', color: '#92400e' }}
          >
            Operational Dispatch Impact (Gating)
          </label>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8125rem', color: '#78350f' }}>
            Controls whether trips for the subject vehicle or driver will be blocked from becoming
            READY or STARTING until this incident is RESOLVED or CANCELLED.
          </p>
          <select
            value={operationalImpact}
            onChange={(e) => setOperationalImpact(e.target.value as IncidentOperationalImpact)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #fcd34d',
              borderRadius: '6px',
              background: '#fff',
            }}
            data-testid="input-operational-impact"
          >
            <option value="NONE">NONE — Informational (No dispatch blocking)</option>
            <option value="VEHICLE">VEHICLE — Block vehicle from READY/START</option>
            <option value="DRIVER">DRIVER — Block driver from READY/START</option>
            <option value="BOTH">BOTH — Block both vehicle and driver from READY/START</option>
          </select>
        </div>

        {/* Associations */}
        <div
          style={{
            marginBottom: '1.5rem',
            padding: '1rem',
            background: '#f9fafb',
            borderRadius: '6px',
            border: '1px solid #e5e7eb',
          }}
        >
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>
            Subject Association Mode
          </label>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="associationMode"
                value="standalone"
                checked={associationMode === 'standalone'}
                onChange={() => setAssociationMode('standalone')}
                data-testid="mode-standalone"
              />
              Standalone Vehicle / Driver
            </label>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="associationMode"
                value="trip"
                checked={associationMode === 'trip'}
                onChange={() => setAssociationMode('trip')}
                data-testid="mode-trip"
              />
              Trip-Linked Incident
            </label>
          </div>

          {associationMode === 'trip' ? (
            <div>
              <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.25rem' }}>
                Select Active Trip *
              </label>
              <select
                value={tripId}
                onChange={(e) => handleTripChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                }}
                data-testid="input-trip-id"
              >
                <option value="">-- Choose Trip --</option>
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.displayId} ({t.origin} &rarr; {t.destination}) [{t.status}]
                  </option>
                ))}
              </select>
              {tripId && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: '#4b5563' }}>
                  Auto-associated vehicle and driver from trip.
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.25rem' }}>
                  Vehicle (Optional if Driver provided)
                </label>
                <select
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                  }}
                  data-testid="input-vehicle-id"
                >
                  <option value="">-- None --</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.displayId} ({v.registration} - {v.model})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.25rem' }}>
                  Driver (Optional if Vehicle provided)
                </label>
                <select
                  value={driverId}
                  onChange={(e) => setDriverId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                  }}
                  data-testid="input-driver-id"
                >
                  <option value="">-- None --</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.displayId} ({d.firstName} {d.lastName})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Form Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <Link
            href="/incidents"
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              textDecoration: 'none',
              color: '#374151',
            }}
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '0.5rem 1.25rem',
              background: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
            data-testid="submit-incident-btn"
          >
            {loading ? 'Submitting...' : 'Submit Incident Report'}
          </button>
        </div>
      </form>
    </div>
  );
}
