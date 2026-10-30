'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import {
  complianceApi,
  vehicleApi,
  type ComplianceDocumentRecord,
  type ComplianceDocumentStatus,
  type ComplianceSubjectType,
  type CurrentUserResponse,
} from '../../../lib/api-client';

export default function AllComplianceDocumentsPage() {
  const [documents, setDocuments] = useState<ComplianceDocumentRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Filters
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<ComplianceSubjectType | ''>('');
  const [statusFilter, setStatusFilter] = useState<ComplianceDocumentStatus | ''>('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [docsRes, user] = await Promise.all([
        complianceApi.fetchDocuments({
          subjectType: subjectTypeFilter || undefined,
          status: statusFilter || undefined,
        }),
        vehicleApi.fetchCurrentUser().catch(() => null),
      ]);
      setDocuments(docsRes.items);
      setCurrentUser(user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [subjectTypeFilter, statusFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleDownload = async (docId: string, fileName: string) => {
    try {
      setDownloadingId(docId);
      const res = await complianceApi.getDownloadUrl(docId);
      // Trigger download via anchor
      const a = document.createElement('a');
      a.href = res.downloadUrl;
      a.download = fileName || res.fileName;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to get download URL');
    } finally {
      setDownloadingId(null);
    }
  };

  const permissions = currentUser?.permissions ?? [];
  const canDownload = permissions.includes('compliance.document.download');

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
            data-testid="all-docs-title"
          >
            Fleet Compliance Documents
          </h1>
          <p style={{ color: '#4b5563', margin: '0.25rem 0 0 0' }}>
            Historical and active records of all uploaded compliance files, certificates, and
            inspections.
          </p>
        </div>
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

      {/* Filter Toolbar */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <label
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#4b5563',
              display: 'block',
              marginBottom: '0.25rem',
            }}
          >
            Subject Type
          </label>
          <select
            value={subjectTypeFilter}
            onChange={(e) => setSubjectTypeFilter(e.target.value as ComplianceSubjectType | '')}
            style={{
              padding: '0.4rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.875rem',
            }}
            data-testid="filter-doc-subject"
          >
            <option value="">All Subjects</option>
            <option value="VEHICLE">Vehicles</option>
            <option value="DRIVER">Drivers</option>
          </select>
        </div>

        <div>
          <label
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#4b5563',
              display: 'block',
              marginBottom: '0.25rem',
            }}
          >
            Document Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ComplianceDocumentStatus | '')}
            style={{
              padding: '0.4rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.875rem',
            }}
            data-testid="filter-doc-status"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="SUPERSEDED">SUPERSEDED</option>
            <option value="REVOKED">REVOKED</option>
          </select>
        </div>
      </div>

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
            Loading documents...
          </div>
        ) : documents.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: '#6b7280' }}>
            No compliance documents found matching your filter criteria.
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
              data-testid="all-docs-table"
            >
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Display ID</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Subject</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Doc Number</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>File</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Expires On</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'right' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr
                    key={doc.id}
                    style={{ borderBottom: '1px solid #f3f4f6' }}
                    data-testid={`document-row-${doc.displayId}`}
                  >
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Link
                        href={`/compliance/documents/${doc.id}`}
                        style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}
                        data-testid={`doc-link-${doc.displayId}`}
                      >
                        {doc.displayId}
                      </Link>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span
                        style={{
                          padding: '0.15rem 0.4rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: doc.subjectType === 'VEHICLE' ? '#e0e7ff' : '#fef3c7',
                          color: doc.subjectType === 'VEHICLE' ? '#3730a3' : '#92400e',
                          marginRight: '0.5rem',
                        }}
                      >
                        {doc.subjectType}
                      </span>
                      {doc.subjectType === 'VEHICLE' && doc.vehicleId ? (
                        <Link
                          href={`/vehicles/${doc.vehicleId}`}
                          style={{ color: '#4b5563', textDecoration: 'none' }}
                        >
                          View Vehicle
                        </Link>
                      ) : doc.subjectType === 'DRIVER' && doc.driverId ? (
                        <Link
                          href={`/drivers/${doc.driverId}`}
                          style={{ color: '#4b5563', textDecoration: 'none' }}
                        >
                          View Driver
                        </Link>
                      ) : null}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {doc.documentNumber ? (
                        <strong>{doc.documentNumber}</strong>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>&mdash;</span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background:
                            doc.status === 'ACTIVE'
                              ? '#dcfce7'
                              : doc.status === 'SUPERSEDED'
                                ? '#f3f4f6'
                                : '#fee2e2',
                          color:
                            doc.status === 'ACTIVE'
                              ? '#166534'
                              : doc.status === 'SUPERSEDED'
                                ? '#6b7280'
                                : '#991b1b',
                        }}
                        data-testid={`doc-status-${doc.displayId}`}
                      >
                        {doc.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div>{doc.originalFileName}</div>
                      <div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>
                        {(doc.sizeBytes / 1024).toFixed(1)} KB &bull; {doc.mimeType}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {doc.expiresOn ? (
                        <span>{new Date(doc.expiresOn).toLocaleDateString()}</span>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>Never</span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <div
                        style={{
                          display: 'flex',
                          gap: '0.5rem',
                          justifyContent: 'flex-end',
                          alignItems: 'center',
                        }}
                      >
                        {canDownload && (
                          <button
                            type="button"
                            onClick={() => void handleDownload(doc.id, doc.originalFileName)}
                            disabled={downloadingId === doc.id}
                            style={{
                              padding: '0.25rem 0.5rem',
                              border: '1px solid #d1d5db',
                              background: '#fff',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              color: '#2563eb',
                            }}
                            data-testid={`btn-download-${doc.displayId}`}
                          >
                            {downloadingId === doc.id ? 'Loading...' : 'Download'}
                          </button>
                        )}
                        <Link
                          href={`/compliance/documents/${doc.id}`}
                          style={{
                            padding: '0.25rem 0.5rem',
                            border: '1px solid #d1d5db',
                            background: '#f9fafb',
                            borderRadius: '4px',
                            textDecoration: 'none',
                            fontSize: '0.75rem',
                            color: '#374151',
                          }}
                        >
                          Details &rarr;
                        </Link>
                      </div>
                    </td>
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
