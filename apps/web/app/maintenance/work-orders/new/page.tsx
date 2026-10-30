'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TenantHeader } from '../../../../components/tenant-header';
import {
  maintenanceApi,
  vehicleApi,
  type MaintenancePriority,
  type MaintenanceVendorRecord,
  type VehicleRecord,
} from '../../../../lib/api-client';

export default function NewMaintenanceWorkOrderPage() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [vendors, setVendors] = useState<MaintenanceVendorRecord[]>([]);

  const [vehicleId, setVehicleId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<MaintenancePriority>('NORMAL');
  const [blocksOperation, setBlocksOperation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      vehicleApi.fetchVehicles(),
      maintenanceApi.fetchVendors({ status: 'ACTIVE', limit: 100 }),
    ]).then(([vRes, vendRes]) => {
      setVehicles(vRes);
      setVendors(vendRes.items);
      if (vRes.length > 0 && vRes[0]) {
        setVehicleId(vRes[0].id);
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleId || !title.trim()) {
      setError('Please select a vehicle and enter a title.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const wo = await maintenanceApi.createWorkOrder({
        vehicleId,
        vendorId: vendorId || undefined,
        title: title.trim(),
        description: description.trim() ? description.trim() : undefined,
        priority,
        blocksOperation,
      });
      router.push(`/maintenance/work-orders/${wo.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create work order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
      <TenantHeader />

      <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <Link
          href="/maintenance/work-orders"
          style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.875rem' }}
        >
          &larr; Back to Work Orders
        </Link>
        <h1 style={{ margin: '0.5rem 0 0 0', fontSize: '1.75rem', fontWeight: 600 }}>
          Create Work Order
        </h1>
        <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280' }}>
          Initiate a new repair or scheduled service for a vehicle
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
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            marginBottom: '1.25rem',
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
              Repair Vendor / Facility
            </label>
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              data-testid="input-vendor"
            >
              <option value="">Internal Fleet Depot (No external vendor)</option>
              {vendors.map((vend) => (
                <option key={vend.id} value={vend.id}>
                  {vend.name} ({vend.displayId})
                </option>
              ))}
            </select>
          </div>
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
            Work Order Title *
          </label>
          <input
            type="text"
            placeholder="e.g. 50,000 km Scheduled Service & Brake Inspection"
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
            Work Scope / Instructions
          </label>
          <textarea
            placeholder="Detailed scope of repairs, customer symptoms, or parts required..."
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
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => {
                const val = e.target.value as MaintenancePriority;
                setPriority(val);
                if (val === 'CRITICAL') setBlocksOperation(true);
              }}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              data-testid="input-priority"
            >
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
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
              <span>Block vehicle operations (prohibits trip dispatch)</span>
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <Link
            href="/maintenance/work-orders"
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
            data-testid="btn-submit-work-order"
          >
            {loading ? 'Creating...' : 'Create Draft Work Order'}
          </button>
        </div>
      </form>
    </div>
  );
}
