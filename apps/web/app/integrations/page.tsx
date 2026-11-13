'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../components/tenant-header';
import { integrationApi, type IntegrationConnectionRecord } from '../../lib/api-client';

function statusBadge(status: string) {
  const styles: Record<string, { bg: string; color: string }> = {
    DRAFT: { bg: '#e5e7eb', color: '#374151' },
    ACTIVE: { bg: '#dcfce7', color: '#166534' },
    SUSPENDED: { bg: '#fef3c7', color: '#92400e' },
    DISABLED: { bg: '#fee2e2', color: '#991b1b' },
  };
  const s = styles[status] ?? { bg: '#f3f4f6', color: '#1f2937' };
  return (
    <span
      data-testid={`badge-status-${status.toLowerCase()}`}
      style={{
        backgroundColor: s.bg,
        color: s.color,
        padding: '0.25rem 0.5rem',
        borderRadius: '0.375rem',
        fontSize: '0.75rem',
        fontWeight: 600,
        textTransform: 'uppercase',
      }}
    >
      {status}
    </span>
  );
}

function kindBadge(kind: string) {
  const labels: Record<string, string> = {
    OUTBOUND_WEBHOOK: 'Outbound Webhook',
    INBOUND_TELEMATICS: 'Inbound Telematics',
    FUEL_CARD_IMPORT: 'Fuel Card Import',
    ACCOUNTING_EXPORT: 'Accounting Export',
  };
  return (
    <span
      data-testid="badge-kind"
      style={{
        backgroundColor: '#e0e7ff',
        color: '#3730a3',
        padding: '0.2rem 0.5rem',
        borderRadius: '0.25rem',
        fontSize: '0.75rem',
        fontWeight: 500,
      }}
    >
      {labels[kind] ?? kind}
    </span>
  );
}

export default function IntegrationsPage() {
  const [connections, setConnections] = useState<IntegrationConnectionRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [kindFilter, setKindFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  const loadConnections = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await integrationApi.fetchConnections({
        kind: kindFilter || undefined,
        status: statusFilter || undefined,
        search: search.trim() || undefined,
      });
      setConnections(res.items);
      setTotal(res.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [kindFilter, statusFilter, search]);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void loadConnections();
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1rem' }}>
      <TenantHeader onAuthChange={() => void loadConnections()} />

      <main style={{ marginTop: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
          }}
        >
          <div>
            <h1
              style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}
              data-testid="page-title"
            >
              Integrations & External Systems
            </h1>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
              Connected external systems, outbound webhooks, telematics, and financial data
              pipelines ({total} total)
            </p>
            <p style={{ color: '#6b7280', margin: '0.25rem 0 0 0' }}>
              Manage third-party connections, webhooks, telematics ingest, fuel card feeds, and
              accounting exports.
            </p>
          </div>
          <Link
            href="/integrations/new"
            data-testid="btn-new-integration"
            style={{
              backgroundColor: '#2563eb',
              color: '#ffffff',
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              textDecoration: 'none',
              fontWeight: 500,
              fontSize: '0.875rem',
            }}
          >
            + New Connection
          </Link>
        </div>

        {/* Filters */}
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
            backgroundColor: '#f9fafb',
            padding: '1rem',
            borderRadius: '0.5rem',
            marginBottom: '1.5rem',
            border: '1px solid #e5e7eb',
            flexWrap: 'wrap',
          }}
        >
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
            <input
              type="text"
              placeholder="Search by name, display ID, or provider..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search"
              style={{
                flex: 1,
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
              }}
            />
            <button
              type="submit"
              data-testid="btn-search"
              style={{
                backgroundColor: '#4b5563',
                color: '#fff',
                padding: '0.5rem 1rem',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Search
            </button>
          </form>

          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            data-testid="select-kind"
            style={{
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
            }}
          >
            <option value="">All Kinds</option>
            <option value="OUTBOUND_WEBHOOK">Outbound Webhook</option>
            <option value="INBOUND_TELEMATICS">Inbound Telematics</option>
            <option value="FUEL_CARD_IMPORT">Fuel Card Import</option>
            <option value="ACCOUNTING_EXPORT">Accounting Export</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            data-testid="select-status"
            style={{
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
            }}
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">DRAFT</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="SUSPENDED">SUSPENDED</option>
            <option value="DISABLED">DISABLED</option>
          </select>
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

        {loading ? (
          <div
            data-testid="loading-state"
            style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}
          >
            Loading integration connections...
          </div>
        ) : connections.length === 0 ? (
          <div
            data-testid="empty-state"
            style={{
              textAlign: 'center',
              padding: '3rem 1rem',
              border: '1px dashed #d1d5db',
              borderRadius: '0.5rem',
              color: '#6b7280',
            }}
          >
            <h3>No integration connections found</h3>
            <p style={{ marginTop: '0.5rem' }}>
              Create your first connection to configure webhooks, telematics ingestion, or financial
              feeds.
            </p>
          </div>
        ) : (
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem',
              overflow: 'hidden',
              backgroundColor: '#ffffff',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <tr>
                  <th
                    style={{
                      padding: '0.75rem 1rem',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      color: '#6b7280',
                    }}
                  >
                    ID / Name
                  </th>
                  <th
                    style={{
                      padding: '0.75rem 1rem',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      color: '#6b7280',
                    }}
                  >
                    Kind
                  </th>
                  <th
                    style={{
                      padding: '0.75rem 1rem',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      color: '#6b7280',
                    }}
                  >
                    Provider
                  </th>
                  <th
                    style={{
                      padding: '0.75rem 1rem',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      color: '#6b7280',
                    }}
                  >
                    Status
                  </th>
                  <th
                    style={{
                      padding: '0.75rem 1rem',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      color: '#6b7280',
                    }}
                  >
                    Last Activity
                  </th>
                  <th
                    style={{
                      padding: '0.75rem 1rem',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      color: '#6b7280',
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {connections.map((c) => (
                  <tr
                    key={c.id}
                    data-testid={`row-connection-${c.id}`}
                    style={{ borderBottom: '1px solid #f3f4f6' }}
                  >
                    <td style={{ padding: '1rem' }}>
                      <Link
                        href={`/integrations/${c.id}`}
                        data-testid={`link-connection-${c.id}`}
                        style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}
                      >
                        {c.displayId}
                      </Link>
                      <div style={{ fontSize: '0.875rem', color: '#374151', fontWeight: 500 }}>
                        {c.name}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>{kindBadge(c.kind)}</td>
                    <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#4b5563' }}>
                      {c.provider || 'CUSTOM'}
                    </td>
                    <td style={{ padding: '1rem' }}>{statusBadge(c.status)}</td>
                    <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                      {c.lastSuccessfulActivityAt
                        ? new Date(c.lastSuccessfulActivityAt).toLocaleString()
                        : 'No activity'}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <Link
                        href={`/integrations/${c.id}`}
                        data-testid={`action-view-${c.id}`}
                        style={{
                          fontSize: '0.875rem',
                          color: '#2563eb',
                          textDecoration: 'none',
                          fontWeight: 500,
                        }}
                      >
                        Manage &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
