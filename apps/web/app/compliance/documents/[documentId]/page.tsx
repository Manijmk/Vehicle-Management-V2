'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../../../components/tenant-header';
import {
  complianceApi,
  vehicleApi,
  type ComplianceDocumentRecord,
  type CurrentUserResponse,
} from '../../../../lib/api-client';

export default function DocumentDetailPage() {
  const params = useParams();
  const documentId = params['documentId'] as string;
  const router = useRouter();

  const [document, setDocument] = useState<ComplianceDocumentRecord | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Download state
  const [downloading, setDownloading] = useState(false);

  // Replace modal state
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [replaceDocNumber, setReplaceDocNumber] = useState('');
  const [replaceIssuer, setReplaceIssuer] = useState('');
  const [replaceIssuedOn, setReplaceIssuedOn] = useState('');
  const [replaceExpiresOn, setReplaceExpiresOn] = useState('');
  const [replaceNotes, setReplaceNotes] = useState('');
  const [replaceSubmitting, setReplaceSubmitting] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);

  // Revoke modal state
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [revokeSubmitting, setRevokeSubmitting] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!documentId) return;
    try {
      setLoading(true);
      setError(null);
      const [doc, user] = await Promise.all([
        complianceApi.fetchDocument(documentId),
        vehicleApi.fetchCurrentUser().catch(() => null),
      ]);
      setDocument(doc);
      setCurrentUser(user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load compliance document');
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleDownload = async () => {
    if (!document) return;
    try {
      setDownloading(true);
      const res = await complianceApi.getDownloadUrl(document.id);
      const a = window.document.createElement('a');
      a.href = res.downloadUrl;
      a.download = document.originalFileName || res.fileName;
      a.target = '_blank';
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to generate download URL');
    } finally {
      setDownloading(false);
    }
  };

  const handleReplaceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replaceFile) {
      setReplaceError('Please choose a replacement file.');
      return;
    }

    try {
      setReplaceSubmitting(true);
      setReplaceError(null);

      const formData = new FormData();
      formData.append('file', replaceFile);
      if (replaceDocNumber) formData.append('documentNumber', replaceDocNumber);
      if (replaceIssuer) formData.append('issuingAuthority', replaceIssuer);
      if (replaceIssuedOn) formData.append('issuedOn', replaceIssuedOn);
      if (replaceExpiresOn) formData.append('expiresOn', replaceExpiresOn);
      if (replaceNotes) formData.append('notes', replaceNotes);

      const newDoc = await complianceApi.replaceDocument(documentId, formData);
      setShowReplaceModal(false);
      router.push(`/compliance/documents/${newDoc.id}`);
    } catch (err: unknown) {
      setReplaceError(err instanceof Error ? err.message : 'Failed to replace document');
    } finally {
      setReplaceSubmitting(false);
    }
  };

  const handleRevokeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokeReason.trim()) {
      setRevokeError('A mandatory reason is required to revoke a compliance document.');
      return;
    }

    try {
      setRevokeSubmitting(true);
      setRevokeError(null);

      await complianceApi.revokeDocument(documentId, revokeReason.trim());
      setShowRevokeModal(false);
      await loadData();
    } catch (err: unknown) {
      setRevokeError(err instanceof Error ? err.message : 'Failed to revoke document');
    } finally {
      setRevokeSubmitting(false);
    }
  };

  const permissions = currentUser?.permissions ?? [];
  const canManage = permissions.includes('compliance.document.manage');
  const canDownload = permissions.includes('compliance.document.download');

  if (loading) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem' }}>
        <TenantHeader />
        <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
          Loading document details...
        </div>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem' }}>
        <TenantHeader />
        <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
          <Link href="/compliance/documents" style={{ color: '#2563eb', textDecoration: 'none' }}>
            &larr; Back to All Documents
          </Link>
        </div>
        <div
          style={{
            padding: '1.5rem',
            background: '#fee2e2',
            border: '1px solid #ef4444',
            borderRadius: '6px',
            color: '#991b1b',
          }}
        >
          {error || 'Document not found'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem' }}>
      <TenantHeader onAuthChange={loadData} />

      <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
        <Link
          href="/compliance/documents"
          style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.875rem' }}
        >
          &larr; Back to All Documents
        </Link>
      </div>

      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '2rem',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h1
                style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}
                data-testid="doc-display-id"
              >
                {document.displayId}
              </h1>
              <span
                style={{
                  padding: '0.25rem 0.6rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  background:
                    document.status === 'ACTIVE'
                      ? '#dcfce7'
                      : document.status === 'SUPERSEDED'
                        ? '#f3f4f6'
                        : '#fee2e2',
                  color:
                    document.status === 'ACTIVE'
                      ? '#166534'
                      : document.status === 'SUPERSEDED'
                        ? '#6b7280'
                        : '#991b1b',
                }}
                data-testid="doc-status-badge"
              >
                {document.status}
              </span>
            </div>
            <p style={{ color: '#4b5563', margin: '0.25rem 0 0 0' }}>
              {document.subjectType} Compliance Document &bull; Version {document.version}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {canDownload && (
              <button
                type="button"
                onClick={() => void handleDownload()}
                disabled={downloading}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
                data-testid="btn-download-file"
              >
                {downloading ? 'Preparing Download...' : 'Download File'}
              </button>
            )}

            {document.status === 'ACTIVE' && canManage && (
              <>
                <button
                  type="button"
                  onClick={() => setShowReplaceModal(true)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#fff',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                  data-testid="btn-open-replace-modal"
                >
                  Replace Document
                </button>
                <button
                  type="button"
                  onClick={() => setShowRevokeModal(true)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#fee2e2',
                    color: '#991b1b',
                    border: '1px solid #fca5a5',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                  data-testid="btn-open-revoke-modal"
                >
                  Revoke
                </button>
              </>
            )}
          </div>
        </div>

        {/* Revocation Banner */}
        {document.status === 'REVOKED' && (
          <div
            style={{
              marginTop: '1.5rem',
              padding: '1rem',
              background: '#fee2e2',
              border: '1px solid #ef4444',
              borderRadius: '6px',
              color: '#991b1b',
            }}
            data-testid="revocation-banner"
          >
            <strong>Document Revoked:</strong> {document.revocationReason}
            {document.revokedAt ? (
              <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                Revoked on {new Date(document.revokedAt).toLocaleString()}
              </div>
            ) : null}
          </div>
        )}

        {/* Superseded Banner */}
        {document.status === 'SUPERSEDED' && (
          <div
            style={{
              marginTop: '1.5rem',
              padding: '1rem',
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              color: '#374151',
            }}
            data-testid="superseded-banner"
          >
            <strong>This document has been superseded</strong> by a newer revision.
            {document.supersededById ? (
              <span style={{ marginLeft: '0.5rem' }}>
                <Link
                  href={`/compliance/documents/${document.supersededById}`}
                  style={{ color: '#2563eb', fontWeight: 600 }}
                >
                  View Replacement Document &rarr;
                </Link>
              </span>
            ) : null}
          </div>
        )}

        {/* Details List */}
        <div style={{ marginTop: '2rem' }}>
          <h2
            style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              borderBottom: '1px solid #e5e7eb',
              paddingBottom: '0.5rem',
              marginBottom: '1rem',
            }}
          >
            Document Details
          </h2>

          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '1rem',
              margin: 0,
            }}
          >
            <div>
              <dt style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>
                Document Number
              </dt>
              <dd
                style={{ margin: '0.25rem 0 0 0', fontWeight: 500 }}
                data-testid="detail-doc-number"
              >
                {document.documentNumber || <span style={{ color: '#9ca3af' }}>&mdash;</span>}
              </dd>
            </div>

            <div>
              <dt style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>Subject</dt>
              <dd style={{ margin: '0.25rem 0 0 0', fontWeight: 500 }}>
                {document.subjectType === 'VEHICLE' && document.vehicleId ? (
                  <Link
                    href={`/vehicles/${document.vehicleId}`}
                    style={{ color: '#2563eb', textDecoration: 'none' }}
                  >
                    Vehicle: {document.vehicleId.slice(0, 8)}... &rarr;
                  </Link>
                ) : document.subjectType === 'DRIVER' && document.driverId ? (
                  <Link
                    href={`/drivers/${document.driverId}`}
                    style={{ color: '#2563eb', textDecoration: 'none' }}
                  >
                    Driver: {document.driverId.slice(0, 8)}... &rarr;
                  </Link>
                ) : (
                  <span>{document.subjectType}</span>
                )}
              </dd>
            </div>

            <div>
              <dt style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>
                Issuing Authority
              </dt>
              <dd style={{ margin: '0.25rem 0 0 0', fontWeight: 500 }}>
                {document.issuerName || <span style={{ color: '#9ca3af' }}>&mdash;</span>}
              </dd>
            </div>

            <div>
              <dt style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>
                Issued Date
              </dt>
              <dd style={{ margin: '0.25rem 0 0 0', fontWeight: 500 }}>
                {document.issuedOn ? (
                  new Date(document.issuedOn).toLocaleDateString()
                ) : (
                  <span style={{ color: '#9ca3af' }}>&mdash;</span>
                )}
              </dd>
            </div>

            <div>
              <dt style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>
                Expiry Date
              </dt>
              <dd
                style={{ margin: '0.25rem 0 0 0', fontWeight: 500 }}
                data-testid="detail-expires-on"
              >
                {document.expiresOn ? (
                  <strong>{new Date(document.expiresOn).toLocaleDateString()}</strong>
                ) : (
                  <span style={{ color: '#9ca3af' }}>No Expiration</span>
                )}
              </dd>
            </div>

            <div>
              <dt style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>
                File Information
              </dt>
              <dd style={{ margin: '0.25rem 0 0 0', fontWeight: 500 }}>
                {document.originalFileName} ({(document.sizeBytes / 1024).toFixed(1)} KB,{' '}
                {document.mimeType})
              </dd>
            </div>

            <div>
              <dt style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>Created At</dt>
              <dd style={{ margin: '0.25rem 0 0 0', fontWeight: 500 }}>
                {new Date(document.createdAt).toLocaleString()}
              </dd>
            </div>
          </dl>

          {document.notes && (
            <div style={{ marginTop: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>Notes</div>
              <p style={{ margin: '0.25rem 0 0 0', color: '#374151', fontSize: '0.875rem' }}>
                {document.notes}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Replace Document Modal */}
      {showReplaceModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '500px',
            }}
          >
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: 600 }}>
              Replace Document
            </h3>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
              Upload an updated replacement document. The current document ({document.displayId})
              will automatically transition to SUPERSEDED.
            </p>

            {replaceError && (
              <div
                style={{
                  padding: '0.75rem',
                  marginBottom: '1rem',
                  background: '#fee2e2',
                  border: '1px solid #ef4444',
                  borderRadius: '6px',
                  color: '#991b1b',
                  fontSize: '0.875rem',
                }}
              >
                {replaceError}
              </div>
            )}

            <form onSubmit={handleReplaceSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    marginBottom: '0.25rem',
                  }}
                >
                  New File (PDF, PNG, JPEG, max 10MB) *
                </label>
                <input
                  type="file"
                  required
                  accept=".pdf,application/pdf,image/png,image/jpeg"
                  onChange={(e) => setReplaceFile(e.target.files?.[0] || null)}
                  style={{ width: '100%' }}
                  data-testid="input-replace-file"
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    marginBottom: '0.25rem',
                  }}
                >
                  Document Number
                </label>
                <input
                  type="text"
                  value={replaceDocNumber}
                  onChange={(e) => setReplaceDocNumber(e.target.value)}
                  placeholder="e.g. FIT-2027-001"
                  style={{
                    width: '100%',
                    padding: '0.4rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                  }}
                  data-testid="input-replace-doc-number"
                />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.75rem',
                  marginBottom: '1rem',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      marginBottom: '0.25rem',
                    }}
                  >
                    Issued On
                  </label>
                  <input
                    type="date"
                    value={replaceIssuedOn}
                    onChange={(e) => setReplaceIssuedOn(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.4rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                    }}
                    data-testid="input-replace-issued-on"
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      marginBottom: '0.25rem',
                    }}
                  >
                    Expires On
                  </label>
                  <input
                    type="date"
                    value={replaceExpiresOn}
                    onChange={(e) => setReplaceExpiresOn(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.4rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                    }}
                    data-testid="input-replace-expires-on"
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    marginBottom: '0.25rem',
                  }}
                >
                  Issuing Authority
                </label>
                <input
                  type="text"
                  value={replaceIssuer}
                  onChange={(e) => setReplaceIssuer(e.target.value)}
                  placeholder="e.g. State DMV or Department of Transportation"
                  style={{
                    width: '100%',
                    padding: '0.4rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                  }}
                  data-testid="input-replace-issuer"
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    marginBottom: '0.25rem',
                  }}
                >
                  Replacement Notes
                </label>
                <textarea
                  rows={2}
                  value={replaceNotes}
                  onChange={(e) => setReplaceNotes(e.target.value)}
                  placeholder="Optional replacement notes or inspection details"
                  style={{
                    width: '100%',
                    padding: '0.4rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                  }}
                  data-testid="input-replace-notes"
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.75rem',
                  marginTop: '1.25rem',
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowReplaceModal(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    background: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={replaceSubmitting || !replaceFile}
                  style={{
                    padding: '0.5rem 1.25rem',
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  data-testid="btn-submit-replace"
                >
                  {replaceSubmitting ? 'Uploading...' : 'Replace & Activate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revoke Document Modal */}
      {showRevokeModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '460px',
            }}
          >
            <h3
              style={{
                margin: '0 0 0.5rem 0',
                fontSize: '1.25rem',
                fontWeight: 600,
                color: '#991b1b',
              }}
            >
              Revoke Compliance Document
            </h3>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
              Revoking marks this document as invalid immediately. If this document was satisfying a
              required policy, the vehicle or driver may become operationally blocked.
            </p>

            {revokeError && (
              <div
                style={{
                  padding: '0.75rem',
                  marginBottom: '1rem',
                  background: '#fee2e2',
                  border: '1px solid #ef4444',
                  borderRadius: '6px',
                  color: '#991b1b',
                  fontSize: '0.875rem',
                }}
              >
                {revokeError}
              </div>
            )}

            <form onSubmit={handleRevokeSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    marginBottom: '0.25rem',
                  }}
                >
                  Mandatory Revocation Reason *
                </label>
                <textarea
                  required
                  rows={3}
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder="e.g. Audit failure, forged document, revoked by regulator..."
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                  }}
                  data-testid="input-revoke-reason"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowRevokeModal(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    background: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={revokeSubmitting || !revokeReason.trim()}
                  style={{
                    padding: '0.5rem 1.25rem',
                    background: '#dc2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  data-testid="btn-submit-revoke"
                >
                  {revokeSubmitting ? 'Revoking...' : 'Confirm Revocation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
