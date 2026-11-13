'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TenantHeader } from '../../components/tenant-header';
import {
  telemetryApi,
  type TelemetryCurrentPositionRecord,
  type TelemetryFreshness,
} from '../../lib/api-client';

function freshnessLabel(f: TelemetryFreshness): string {
  if (f === 'FRESH') return '🟢 Fresh';
  if (f === 'STALE') return '🟡 Stale';
  return '⚫ Unknown';
}

function FleetSvgMap({ positions }: { positions: TelemetryCurrentPositionRecord[] }) {
  const W = 600;
  const H = 300;
  const PAD = 20;

  if (positions.length === 0) {
    return (
      <svg
        width={W}
        height={H}
        role="img"
        aria-label="Fleet map — no positions"
        style={{ border: '1px solid #ccc', borderRadius: 8, background: '#f8fafc' }}
      >
        <text x={W / 2} y={H / 2} textAnchor="middle" fill="#999" fontSize={14}>
          No position data yet
        </text>
      </svg>
    );
  }

  const lats = positions.map((p) => p.latitude);
  const lons = positions.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latRange = maxLat - minLat || 0.01;
  const lonRange = maxLon - minLon || 0.01;

  const toX = (lon: number) => PAD + ((lon - minLon) / lonRange) * (W - 2 * PAD);
  const toY = (lat: number) => H - PAD - ((lat - minLat) / latRange) * (H - 2 * PAD);

  const colorByFreshness: Record<TelemetryFreshness, string> = {
    FRESH: '#16a34a',
    STALE: '#ca8a04',
    UNKNOWN: '#6b7280',
  };

  return (
    <svg
      width={W}
      height={H}
      role="img"
      aria-label={`Fleet map showing ${positions.length} vehicle position${positions.length !== 1 ? 's' : ''}`}
      style={{ border: '1px solid #ccc', borderRadius: 8, background: '#f0f9ff' }}
    >
      {positions.map((p) => {
        const x = toX(p.longitude);
        const y = toY(p.latitude);
        const fill = colorByFreshness[p.freshness];
        return (
          <g key={p.vehicleId}>
            <circle
              cx={x}
              cy={y}
              r={8}
              fill={fill}
              stroke="#fff"
              strokeWidth={2}
              aria-label={`${p.vehicle?.registration ?? p.vehicleId} at ${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}`}
            />
            <text x={x} y={y - 12} textAnchor="middle" fontSize={10} fill="#374151">
              {p.vehicle?.registration ?? p.vehicleId.slice(0, 8)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function TelemetryPage() {
  const [positions, setPositions] = useState<TelemetryCurrentPositionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadPositions = async () => {
    try {
      const data = await telemetryApi.getCurrentFleetPositions();
      setPositions(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fleet positions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPositions();
    // Poll every 15 seconds for live position updates
    const interval = setInterval(() => void loadPositions(), 15_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <TenantHeader onAuthChange={loadPositions} />
      <main style={{ padding: '2rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
          }}
        >
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>Fleet Telemetry Map</h1>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {lastUpdated && (
              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                Updated: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <Link
              href="/telemetry/devices"
              data-testid="telemetry-devices-link"
              style={{
                padding: '0.5rem 1rem',
                background: '#1a56db',
                color: '#fff',
                borderRadius: 6,
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              Manage Devices
            </Link>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            data-testid="telemetry-error"
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

        <div style={{ marginBottom: '1.5rem' }}>
          <FleetSvgMap positions={positions} />
        </div>

        {loading && positions.length === 0 ? (
          <p data-testid="telemetry-loading" style={{ color: '#6b7280' }}>
            Loading fleet positions…
          </p>
        ) : (
          <section aria-label="Fleet position table">
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
              Live Fleet Positions ({positions.length})
            </h2>
            {positions.length === 0 ? (
              <p data-testid="telemetry-empty" style={{ color: '#6b7280' }}>
                No vehicle positions recorded yet. Assign a device to a vehicle and ingest a
                position to see it here.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table
                  data-testid="telemetry-fleet-table"
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
                        Vehicle
                      </th>
                      <th
                        style={{
                          padding: '0.5rem 0.75rem',
                          textAlign: 'left',
                          border: '1px solid #e5e7eb',
                        }}
                      >
                        Registration
                      </th>
                      <th
                        style={{
                          padding: '0.5rem 0.75rem',
                          textAlign: 'left',
                          border: '1px solid #e5e7eb',
                        }}
                      >
                        Device
                      </th>
                      <th
                        style={{
                          padding: '0.5rem 0.75rem',
                          textAlign: 'right',
                          border: '1px solid #e5e7eb',
                        }}
                      >
                        Latitude
                      </th>
                      <th
                        style={{
                          padding: '0.5rem 0.75rem',
                          textAlign: 'right',
                          border: '1px solid #e5e7eb',
                        }}
                      >
                        Longitude
                      </th>
                      <th
                        style={{
                          padding: '0.5rem 0.75rem',
                          textAlign: 'right',
                          border: '1px solid #e5e7eb',
                        }}
                      >
                        Speed (km/h)
                      </th>
                      <th
                        style={{
                          padding: '0.5rem 0.75rem',
                          textAlign: 'left',
                          border: '1px solid #e5e7eb',
                        }}
                      >
                        Freshness
                      </th>
                      <th
                        style={{
                          padding: '0.5rem 0.75rem',
                          textAlign: 'left',
                          border: '1px solid #e5e7eb',
                        }}
                      >
                        Captured At
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p) => (
                      <tr
                        key={p.vehicleId}
                        data-testid={`position-row-${p.vehicleId}`}
                        style={{ borderBottom: '1px solid #e5e7eb' }}
                      >
                        <td style={{ padding: '0.5rem 0.75rem', border: '1px solid #e5e7eb' }}>
                          <Link href={`/vehicles/${p.vehicleId}`} style={{ color: '#1a56db' }}>
                            {p.vehicle?.displayId ?? p.vehicleId.slice(0, 8)}
                          </Link>
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', border: '1px solid #e5e7eb' }}>
                          {p.vehicle?.registration ?? '—'}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', border: '1px solid #e5e7eb' }}>
                          {p.device?.displayId ?? p.deviceId.slice(0, 8)}
                        </td>
                        <td
                          style={{
                            padding: '0.5rem 0.75rem',
                            textAlign: 'right',
                            border: '1px solid #e5e7eb',
                          }}
                        >
                          {p.latitude.toFixed(5)}
                        </td>
                        <td
                          style={{
                            padding: '0.5rem 0.75rem',
                            textAlign: 'right',
                            border: '1px solid #e5e7eb',
                          }}
                        >
                          {p.longitude.toFixed(5)}
                        </td>
                        <td
                          style={{
                            padding: '0.5rem 0.75rem',
                            textAlign: 'right',
                            border: '1px solid #e5e7eb',
                          }}
                        >
                          {p.speedKmh != null ? p.speedKmh.toFixed(1) : '—'}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', border: '1px solid #e5e7eb' }}>
                          {freshnessLabel(p.freshness)}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', border: '1px solid #e5e7eb' }}>
                          {new Date(p.capturedAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
