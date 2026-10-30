'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../components/tenant-header';
import { financeApi, type FinanceSummaryResponse } from '../../lib/api-client';

export default function FinanceDashboardPage() {
  const [summary, setSummary] = useState<FinanceSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await financeApi.fetchSummary(fromDate || undefined, toDate || undefined);
      setSummary(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load finance summary');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const spendByCurrency = summary?.spendByCurrency ?? [];

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
            data-testid="finance-title"
          >
            Finance & Cost Management
          </h1>
          <p style={{ color: '#4b5563', margin: '0.25rem 0 0 0' }}>
            Fuel consumption, fleet expenses, category attributions, and vehicle efficiency metrics.
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
            href="/fuel"
            style={{
              padding: '0.5rem 1rem',
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 500,
              color: '#374151',
            }}
            data-testid="btn-view-fuel"
          >
            Fuel Logs
          </Link>
          <Link
            href="/expenses"
            style={{
              padding: '0.5rem 1rem',
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 500,
              color: '#374151',
            }}
            data-testid="btn-view-expenses"
          >
            Expenses
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
            Categories
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
          data-testid="finance-error"
        >
          {error}
        </div>
      )}

      {/* Date Filters */}
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
            From Date:
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{ padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            data-testid="filter-from-date"
          />
        </div>
        <div>
          <label style={{ fontSize: '0.875rem', fontWeight: 500, marginRight: '0.5rem' }}>
            To Date:
          </label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{ padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            data-testid="filter-to-date"
          />
        </div>
        {(fromDate || toDate) && (
          <button
            type="button"
            onClick={() => {
              setFromDate('');
              setToDate('');
            }}
            style={{
              padding: '0.375rem 0.75rem',
              background: '#e5e7eb',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {loading ? (
        <div
          style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}
          data-testid="finance-loading"
        >
          Loading financial metrics...
        </div>
      ) : (
        <>
          {/* Currency Totals Cards */}
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.75rem' }}>
            Cost Summaries by Currency
          </h2>
          {spendByCurrency.length === 0 ? (
            <div
              style={{
                padding: '2rem',
                textAlign: 'center',
                background: '#f9fafb',
                borderRadius: '8px',
                color: '#6b7280',
                marginBottom: '2rem',
              }}
              data-testid="no-costs-message"
            >
              No financial transactions posted yet.
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '1rem',
                marginBottom: '2rem',
              }}
            >
              {spendByCurrency.map((item) => (
                <div
                  key={item.currencyCode}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '1.25rem',
                    background: '#fff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                  data-testid={`currency-card-${item.currencyCode}`}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      borderBottom: '1px solid #f3f4f6',
                      paddingBottom: '0.5rem',
                      marginBottom: '0.75rem',
                    }}
                  >
                    <span style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>
                      {item.currencyCode}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.875rem',
                      }}
                    >
                      <span style={{ color: '#4b5563' }}>Fuel:</span>
                      <span
                        style={{ fontWeight: 600 }}
                        data-testid={`fuel-total-${item.currencyCode}`}
                      >
                        {item.fuelSpend.toFixed(2)} {item.currencyCode}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.875rem',
                      }}
                    >
                      <span style={{ color: '#4b5563' }}>Expenses:</span>
                      <span
                        style={{ fontWeight: 600 }}
                        data-testid={`expense-total-${item.currencyCode}`}
                      >
                        {item.expenseSpend.toFixed(2)} {item.currencyCode}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '1rem',
                        fontWeight: 700,
                        borderTop: '1px dashed #e5e7eb',
                        paddingTop: '0.5rem',
                        marginTop: '0.25rem',
                        color: '#1f2937',
                      }}
                    >
                      <span>Grand Total:</span>
                      <span data-testid={`grand-total-${item.currencyCode}`}>
                        {item.totalSpend.toFixed(2)} {item.currencyCode}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Category Breakdown */}
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.75rem' }}>
              Expense Breakdown by Category
            </h2>
            {!summary?.spendByCategory || summary.spendByCategory.length === 0 ? (
              <p style={{ color: '#6b7280', fontStyle: 'italic' }}>No expenses recorded.</p>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    textAlign: 'left',
                    fontSize: '0.875rem',
                  }}
                >
                  <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <tr>
                      <th style={{ padding: '0.75rem 1rem' }}>Category</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Code</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Transactions</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Total Amount</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Currency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.spendByCategory.map((cat) => (
                      <tr
                        key={`${cat.categoryId}-${cat.currencyCode}`}
                        style={{ borderBottom: '1px solid #f3f4f6' }}
                      >
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>
                          {cat.categoryName}
                        </td>
                        <td
                          style={{
                            padding: '0.75rem 1rem',
                            fontFamily: 'monospace',
                            color: '#4b5563',
                          }}
                        >
                          {cat.categoryCode}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>{cat.expenseCount}</td>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                          {cat.totalAmount.toFixed(2)}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>{cat.currencyCode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Top Vehicles by Cost */}
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.75rem' }}>
              Top Vehicles by Cost
            </h2>
            {!summary?.topVehiclesBySpend || summary.topVehiclesBySpend.length === 0 ? (
              <p style={{ color: '#6b7280', fontStyle: 'italic' }}>
                No vehicle cost attributions recorded.
              </p>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    textAlign: 'left',
                    fontSize: '0.875rem',
                  }}
                >
                  <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <tr>
                      <th style={{ padding: '0.75rem 1rem' }}>Vehicle</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Registration</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Fuel Cost</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Expense Cost</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Total Cost</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.topVehiclesBySpend.map((v) => (
                      <tr
                        key={`${v.vehicleId}-${v.currencyCode}`}
                        style={{ borderBottom: '1px solid #f3f4f6' }}
                      >
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{v.displayId}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>{v.registration}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          {v.fuelSpend.toFixed(2)} {v.currencyCode}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          {v.expenseSpend.toFixed(2)} {v.currencyCode}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#111827' }}>
                          {v.totalSpend.toFixed(2)} {v.currencyCode}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <Link
                            href={`/vehicles/${v.vehicleId}`}
                            style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}
                          >
                            View Vehicle &rarr;
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
