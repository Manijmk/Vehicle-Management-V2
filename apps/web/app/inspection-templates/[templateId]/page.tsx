'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import {
  api,
  vehicleApi,
  type CurrentUserResponse,
  type InspectionTemplateRecord,
} from '../../../lib/api-client';

export default function InspectionTemplateDetailPage() {
  const params = useParams();
  const templateId = String(params.templateId);

  const [template, setTemplate] = useState<InspectionTemplateRecord | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [tmpl, user] = await Promise.all([
        api.fetchInspectionTemplate(templateId),
        vehicleApi.fetchCurrentUser().catch(() => null),
      ]);
      setTemplate(tmpl);
      setCurrentUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inspection template');
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const canManage = Boolean(currentUser?.permissions.includes('inspection.template.manage'));

  const handleActivate = async () => {
    if (!template) return;
    try {
      setActionLoading(true);
      setError(null);
      const updated = await api.activateInspectionTemplate(template.id, template.version);
      setTemplate(updated);
      setSuccessMsg('Template activated successfully. It can now be used for inspections.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate template');
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchive = async () => {
    if (!template) return;
    try {
      setActionLoading(true);
      setError(null);
      const updated = await api.archiveInspectionTemplate(template.id, template.version);
      setTemplate(updated);
      setSuccessMsg('Template archived successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive template');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="vehicle-page">
        <TenantHeader />
        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
          Loading template details...
        </div>
      </main>
    );
  }

  if (!template) {
    return (
      <main className="vehicle-page">
        <TenantHeader />
        <div style={{ textAlign: 'center', padding: '3rem', color: '#991b1b' }}>
          Inspection template not found.
        </div>
      </main>
    );
  }

  return (
    <main className="vehicle-page">
      <TenantHeader onAuthChange={() => void loadData()} />

      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <Link
            href="/inspection-templates"
            style={{ color: '#1a56db', textDecoration: 'none', fontSize: '0.875rem' }}
          >
            ← Back to Templates
          </Link>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginTop: '0.5rem',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 600 }} data-testid="template-name">
                  {template.name}
                </h1>
                <span
                  style={{
                    fontSize: '0.8125rem',
                    padding: '0.25rem 0.6rem',
                    borderRadius: '4px',
                    fontWeight: 700,
                    background:
                      template.status === 'ACTIVE'
                        ? '#dcfce7'
                        : template.status === 'DRAFT'
                          ? '#fef9c3'
                          : '#f1f5f9',
                    color:
                      template.status === 'ACTIVE'
                        ? '#166534'
                        : template.status === 'DRAFT'
                          ? '#854d0e'
                          : '#475569',
                  }}
                  data-testid="template-status-badge"
                >
                  {template.status}
                </span>
                <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>v{template.version}</span>
              </div>
              {template.description && (
                <p style={{ color: '#475569', marginTop: '0.5rem', fontSize: '0.9375rem' }}>
                  {template.description}
                </p>
              )}
            </div>

            {canManage && (
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {template.status === 'DRAFT' && (
                  <button
                    type="button"
                    onClick={() => void handleActivate()}
                    disabled={actionLoading}
                    data-testid="activate-template-btn"
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#16a34a',
                      color: '#fff',
                      borderRadius: '4px',
                      border: 'none',
                      fontWeight: 600,
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {actionLoading ? 'Activating...' : 'Activate Template'}
                  </button>
                )}

                {template.status === 'ACTIVE' && (
                  <button
                    type="button"
                    onClick={() => void handleArchive()}
                    disabled={actionLoading}
                    data-testid="archive-template-btn"
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#dc2626',
                      color: '#fff',
                      borderRadius: '4px',
                      border: 'none',
                      fontWeight: 600,
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {actionLoading ? 'Archiving...' : 'Archive Template'}
                  </button>
                )}
              </div>
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

        {successMsg && (
          <div
            data-testid="success-banner"
            style={{
              background: '#f0fdf4',
              border: '1px solid #86efac',
              color: '#166534',
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              marginBottom: '1rem',
            }}
          >
            {successMsg}
          </div>
        )}

        {template.status !== 'DRAFT' && (
          <div
            data-testid="template-locked-banner"
            style={{
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              color: '#334155',
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              marginBottom: '1.5rem',
              fontSize: '0.875rem',
            }}
          >
            <strong>Note:</strong> This template is <strong>{template.status}</strong>. Its items
            and parameters are immutable to ensure historical audit integrity.
          </div>
        )}

        <div
          style={{
            background: '#fff',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            padding: '1.5rem',
            marginBottom: '1.5rem',
          }}
        >
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>
            Template Items ({template.items?.length ?? 0})
          </h2>

          <div className="table-container" style={{ overflowX: 'auto' }}>
            <table
              className="data-table"
              data-testid="template-items-table"
              style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}
            >
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '0.5rem 0.75rem', width: '50px' }}>#</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Category</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Prompt</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Severity</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Required</th>
                </tr>
              </thead>
              <tbody>
                {(template.items ?? []).map((item, idx) => (
                  <tr
                    key={item.id}
                    data-testid={`template-item-${item.id}`}
                    style={{ borderBottom: '1px solid #f1f5f9' }}
                  >
                    <td
                      style={{ padding: '0.5rem 0.75rem', color: '#64748b', fontSize: '0.875rem' }}
                    >
                      {idx + 1}
                    </td>
                    <td
                      style={{ padding: '0.5rem 0.75rem', fontWeight: 500, fontSize: '0.875rem' }}
                    >
                      {item.category}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}>
                      <div>{item.prompt}</div>
                      {item.description && (
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                          {item.description}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.2rem 0.4rem',
                          borderRadius: '4px',
                          fontWeight: 700,
                          background: item.severity === 'CRITICAL' ? '#fee2e2' : '#f1f5f9',
                          color: item.severity === 'CRITICAL' ? '#991b1b' : '#475569',
                        }}
                        data-testid={`item-severity-${item.id}`}
                      >
                        {item.severity}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}>
                      {item.required ? (
                        <span style={{ color: '#166534', fontWeight: 600 }}>Yes</span>
                      ) : (
                        <span style={{ color: '#64748b' }}>Optional</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
