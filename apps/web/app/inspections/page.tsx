'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TenantHeader } from '../../components/tenant-header';
import {
  api,
  vehicleApi,
  type CurrentUserResponse,
  type InspectionRecord,
  type InspectionResult,
  type InspectionStatus,
  type InspectionType,
} from '../../lib/api-client';

export default function InspectionsPage() {
  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | InspectionType>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | InspectionStatus>('ALL');
  const [resultFilter, setResultFilter] = useState<'ALL' | InspectionResult>('ALL');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [res, user] = await Promise.all([
        api.fetchInspections({
          type: typeFilter !== 'ALL' ? typeFilter : undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          result: resultFilter !== 'ALL' ? resultFilter : undefined,
          limit: 100,
        }),
        vehicleApi.fetchCurrentUser().catch(() => null),
      ]);
      setInspections(res.items);
      setCurrentUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inspections');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter, resultFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const canCreate = Boolean(currentUser?.permissions.includes('inspection.create'));

  const filteredInspections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inspections.filter((i) => {
      const displayId = (i.displayId ?? '').toLowerCase();
      const tmplName = (i.template?.name ?? '').toLowerCase();
      const vText = i.vehicle
        ? `${i.vehicle.displayId} ${i.vehicle.registration} ${i.vehicle.model}`.toLowerCase()
        : '';
      const dText = i.driver
        ? `${i.driver.displayId} ${i.driver.firstName} ${i.driver.lastName}`.toLowerCase()
        : '';

      const matchesText =
        !q ||
        displayId.includes(q) ||
        tmplName.includes(q) ||
        vText.includes(q) ||
        dText.includes(q);

      const matchesType = typeFilter === 'ALL' || i.type === typeFilter;
      const matchesStatus = statusFilter === 'ALL' || i.status === statusFilter;
      const matchesResult = resultFilter === 'ALL' || i.result === resultFilter;

      return matchesText && matchesType && matchesStatus && matchesResult;
    });
  }, [inspections, query, typeFilter, statusFilter, resultFilter]);

  return (
    <main className="vehicle-page">
      <TenantHeader onAuthChange={() => void loadData()} />

      <div
        className="page-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h1 data-testid="inspections-title" style={{ fontSize: '1.75rem', fontWeight: 600 }}>
            Inspections
          </h1>
          <p style={{ color: '#64748b', marginTop: '0.25rem' }}>
            Pre-trip safety verifications, post-trip defect logs, and periodic inspections.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link
            href="/inspection-templates"
            className="secondary-btn"
            style={{
              textDecoration: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              border: '1px solid #cbd5e1',
            }}
          >
            Checklist Templates
          </Link>
          {canCreate && (
            <Link
              href="/inspections/new"
              className="primary-btn"
              data-testid="new-inspection-button"
              style={{
                textDecoration: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                background: '#1a56db',
                color: '#fff',
                fontWeight: 500,
              }}
            >
              + New Inspection
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div
          className="error-banner"
          data-testid="error-banner"
          style={{
            background: '#fef2f2',
            border: '1px solid #f87171',
            color: '#991b1b',
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            marginBottom: '1rem',
          }}
        >
          {error}
        </div>
      )}

      <div
        className="filters-row"
        style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}
      >
        <input
          type="text"
          placeholder="Search by ID, template, vehicle, driver..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="inspection-search-input"
          style={{
            flex: 1,
            minWidth: '220px',
            padding: '0.5rem',
            borderRadius: '4px',
            border: '1px solid #cbd5e1',
          }}
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'ALL' | InspectionType)}
          data-testid="inspection-type-filter"
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
        >
          <option value="ALL">All Types</option>
          <option value="PRE_TRIP">Pre-Trip</option>
          <option value="POST_TRIP">Post-Trip</option>
          <option value="PERIODIC">Periodic</option>
          <option value="SAFETY">Safety</option>
          <option value="CUSTOM">Custom</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'ALL' | InspectionStatus)}
          data-testid="inspection-status-filter"
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
        >
          <option value="ALL">All Statuses</option>
          <option value="DRAFT">DRAFT</option>
          <option value="IN_PROGRESS">IN_PROGRESS</option>
          <option value="COMPLETED">COMPLETED</option>
          <option value="CANCELLED">CANCELLED</option>
        </select>
        <select
          value={resultFilter}
          onChange={(e) => setResultFilter(e.target.value as 'ALL' | InspectionResult)}
          data-testid="inspection-result-filter"
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
        >
          <option value="ALL">All Results</option>
          <option value="PASS">PASS</option>
          <option value="FAIL">FAIL</option>
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
          Loading inspections...
        </div>
      ) : filteredInspections.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '3rem',
            background: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
          }}
          data-testid="empty-inspections-state"
        >
          <h3>No inspections found</h3>
          <p style={{ color: '#64748b', marginTop: '0.5rem' }}>
            {inspections.length === 0
              ? 'Start a new inspection to track vehicle safety.'
              : 'Try adjusting your search filters.'}
          </p>
        </div>
      ) : (
        <div
          className="table-container"
          style={{
            overflowX: 'auto',
            background: '#fff',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
          }}
        >
          <table
            className="data-table"
            data-testid="inspections-table"
            style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}
          >
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Display ID</th>
                <th style={{ padding: '0.75rem 1rem' }}>Type</th>
                <th style={{ padding: '0.75rem 1rem' }}>Template</th>
                <th style={{ padding: '0.75rem 1rem' }}>Vehicle</th>
                <th style={{ padding: '0.75rem 1rem' }}>Driver / Performer</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem' }}>Result</th>
                <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                <th style={{ padding: '0.75rem 1rem' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredInspections.map((i) => (
                <tr
                  key={i.id}
                  data-testid={`inspection-row-${i.id}`}
                  style={{ borderBottom: '1px solid #f1f5f9' }}
                >
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <Link
                      href={`/inspections/${i.id}`}
                      style={{ color: '#1a56db', textDecoration: 'none', fontWeight: 600 }}
                      data-testid={`inspection-link-${i.id}`}
                    >
                      {i.displayId}
                    </Link>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        background: '#e0f2fe',
                        color: '#0369a1',
                        fontWeight: 600,
                      }}
                    >
                      {i.type}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>
                    {i.template?.name ?? 'Template'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>
                    <Link
                      href={`/vehicles/${i.vehicle.id}`}
                      style={{ color: '#1a56db', textDecoration: 'none' }}
                    >
                      {i.vehicle.displayId}
                    </Link>
                    <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>
                      {i.vehicle.registration}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>
                    {i.driver ? (
                      <Link
                        href={`/drivers/${i.driver.id}`}
                        style={{ color: '#1a56db', textDecoration: 'none' }}
                      >
                        {i.driver.firstName} {i.driver.lastName}
                      </Link>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>Unassigned</span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontWeight: 600,
                        background:
                          i.status === 'COMPLETED'
                            ? '#dcfce7'
                            : i.status === 'IN_PROGRESS'
                              ? '#dbeafe'
                              : i.status === 'DRAFT'
                                ? '#fef9c3'
                                : '#f1f5f9',
                        color:
                          i.status === 'COMPLETED'
                            ? '#166534'
                            : i.status === 'IN_PROGRESS'
                              ? '#1e40af'
                              : i.status === 'DRAFT'
                                ? '#854d0e'
                                : '#475569',
                      }}
                      data-testid={`inspection-status-${i.id}`}
                    >
                      {i.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {i.result ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontWeight: 700,
                            background: i.result === 'PASS' ? '#dcfce7' : '#fee2e2',
                            color: i.result === 'PASS' ? '#166534' : '#991b1b',
                          }}
                          data-testid={`inspection-result-${i.id}`}
                        >
                          {i.result}
                        </span>
                        {i.hasCriticalFailure && (
                          <span
                            title="Critical defect detected"
                            style={{
                              fontSize: '0.65rem',
                              padding: '0.1rem 0.3rem',
                              borderRadius: '3px',
                              background: '#ef4444',
                              color: '#fff',
                              fontWeight: 700,
                            }}
                            data-testid={`inspection-critical-badge-${i.id}`}
                          >
                            CRITICAL
                          </span>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem', color: '#64748b' }}>
                    {new Date(i.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <Link
                      href={`/inspections/${i.id}`}
                      style={{ fontSize: '0.875rem', color: '#1a56db', textDecoration: 'none' }}
                    >
                      {i.status === 'DRAFT' || i.status === 'IN_PROGRESS' ? 'Perform' : 'View'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

