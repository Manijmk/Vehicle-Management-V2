'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import {
  downloadAccountingExport,
  integrationApi,
  type AccountingExportRecord,
  type FuelCardBatchRecord,
  type FuelCardPreviewResponse,
  type FuelCardPreviewRow,
  type IntegrationConnectionRecord,
  type IntegrationDeviceMappingRecord,
  type WebhookDeliveryRecord,
  type WebhookSubscriptionRecord,
} from '../../../lib/api-client';

export default function IntegrationDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [connection, setConnection] = useState<IntegrationConnectionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // One-time plaintext secret reveal state
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  // Subscriptions & Deliveries state
  const [subscriptions, setSubscriptions] = useState<WebhookSubscriptionRecord[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryRecord[]>([]);
  const [newEndpointUrl, setNewEndpointUrl] = useState('');
  const [selectedEventTypes] = useState<string[]>([
    'TripCreated',
    'TripCompleted',
    'VehicleCreated',
  ]);

  // Device Mappings state
  const [deviceMappings, setDeviceMappings] = useState<IntegrationDeviceMappingRecord[]>([]);
  const [providerDeviceId, setProviderDeviceId] = useState('');
  const [telemetryDeviceId, setTelemetryDeviceId] = useState('');

  // Fuel Card Import state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewResult, setPreviewResult] = useState<FuelCardPreviewResponse | null>(null);
  const [fuelBatches, setFuelBatches] = useState<FuelCardBatchRecord[]>([]);

  // Accounting Export state
  const [exportFrom, setExportFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [exportTo, setExportTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [exportCurrency, setExportCurrency] = useState('');
  const [accountingExports, setAccountingExports] = useState<AccountingExportRecord[]>([]);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const conn = await integrationApi.fetchConnection(id);
      setConnection(conn);

      if (conn.kind === 'OUTBOUND_WEBHOOK') {
        const [subs, dels] = await Promise.all([
          integrationApi.fetchSubscriptions(id),
          integrationApi.fetchDeliveries(id),
        ]);
        setSubscriptions(subs);
        setDeliveries(dels.items);
      } else if (conn.kind === 'INBOUND_TELEMATICS') {
        const mappings = await integrationApi.fetchDeviceMappings(id);
        setDeviceMappings(mappings);
      } else if (conn.kind === 'FUEL_CARD_IMPORT') {
        const batches = await integrationApi.fetchFuelCardImports(id);
        setFuelBatches(batches);
      } else if (conn.kind === 'ACCOUNTING_EXPORT') {
        const exportsList = await integrationApi.fetchAccountingExports(id);
        setAccountingExports(exportsList);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Lifecycle actions
  const handleLifecycle = async (action: 'activate' | 'suspend' | 'disable') => {
    if (!connection) return;
    try {
      setError(null);
      let updated: IntegrationConnectionRecord;
      if (action === 'activate') {
        updated = await integrationApi.activateConnection(id, connection.version);
      } else if (action === 'suspend') {
        updated = await integrationApi.suspendConnection(id, connection.version);
      } else {
        updated = await integrationApi.disableConnection(id, connection.version);
      }
      setConnection(updated);
      setSuccessMsg(`Connection status updated to ${updated.status}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Credential actions
  const handleProvisionSecret = async () => {
    try {
      setError(null);
      const res = await integrationApi.provisionSecret(id);
      setRevealedSecret(res.plaintextSecret);
      setSuccessMsg('New credentials provisioned successfully.');
      void loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRotateSecret = async () => {
    if (!confirm('Rotating credentials will revoke existing active secrets. Continue?')) {
      return;
    }
    try {
      setError(null);
      const res = await integrationApi.rotateSecret(id);
      setRevealedSecret(res.plaintextSecret);
      setSuccessMsg('Credentials rotated successfully.');
      void loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Webhook subscriptions
  const handleCreateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      await integrationApi.createSubscription(id, {
        endpointUrl: newEndpointUrl.trim(),
        eventTypes: selectedEventTypes,
      });
      setNewEndpointUrl('');
      setSuccessMsg('Webhook subscription created.');
      const subs = await integrationApi.fetchSubscriptions(id);
      setSubscriptions(subs);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteSubscription = async (subId: string) => {
    if (!confirm('Delete this webhook subscription?')) return;
    try {
      setError(null);
      await integrationApi.deleteSubscription(id, subId);
      setSubscriptions((prev) => prev.filter((s) => s.id !== subId));
      setSuccessMsg('Webhook subscription deleted.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRetryDelivery = async (deliveryId: string) => {
    try {
      setError(null);
      await integrationApi.retryDelivery(id, deliveryId);
      setSuccessMsg('Delivery scheduled for retry.');
      const dels = await integrationApi.fetchDeliveries(id);
      setDeliveries(dels.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Device Mappings
  const handleUpsertMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      await integrationApi.upsertDeviceMapping(id, {
        providerDeviceId: providerDeviceId.trim(),
        telemetryDeviceId: telemetryDeviceId.trim(),
      });
      setProviderDeviceId('');
      setTelemetryDeviceId('');
      setSuccessMsg('Device mapping saved.');
      const mappings = await integrationApi.fetchDeviceMappings(id);
      setDeviceMappings(mappings);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Fuel Card Import
  const handlePreviewFuelCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    try {
      setError(null);
      const formData = new FormData();
      formData.append('file', selectedFile);
      const res = await integrationApi.previewFuelCardImport(id, formData);
      setPreviewResult(res);
      setSuccessMsg(
        `Preview loaded: ${res.validRows} valid rows, ${res.invalidRows} invalid rows.`,
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleConfirmFuelImport = async () => {
    if (!previewResult) return;
    try {
      setError(null);
      const res = await integrationApi.confirmFuelCardImport(id, previewResult.batchId);
      setSuccessMsg(`Successfully imported ${res.importedRows} fuel transactions.`);
      setPreviewResult(null);
      setSelectedFile(null);
      const batches = await integrationApi.fetchFuelCardImports(id);
      setFuelBatches(batches);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Accounting Export
  const handleAccountingExport = async () => {
    try {
      setError(null);
      const fromDate = new Date(`${exportFrom}T00:00:00.000Z`).toISOString();
      const toDate = new Date(`${exportTo}T23:59:59.999Z`).toISOString();
      const { blob, filename } = await downloadAccountingExport(id, {
        from: fromDate,
        to: toDate,
        currency: exportCurrency.trim() || undefined,
      });

      // Browser download
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);

      setSuccessMsg(`Downloaded accounting CSV: ${filename}`);
      const exportsList = await integrationApi.fetchAccountingExports(id);
      setAccountingExports(exportsList);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '1rem' }}>
        <TenantHeader />
        <div
          data-testid="loading-state"
          style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}
        >
          Loading connection details...
        </div>
      </div>
    );
  }

  if (!connection) {
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '1rem' }}>
        <TenantHeader />
        <div data-testid="error-banner" style={{ padding: '2rem', color: '#991b1b' }}>
          Connection not found.
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1rem' }}>
      <TenantHeader onAuthChange={() => void loadData()} />

      <main style={{ marginTop: '1.5rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <Link
            href="/integrations"
            data-testid="link-back-integrations"
            style={{ fontSize: '0.875rem', color: '#2563eb', textDecoration: 'none' }}
          >
            &larr; Back to Integrations
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
                <h1
                  style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}
                  data-testid="connection-name"
                >
                  {connection.name}
                </h1>
                <span
                  data-testid="badge-status"
                  style={{
                    backgroundColor: connection.status === 'ACTIVE' ? '#dcfce7' : '#fef3c7',
                    color: connection.status === 'ACTIVE' ? '#166534' : '#92400e',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  <span data-testid={`badge-status-${connection.status.toLowerCase()}`}>
                    {connection.status}
                  </span>
                </span>
              </div>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                <strong data-testid="connection-display-id">{connection.displayId}</strong> &bull;
                Kind: {connection.kind} &bull; Provider: {connection.provider} &bull; Version:{' '}
                {connection.version}
              </div>
            </div>

            {/* Lifecycle controls */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {connection.status !== 'ACTIVE' && connection.status !== 'DISABLED' && (
                <button
                  type="button"
                  data-testid="btn-activate"
                  onClick={() => void handleLifecycle('activate')}
                  style={{
                    backgroundColor: '#16a34a',
                    color: '#fff',
                    padding: '0.4rem 0.8rem',
                    borderRadius: '0.375rem',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                  }}
                >
                  Activate
                </button>
              )}
              {connection.status === 'ACTIVE' && (
                <button
                  type="button"
                  data-testid="btn-suspend"
                  onClick={() => void handleLifecycle('suspend')}
                  style={{
                    backgroundColor: '#d97706',
                    color: '#fff',
                    padding: '0.4rem 0.8rem',
                    borderRadius: '0.375rem',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                  }}
                >
                  Suspend
                </button>
              )}
              {connection.status !== 'DISABLED' && (
                <button
                  type="button"
                  data-testid="btn-disable"
                  onClick={() => void handleLifecycle('disable')}
                  style={{
                    backgroundColor: '#dc2626',
                    color: '#fff',
                    padding: '0.4rem 0.8rem',
                    borderRadius: '0.375rem',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                  }}
                >
                  Disable
                </button>
              )}
            </div>
          </div>
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

        {successMsg && (
          <div
            data-testid="success-banner"
            style={{
              backgroundColor: '#dcfce7',
              border: '1px solid #86efac',
              color: '#166534',
              padding: '0.75rem 1rem',
              borderRadius: '0.375rem',
              marginBottom: '1rem',
            }}
          >
            {successMsg}
          </div>
        )}

        {/* Plaintext Secret One-Time Reveal Banner */}
        {revealedSecret && (
          <div
            data-testid="plaintext-secret-banner"
            style={{
              backgroundColor: '#eff6ff',
              border: '2px solid #3b82f6',
              borderRadius: '0.5rem',
              padding: '1.25rem',
              marginBottom: '1.5rem',
            }}
          >
            <h3
              style={{
                margin: '0 0 0.5rem 0',
                color: '#1e40af',
                fontSize: '1rem',
                fontWeight: 600,
              }}
            >
              Integration Secret Provisioned (One-Time Reveal)
            </h3>
            <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', color: '#1e3a8a' }}>
              <strong>Important:</strong> This secret is encrypted with AES-256-GCM. It will{' '}
              <strong>NOT</strong> be displayed again after you leave this page. Copy and store it
              in your secret manager now.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                readOnly
                value={revealedSecret}
                data-testid="plaintext-secret-value"
                style={{
                  flex: 1,
                  fontFamily: 'monospace',
                  padding: '0.5rem',
                  fontSize: '0.875rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #93c5fd',
                  borderRadius: '0.375rem',
                }}
              />
              <button
                type="button"
                data-testid="btn-copy-secret"
                onClick={() => {
                  navigator.clipboard.writeText(revealedSecret);
                  alert('Secret copied to clipboard!');
                }}
                style={{
                  backgroundColor: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                Copy Secret
              </button>
            </div>
          </div>
        )}

        {/* Credentials & Authentication Card */}
        <div
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            padding: '1.25rem',
            marginBottom: '1.5rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 0.25rem 0' }}>
                Credentials & Authentication
              </h2>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>
                {connection.hasActiveSecret
                  ? 'An active HMAC-SHA256 secret is configured for this connection.'
                  : 'No active secret provisioned yet.'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {!connection.hasActiveSecret ? (
                <button
                  type="button"
                  data-testid="btn-provision-secret"
                  onClick={() => void handleProvisionSecret()}
                  style={{
                    backgroundColor: '#2563eb',
                    color: '#fff',
                    padding: '0.4rem 0.8rem',
                    borderRadius: '0.375rem',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                  }}
                >
                  Provision Secret
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="btn-rotate-secret"
                  onClick={() => void handleRotateSecret()}
                  style={{
                    backgroundColor: '#4b5563',
                    color: '#fff',
                    padding: '0.4rem 0.8rem',
                    borderRadius: '0.375rem',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                  }}
                >
                  Rotate Secret
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* Kind-Specific Functional Panels                                  */}
        {/* ================================================================= */}

        {/* 1. OUTBOUND_WEBHOOK */}
        {connection.kind === 'OUTBOUND_WEBHOOK' && (
          <div>
            {/* Subscriptions */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                padding: '1.25rem',
                marginBottom: '1.5rem',
              }}
            >
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 1rem 0' }}>
                Webhook Subscriptions
              </h2>

              <form
                onSubmit={handleCreateSubscription}
                style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}
              >
                <input
                  type="url"
                  required
                  placeholder="https://your-domain.com/webhooks"
                  value={newEndpointUrl}
                  onChange={(e) => setNewEndpointUrl(e.target.value)}
                  data-testid="input-endpoint-url"
                  style={{
                    flex: 1,
                    minWidth: 260,
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                  }}
                />
                <button
                  type="submit"
                  data-testid="btn-create-subscription"
                  style={{
                    backgroundColor: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    fontWeight: 500,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  + Add Subscription
                </button>
              </form>

              {subscriptions.length === 0 ? (
                <p
                  style={{ color: '#6b7280', fontSize: '0.875rem' }}
                  data-testid="empty-subscriptions"
                >
                  No active subscriptions.
                </p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Endpoint URL</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Events</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions.map((s) => (
                      <tr
                        key={s.id}
                        data-testid={`row-subscription-${s.id}`}
                        style={{ borderBottom: '1px solid #f3f4f6' }}
                      >
                        <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>
                          {s.endpointUrl}
                        </td>
                        <td style={{ padding: '0.5rem' }}>{s.eventTypes.join(', ')}</td>
                        <td style={{ padding: '0.5rem' }}>{s.status}</td>
                        <td style={{ textAlign: 'right', padding: '0.5rem' }}>
                          <button
                            type="button"
                            onClick={() => void handleDeleteSubscription(s.id)}
                            data-testid={`btn-delete-sub-${s.id}`}
                            style={{
                              backgroundColor: 'transparent',
                              color: '#dc2626',
                              border: 'none',
                              cursor: 'pointer',
                              fontWeight: 500,
                            }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Deliveries */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                padding: '1.25rem',
              }}
            >
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 1rem 0' }}>
                Recent Webhook Deliveries
              </h2>
              {deliveries.length === 0 ? (
                <p
                  style={{ color: '#6b7280', fontSize: '0.875rem' }}
                  data-testid="empty-deliveries"
                >
                  No webhook deliveries logged yet.
                </p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Event Type</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Attempts</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Last HTTP</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Next / Delivered</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.map((d) => (
                      <tr
                        key={d.id}
                        data-testid={`row-delivery-${d.id}`}
                        style={{ borderBottom: '1px solid #f3f4f6' }}
                      >
                        <td style={{ padding: '0.5rem', fontWeight: 500 }}>{d.eventType}</td>
                        <td style={{ padding: '0.5rem' }}>
                          <span
                            data-testid={`badge-delivery-${d.deliveryStatus.toLowerCase()}`}
                            style={{
                              backgroundColor:
                                d.deliveryStatus === 'SUCCESS'
                                  ? '#dcfce7'
                                  : d.deliveryStatus === 'RETRYING'
                                    ? '#fef3c7'
                                    : '#fee2e2',
                              color:
                                d.deliveryStatus === 'SUCCESS'
                                  ? '#166534'
                                  : d.deliveryStatus === 'RETRYING'
                                    ? '#92400e'
                                    : '#991b1b',
                              padding: '0.2rem 0.4rem',
                              borderRadius: '0.25rem',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}
                          >
                            {d.deliveryStatus}
                          </span>
                        </td>
                        <td style={{ padding: '0.5rem' }}>{d.attempts}</td>
                        <td style={{ padding: '0.5rem' }}>{d.lastHttpStatus ?? '-'}</td>
                        <td style={{ padding: '0.5rem', color: '#6b7280' }}>
                          {d.deliveredAt
                            ? new Date(d.deliveredAt).toLocaleTimeString()
                            : d.nextAttemptAt
                              ? `Next: ${new Date(d.nextAttemptAt).toLocaleTimeString()}`
                              : '-'}
                        </td>
                        <td style={{ textAlign: 'right', padding: '0.5rem' }}>
                          {(d.deliveryStatus === 'EXHAUSTED' ||
                            d.deliveryStatus === 'FAILED' ||
                            d.deliveryStatus === 'RETRYING') && (
                            <button
                              type="button"
                              data-testid={`btn-retry-delivery-${d.id}`}
                              onClick={() => void handleRetryDelivery(d.id)}
                              style={{
                                backgroundColor: '#2563eb',
                                color: '#fff',
                                border: 'none',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '0.25rem',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                              }}
                            >
                              Retry
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* 2. INBOUND_TELEMATICS */}
        {connection.kind === 'INBOUND_TELEMATICS' && (
          <div>
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                padding: '1.25rem',
                marginBottom: '1.5rem',
              }}
            >
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>
                Telematics Ingest Webhook Endpoint
              </h2>
              <p style={{ fontSize: '0.875rem', color: '#4b5563', margin: '0 0 0.5rem 0' }}>
                External telematics providers send position batches to this authenticated endpoint:
              </p>
              <div
                data-testid="telematics-webhook-url"
                style={{
                  backgroundColor: '#f3f4f6',
                  padding: '0.75rem',
                  borderRadius: '0.375rem',
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                }}
              >
                POST /api/v1/integrations/telematics/{connection.id}/events
              </div>
              <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: '0.5rem' }}>
                Required Headers: <code>X-VMS-Signature: v1=&lt;hmac-sha256&gt;</code> &bull;{' '}
                <code>X-VMS-Timestamp: &lt;epoch-ms&gt;</code> (clock skew &plusmn;5m)
              </p>
            </div>

            {/* Provider-Device Mappings */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                padding: '1.25rem',
              }}
            >
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 1rem 0' }}>
                Provider-to-Device Mappings
              </h2>

              <form
                onSubmit={handleUpsertMapping}
                style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}
              >
                <input
                  type="text"
                  required
                  placeholder="Provider Device ID (e.g. SAMSARA-992)"
                  value={providerDeviceId}
                  onChange={(e) => setProviderDeviceId(e.target.value)}
                  data-testid="input-provider-device-id"
                  style={{
                    flex: 1,
                    minWidth: 200,
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                  }}
                />
                <input
                  type="text"
                  required
                  placeholder="Internal TelemetryDevice UUID"
                  value={telemetryDeviceId}
                  onChange={(e) => setTelemetryDeviceId(e.target.value)}
                  data-testid="input-telemetry-device-id"
                  style={{
                    flex: 1,
                    minWidth: 260,
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                  }}
                />
                <button
                  type="submit"
                  data-testid="btn-save-mapping"
                  style={{
                    backgroundColor: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    fontWeight: 500,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  Save Mapping
                </button>
              </form>

              {deviceMappings.length === 0 ? (
                <p style={{ color: '#6b7280', fontSize: '0.875rem' }} data-testid="empty-mappings">
                  No device mappings registered.
                </p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Provider Device ID</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Telemetry Device</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deviceMappings.map((m) => (
                      <tr
                        key={m.id}
                        data-testid={`row-mapping-${m.id}`}
                        style={{ borderBottom: '1px solid #f3f4f6' }}
                      >
                        <td style={{ padding: '0.5rem', fontWeight: 500 }}>{m.providerDeviceId}</td>
                        <td style={{ padding: '0.5rem' }}>
                          {m.telemetryDevice
                            ? `${m.telemetryDevice.displayId} (${m.telemetryDevice.name})`
                            : m.telemetryDeviceId}
                        </td>
                        <td style={{ padding: '0.5rem' }}>{m.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* 3. FUEL_CARD_IMPORT */}
        {connection.kind === 'FUEL_CARD_IMPORT' && (
          <div>
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                padding: '1.25rem',
                marginBottom: '1.5rem',
              }}
            >
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 1rem 0' }}>
                Upload Fuel-Card Transaction File (CSV)
              </h2>

              <form
                onSubmit={handlePreviewFuelCsv}
                style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}
              >
                <input
                  type="file"
                  accept=".csv"
                  required
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  data-testid="input-fuel-csv"
                  style={{ fontSize: '0.875rem' }}
                />
                <button
                  type="submit"
                  disabled={!selectedFile}
                  data-testid="btn-preview-csv"
                  style={{
                    backgroundColor: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    fontWeight: 500,
                    fontSize: '0.875rem',
                    cursor: selectedFile ? 'pointer' : 'not-allowed',
                  }}
                >
                  Preview Import
                </button>
              </form>

              {/* Preview Table */}
              {previewResult && (
                <div style={{ marginTop: '1.5rem' }} data-testid="fuel-import-preview-box">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.75rem',
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                      Preview: {previewResult.validRows} valid / {previewResult.totalRows} total
                      rows
                    </h3>
                    {previewResult.validRows > 0 && (
                      <button
                        type="button"
                        onClick={() => void handleConfirmFuelImport()}
                        data-testid="btn-confirm-import"
                        style={{
                          backgroundColor: '#16a34a',
                          color: '#fff',
                          border: 'none',
                          padding: '0.5rem 1rem',
                          borderRadius: '0.375rem',
                          fontWeight: 600,
                          fontSize: '0.875rem',
                          cursor: 'pointer',
                        }}
                      >
                        Confirm Import ({previewResult.validRows} Rows)
                      </button>
                    )}
                  </div>

                  <table
                    style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}
                  >
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>
                        <th style={{ textAlign: 'left', padding: '0.4rem' }}>Ext ID</th>
                        <th style={{ textAlign: 'left', padding: '0.4rem' }}>Vehicle</th>
                        <th style={{ textAlign: 'left', padding: '0.4rem' }}>Date</th>
                        <th style={{ textAlign: 'left', padding: '0.4rem' }}>Volume</th>
                        <th style={{ textAlign: 'left', padding: '0.4rem' }}>Total</th>
                        <th style={{ textAlign: 'left', padding: '0.4rem' }}>Validation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewResult.rows.map((r: FuelCardPreviewRow, idx: number) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '0.4rem' }}>{r.externalTransactionId}</td>
                          <td style={{ padding: '0.4rem' }}>{r.vehicleRegistration}</td>
                          <td style={{ padding: '0.4rem' }}>{r.occurredAt}</td>
                          <td style={{ padding: '0.4rem' }}>
                            {r.quantity} {r.quantityUnit}
                          </td>
                          <td style={{ padding: '0.4rem' }}>
                            {r.totalAmount} {r.currencyCode}
                          </td>
                          <td style={{ padding: '0.4rem' }}>
                            {r.validationError ? (
                              <span style={{ color: '#dc2626' }}>{r.validationError}</span>
                            ) : (
                              <span style={{ color: '#16a34a', fontWeight: 600 }}>
                                &check; Ready
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Past Batches */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                padding: '1.25rem',
              }}
            >
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 1rem 0' }}>
                Import History
              </h2>
              {fuelBatches.length === 0 ? (
                <p
                  style={{ color: '#6b7280', fontSize: '0.875rem' }}
                  data-testid="empty-fuel-batches"
                >
                  No fuel card batches confirmed yet.
                </p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>File Name</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Valid / Imported</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fuelBatches.map((b) => (
                      <tr
                        key={b.id}
                        data-testid={`row-batch-${b.id}`}
                        style={{ borderBottom: '1px solid #f3f4f6' }}
                      >
                        <td style={{ padding: '0.5rem', fontWeight: 500 }}>{b.fileName}</td>
                        <td style={{ padding: '0.5rem' }}>{b.status}</td>
                        <td style={{ padding: '0.5rem' }}>
                          {b.importedRows} / {b.totalRows}
                        </td>
                        <td style={{ padding: '0.5rem', color: '#6b7280' }}>
                          {new Date(b.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* 4. ACCOUNTING_EXPORT */}
        {connection.kind === 'ACCOUNTING_EXPORT' && (
          <div>
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                padding: '1.25rem',
                marginBottom: '1.5rem',
              }}
            >
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 1rem 0' }}>
                Accounting-Ready Financial CSV Export
              </h2>
              <p style={{ fontSize: '0.875rem', color: '#4b5563', margin: '0 0 1rem 0' }}>
                Exports POSTED fuel transactions and POSTED expenses within the given UTC date
                window. Formula injection sanitized.
              </p>

              <div
                style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#374151',
                      marginBottom: '0.25rem',
                    }}
                  >
                    From (UTC)
                  </label>
                  <input
                    type="date"
                    value={exportFrom}
                    onChange={(e) => setExportFrom(e.target.value)}
                    data-testid="input-export-from"
                    style={{
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#374151',
                      marginBottom: '0.25rem',
                    }}
                  >
                    To (UTC)
                  </label>
                  <input
                    type="date"
                    value={exportTo}
                    onChange={(e) => setExportTo(e.target.value)}
                    data-testid="input-export-to"
                    style={{
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#374151',
                      marginBottom: '0.25rem',
                    }}
                  >
                    Currency Filter (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. USD, EUR"
                    maxLength={3}
                    value={exportCurrency}
                    onChange={(e) => setExportCurrency(e.target.value.toUpperCase())}
                    data-testid="input-export-currency"
                    style={{
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      width: 120,
                    }}
                  />
                </div>

                <button
                  type="button"
                  data-testid="btn-export-accounting"
                  onClick={() => void handleAccountingExport()}
                  style={{
                    backgroundColor: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    padding: '0.5rem 1.25rem',
                    borderRadius: '0.375rem',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    height: 38,
                  }}
                >
                  Download Accounting CSV
                </button>
              </div>
            </div>

            {/* Export History */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                padding: '1.25rem',
              }}
            >
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 1rem 0' }}>
                Accounting Export Logs
              </h2>
              {accountingExports.length === 0 ? (
                <p
                  style={{ color: '#6b7280', fontSize: '0.875rem' }}
                  data-testid="empty-accounting-exports"
                >
                  No export logs found.
                </p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Format</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Window (UTC)</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Rows</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Exported At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountingExports.map((ex) => (
                      <tr
                        key={ex.id}
                        data-testid={`row-export-${ex.id}`}
                        style={{ borderBottom: '1px solid #f3f4f6' }}
                      >
                        <td style={{ padding: '0.5rem', fontWeight: 500 }}>{ex.format}</td>
                        <td style={{ padding: '0.5rem' }}>
                          {new Date(ex.fromUtc).toLocaleDateString()} &rarr;{' '}
                          {new Date(ex.toUtc).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '0.5rem' }}>{ex.rowCount}</td>
                        <td style={{ padding: '0.5rem', color: '#6b7280' }}>
                          {new Date(ex.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
