'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ReportControls } from '../../../components/report-controls';
import { TenantHeader } from '../../../components/tenant-header';
import {
  reportingApi,
  type CostAnalyticsReport,
  type FuelAnalyticsReport,
} from '../../../lib/api-client';

const FUEL_ANOMALY_LABELS: Record<string, string> = {
  ODOMETER_REGRESSION: 'Odometer regression',
  DUPLICATE_REFERENCE: 'Duplicate reference',
  DUPLICATE_TRANSACTION: 'Duplicate transaction',
  FUTURE_TRANSACTION_DATE: 'Future transaction date',
  ZERO_DISTANCE_REFUEL: 'Zero distance refuel',
  UNUSUAL_UNIT_PRICE: 'Unusual unit price',
};

export default function CostAnalyticsReportPage() {
  const [costData, setCostData] = useState<CostAnalyticsReport | null>(null);
  const [fuelData, setFuelData] = useState<FuelAnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0] ?? '';
  });
  const [to, setTo] = useState(() => {
    return new Date().toISOString().split('T')[0] ?? '';
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [costs, fuel] = await Promise.all([
        reportingApi.fetchCostAnalyticsReport({ from: from || undefined, to: to || undefined }),
        reportingApi.fetchFuelAnalyticsReport({ from: from || undefined, to: to || undefined }),
      ]);
      setCostData(costs);
      setFuelData(fuel);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load financial analytics report');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleDateChange = (newFrom: string, newTo: string) => {
    setFrom(newFrom);
    setTo(newTo);
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
      <TenantHeader onAuthChange={loadData} />

      <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}
        >
          <Link
            href="/reports"
            style={{ fontSize: '0.875rem', color: '#2563eb', textDecoration: 'none' }}
          >
            &larr; Reports Dashboard
          </Link>
        </div>
        <h1
          data-testid="costs-report-title"
          style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0, color: '#111827' }}
        >
          Costs & Fuel Analytics
        </h1>
        <p style={{ color: '#4b5563', margin: '0.35rem 0 0 0', fontSize: '0.95rem' }}>
          Strictly segregated multi-currency financial ledger, unit-partitioned energy consumption,
          and cost per km metrics.
        </p>
      </div>

      <ReportControls
        reportKey="costs"
        from={from}
        to={to}
        onDateChange={handleDateChange}
        exportTitle="Export Financials"
      />

      {loading && (
        <div
          data-testid="loading-indicator"
          style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}
        >
          Loading financial metrics...
        </div>
      )}

      {error && (
        <div
          data-testid="error-message"
          style={{
            padding: '1rem',
            backgroundColor: '#fee2e2',
            border: '1px solid #f87171',
            borderRadius: '8px',
            color: '#b91c1c',
            marginBottom: '1.5rem',
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && costData && fuelData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Multi-Currency Financial Sections */}
          <div>
            <div style={{ marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: '#111827' }}>
                Financial Spend by Currency
              </h2>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0.25rem 0 0 0' }}>
                Each currency is isolated into its own accounting partition. Only POSTED fuel
                transactions and expenses are included. Zero foreign exchange (FX) conversion is
                applied.
              </p>
            </div>

            {costData.summariesByCurrency.length === 0 ? (
              <div
                style={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '2rem',
                  textAlign: 'center',
                  color: '#9ca3af',
                }}
              >
                No posted financial transactions found in this period.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {costData.summariesByCurrency.map((curr) => {
                  const catList = costData.categories.filter(
                    (c) => c.currencyCode === curr.currencyCode,
                  );
                  return (
                    <div
                      key={curr.currencyCode}
                      data-testid={`currency-${curr.currencyCode}`}
                      style={{
                        backgroundColor: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '1.5rem',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      }}
                    >
                      {/* Currency Banner */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                          borderBottom: '1px solid #f3f4f6',
                          paddingBottom: '1rem',
                          flexWrap: 'wrap',
                          gap: '0.5rem',
                        }}
                      >
                        <div>
                          <span
                            style={{
                              fontSize: '0.85rem',
                              fontWeight: 700,
                              padding: '0.25rem 0.6rem',
                              backgroundColor: '#ecfdf5',
                              color: '#065f46',
                              borderRadius: '4px',
                              border: '1px solid #a7f3d0',
                            }}
                          >
                            {curr.currencyCode}
                          </span>
                          <span
                            style={{
                              marginLeft: '0.75rem',
                              fontSize: '1.5rem',
                              fontWeight: 700,
                              color: '#111827',
                            }}
                          >
                            Total Spend:{' '}
                            {curr.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}{' '}
                            {curr.currencyCode}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#4b5563' }}>
                          Cost per km:{' '}
                          <strong style={{ color: '#047857' }}>
                            {curr.costPerKm !== null
                              ? `${curr.costPerKm.toFixed(3)} ${curr.currencyCode}/km`
                              : 'N/A'}
                          </strong>
                        </div>
                      </div>

                      {/* Breakdown Cards */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                          gap: '1rem',
                          margin: '1rem 0',
                        }}
                      >
                        <div
                          style={{
                            padding: '0.75rem',
                            backgroundColor: '#f9fafb',
                            borderRadius: '6px',
                            border: '1px solid #e5e7eb',
                          }}
                        >
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            POSTED FUEL SPEND
                          </div>
                          <div
                            style={{
                              fontSize: '1.25rem',
                              fontWeight: 600,
                              color: '#111827',
                              marginTop: '0.25rem',
                            }}
                          >
                            {curr.totalFuelAmount.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}{' '}
                            {curr.currencyCode}
                          </div>
                        </div>
                        <div
                          style={{
                            padding: '0.75rem',
                            backgroundColor: '#f9fafb',
                            borderRadius: '6px',
                            border: '1px solid #e5e7eb',
                          }}
                        >
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            POSTED EXPENSE SPEND
                          </div>
                          <div
                            style={{
                              fontSize: '1.25rem',
                              fontWeight: 600,
                              color: '#111827',
                              marginTop: '0.25rem',
                            }}
                          >
                            {curr.totalExpenseAmount.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}{' '}
                            {curr.currencyCode}
                          </div>
                        </div>
                        <div
                          style={{
                            padding: '0.75rem',
                            backgroundColor: '#f9fafb',
                            borderRadius: '6px',
                            border: '1px solid #e5e7eb',
                          }}
                        >
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            COMPLETED TRIP DISTANCE
                          </div>
                          <div
                            style={{
                              fontSize: '1.25rem',
                              fontWeight: 600,
                              color: '#111827',
                              marginTop: '0.25rem',
                            }}
                          >
                            {curr.authoritativeDistanceKm.toLocaleString()} km
                          </div>
                        </div>
                      </div>

                      {/* Category Breakdown Table */}
                      <h4
                        style={{
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          color: '#374151',
                          margin: '1rem 0 0.5rem 0',
                        }}
                      >
                        Spend by Expense Category ({curr.currencyCode})
                      </h4>
                      <div style={{ overflowX: 'auto' }}>
                        <table
                          style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}
                        >
                          <thead>
                            <tr
                              style={{
                                backgroundColor: '#f9fafb',
                                borderBottom: '1px solid #e5e7eb',
                                color: '#4b5563',
                              }}
                            >
                              <th style={{ padding: '0.5rem', textAlign: 'left' }}>Category</th>
                              <th style={{ padding: '0.5rem', textAlign: 'right' }}>
                                Total Amount ({curr.currencyCode})
                              </th>
                              <th style={{ padding: '0.5rem', textAlign: 'right' }}>
                                % of Currency Total
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {catList.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={3}
                                  style={{
                                    padding: '0.75rem',
                                    textAlign: 'center',
                                    color: '#9ca3af',
                                  }}
                                >
                                  No categorized expenses.
                                </td>
                              </tr>
                            ) : (
                              catList.map((cat) => (
                                <tr
                                  key={cat.categoryId}
                                  style={{ borderBottom: '1px solid #f3f4f6' }}
                                >
                                  <td style={{ padding: '0.5rem', fontWeight: 500 }}>
                                    {cat.categoryName}
                                  </td>
                                  <td
                                    style={{
                                      padding: '0.5rem',
                                      textAlign: 'right',
                                      fontWeight: 600,
                                    }}
                                  >
                                    {cat.totalAmount.toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                    })}
                                  </td>
                                  <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                                    {cat.percentageWithinCurrency}%
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Fuel & Energy Physical Consumption */}
          <div
            style={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: '#111827' }}>
                  Fuel & Energy Volume Segregation
                </h2>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0.25rem 0 0 0' }}>
                  Quantities are grouped by measurement unit. Liters, kWh, and kilograms are
                  physical units that must never be added across boundaries.
                </p>
              </div>
            </div>

            {/* Units Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem',
              }}
            >
              {fuelData.quantitiesByUnit.length === 0 ? (
                <div style={{ color: '#9ca3af', fontStyle: 'italic' }}>
                  No fuel transactions recorded in period.
                </div>
              ) : (
                fuelData.quantitiesByUnit.map((u) => (
                  <div
                    key={u.quantityUnit}
                    style={{
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      padding: '1rem',
                      backgroundColor: '#f9fafb',
                    }}
                  >
                    <div style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
                      UNIT: {u.quantityUnit}
                    </div>
                    <div
                      style={{
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        color: '#111827',
                        marginTop: '0.25rem',
                      }}
                    >
                      {u.totalQuantity.toLocaleString()} {u.quantityUnit}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Energy Type Breakdown Table */}
            <h4
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#374151',
                margin: '0 0 0.5rem 0',
              }}
            >
              Breakdown by Energy / Fuel Type
            </h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr
                    style={{
                      backgroundColor: '#f9fafb',
                      borderBottom: '1px solid #e5e7eb',
                      color: '#4b5563',
                    }}
                  >
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Energy Type</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Unit</th>
                    <th style={{ padding: '0.5rem', textAlign: 'right' }}>Transactions</th>
                    <th style={{ padding: '0.5rem', textAlign: 'right' }}>Total Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {fuelData.fuelTypeDistribution.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        style={{ padding: '0.75rem', textAlign: 'center', color: '#9ca3af' }}
                      >
                        No fuel data available.
                      </td>
                    </tr>
                  ) : (
                    fuelData.fuelTypeDistribution.map((f) => (
                      <tr
                        key={`${f.fuelType}-${f.quantityUnit}`}
                        style={{ borderBottom: '1px solid #f3f4f6' }}
                      >
                        <td style={{ padding: '0.5rem', fontWeight: 500 }}>{f.fuelType}</td>
                        <td style={{ padding: '0.5rem' }}>{f.quantityUnit}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right' }}>{f.count}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 600 }}>
                          {f.totalQuantity.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Operational Fuel Anomalies */}
            <div style={{ marginTop: '1.5rem' }}>
              <h4
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#374151',
                  margin: '0 0 0.5rem 0',
                }}
              >
                Operational Fuel Anomalies
              </h4>
              <div style={{ overflowX: 'auto' }}>
                <table
                  data-testid="fuel-anomalies-table"
                  style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}
                >
                  <thead>
                    <tr
                      style={{
                        backgroundColor: '#f9fafb',
                        borderBottom: '1px solid #e5e7eb',
                        color: '#4b5563',
                      }}
                    >
                      <th style={{ padding: '0.5rem', textAlign: 'left' }}>Anomaly Code</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left' }}>Description</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Occurrences</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fuelData.anomalies.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          style={{ padding: '0.75rem', textAlign: 'center', color: '#9ca3af' }}
                        >
                          No fuel anomalies detected in this period.
                        </td>
                      </tr>
                    ) : (
                      fuelData.anomalies.map((a) => (
                        <tr
                          key={a.anomalyCode}
                          data-testid={`anomaly-row-${a.anomalyCode.toLowerCase()}`}
                          style={{ borderBottom: '1px solid #f3f4f6' }}
                        >
                          <td style={{ padding: '0.5rem', fontWeight: 600, color: '#dc2626' }}>
                            {a.anomalyCode}
                          </td>
                          <td style={{ padding: '0.5rem', color: '#4b5563' }}>
                            {FUEL_ANOMALY_LABELS[a.anomalyCode] ?? a.anomalyCode}
                          </td>
                          <td
                            style={{
                              padding: '0.5rem',
                              textAlign: 'right',
                              fontWeight: 600,
                              color: '#111827',
                            }}
                          >
                            {a.count}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Compliance & Accounting Disclosure */}
          <div
            style={{
              padding: '1rem',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '0.8rem',
              color: '#64748b',
            }}
          >
            <strong>Accounting Isolation Rule:</strong> All cost calculations exclude VOIDED and
            DRAFT transactions. Currency totals are strictly compartmentalized to maintain
            accounting integrity across multi-national fleet operations without assuming arbitrary
            or volatile foreign exchange conversion rates.
          </div>
        </div>
      )}
    </div>
  );
}
