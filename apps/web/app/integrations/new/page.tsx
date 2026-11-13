'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import { integrationApi } from '../../../lib/api-client';

export default function NewIntegrationPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<string>('OUTBOUND_WEBHOOK');
  const [provider, setProvider] = useState('CUSTOM');
  const [configJson, setConfigJson] = useState('{}');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let parsedConfig: Record<string, unknown> = {};
    if (configJson.trim()) {
      try {
        parsedConfig = JSON.parse(configJson.trim()) as Record<string, unknown>;
      } catch {
        setError('Configuration must be a valid JSON object');
        return;
      }
    }

    try {
      setLoading(true);
      const created = await integrationApi.createConnection({
        name: name.trim(),
        kind,
        provider: provider.trim() || 'CUSTOM',
        configuration: parsedConfig,
      });
      router.push(`/integrations/${created.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '1rem' }}>
      <TenantHeader />

      <main style={{ marginTop: '1.5rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <Link
            href="/integrations"
            data-testid="link-back-integrations"
            style={{ fontSize: '0.875rem', color: '#2563eb', textDecoration: 'none' }}
          >
            &larr; Back to Integrations
          </Link>
          <h1
            style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.5rem 0 0 0' }}
            data-testid="page-title"
          >
            Register New Integration Connection
          </h1>
        </div>

        {error && (
          <div
            data-testid="error-banner"
            style={{
              backgroundColor: '#fee2e2',
              border: '1px solid #f87171',
              color: '#991b1b',
              padding: '0.75rem 1rem',
              borderRadius: '0.375rem',
              marginBottom: '1rem',
            }}
          >
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          <div>
            <label
              htmlFor="conn-name"
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#374151',
                marginBottom: '0.25rem',
              }}
            >
              Connection Name *
            </label>
            <input
              id="conn-name"
              type="text"
              required
              placeholder="e.g. Acme Telematics Feed, Corporate Webhooks"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-name"
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="conn-kind"
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#374151',
                marginBottom: '0.25rem',
              }}
            >
              Integration Kind *
            </label>
            <select
              id="conn-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              data-testid="select-kind"
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
              }}
            >
              <option value="OUTBOUND_WEBHOOK">
                Outbound Webhook (Signed transactional event stream)
              </option>
              <option value="INBOUND_TELEMATICS">
                Inbound Telematics (Signed GPS position ingest & mapping)
              </option>
              <option value="FUEL_CARD_IMPORT">
                Fuel Card Import (CSV preview, anomaly checks & posting)
              </option>
              <option value="ACCOUNTING_EXPORT">
                Accounting Export (General ledger ready CSV handoff)
              </option>
            </select>
          </div>

          <div>
            <label
              htmlFor="conn-provider"
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#374151',
                marginBottom: '0.25rem',
              }}
            >
              Provider Identifier *
            </label>
            <input
              id="conn-provider"
              type="text"
              required
              placeholder="e.g. SAMSARA, GEOTAB, WEX, FLEETCOR, CUSTOM"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              data-testid="input-provider"
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="conn-config"
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#374151',
                marginBottom: '0.25rem',
              }}
            >
              Configuration (JSON)
            </label>
            <textarea
              id="conn-config"
              rows={4}
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
              data-testid="textarea-config"
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
              marginTop: '0.5rem',
            }}
          >
            <Link
              href="/integrations"
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                color: '#374151',
                textDecoration: 'none',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              data-testid="btn-submit"
              style={{
                backgroundColor: '#2563eb',
                color: '#fff',
                padding: '0.5rem 1.25rem',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: 500,
                fontSize: '0.875rem',
              }}
            >
              {loading ? 'Registering...' : 'Create Connection'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
