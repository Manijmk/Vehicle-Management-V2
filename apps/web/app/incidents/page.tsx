'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../components/tenant-header';
import {
  incidentApi,
  vehicleApi,
  type CurrentUserResponse,
  type IncidentOperationalImpact,
  type IncidentRecord,
  type IncidentSeverity,
  type IncidentStatus,
  type IncidentType,
} from '../../lib/api-client';

export default function IncidentsListPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | ''>('');
  const [severityFilter, setSeverityFilter] = useState<IncidentSeverity | ''>('');
  const [typeFilter, setTypeFilter] = useState<IncidentType | ''>('');
  const [impactFilter, setImpactFilter] = useState<IncidentOperationalImpact | ''>('');
  const [searchFilter, setSearchFilter] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [incRes, user] = await Promise.all([
        incidentApi.fetchIncidents({
          status: statusFilter || undefined,
          severity: severityFilter || undefined,
          type: typeFilter || undefined,
          operationalImpact: impactFilter || undefined,
          search: searchFilter || undefined,
          limit: 100,
        }),
        vehicleApi.fetchCurrentUser().catch(() => null),
      ]);
      setIncidents(incRes.items);
      setTotal(incRes.total);
      setCurrentUser(user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load incidents');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, severityFilter, typeFilter, impactFilter, searchFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const canCreate = Boolean(currentUser?.permissions.includes('incident.create'));

  const getSeverityStyle = (severity: IncidentSeverity) => {
    switch (severity) {
      case 'CRITICAL':
        return { background: '#fee2e2', color: '#991b1b', border: '1px solid #f87171' };
      case 'HIGH':
        return { background: '#ffedd5', color: '#9a3412', border: '1px solid #fb923c' };
      case 'MEDIUM':
        return { background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' };
      case 'LOW':
      default:
        return { background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' };
    }
  };

  const getStatusStyle = (status: IncidentStatus) => {
    switch (status) {
      case 'REPORTED':
        return { background: '#dbeafe', color: '#1e40af' };
      case 'INVESTIGATING':
        return { background: '#fef3c7', color: '#92400e' };
      case 'RESOLVED':
        return { background: '#d1fae5', color: '#065f46' };
      case 'CLOSED':
        return { background: '#e5e7eb', color: '#374151' };
      case 'CANCELLED':
        return { background: '#fee2e2', color: '#991b1b' };
      default:
        return { background: '#f3f4f6', color: '#374151' };
    }
  };

  const getImpactStyle = (impact: IncidentOperationalImpact) => {
    switch (impact) {
      case 'BOTH':
        return { background: '#fecaca', color: '#7f1d1d' };
      case 'VEHICLE':
      case 'DRIVER':
        return { background: '#fed7aa', color: '#7c2d12' };
      case 'NONE':
      default:
        return { background: '#f3f4f6', color: '#6b7280' };
    }
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '1.5rem' }}>
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
            data-testid="incidents-title"
          >
            Incidents & Accidents
          </h1>
          <p style={{ color: '#4b5563', margin: '0.25rem 0 0 0' }}>
            Report, investigate, track operational dispatch impacts, and resolve safety and
            breakdown events ({total} total).
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {canCreate && (
            <Link
              href="/incidents/new"
              style={{
                padding: '0.5rem 1rem',
                background: '#dc2626',
                color: '#fff',
                borderRadius: '6px',
                textDecoration: 'none',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
              data-testid="report-incident-btn"
            >
              + Report Incident
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: '#fee2e2',
            color: '#b91c1c',
            borderRadius: '6px',
            marginBottom: '1rem',
          }}
          data-testid="error-message"
        >
          {error}
        </div>
      )}

      {/* Filter Toolbar */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          flexWrap: 'wrap',
          alignItems: 'center',
          padding: '1rem',
          background: '#f9fafb',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          marginBottom: '1.5rem',
        }}
      >
        <input
          type="text"
          placeholder="Search by ID, title, vehicle..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          style={{
            padding: '0.5rem 0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            minWidth: '220px',
          }}
          data-testid="search-input"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as IncidentStatus | '')}
          style={{ padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
          data-testid="filter-status"
        >
          <option value="">All Statuses</option>
          <option value="REPORTED">Reported</option>
          <option value="INVESTIGATING">Investigating</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as IncidentSeverity | '')}
          style={{ padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
          data-testid="filter-severity"
        >
          <option value="">All Severities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as IncidentType | '')}
          style={{ padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
          data-testid="filter-type"
        >
          <option value="">All Types</option>
          <option value="ACCIDENT">Accident</option>
          <option value="BREAKDOWN">Breakdown</option>
          <option value="VIOLATION">Violation</option>
          <option value="DAMAGE">Damage</option>
          <option value="THEFT">Theft</option>
          <option value="SAFETY">Safety</option>
          <option value="OTHER">Other</option>
        </select>

        <select
          value={impactFilter}
          onChange={(e) => setImpactFilter(e.target.value as IncidentOperationalImpact | '')}
          style={{ padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
          data-testid="filter-impact"
        >
          <option value="">All Operational Impacts</option>
          <option value="NONE">None (No Dispatch Block)</option>
          <option value="VEHICLE">Vehicle Blocked</option>
          <option value="DRIVER">Driver Blocked</option>
          <option value="BOTH">Both Blocked</option>
        </select>

        {(statusFilter || severityFilter || typeFilter || impactFilter || searchFilter) && (
          <button
            type="button"
            onClick={() => {
              setStatusFilter('');
              setSeverityFilter('');
              setTypeFilter('');
              setImpactFilter('');
              setSearchFilter('');
            }}
            style={{
              padding: '0.5rem 0.75rem',
              background: 'transparent',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              color: '#4b5563',
            }}
            data-testid="clear-filters-btn"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Incidents Table */}
      {loading ? (
        <div
          style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}
          data-testid="loading-indicator"
        >
          Loading incidents...
        </div>
      ) : incidents.length === 0 ? (
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            background: '#f9fafb',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
          }}
          data-testid="no-incidents"
        >
          <h3
            style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              color: '#374151',
              margin: '0 0 0.5rem 0',
            }}
          >
            No Incidents Found
          </h3>
          <p style={{ color: '#6b7280', margin: 0 }}>
            No incidents match your current search and filter criteria.
          </p>
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
            data-testid="incidents-table"
          >
            <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>ID</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>
                  Title
                </th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Type</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>
                  Severity
                </th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>
                  Status
                </th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>
                  Operational Impact
                </th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>
                  Vehicle
                </th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>
                  Driver
                </th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>
                  Occurred
                </th>
                <th
                  style={{
                    padding: '0.75rem 1rem',
                    fontWeight: 600,
                    color: '#374151',
                    textAlign: 'right',
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc) => (
                <tr
                  key={inc.id}
                  style={{ borderBottom: '1px solid #f3f4f6' }}
                  data-testid={`incident-row-${inc.id}`}
                >
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                    <Link
                      href={`/incidents/${inc.id}`}
                      style={{ color: '#1d4ed8', textDecoration: 'none' }}
                      data-testid={`incident-link-${inc.id}`}
                    >
                      {inc.displayId}
                    </Link>
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
                    <span title={inc.title}>{inc.title}</span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{ fontWeight: 500 }}>{inc.type}</span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        ...getSeverityStyle(inc.severity),
                      }}
                      data-testid={`incident-severity-${inc.id}`}
                    >
                      {inc.severity}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        ...getStatusStyle(inc.status),
                      }}
                      data-testid={`incident-status-${inc.id}`}
                    >
                      {inc.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        ...getImpactStyle(inc.operationalImpact),
                      }}
                      data-testid={`incident-impact-${inc.id}`}
                    >
                      {inc.operationalImpact}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {inc.vehicle ? (
                      <Link
                        href={`/vehicles/${inc.vehicle.id}`}
                        style={{ color: '#2563eb', textDecoration: 'none' }}
                      >
                        {inc.vehicle.displayId} ({inc.vehicle.registration})
                      </Link>
                    ) : (
                      <span style={{ color: '#9ca3af' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {inc.driver ? (
                      <Link
                        href={`/drivers/${inc.driver.id}`}
                        style={{ color: '#2563eb', textDecoration: 'none' }}
                      >
                        {inc.driver.firstName} {inc.driver.lastName}
                      </Link>
                    ) : (
                      <span style={{ color: '#9ca3af' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: '#6b7280' }}>
                    {new Date(inc.occurredAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    <Link
                      href={`/incidents/${inc.id}`}
                      style={{
                        padding: '0.25rem 0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        color: '#374151',
                        textDecoration: 'none',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                      }}
                      data-testid={`view-incident-btn-${inc.id}`}
                    >
                      View
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
