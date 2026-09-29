'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TenantHeader } from '../../components/tenant-header';
import {
  assignmentApi,
  vehicleApi,
  type AssignmentStatus,
  type CurrentUserResponse,
  type VehicleDriverAssignmentRecord,
} from '../../lib/api-client';

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<VehicleDriverAssignmentRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | AssignmentStatus>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [res, user] = await Promise.all([
        assignmentApi.fetchAssignments({ limit: 100 }),
        vehicleApi.fetchCurrentUser().catch(() => null),
      ]);
      setAssignments(res.items);
      setCurrentUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const canCreate = Boolean(currentUser?.permissions.includes('assignment.create'));

  const filteredAssignments = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assignments.filter((asn) => {
      const vText = asn.vehicle
        ? `${asn.vehicle.displayId} ${asn.vehicle.registration}`.toLowerCase()
        : '';
      const dText = asn.driver
        ? `${asn.driver.displayId} ${asn.driver.firstName} ${asn.driver.lastName}`.toLowerCase()
        : '';
      const notesText = (asn.notes ?? '').toLowerCase();
      const matchesText = !q || vText.includes(q) || dText.includes(q) || notesText.includes(q);
      const matchesStatus = statusFilter === 'ALL' || asn.status === statusFilter;
      return matchesText && matchesStatus;
    });
  }, [assignments, query, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredAssignments.length / pageSize));
  const paginatedAssignments = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAssignments.slice(start, start + pageSize);
  }, [filteredAssignments, currentPage, pageSize]);

  return (
    <main className="vehicle-page">
      <TenantHeader onAuthChange={() => void loadData()} />

      <div className="page-header">
        <div>
          <p className="eyebrow">Fleet operations</p>
          <h1>Assignments</h1>
        </div>
        {canCreate ? (
          <Link
            href="/assignments/new"
            className="primary-action"
            data-testid="create-assignment-link"
          >
            Assign driver
          </Link>
        ) : null}
      </div>

      <section className="panel controls" aria-label="Assignment filters">
        <label>
          Search
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCurrentPage(1);
            }}
            placeholder="Vehicle, driver, or notes"
            data-testid="search-input"
          />
        </label>
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as 'ALL' | AssignmentStatus);
              setCurrentPage(1);
            }}
            data-testid="status-filter"
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="ENDED">ENDED</option>
          </select>
        </label>
      </section>

      {error ? (
        <div className="action-error" data-testid="load-error-banner">
          {error}
        </div>
      ) : null}

      <section className="panel" aria-label="Assignments table section">
        {loading ? (
          <p className="loading-state">Loading assignments...</p>
        ) : filteredAssignments.length === 0 ? (
          <div className="empty-state" data-testid="empty-assignments">
            <p>No assignments found matching the filter criteria.</p>
          </div>
        ) : (
          <>
            <table className="data-table" data-testid="assignments-table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Driver</th>
                  <th>Status</th>
                  <th>Eligibility</th>
                  <th>Started At</th>
                  <th>Ended At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedAssignments.map((asn) => {
                  const isEligible =
                    asn.driver?.eligible ?? asn.driver?.isOperationallyEligible ?? false;
                  return (
                    <tr key={asn.id} data-testid={`assignment-row-${asn.id}`}>
                      <td>
                        <Link href={`/vehicles/${asn.vehicleId}`} className="entity-link">
                          {asn.vehicle
                            ? `${asn.vehicle.displayId} (${asn.vehicle.registration})`
                            : asn.vehicleId}
                        </Link>
                      </td>
                      <td>
                        <Link href={`/drivers/${asn.driverId}`} className="entity-link">
                          {asn.driver
                            ? `${asn.driver.firstName} ${asn.driver.lastName} (${asn.driver.displayId})`
                            : asn.driverId}
                        </Link>
                      </td>
                      <td>
                        <span
                          className={`badge status-${asn.status.toLowerCase()}`}
                          data-testid={`assignment-status-badge-${asn.status.toLowerCase()}`}
                        >
                          {asn.status}
                        </span>
                      </td>
                      <td>
                        {asn.status === 'ACTIVE' ? (
                          <span
                            className={`badge ${isEligible ? 'badge-eligible' : 'badge-ineligible'}`}
                            data-testid="driver-eligibility-badge"
                          >
                            {isEligible ? 'Eligible' : 'Ineligible'}
                          </span>
                        ) : (
                          <span className="badge muted">—</span>
                        )}
                      </td>
                      <td>{new Date(asn.startedAt).toLocaleString()}</td>
                      <td>{asn.endedAt ? new Date(asn.endedAt).toLocaleString() : '—'}</td>
                      <td>
                        <Link
                          href={`/assignments/${asn.id}`}
                          className="action-link"
                          data-testid={`view-assignment-${asn.id}`}
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {totalPages > 1 ? (
              <div className="pagination">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  data-testid="prev-page-button"
                >
                  Previous
                </button>
                <span data-testid="current-page">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  data-testid="next-page-button"
                >
                  Next
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
