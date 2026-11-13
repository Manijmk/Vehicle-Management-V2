'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import { telemetryApi, type TelemetryDeviceRecord } from '../../../lib/api-client';

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    ACTIVE: '#16a34a',
    INACTIVE: '#6b7280',
    SUSPENDED: '#dc2626',
  };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.15rem 0.5rem',
        borderRadius: 9999,
        fontSize: '0.75rem',
        fontWeight: 600,
        background: colors[status] ?? '#6b7280',
        color: '#fff',
      }}
    >
      {status}
    </span>
  );
}

export default function TelemetryDevicesPage() {
  const [devices, setDevices] = useState<TelemetryDeviceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [provisionedToken, setProvisionedToken] = useState<{
    deviceId: string;
    token: string;
  } | null>(null);

  const loadDevices = async () => {
    try {
      setLoading(true);
      const data = await telemetryApi.listDevices();
      setDevices(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDevices();
  }, []);

  const handleSuspend = async (deviceId: string) => {
    try {
      setActionError(null);
      await telemetryApi.suspendDevice(deviceId);
      await loadDevices();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to suspend device');
    }
  };

  const handleActivate = async (deviceId: string) => {
    try {
      setActionError(null);
      await telemetryApi.activateDevice(deviceId);
      await loadDevices();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to activate device');
    }
  };

  const handleProvisionCredential = async (deviceId: string) => {
    try {
      setActionError(null);
      const cred = await telemetryApi.createDeviceCredential(deviceId);
      setProvisionedToken({ deviceId, token: cred.token });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to provision credential');
    }
  };

  const handleUnassign = async (deviceId: string) => {
    try {
      setActionError(null);
      await telemetryApi.unassignDevice(deviceId);
      await loadDevices();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to unassign device');
    }
  };

  return (
    <div>
      <TenantHeader onAuthChange={loadDevices} />
      <main style={{ padding: '2rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
          }}
        >
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <Link href="/telemetry" style={{ color: '#6b7280', textDecoration: 'none' }}>
              ← Fleet Map
            </Link>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>Telemetry Devices</h1>
          </div>
          <Link
            href="/telemetry/devices/new"
            data-testid="new-device-btn"
            style={{
              padding: '0.5rem 1rem',
              background: '#1a56db',
              color: '#fff',
              borderRadius: 6,
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Register Device
          </Link>
        </div>

        {error && (
          <div
            role="alert"
            data-testid="devices-error"
            style={{
              padding: '1rem',
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: 6,
              marginBottom: '1rem',
              color: '#dc2626',
            }}
          >
            {error}
          </div>
        )}
        {actionError && (
          <div
            role="alert"
            data-testid="device-action-error"
            style={{
              padding: '1rem',
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: 6,
              marginBottom: '1rem',
              color: '#dc2626',
            }}
          >
            {actionError}
          </div>
        )}

        {provisionedToken && (
          <div
            role="status"
            data-testid="credential-success-banner"
            style={{
              padding: '1rem',
              background: '#f0fdf4',
              border: '1px solid #86efac',
              borderRadius: 6,
              marginBottom: '1rem',
              color: '#166534',
            }}
          >
            <p style={{ margin: 0, fontWeight: 600 }}>Device Machine Credential Provisioned:</p>
            <code
              data-testid="device-token-display"
              style={{
                display: 'block',
                margin: '0.5rem 0',
                wordBreak: 'break-all',
                background: '#fff',
                padding: '0.25rem 0.5rem',
                borderRadius: 4,
                border: '1px solid #bbf7d0',
              }}
            >
              {provisionedToken.token}
            </code>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#15803d' }}>
              Save this key now — it will never be displayed again.
            </p>
          </div>
        )}

        {loading ? (
          <p data-testid="devices-loading" style={{ color: '#6b7280' }}>
            Loading devices…
          </p>
        ) : devices.length === 0 ? (
          <p data-testid="devices-empty" style={{ color: '#6b7280' }}>
            No devices registered yet. Click &quot;Register Device&quot; to add one.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              data-testid="devices-table"
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}
            >
              <thead>
                <tr style={{ background: '#f3f4f6' }}>
                  <th
                    style={{
                      padding: '0.5rem 0.75rem',
                      textAlign: 'left',
                      border: '1px solid #e5e7eb',
                    }}
                  >
                    ID
                  </th>
                  <th
                    style={{
                      padding: '0.5rem 0.75rem',
                      textAlign: 'left',
                      border: '1px solid #e5e7eb',
                    }}
                  >
                    Name
                  </th>
                  <th
                    style={{
                      padding: '0.5rem 0.75rem',
                      textAlign: 'left',
                      border: '1px solid #e5e7eb',
                    }}
                  >
                    Identifier
                  </th>
                  <th
                    style={{
                      padding: '0.5rem 0.75rem',
                      textAlign: 'left',
                      border: '1px solid #e5e7eb',
                    }}
                  >
                    Status
                  </th>
                  <th
                    style={{
                      padding: '0.5rem 0.75rem',
                      textAlign: 'left',
                      border: '1px solid #e5e7eb',
                    }}
                  >
                    Assigned Vehicle
                  </th>
                  <th
                    style={{
                      padding: '0.5rem 0.75rem',
                      textAlign: 'left',
                      border: '1px solid #e5e7eb',
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr
                    key={d.id}
                    data-testid={`device-row-${d.id}`}
                    style={{ borderBottom: '1px solid #e5e7eb' }}
                  >
                    <td
                      style={{
                        padding: '0.5rem 0.75rem',
                        border: '1px solid #e5e7eb',
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                      }}
                    >
                      {d.displayId}
                    </td>
                    <td
                      style={{
                        padding: '0.5rem 0.75rem',
                        border: '1px solid #e5e7eb',
                        fontWeight: 500,
                      }}
                    >
                      {d.name}
                    </td>
                    <td
                      style={{
                        padding: '0.5rem 0.75rem',
                        border: '1px solid #e5e7eb',
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                      }}
                    >
                      {d.identifier}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', border: '1px solid #e5e7eb' }}>
                      {statusBadge(d.status)}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', border: '1px solid #e5e7eb' }}>
                      {d.activeAssignment ? (
                        <span>
                          {d.activeAssignment.vehicle?.registration ??
                            d.activeAssignment.vehicleId.slice(0, 8)}
                          <button
                            type="button"
                            data-testid={`unassign-${d.id}`}
                            onClick={() => void handleUnassign(d.id)}
                            style={{
                              marginLeft: '0.5rem',
                              fontSize: '0.75rem',
                              color: '#dc2626',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              textDecoration: 'underline',
                            }}
                          >
                            Unassign
                          </button>
                        </span>
                      ) : (
                        <span style={{ color: '#6b7280' }}>Unassigned</span>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', border: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {d.status === 'ACTIVE' && (
                          <button
                            type="button"
                            data-testid={`provision-cred-${d.id}`}
                            onClick={() => void handleProvisionCredential(d.id)}
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.25rem 0.5rem',
                              background: '#4b5563',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 4,
                              cursor: 'pointer',
                            }}
                          >
                            Key
                          </button>
                        )}
                        {d.status === 'ACTIVE' && (
                          <button
                            type="button"
                            data-testid={`suspend-${d.id}`}
                            onClick={() => void handleSuspend(d.id)}
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.25rem 0.5rem',
                              background: '#dc2626',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 4,
                              cursor: 'pointer',
                            }}
                          >
                            Suspend
                          </button>
                        )}
                        {(d.status === 'INACTIVE' || d.status === 'SUSPENDED') && (
                          <button
                            type="button"
                            data-testid={`activate-${d.id}`}
                            onClick={() => void handleActivate(d.id)}
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.25rem 0.5rem',
                              background: '#16a34a',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 4,
                              cursor: 'pointer',
                            }}
                          >
                            Activate
                          </button>
                        )}
                      </div>
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
