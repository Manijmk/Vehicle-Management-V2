'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TenantHeader } from '../../components/tenant-header';
import {
  api,
  vehicleApi,
  type CurrentUserResponse,
  type InspectionTemplateRecord,
  type InspectionTemplateStatus,
  type InspectionType,
} from '../../lib/api-client';

export default function InspectionTemplatesPage() {
  const [templates, setTemplates] = useState<InspectionTemplateRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | InspectionType>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | InspectionTemplateStatus>('ALL');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [res, user] = await Promise.all([
        api.fetchInspectionTemplates(
          typeFilter !== 'ALL' ? typeFilter : undefined,
          statusFilter !== 'ALL' ? statusFilter : undefined,
          100,
        ),
        vehicleApi.fetchCurrentUser().catch(() => null),
      ]);
      setTemplates(res.items);
      setCurrentUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inspection templates');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const canManage = Boolean(currentUser?.permissions.includes('inspection.template.manage'));

  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      const name = (t.name ?? '').toLowerCase();
      const desc = (t.description ?? '').toLowerCase();
      const matchesText = !q || name.includes(q) || desc.includes(q);
      const matchesType = typeFilter === 'ALL' || t.type === typeFilter;
      const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
      return matchesText && matchesType && matchesStatus;
    });
  }, [templates, query, typeFilter, statusFilter]);

  return (
    <main className="vehicle-page">
      <TenantHeader onAuthChange={() => void loadData()} />

      <div
        className="page-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h1
            data-testid="inspection-templates-title"
            style={{ fontSize: '1.75rem', fontWeight: 600 }}
          >
            Inspection Templates
          </h1>
          <p style={{ color: 'var(--text-muted, #64748b)', marginTop: '0.25rem' }}>
            Manage safety checklists, pre-trip and post-trip inspection definitions.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link
            href="/inspections"
            className="secondary-btn"
            style={{
              textDecoration: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              border: '1px solid #cbd5e1',
            }}
          >
            View Inspections
          </Link>
          {canManage && (
            <Link
              href="/inspection-templates/new"
              className="primary-btn"
              data-testid="new-template-button"
              style={{
                textDecoration: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                background: '#1a56db',
                color: '#fff',
                fontWeight: 500,
              }}
            >
              + Create Template
            </Link>
          )}
        </div>
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

      <div
        className="filters-row"
        style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}
      >
        <input
          type="text"
          placeholder="Search by name or description..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="template-search-input"
          style={{
            flex: 1,
            minWidth: '220px',
            padding: '0.5rem',
            borderRadius: '4px',
            border: '1px solid #cbd5e1',
          }}
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'ALL' | InspectionType)}
          data-testid="template-type-filter"
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
        >
          <option value="ALL">All Types</option>
          <option value="PRE_TRIP">Pre-Trip</option>
          <option value="POST_TRIP">Post-Trip</option>
          <option value="PERIODIC">Periodic</option>
          <option value="SAFETY">Safety</option>
          <option value="CUSTOM">Custom</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'ALL' | InspectionTemplateStatus)}
          data-testid="template-status-filter"
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
        >
          <option value="ALL">All Statuses</option>
          <option value="DRAFT">DRAFT</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="ARCHIVED">ARCHIVED</option>
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
          Loading templates...
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '3rem',
            background: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
          }}
          data-testid="empty-templates-state"
        >
          <h3>No inspection templates found</h3>
          <p style={{ color: '#64748b', marginTop: '0.5rem' }}>
            {templates.length === 0
              ? 'Create a template to begin conducting structured inspections.'
              : 'Try adjusting your search filters.'}
          </p>
        </div>
      ) : (
        <div
          className="table-container"
          style={{
            overflowX: 'auto',
            background: '#fff',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
          }}
        >
          <table
            className="data-table"
            data-testid="templates-table"
            style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}
          >
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Name</th>
                <th style={{ padding: '0.75rem 1rem' }}>Type</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem' }}>Version</th>
                <th style={{ padding: '0.75rem 1rem' }}>Items</th>
                <th style={{ padding: '0.75rem 1rem' }}>Updated At</th>
                <th style={{ padding: '0.75rem 1rem' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredTemplates.map((t) => (
                <tr
                  key={t.id}
                  data-testid={`template-row-${t.id}`}
                  style={{ borderBottom: '1px solid #f1f5f9' }}
                >
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <Link
                      href={`/inspection-templates/${t.id}`}
                      style={{ color: '#1a56db', textDecoration: 'none', fontWeight: 500 }}
                      data-testid={`template-link-${t.id}`}
                    >
                      {t.name}
                    </Link>
                    {t.description && (
                      <div style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.2rem' }}>
                        {t.description}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span
                      style={{
                        fontSize: '0.8125rem',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        background: '#e0f2fe',
                        color: '#0369a1',
                        fontWeight: 500,
                      }}
                    >
                      {t.type}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span
                      style={{
                        fontSize: '0.8125rem',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontWeight: 600,
                        background:
                          t.status === 'ACTIVE'
                            ? '#dcfce7'
                            : t.status === 'DRAFT'
                              ? '#fef9c3'
                              : '#f1f5f9',
                        color:
                          t.status === 'ACTIVE'
                            ? '#166534'
                            : t.status === 'DRAFT'
                              ? '#854d0e'
                              : '#475569',
                      }}
                      data-testid={`template-status-${t.id}`}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>v{t.version}</td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>
                    {t.items?.length ?? 0} items
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem', color: '#64748b' }}>
                    {new Date(t.updatedAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <Link
                      href={`/inspection-templates/${t.id}`}
                      style={{ fontSize: '0.875rem', color: '#1a56db', textDecoration: 'none' }}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
