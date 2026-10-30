'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../components/tenant-header';
import {
  financeApi,
  vehicleApi,
  type FuelTransactionRecord,
  type FuelTransactionStatus,
  type VehicleRecord,
} from '../../lib/api-client';

export default function FuelListPage() {
  const [transactions, setTransactions] = useState<FuelTransactionRecord[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [vehicleIdFilter, setVehicleIdFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<FuelTransactionStatus | ''>('');
  const [anomaliesOnly, setAnomaliesOnly] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [txRes, vehRes] = await Promise.all([
        financeApi.fetchFuelTransactions({
          vehicleId: vehicleIdFilter || undefined,
          status: statusFilter || undefined,
          hasAnomalies: anomaliesOnly ? true : undefined,
          search: searchFilter || undefined,
        }),
        vehicleApi.fetchVehicles(),
      ]);
      setTransactions(txRes.items);
      setTotal(txRes.total);
      setVehicles(vehRes);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load fuel transactions');
    } finally {
      setLoading(false);
    }
  }, [vehicleIdFilter, statusFilter, anomaliesOnly, searchFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
      <TenantHeader onAuthChange={loadData} />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '1.5rem',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0 }} data-testid="fuel-title">
            Fuel Transactions
          </h1>
          <p style={{ color: '#4b5563', margin: '0.25rem 0 0 0' }}>
            Refueling records, fuel economy tracking, receipt archives, and automated anomaly
            detection ({total} total records).
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link
            href="/fuel/new"
            style={{
              padding: '0.5rem 1rem',
              background: '#2563eb',
              color: '#fff',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 500,
            }}
            data-testid="btn-log-fuel"
          >
            + Log Fuel
          </Link>
          <Link
            href="/fuel/import"
            style={{
              padding: '0.5rem 1rem',
              background: '#4f46e5',
              color: '#fff',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 500,
            }}
            data-testid="btn-import-csv"
          >
            Import CSV
          </Link>
          <Link
            href="/finance"
            style={{
              padding: '0.5rem 1rem',
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 500,
              color: '#374151',
            }}
          >
            &larr; Finance Summary
          </Link>
        </div>
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
          data-testid="fuel-error"
        >
          {error}
        </div>
      )}

      {/* Filters Bar */}
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          background: '#f9fafb',
          padding: '1rem',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <label style={{ fontSize: '0.875rem', fontWeight: 500, marginRight: '0.5rem' }}>
            Vehicle:
          </label>
          <select
            value={vehicleIdFilter}
            onChange={(e) => setVehicleIdFilter(e.target.value)}
            style={{ padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            data-testid="filter-vehicle"
          >
            <option value="">All Vehicles</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.displayId} ({v.registration})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '0.875rem', fontWeight: 500, marginRight: '0.5rem' }}>
            Status:
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as FuelTransactionStatus | '')}
            style={{ padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            data-testid="filter-status"
          >
            <option value="">All Statuses</option>
            <option value="POSTED">POSTED</option>
            <option value="VOIDED">VOIDED</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <input
            type="checkbox"
            id="anomalyOnlyCheckbox"
            checked={anomaliesOnly}
            onChange={(e) => setAnomaliesOnly(e.target.checked)}
            data-testid="filter-anomalies"
          />
          <label htmlFor="anomalyOnlyCheckbox" style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
            Anomalies Only
          </label>
        </div>

        <div style={{ flex: 1, minWidth: '200px' }}>
          <input
            type="text"
            placeholder="Search station or ref #..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            style={{
              width: '100%',
              padding: '0.375rem 0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
            }}
            data-testid="filter-search"
          />
        </div>

        {(vehicleIdFilter || statusFilter || anomaliesOnly || searchFilter) && (
          <button
            type="button"
            onClick={() => {
              setVehicleIdFilter('');
              setStatusFilter('');
              setAnomaliesOnly(false);
              setSearchFilter('');
            }}
            style={{
              padding: '0.375rem 0.75rem',
              background: '#e5e7eb',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        )}
      </div>

      {loading ? (
        <div
          style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}
          data-testid="fuel-loading"
        >
          Loading fuel logs...
        </div>
      ) : transactions.length === 0 ? (
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            background: '#f9fafb',
            borderRadius: '8px',
            color: '#6b7280',
          }}
          data-testid="no-fuel-message"
        >
          No fuel transactions found. Click <strong>+ Log Fuel</strong> or{' '}
          <strong>Import CSV</strong> to add refuels.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '0.875rem',
            }}
            data-testid="fuel-table"
          >
            <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th style={{ padding: '0.75rem 1rem' }}>Display ID</th>
                <th style={{ padding: '0.75rem 1rem' }}>Vehicle</th>
                <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                <th style={{ padding: '0.75rem 1rem' }}>Quantity</th>
                <th style={{ padding: '0.75rem 1rem' }}>Unit Price</th>
                <th style={{ padding: '0.75rem 1rem' }}>Total Amount</th>
                <th style={{ padding: '0.75rem 1rem' }}>Odometer</th>
                <th style={{ padding: '0.75rem 1rem' }}>Anomalies</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr
                  key={tx.id}
                  style={{ borderBottom: '1px solid #f3f4f6' }}
                  data-testid={`fuel-row-${tx.displayId}`}
                >
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                    <Link
                      href={`/fuel/${tx.id}`}
                      style={{ color: '#2563eb', textDecoration: 'none' }}
                      data-testid={`link-fuel-${tx.displayId}`}
                    >
                      {tx.displayId}
                    </Link>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {tx.vehicle ? (
                      <span>
                        {tx.vehicle.displayId} ({tx.vehicle.registration})
                      </span>
                    ) : (
                      'Unknown'
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: '#4b5563' }}>
                    {new Date(tx.occurredAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {tx.quantity} {tx.quantityUnit}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {tx.unitPrice.toFixed(2)} {tx.currencyCode}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                    {tx.totalAmount.toFixed(2)} {tx.currencyCode}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {tx.odometerKm !== null ? `${tx.odometerKm} km` : '-'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {tx.anomalies && tx.anomalies.length > 0 ? (
                      <span
                        style={{
                          background: tx.anomalies.some((a) => a.severity === 'CRITICAL')
                            ? '#fee2e2'
                            : '#fef3c7',
                          color: tx.anomalies.some((a) => a.severity === 'CRITICAL')
                            ? '#991b1b'
                            : '#92400e',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                        }}
                        data-testid={`anomaly-badge-${tx.displayId}`}
                      >
                        {tx.anomalies.length} anomaly
                      </span>
                    ) : (
                      <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>None</span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background: tx.status === 'POSTED' ? '#dcfce7' : '#f3f4f6',
                        color: tx.status === 'POSTED' ? '#166534' : '#6b7280',
                      }}
                      data-testid={`status-badge-${tx.displayId}`}
                    >
                      {tx.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <Link
                      href={`/fuel/${tx.id}`}
                      style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}
                    >
                      View &rarr;
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
