'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TenantHeader } from '../../../../components/tenant-header';
import {
  maintenanceApi,
  vehicleApi,
  type MaintenancePriority,
  type VehicleRecord,
} from '../../../../lib/api-client';

export default function NewMaintenanceRequestPage() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<MaintenancePriority>('NORMAL');
  const [blocksOperation, setBlocksOperation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void vehicleApi.fetchVehicles().then((res) => {
      setVehicles(res);
      if (res.length > 0 && res[0]) {
        setVehicleId(res[0].id);
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleId || !title.trim()) {
      setError('Please select a vehicle and provide a defect title.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const req = await maintenanceApi.createRequest({
        vehicleId,
        title: title.trim(),
        description: description.trim() ? description.trim() : undefined,
        priority,
        blocksOperation,
      });
      router.push(`/maintenance/requests/${req.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
      <TenantHeader />

      <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <Link
          href="/maintenance/requests"
          style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.875rem' }}
        >
          &larr; Back to Requests
        </Link>
        <h1 style={{ margin: '0.5rem 0 0 0', fontSize: '1.75rem', fontWeight: 600 }}>
          Create Maintenance Request
        </h1>
        <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280' }}>
          Report a mechanical issue, wear concern, or safety defect for a fleet vehicle
        </p>
      </div>

      {error && (
        <div
          style={{
            background: '#fee2e2',
            border: '1px solid #ef4444',
            color: '#b91c1c',
            padding: '1rem',
            borderRadius: '6px',
            marginBottom: '1.5rem',
          }}
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
      >
        <div style={{ marginBottom: '1.25rem' }}>
          <label
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#374151',
              marginBottom: '0.5rem',
            }}
          >
            Vehicle *
          </label>
          <select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
            }}
            data-testid="input-vehicle"
            required
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.displayId} — {v.model} ({v.registration})
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <label
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#374151',
              marginBottom: '0.5rem',
            }}
          >
            Issue Title *
          </label>
          <input
            type="text"
            placeholder="e.g. Unusual grinding noise on front right brake"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
            }}
            data-testid="input-title"
            required
          />
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <label
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#374151',
              marginBottom: '0.5rem',
            }}
          >
            Detailed Description
          </label>
          <textarea
            placeholder="Describe symptoms, operating conditions, or technician notes..."
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
            }}
            data-testid="input-description"
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#374151',
                marginBottom: '0.5rem',
              }}
            >
              Priority Level
            </label>
            <select
              value={priority}
              onChange={(e) => {
                const val = e.target.value as MaintenancePriority;
                setPriority(val);
                if (val === 'CRITICAL') {
                  setBlocksOperation(true);
                }
              }}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              data-testid="input-priority"
            >
              <option value="LOW">Low (Cosmetic / Minor)</option>
              <option value="NORMAL">Normal (Routine Wear)</option>
              <option value="HIGH">High (Urgent Repair)</option>
              <option value="CRITICAL">Critical (Immediate Safety Hazard)</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                fontWeight: 500,
                color: '#374151',
                marginTop: '1.25rem',
              }}
            >
              <input
                type="checkbox"
                checked={blocksOperation}
                onChange={(e) => setBlocksOperation(e.target.checked)}
                data-testid="input-blocks-operation"
                style={{ width: '1.1rem', height: '1.1rem' }}
              />
              <span>Block vehicle operations (prohibits dispatch)</span>
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <Link
            href="/maintenance/requests"
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              color: '#4b5563',
              textDecoration: 'none',
            }}
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '0.5rem 1.5rem',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            data-testid="btn-submit-request"
          >
            {loading ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </form>
    </div>
  );
}
