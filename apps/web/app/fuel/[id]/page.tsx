'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import { financeApi, type FuelTransactionRecord } from '../../../lib/api-client';

export default function FuelTransactionDetailPage() {
  const params = useParams();
  const transactionId = params['id'] as string;

  const [transaction, setTransaction] = useState<FuelTransactionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Void modal state
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  // Receipt upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadData = useCallback(async () => {
    if (!transactionId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await financeApi.fetchFuelTransaction(transactionId);
      setTransaction(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load fuel transaction');
    } finally {
      setLoading(false);
    }
  }, [transactionId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidReason.trim()) {
      setError('Void reason is mandatory');
      return;
    }
    try {
      setVoiding(true);
      setError(null);
      await financeApi.voidFuelTransaction(transactionId, voidReason);
      setShowVoidModal(false);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to void fuel transaction');
    } finally {
      setVoiding(false);
    }
  };

  const handleDownloadReceipt = async () => {
    try {
      const res = await financeApi.getFuelReceiptUrl(transactionId);
      window.open(res.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to get receipt download URL');
    }
  };

  const handleUploadReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    try {
      setUploading(true);
      setError(null);
      const fd = new FormData();
      fd.append('file', uploadFile);
      await financeApi.uploadFuelReceipt(transactionId, fd);
      setUploadFile(null);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to upload receipt');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem' }}>
      <TenantHeader onAuthChange={loadData} />

      <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <Link
          href="/fuel"
          style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.875rem' }}
        >
          &larr; Back to Fuel Transactions
        </Link>
      </div>

      {error && (
        <div
          style={{
            padding: '1rem',
            background: '#fee2e2',
            border: '1px solid #ef4444',
            borderRadius: '6px',
            color: '#991b1b',
            marginBottom: '1rem',
          }}
          data-testid="fuel-detail-error"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div
          style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}
          data-testid="fuel-loading"
        >
          Loading fuel transaction...
        </div>
      ) : !transaction ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
          Transaction not found.
        </div>
      ) : (
        <>
          {/* Header Bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid #e5e7eb',
              paddingBottom: '1rem',
              marginBottom: '1.5rem',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <h1
                  style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}
                  data-testid="fuel-display-id"
                >
                  {transaction.displayId}
                </h1>
                <span
                  style={{
                    padding: '0.25rem 0.625rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    background: transaction.status === 'POSTED' ? '#dcfce7' : '#f3f4f6',
                    color: transaction.status === 'POSTED' ? '#166534' : '#4b5563',
                  }}
                  data-testid="fuel-status"
                >
                  {transaction.status}
                </span>
              </div>
              <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
                Recorded on {new Date(transaction.createdAt).toLocaleString()} &bull; Source:{' '}
                {transaction.source}
              </p>
            </div>

            {transaction.status === 'POSTED' && (
              <button
                type="button"
                onClick={() => setShowVoidModal(true)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#fee2e2',
                  color: '#991b1b',
                  border: '1px solid #f87171',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                data-testid="btn-void-transaction"
              >
                Void Transaction
              </button>
            )}
          </div>

          {/* Voided Banner */}
          {transaction.status === 'VOIDED' && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fca5a5',
                borderRadius: '8px',
                padding: '1rem',
                marginBottom: '1.5rem',
                color: '#991b1b',
              }}
              data-testid="void-reason-banner"
            >
              <strong>Transaction Voided:</strong> {transaction.voidReason}
              <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: '#b91c1c' }}>
                Voided on{' '}
                {transaction.voidedAt ? new Date(transaction.voidedAt).toLocaleString() : 'N/A'}
              </div>
            </div>
          )}

          {/* Anomalies Alert Box */}
          {transaction.anomalies && transaction.anomalies.length > 0 && (
            <div
              style={{
                background: '#fffbeb',
                border: '1px solid #fcd34d',
                borderRadius: '8px',
                padding: '1.25rem',
                marginBottom: '1.5rem',
              }}
              data-testid="anomalies-list"
            >
              <h3
                style={{
                  margin: '0 0 0.5rem 0',
                  color: '#92400e',
                  fontSize: '1rem',
                  fontWeight: 600,
                }}
              >
                ⚠️ Anomalies Detected ({transaction.anomalies.length})
              </h3>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: '1.25rem',
                  color: '#78350f',
                  fontSize: '0.875rem',
                }}
              >
                {transaction.anomalies.map((anom) => (
                  <li key={anom.id} style={{ marginBottom: '0.25rem' }} data-testid="anomaly-item">
                    <strong style={{ fontFamily: 'monospace' }}>
                      [{anom.code || anom.anomalyCode}]
                    </strong>{' '}
                    ({anom.severity}): {anom.description}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Core Details Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1.5rem',
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1.5rem',
              marginBottom: '1.5rem',
            }}
          >
            <div>
              <h4
                style={{
                  margin: '0 0 0.75rem 0',
                  fontSize: '0.875rem',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                }}
              >
                Vehicle & Operational Context
              </h4>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  fontSize: '0.875rem',
                }}
              >
                <div>
                  <span style={{ color: '#4b5563' }}>Vehicle: </span>
                  {transaction.vehicle ? (
                    <Link
                      href={`/vehicles/${transaction.vehicle.id}`}
                      style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}
                      data-testid="fuel-vehicle"
                    >
                      {transaction.vehicle.displayId} ({transaction.vehicle.registration} &bull;{' '}
                      {transaction.vehicle.model})
                    </Link>
                  ) : (
                    'N/A'
                  )}
                </div>
                <div>
                  <span style={{ color: '#4b5563' }}>Driver: </span>
                  <span style={{ fontWeight: 500 }}>
                    {transaction.driver
                      ? `${transaction.driver.fullName} (${transaction.driver.displayId})`
                      : 'Unassigned'}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#4b5563' }}>Trip: </span>
                  <span style={{ fontWeight: 500 }}>
                    {transaction.trip ? (
                      <Link
                        href={`/trips/${transaction.trip.id}`}
                        style={{ color: '#2563eb', textDecoration: 'none' }}
                      >
                        {transaction.trip.displayId}
                      </Link>
                    ) : (
                      'None'
                    )}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#4b5563' }}>Odometer: </span>
                  <strong data-testid="fuel-odometer">
                    {transaction.odometerKm !== null
                      ? `${transaction.odometerKm} km`
                      : 'Not recorded'}
                  </strong>
                </div>
              </div>
            </div>

            <div>
              <h4
                style={{
                  margin: '0 0 0.75rem 0',
                  fontSize: '0.875rem',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                }}
              >
                Financial Details
              </h4>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  fontSize: '0.875rem',
                }}
              >
                <div>
                  <span style={{ color: '#4b5563' }}>Date Refueled: </span>
                  <strong>{new Date(transaction.occurredAt).toLocaleString()}</strong>
                </div>
                <div>
                  <span style={{ color: '#4b5563' }}>Energy Type: </span>
                  <strong>{transaction.energyType}</strong>
                </div>
                <div>
                  <span style={{ color: '#4b5563' }}>Quantity: </span>
                  <strong data-testid="fuel-quantity">
                    {transaction.quantity} {transaction.quantityUnit}
                  </strong>
                </div>
                <div>
                  <span style={{ color: '#4b5563' }}>Unit Price: </span>
                  <strong>
                    {transaction.unitPrice.toFixed(2)} {transaction.currencyCode}
                  </strong>
                </div>
                <div
                  style={{
                    borderTop: '1px dashed #e5e7eb',
                    paddingTop: '0.5rem',
                    marginTop: '0.25rem',
                  }}
                >
                  <span style={{ color: '#4b5563' }}>Total Amount: </span>
                  <strong
                    style={{ fontSize: '1.25rem', color: '#111827' }}
                    data-testid="fuel-total-amount"
                  >
                    {transaction.totalAmount.toFixed(2)} {transaction.currencyCode}
                  </strong>
                </div>
                <div>
                  <span style={{ color: '#4b5563' }}>Station / Vendor: </span>
                  <span>{transaction.stationName || 'N/A'}</span>
                </div>
                <div>
                  <span style={{ color: '#4b5563' }}>Reference / Receipt #: </span>
                  <span>{transaction.referenceNumber || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Receipt Section */}
          <div
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1.5rem',
              marginBottom: '1.5rem',
            }}
            data-testid="receipt-section"
          >
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.125rem', fontWeight: 600 }}>
              Receipt Documentation
            </h3>
            {transaction.receiptStorageKey ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div>
                  <p style={{ margin: 0, fontWeight: 500 }}>
                    Attached file: {transaction.receiptFileName || 'receipt.pdf'}
                  </p>
                  <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280', fontSize: '0.75rem' }}>
                    {transaction.receiptContentType} &bull;{' '}
                    {transaction.receiptFileSize
                      ? `${(transaction.receiptFileSize / 1024).toFixed(1)} KB`
                      : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadReceipt}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                  data-testid="btn-download-receipt"
                >
                  Download Signed Receipt &darr;
                </button>
              </div>
            ) : (
              <div>
                <p style={{ color: '#6b7280', margin: '0 0 1rem 0', fontSize: '0.875rem' }}>
                  No receipt attached to this fuel transaction yet.
                </p>
                {transaction.status === 'POSTED' && (
                  <form
                    onSubmit={handleUploadReceipt}
                    style={{
                      display: 'flex',
                      gap: '0.75rem',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                    data-testid="upload-receipt-form"
                  >
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                      required
                      style={{
                        padding: '0.25rem',
                        border: '1px dashed #d1d5db',
                        borderRadius: '4px',
                      }}
                    />
                    <button
                      type="submit"
                      disabled={uploading || !uploadFile}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#059669',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 500,
                        cursor: uploading || !uploadFile ? 'not-allowed' : 'pointer',
                      }}
                      data-testid="btn-upload-receipt"
                    >
                      {uploading ? 'Uploading...' : 'Upload Receipt'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Void Modal */}
          {showVoidModal && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 50,
                padding: '1rem',
              }}
              data-testid="void-modal"
            >
              <div
                style={{
                  background: '#fff',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  maxWidth: '500px',
                  width: '100%',
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                }}
              >
                <h3
                  style={{
                    margin: '0 0 0.5rem 0',
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: '#991b1b',
                  }}
                >
                  Void Fuel Transaction
                </h3>
                <p style={{ color: '#4b5563', fontSize: '0.875rem', margin: '0 0 1rem 0' }}>
                  Voiding a fuel transaction is an irreversible action. A mandatory reason must be
                  recorded in the audit trail.
                </p>
                <form onSubmit={handleVoid}>
                  <div style={{ marginBottom: '1rem' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        marginBottom: '0.25rem',
                      }}
                    >
                      Reason for Voiding *
                    </label>
                    <textarea
                      value={voidReason}
                      onChange={(e) => setVoidReason(e.target.value)}
                      placeholder="e.g. Duplicate entry from driver receipt vs company fuel card"
                      required
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                      }}
                      data-testid="input-void-reason"
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button
                      type="button"
                      onClick={() => setShowVoidModal(false)}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#f3f4f6',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={voiding || !voidReason.trim()}
                      style={{
                        padding: '0.5rem 1rem',
                        background: voiding ? '#f87171' : '#dc2626',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 600,
                        cursor: voiding || !voidReason.trim() ? 'not-allowed' : 'pointer',
                      }}
                      data-testid="confirm-void-btn"
                    >
                      {voiding ? 'Voiding...' : 'Confirm Void'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
