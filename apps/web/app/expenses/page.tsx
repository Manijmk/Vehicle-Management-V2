'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../components/tenant-header';
import {
  financeApi,
  vehicleApi,
  type ExpenseCategoryRecord,
  type ExpenseRecord,
  type ExpenseStatus,
  type VehicleRecord,
} from '../../lib/api-client';

export default function ExpensesListPage() {
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [categories, setCategories] = useState<ExpenseCategoryRecord[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [categoryIdFilter, setCategoryIdFilter] = useState('');
  const [vehicleIdFilter, setVehicleIdFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<ExpenseStatus | ''>('');
  const [searchFilter, setSearchFilter] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [expRes, catRes, vehRes] = await Promise.all([
        financeApi.fetchExpenses({
          categoryId: categoryIdFilter || undefined,
          vehicleId: vehicleIdFilter || undefined,
          status: statusFilter || undefined,
          search: searchFilter || undefined,
        }),
        financeApi.fetchExpenseCategories(true),
        vehicleApi.fetchVehicles(),
      ]);
      setExpenses(expRes.items);
      setTotal(expRes.total);
      setCategories(catRes);
      setVehicles(vehRes);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [categoryIdFilter, vehicleIdFilter, statusFilter, searchFilter]);

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
          <h1
            style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0 }}
            data-testid="expenses-title"
          >
            Fleet Expenses
          </h1>
          <p style={{ color: '#4b5563', margin: '0.25rem 0 0 0' }}>
            Tolls, parking, repairs, insurance, fines, and maintenance attributions ({total} total
            records).
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link
            href="/expenses/new"
            style={{
              padding: '0.5rem 1rem',
              background: '#059669',
              color: '#fff',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 500,
            }}
            data-testid="btn-new-expense"
          >
            + New Expense
          </Link>
          <Link
            href="/expense-categories"
            style={{
              padding: '0.5rem 1rem',
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 500,
              color: '#374151',
            }}
            data-testid="btn-view-categories"
          >
            Manage Categories
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
          data-testid="expenses-error"
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
            Category:
          </label>
          <select
            value={categoryIdFilter}
            onChange={(e) => setCategoryIdFilter(e.target.value)}
            style={{ padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            data-testid="filter-category"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </div>

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
            onChange={(e) => setStatusFilter(e.target.value as ExpenseStatus | '')}
            style={{ padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            data-testid="filter-status"
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">DRAFT</option>
            <option value="POSTED">POSTED</option>
            <option value="VOIDED">VOIDED</option>
          </select>
        </div>

        <div style={{ flex: 1, minWidth: '200px' }}>
          <input
            type="text"
            placeholder="Search description, vendor or ref #..."
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

        {(categoryIdFilter || vehicleIdFilter || statusFilter || searchFilter) && (
          <button
            type="button"
            onClick={() => {
              setCategoryIdFilter('');
              setVehicleIdFilter('');
              setStatusFilter('');
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
          data-testid="expenses-loading"
        >
          Loading expenses...
        </div>
      ) : expenses.length === 0 ? (
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            background: '#f9fafb',
            borderRadius: '8px',
            color: '#6b7280',
          }}
          data-testid="no-expenses-message"
        >
          No expenses found. Click <strong>+ New Expense</strong> to record a fleet cost.
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
            data-testid="expenses-table"
          >
            <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th style={{ padding: '0.75rem 1rem' }}>Display ID</th>
                <th style={{ padding: '0.75rem 1rem' }}>Category</th>
                <th style={{ padding: '0.75rem 1rem' }}>Attribution</th>
                <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                <th style={{ padding: '0.75rem 1rem' }}>Description</th>
                <th style={{ padding: '0.75rem 1rem' }}>Amount</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((exp) => (
                <tr
                  key={exp.id}
                  style={{ borderBottom: '1px solid #f3f4f6' }}
                  data-testid={`expense-row-${exp.displayId}`}
                >
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                    <Link
                      href={`/expenses/${exp.id}`}
                      style={{ color: '#2563eb', textDecoration: 'none' }}
                      data-testid={`link-expense-${exp.displayId}`}
                    >
                      {exp.displayId}
                    </Link>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>
                    {exp.category ? exp.category.name : 'Unknown'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem' }}>
                    {exp.vehicle && <div>🚗 {exp.vehicle.displayId}</div>}
                    {exp.trip && <div>🗺️ {exp.trip.displayId}</div>}
                    {exp.maintenanceWorkOrder && <div>🔧 {exp.maintenanceWorkOrder.displayId}</div>}
                    {!exp.vehicle && !exp.trip && !exp.maintenanceWorkOrder && (
                      <span style={{ color: '#9ca3af' }}>General Fleet</span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: '#4b5563' }}>
                    {new Date(exp.occurredAt).toLocaleDateString()}
                  </td>
                  <td
                    style={{
                      padding: '0.75rem 1rem',
                      maxWidth: '240px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {exp.description}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                    {exp.amount.toFixed(2)} {exp.currencyCode}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background:
                          exp.status === 'POSTED'
                            ? '#dcfce7'
                            : exp.status === 'DRAFT'
                              ? '#fef3c7'
                              : '#f3f4f6',
                        color:
                          exp.status === 'POSTED'
                            ? '#166534'
                            : exp.status === 'DRAFT'
                              ? '#92400e'
                              : '#6b7280',
                      }}
                      data-testid={`status-badge-${exp.displayId}`}
                    >
                      {exp.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <Link
                      href={`/expenses/${exp.id}`}
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
