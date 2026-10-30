'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../components/tenant-header';
import {
  complianceApi,
  type ComplianceExceptionItem,
  type ComplianceSubjectType,
  type ComplianceSummaryResponse,
} from '../../lib/api-client';

export default function ComplianceDashboardPage() {
  const [summary, setSummary] = useState<ComplianceSummaryResponse | null>(null);
  const [exceptions, setExceptions] = useState<ComplianceExceptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<ComplianceSubjectType | ''>('');
  const [blockedOnlyFilter, setBlockedOnlyFilter] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [sumRes, excRes] = await Promise.all([
        complianceApi.fetchSummary(),
        complianceApi.fetchExceptions({
          subjectType: subjectTypeFilter || undefined,
          operationallyBlocked: blockedOnlyFilter ? true : undefined,
          search: searchFilter || undefined,
        }),
      ]);
      setSummary(sumRes);
      setExceptions(excRes.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load compliance data');
    } finally {
      setLoading(false);
    }
  }, [subjectTypeFilter, blockedOnlyFilter, searchFilter]);

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
        }}
      >
        <div>
          <h1
            style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0 }}
            data-testid="compliance-title"
          >
            Fleet Compliance & Documents
          </h1>
          <p style={{ color: '#4b5563', margin: '0.25rem 0 0 0' }}>
            Operational compliance gating, document verification, and fleet exception monitoring.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link
            href="/compliance/document-types"
            style={{
              padding: '0.5rem 1rem',
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 500,
              color: '#374151',
            }}
            data-testid="link-doc-types"
          >
            Document Types Catalog
          </Link>
          <Link
            href="/compliance/documents"
            style={{
              padding: '0.5rem 1rem',
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 500,
              color: '#374151',
            }}
            data-testid="link-all-docs"
          >
            All Documents
          </Link>
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
          data-testid="compliance-error-banner"
        >
          {error}
        </div>
      )}

      {/* Metrics Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}
        data-testid="compliance-summary-cards"
      >
        <div
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1.25rem',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 }}>
            Blocked Vehicles
          </div>
          <div
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: summary && summary.blockedVehicles > 0 ? '#dc2626' : '#111827',
              marginTop: '0.25rem',
            }}
            data-testid="metric-blocked-vehicles"
          >
            {summary?.blockedVehicles ?? 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
            Cannot dispatch on trips
          </div>
        </div>

        <div
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1.25rem',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 }}>
            Blocked Drivers
          </div>
          <div
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: summary && summary.blockedDrivers > 0 ? '#dc2626' : '#111827',
              marginTop: '0.25rem',
            }}
            data-testid="metric-blocked-drivers"
          >
            {summary?.blockedDrivers ?? 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
            Operationally ineligible
          </div>
        </div>

        <div
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1.25rem',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 }}>
            Non-Compliant Vehicles
          </div>
          <div
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: summary && summary.nonCompliantVehicles > 0 ? '#ea580c' : '#111827',
              marginTop: '0.25rem',
            }}
            data-testid="metric-non-compliant-vehicles"
          >
            {summary?.nonCompliantVehicles ?? 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
            Missing / expired required documents
          </div>
        </div>

        <div
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1.25rem',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 }}>
            Non-Compliant Drivers
          </div>
          <div
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: summary && summary.nonCompliantDrivers > 0 ? '#ea580c' : '#111827',
              marginTop: '0.25rem',
            }}
            data-testid="metric-non-compliant-drivers"
          >
            {summary?.nonCompliantDrivers ?? 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
            Missing / expired compliance certs
          </div>
        </div>

        <div
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1.25rem',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 }}>
            Expiring Soon
          </div>
          <div
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: summary && summary.expiringDocuments > 0 ? '#d97706' : '#111827',
              marginTop: '0.25rem',
            }}
            data-testid="metric-expiring-documents"
          >
            {summary?.expiringDocuments ?? 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
            Within configured warning window
          </div>
        </div>
      </div>

      {/* Exceptions Section */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1.5rem',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        }}
        data-testid="exceptions-section"
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
              Compliance Exceptions & Issues
            </h2>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
              Vehicles and drivers with missing, expired, or soon-to-expire documents.
            </p>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={subjectTypeFilter}
              onChange={(e) => setSubjectTypeFilter(e.target.value as ComplianceSubjectType | '')}
              style={{
                padding: '0.4rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem',
              }}
              data-testid="filter-subject-type"
            >
              <option value="">All Subjects</option>
              <option value="VEHICLE">Vehicles Only</option>
              <option value="DRIVER">Drivers Only</option>
            </select>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={blockedOnlyFilter}
                onChange={(e) => setBlockedOnlyFilter(e.target.checked)}
                data-testid="filter-blocked-only"
              />
              Blocked Only
            </label>

            <input
              type="text"
              placeholder="Search ID or name..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{
                padding: '0.4rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem',
                width: '180px',
              }}
              data-testid="filter-search"
            />
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            Loading compliance exceptions...
          </div>
        ) : exceptions.length === 0 ? (
          <div
            style={{
              padding: '2.5rem',
              textAlign: 'center',
              color: '#059669',
              background: '#ecfdf5',
              borderRadius: '6px',
              fontWeight: 500,
            }}
            data-testid="no-exceptions-message"
          >
            All active vehicles and drivers meet current compliance policies. No operational blocks
            active.
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
              data-testid="exceptions-table"
            >
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Type</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Subject</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Overall State</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Operation Status</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Blocking Reasons</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'right' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {exceptions.map((item) => (
                  <tr
                    key={`${item.subjectType}-${item.subjectId}`}
                    style={{ borderBottom: '1px solid #f3f4f6' }}
                    data-testid={`exception-row-${item.displayId}`}
                  >
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: item.subjectType === 'VEHICLE' ? '#e0e7ff' : '#fef3c7',
                          color: item.subjectType === 'VEHICLE' ? '#3730a3' : '#92400e',
                        }}
                      >
                        {item.subjectType}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <strong>{item.displayId}</strong>
                      {item.name ? ` (${item.name})` : ''}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span
                        style={{
                          padding: '0.25rem 0.6rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background:
                            item.overallState === 'COMPLIANT'
                              ? '#dcfce7'
                              : item.overallState === 'WARNING'
                                ? '#fef9c3'
                                : '#fee2e2',
                          color:
                            item.overallState === 'COMPLIANT'
                              ? '#166534'
                              : item.overallState === 'WARNING'
                                ? '#854d0e'
                                : '#991b1b',
                        }}
                        data-testid={`state-badge-${item.displayId}`}
                      >
                        {item.overallState}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {item.operationallyBlocked ? (
                        <span
                          style={{
                            padding: '0.25rem 0.6rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: '#fee2e2',
                            color: '#991b1b',
                          }}
                          data-testid={`blocked-badge-${item.displayId}`}
                        >
                          BLOCKED
                        </span>
                      ) : (
                        <span
                          style={{
                            padding: '0.25rem 0.6rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: '#dcfce7',
                            color: '#166534',
                          }}
                          data-testid={`clear-badge-${item.displayId}`}
                        >
                          UNBLOCKED
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', maxWidth: '350px' }}>
                      {item.blockingReasons.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#dc2626' }}>
                          {item.blockingReasons.map((reason, idx) => (
                            <li key={idx}>{reason}</li>
                          ))}
                        </ul>
                      ) : (
                        <span style={{ color: '#6b7280', fontStyle: 'italic' }}>
                          No operational block (warning only)
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <Link
                        href={
                          item.subjectType === 'VEHICLE'
                            ? `/vehicles/${item.subjectId}`
                            : `/drivers/${item.subjectId}`
                        }
                        style={{
                          color: '#2563eb',
                          textDecoration: 'none',
                          fontWeight: 500,
                        }}
                        data-testid={`manage-link-${item.displayId}`}
                      >
                        Manage &rarr;
                      </Link>
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
