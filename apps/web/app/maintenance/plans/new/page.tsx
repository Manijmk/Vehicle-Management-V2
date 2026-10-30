'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TenantHeader } from '../../../../components/tenant-header';
import { maintenanceApi, type MaintenancePriority } from '../../../../lib/api-client';

export default function NewMaintenancePlanPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [intervalDays, setIntervalDays] = useState<number | ''>('');
  const [intervalOdometerKm, setIntervalOdometerKm] = useState<number | ''>('');
  const [defaultPriority, setDefaultPriority] = useState<MaintenancePriority>('NORMAL');
  const [blocksOperationWhenDue, setBlocksOperationWhenDue] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Plan name is required');
      return;
    }
    if (intervalDays === '' && intervalOdometerKm === '') {
      setError('At least one trigger interval (Days or Odometer Km) is required');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const plan = await maintenanceApi.createPlan({
        name: name.trim(),
        description: description.trim() ? description.trim() : undefined,
        intervalDays:
          typeof intervalDays === 'number' && intervalDays > 0 ? intervalDays : undefined,
        intervalOdometerKm:
          typeof intervalOdometerKm === 'number' && intervalOdometerKm > 0
            ? intervalOdometerKm
            : undefined,
        defaultPriority,
        blocksOperationWhenDue,
      });
      router.push(`/maintenance/plans/${plan.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create plan');
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
      <TenantHeader />

      <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <Link
          href="/maintenance/plans"
          style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.875rem' }}
        >
          &larr; Back to Preventive Plans
        </Link>
        <h1 style={{ margin: '0.5rem 0 0 0', fontSize: '1.75rem', fontWeight: 600 }}>
          Create Preventive Maintenance Plan
        </h1>
        <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280' }}>
          Define interval-based service schedules that apply across your fleet.
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
              fontWeight: 600,
              color: '#374151',
              marginBottom: '0.25rem',
            }}
          >
            Plan Name *
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., 10,000 km Oil & Filter Service"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
            }}
            data-testid="input-plan-name"
          />
        </div>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#374151',
              marginBottom: '0.25rem',
            }}
          >
            Description
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Details of checks and parts replaced during this service"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
            }}
            data-testid="input-plan-description"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#374151',
                marginBottom: '0.25rem',
              }}
            >
              Interval (Days)
            </label>
            <input
              type="number"
              min={1}
              value={intervalDays}
              onChange={(e) => setIntervalDays(e.target.value ? Number(e.target.value) : '')}
              placeholder="e.g., 90 (every 3 months)"
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              data-testid="input-interval-days"
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#374151',
                marginBottom: '0.25rem',
              }}
            >
              Interval (Odometer Km)
            </label>
            <input
              type="number"
              min={1}
              value={intervalOdometerKm}
              onChange={(e) => setIntervalOdometerKm(e.target.value ? Number(e.target.value) : '')}
              placeholder="e.g., 10000"
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              data-testid="input-interval-km"
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#374151',
                marginBottom: '0.25rem',
              }}
            >
              Default Priority
            </label>
            <select
              value={defaultPriority}
              onChange={(e) => setDefaultPriority(e.target.value as MaintenancePriority)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              data-testid="select-default-priority"
            >
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', marginTop: '1.5rem' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              <input
                type="checkbox"
                checked={blocksOperationWhenDue}
                onChange={(e) => setBlocksOperationWhenDue(e.target.checked)}
                data-testid="checkbox-blocks-operation"
              />
              Blocks vehicle dispatch when due
            </label>
          </div>
        </div>

        <div
          style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}
        >
          <Link
            href="/maintenance/plans"
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              textDecoration: 'none',
              color: '#374151',
              background: '#fff',
            }}
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: '0.5rem 1.25rem',
              background: '#2563eb',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
            data-testid="btn-submit-plan"
          >
            {submitting ? 'Creating...' : 'Create Plan'}
          </button>
        </div>
      </form>
    </div>
  );
}
