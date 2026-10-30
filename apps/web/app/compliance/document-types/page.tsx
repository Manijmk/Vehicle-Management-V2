'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import {
  complianceApi,
  vehicleApi,
  type ComplianceDocumentTypeRecord,
  type CurrentUserResponse,
} from '../../../lib/api-client';

export default function DocumentTypesCatalogPage() {
  const [types, setTypes] = useState<ComplianceDocumentTypeRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [typesRes, user] = await Promise.all([
        complianceApi.fetchDocumentTypes(),
        vehicleApi.fetchCurrentUser().catch(() => null),
      ]);
      setTypes(typesRes.items);
      setCurrentUser(user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load document types');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleArchive = async (typeId: string, name: string) => {
    if (
      !confirm(
        `Are you sure you want to archive '${name}'? Existing documents remain, but no new documents can be uploaded for an archived type.`,
      )
    ) {
      return;
    }
    try {
      setActionLoading(typeId);
      await complianceApi.archiveDocumentType(typeId);
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to archive document type');
    } finally {
      setActionLoading(null);
    }
  };

  const permissions = currentUser?.permissions ?? [];
  const canManageTypes = permissions.includes('compliance.type.manage');

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
      <TenantHeader onAuthChange={loadData} />

      <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
        <Link
          href="/compliance"
          style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.875rem' }}
        >
          &larr; Back to Compliance Dashboard
        </Link>
      </div>

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
            data-testid="doc-types-title"
          >
            Compliance Document Types Catalog
          </h1>
          <p style={{ color: '#4b5563', margin: '0.25rem 0 0 0' }}>
            Policies defining which documents are required, whether they expire, and whether
            missing/expired documents block dispatch.
          </p>
        </div>
        {canManageTypes && (
          <Link
            href="/compliance/document-types/new"
            style={{
              padding: '0.5rem 1.25rem',
              background: '#2563eb',
              color: '#fff',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 600,
            }}
            data-testid="btn-create-doc-type"
          >
            + New Document Type
          </Link>
        )}
      </div>

      {error && (
        <div
          style={{
            padding: '1rem',
            marginBottom: '1.5rem',
            background: '#fee2e2',
            border: '1px solid #ef4444',
            borderRadius: '6px',
            color: '#991b1b',
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            Loading document types...
          </div>
        ) : types.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: '#6b7280' }}>
            No document types configured yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '0.875rem',
              }}
              data-testid="doc-types-table"
            >
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Code</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Name</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Subject</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Required</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Blocks Operation</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Warning Window</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Status</th>
                  {canManageTypes && (
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'right' }}>
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {types.map((type) => (
                  <tr
                    key={type.id}
                    style={{ borderBottom: '1px solid #f3f4f6' }}
                    data-testid={`doc-type-row-${type.code}`}
                  >
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <code
                        style={{
                          background: '#f3f4f6',
                          padding: '0.15rem 0.4rem',
                          borderRadius: '4px',
                        }}
                      >
                        {type.code}
                      </code>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <strong>{type.name}</strong>
                      {type.description ? (
                        <div
                          style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '0.15rem' }}
                        >
                          {type.description}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: type.subjectType === 'VEHICLE' ? '#e0e7ff' : '#fef3c7',
                          color: type.subjectType === 'VEHICLE' ? '#3730a3' : '#92400e',
                        }}
                      >
                        {type.subjectType}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {type.required ? (
                        <span style={{ color: '#059669', fontWeight: 600 }}>Yes</span>
                      ) : (
                        <span style={{ color: '#6b7280' }}>Optional</span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {type.blocksOperation ? (
                        <span
                          style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: '#fee2e2',
                            color: '#991b1b',
                          }}
                        >
                          BLOCKS DISPATCH
                        </span>
                      ) : (
                        <span style={{ color: '#6b7280' }}>No</span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {type.requiresExpiry ? `${type.warningDaysBeforeExpiry} days` : 'No expiry'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: type.status === 'ACTIVE' ? '#dcfce7' : '#f3f4f6',
                          color: type.status === 'ACTIVE' ? '#166534' : '#6b7280',
                        }}
                        data-testid={`doc-type-status-${type.code}`}
                      >
                        {type.status}
                      </span>
                    </td>
                    {canManageTypes && (
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        {type.status === 'ACTIVE' ? (
                          <button
                            type="button"
                            onClick={() => void handleArchive(type.id, type.name)}
                            disabled={actionLoading === type.id}
                            style={{
                              padding: '0.3rem 0.75rem',
                              border: '1px solid #d1d5db',
                              background: '#fff',
                              color: '#dc2626',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                            }}
                            data-testid={`btn-archive-${type.code}`}
                          >
                            {actionLoading === type.id ? 'Archiving...' : 'Archive'}
                          </button>
                        ) : (
                          <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>Archived</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
