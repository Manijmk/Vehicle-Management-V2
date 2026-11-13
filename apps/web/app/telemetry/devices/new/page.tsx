'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TenantHeader } from '../../../../components/tenant-header';
import { telemetryApi } from '../../../../lib/api-client';

export default function NewTelemetryDevicePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !identifier.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await telemetryApi.createDevice({
        name: name.trim(),
        identifier: identifier.trim(),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      router.push('/telemetry/devices');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register device');
      setSubmitting(false);
    }
  };

  return (
    <div>
      <TenantHeader />
      <main style={{ padding: '2rem', maxWidth: '36rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
          <Link href="/telemetry/devices" style={{ color: '#6b7280', textDecoration: 'none' }}>
            ← Devices
          </Link>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Register New Device</h1>
        </div>

        {error && (
          <div
            role="alert"
            data-testid="new-device-error"
            style={{
              padding: '1rem',
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: 6,
              marginBottom: '1rem',
              color: '#dc2626',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} data-testid="new-device-form">
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="device-name"
              style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}
            >
              Device Name <span aria-hidden>*</span>
            </label>
            <input
              id="device-name"
              data-testid="device-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              placeholder="e.g. GPS Tracker Fleet-01"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: '0.95rem',
              }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="device-identifier"
              style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}
            >
              Device Identifier (IMEI/Serial) <span aria-hidden>*</span>
            </label>
            <input
              id="device-identifier"
              data-testid="device-identifier-input"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              maxLength={100}
              placeholder="e.g. IMEI-864209876543210"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: '0.95rem',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label
              htmlFor="device-notes"
              style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}
            >
              Notes (optional)
            </label>
            <textarea
              id="device-notes"
              data-testid="device-notes-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="e.g. Installed under dashboard"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: '0.95rem',
                resize: 'vertical',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              type="submit"
              data-testid="new-device-submit"
              disabled={submitting || !name.trim() || !identifier.trim()}
              style={{
                padding: '0.6rem 1.5rem',
                background: submitting ? '#9ca3af' : '#1a56db',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Registering…' : 'Register Device'}
            </button>
            <Link
              href="/telemetry/devices"
              style={{
                padding: '0.6rem 1.5rem',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              Cancel
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
