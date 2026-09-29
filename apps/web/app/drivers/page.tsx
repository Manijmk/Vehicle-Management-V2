'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TenantHeader } from '../../components/tenant-header';
import {
  driverApi,
  vehicleApi,
  type CurrentUserResponse,
  type DriverRecord,
  type DriverStatus,
} from '../../lib/api-client';

export default function DriversPage() {
  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | DriverStatus>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [res, user] = await Promise.all([
        driverApi.fetchDrivers({ limit: 100 }),
        vehicleApi.fetchCurrentUser().catch(() => null),
      ]);
      setDrivers(res.items);
      setCurrentUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load drivers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const canCreate = Boolean(currentUser?.permissions.includes('driver.create'));

  const filteredDrivers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return drivers.filter((driver) => {
      const fullName = `${driver.firstName} ${driver.lastName}`.toLowerCase();
      const matchesText =
        !q ||
        driver.displayId.toLowerCase().includes(q) ||
        fullName.includes(q) ||
        (driver.employeeNumber && driver.employeeNumber.toLowerCase().includes(q)) ||
        (driver.email && driver.email.toLowerCase().includes(q));
      const matchesStatus = statusFilter === 'ALL' || driver.status === statusFilter;
      return matchesText && matchesStatus;
    });
  }, [drivers, query, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredDrivers.length / pageSize));
  const paginatedDrivers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDrivers.slice(start, start + pageSize);
  }, [filteredDrivers, currentPage, pageSize]);

  return (
    <main className="driver-page">
      <TenantHeader onAuthChange={() => void loadData()} />

      <div className="page-header">
        <div>
          <p className="eyebrow">Fleet operations</p>
          <h1>Drivers</h1>
        </div>
        {canCreate ? (
          <Link href="/drivers/new" className="primary-action" data-testid="create-driver-link">
            Create driver
          </Link>
        ) : null}
      </div>

      <section className="panel controls" aria-label="Driver filters">
        <label>
          Search
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCurrentPage(1);
            }}
            placeholder="Display ID, name, employee number, email"
            data-testid="search-input"
          />
        </label>
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as 'ALL' | DriverStatus);
              setCurrentPage(1);
            }}
            data-testid="status-filter"
          >
            <option value="ALL">All</option>
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
      </section>

      {error ? (
        <section
          className="panel empty-state error-panel"
          role="alert"
          data-testid="api-error-state"
        >
          <h2>Failed to load drivers</h2>
          <p>{error}</p>
          <button type="button" className="secondary-action" onClick={() => void loadData()}>
            Retry
          </button>
        </section>
      ) : loading ? (
        <section className="panel empty-state" data-testid="loading-state">
          <h2>Loading drivers...</h2>
          <p>Connecting to fleet operations service</p>
        </section>
      ) : drivers.length === 0 ? (
        <section className="panel empty-state" data-testid="empty-state">
          <h2>No drivers registered yet</h2>
          <p>Add your first driver to begin managing fleet operations.</p>
          {canCreate ? (
            <Link href="/drivers/new" className="primary-action">
              Create driver
            </Link>
          ) : null}
        </section>
      ) : filteredDrivers.length === 0 ? (
        <section className="panel empty-state" data-testid="search-no-results">
          <h2>No drivers match your filters</h2>
          <p>Try a different name, display ID, employee number, or status filter.</p>
        </section>
      ) : (
        <section className="panel table-panel" aria-live="polite">
          <div className="table-wrap">
            <table data-testid="drivers-table">
              <thead>
                <tr>
                  <th>Display ID</th>
                  <th>Name</th>
                  <th>Employee #</th>
                  <th>Status</th>
                  <th>Eligibility</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedDrivers.map((driver) => (
                  <tr key={driver.id} data-testid={`driver-row-${driver.id}`}>
                    <td data-testid="driver-display-id">{driver.displayId}</td>
                    <td data-testid="driver-name">
                      {driver.firstName} {driver.lastName}
                    </td>
                    <td data-testid="driver-employee-number">{driver.employeeNumber || '—'}</td>
                    <td>
                      <span
                        className={`status-pill status-${driver.status.toLowerCase()}`}
                        data-testid={`status-${driver.status.toLowerCase()}`}
                      >
                        {driver.status}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`status-pill ${driver.eligible ? 'status-eligible' : 'status-ineligible'}`}
                        data-testid={`eligibility-${driver.eligible ? 'eligible' : 'ineligible'}`}
                        title={driver.eligibilityReasons?.join(', ')}
                      >
                        {driver.eligible ? 'Eligible' : 'Ineligible'}
                      </span>
                    </td>
                    <td>
                      <Link
                        href={`/drivers/${driver.id}`}
                        className="table-action-link"
                        data-testid={`view-driver-${driver.id}`}
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <div className="pagination-bar" data-testid="pagination-controls">
              <button
                type="button"
                className="secondary-action compact-btn"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="pagination-info">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                className="secondary-action compact-btn"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          ) : null}
        </section>
      )}
    </main>
  );
}
