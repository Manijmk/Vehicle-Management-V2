'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, Suspense } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import {
  api,
  vehicleApi,
  type InspectionTemplateRecord,
  type InspectionType,
  type VehicleRecord,
} from '../../../lib/api-client';

function NewInspectionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const defaultType = (searchParams.get('type') as InspectionType) || 'PRE_TRIP';
  const defaultVehicleId = searchParams.get('vehicleId') || '';
  const defaultTripId = searchParams.get('tripId') || '';

  const [type, setType] = useState<InspectionType>(defaultType);
  const [templateId, setTemplateId] = useState('');
  const [vehicleId, setVehicleId] = useState(defaultVehicleId);
  const [tripId, setTripId] = useState(defaultTripId);
  const [notes, setNotes] = useState('');

  const [templates, setTemplates] = useState<InspectionTemplateRecord[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [tmplRes, vRes] = await Promise.all([
        api.fetchInspectionTemplates(undefined, 'ACTIVE', 100),
        vehicleApi.fetchVehicles(),
      ]);
      setTemplates(tmplRes.items);
      setVehicles(vRes.filter((v: VehicleRecord) => v.status === 'ACTIVE'));

      // If matching template exists, auto-select
      const matching = tmplRes.items.find(
        (t: InspectionTemplateRecord) => t.type === type && t.status === 'ACTIVE',
      );
      const firstTmpl = tmplRes.items[0];
      if (matching) {
        setTemplateId(matching.id);
      } else if (firstTmpl) {
        setTemplateId(firstTmpl.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load options');
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // When type changes, try to switch to matching template
  const handleTypeChange = (newType: InspectionType) => {
    setType(newType);
    const matching = templates.find((t) => t.type === newType && t.status === 'ACTIVE');
    if (matching) {
      setTemplateId(matching.id);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateId) {
      setError('Please select an active inspection template');
      return;
    }
    if (!vehicleId) {
      setError('Please select a vehicle');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const created = await api.createInspection({
        templateId,
        type,
        vehicleId,
        tripId: tripId.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      router.push(`/inspections/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create inspection');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link
          href="/inspections"
          style={{ color: '#1a56db', textDecoration: 'none', fontSize: '0.875rem' }}
        >
          ← Back to Inspections
        </Link>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 600, marginTop: '0.5rem' }}>
          Start New Inspection
        </h1>
        <p style={{ color: '#64748b', marginTop: '0.25rem' }}>
          Create an inspection checklist session for a vehicle or trip.
        </p>
      </div>

      {error && (
        <div
          className="error-banner"
          data-testid="error-banner"
          style={{
            background: '#fef2f2',
            border: '1px solid #f87171',
            color: '#991b1b',
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            marginBottom: '1rem',
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
          Loading active templates and fleet data...
        </div>
      ) : templates.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '2.5rem',
            background: '#fff',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
          }}
        >
          <h3>No Active Templates Available</h3>
          <p style={{ color: '#64748b', marginTop: '0.5rem' }}>
            You must have at least one ACTIVE template to create an inspection.
          </p>
          <Link
            href="/inspection-templates"
            style={{
              display: 'inline-block',
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              background: '#1a56db',
              color: '#fff',
              borderRadius: '4px',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Manage Templates
          </Link>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          style={{
            background: '#fff',
            padding: '1.5rem',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                marginBottom: '0.25rem',
              }}
            >
              Inspection Type *
            </label>
            <select
              value={type}
              onChange={(e) => handleTypeChange(e.target.value as InspectionType)}
              data-testid="inspection-type-select"
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
              }}
            >
              <option value="PRE_TRIP">Pre-Trip Inspection</option>
              <option value="POST_TRIP">Post-Trip Inspection</option>
              <option value="PERIODIC">Periodic Safety Audit</option>
              <option value="SAFETY">Walkaround Safety Check</option>
              <option value="CUSTOM">Custom Inspection</option>
            </select>
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                marginBottom: '0.25rem',
              }}
            >
              Checklist Template *
            </label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              data-testid="inspection-template-select"
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
              }}
              required
            >
              <option value="">Select an active template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.type})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                marginBottom: '0.25rem',
              }}
            >
              Vehicle *
            </label>
            <select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              data-testid="inspection-vehicle-select"
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
              }}
              required
            >
              <option value="">Select an active vehicle</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.displayId} — {v.registration} ({v.model})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                marginBottom: '0.25rem',
              }}
            >
              Trip ID (Optional / Auto-linked)
            </label>
            <input
              type="text"
              value={tripId}
              onChange={(e) => setTripId(e.target.value)}
              placeholder="UUID of associated trip (if pre-trip or post-trip)"
              data-testid="inspection-trip-id-input"
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                marginBottom: '0.25rem',
              }}
            >
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes or remarks before starting..."
              data-testid="inspection-notes-input"
              rows={3}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              gap: '1rem',
              justifyContent: 'flex-end',
              marginTop: '0.5rem',
            }}
          >
            <Link
              href="/inspections"
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
                textDecoration: 'none',
                color: '#334155',
              }}
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              data-testid="submit-inspection-button"
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: '4px',
                background: '#1a56db',
                color: '#fff',
                border: 'none',
                fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Creating...' : 'Create Inspection'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function NewInspectionPage() {
  return (
    <main className="vehicle-page">
      <TenantHeader />
      <Suspense fallback={<div style={{ textAlign: 'center', padding: '2rem' }}>Loading...</div>}>
        <NewInspectionContent />
      </Suspense>
    </main>
  );
}
