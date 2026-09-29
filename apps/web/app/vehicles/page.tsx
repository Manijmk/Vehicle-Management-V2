'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TenantHeader } from '../../components/tenant-header';
import {
  vehicleApi,
  type CurrentUserResponse,
  type VehicleRecord,
  type VehicleStatus,
} from '../../lib/api-client';

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | VehicleStatus>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [vehicleList, user] = await Promise.all([
        vehicleApi.fetchVehicles(),
        vehicleApi.fetchCurrentUser().catch(() => null),
      ]);
      setVehicles(vehicleList);
      setCurrentUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vehicles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const canCreate = Boolean(currentUser?.permissions.includes('vehicle.create'));

  const filteredVehicles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vehicles.filter((vehicle) => {
      const matchesText =
        !q ||
        vehicle.displayId.toLowerCase().includes(q) ||
        vehicle.registration.toLowerCase().includes(q) ||
        vehicle.model.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'ALL' || vehicle.status === statusFilter;
      return matchesText && matchesStatus;
    });
  }, [vehicles, query, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredVehicles.length / pageSize));
  const paginatedVehicles = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredVehicles.slice(start, start + pageSize);
  }, [filteredVehicles, currentPage, pageSize]);

  return (
    <main className="vehicle-page">
      <TenantHeader onAuthChange={() => void loadData()} />

      <div className="page-header">
        <div>
          <p className="eyebrow">Fleet operations</p>
          <h1>Vehicles</h1>
        </div>
        {canCreate ? (
          <Link href="/vehicles/new" className="primary-action" data-testid="create-vehicle-link">
            Create vehicle
          </Link>
        ) : null}
      </div>

      <section className="panel controls" aria-label="Vehicle filters">
        <label>
          Search
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCurrentPage(1);
            }}
            placeholder="Display ID, registration, model"
            data-testid="search-input"
          />
        </label>
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as 'ALL' | VehicleStatus);
              setCurrentPage(1);
            }}
            data-testid="status-filter"
          >
            <option value="ALL">All</option>
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Active</option>
            <option value="RETIRED">Retired</option>
          </select>
        </label>
      </section>

      {error ? (
        <section
          className="panel empty-state error-panel"
          role="alert"
          data-testid="api-error-state"
        >
          <h2>Failed to load vehicles</h2>
          <p>{error}</p>
          <button type="button" className="secondary-action" onClick={() => void loadData()}>
            Retry
          </button>
        </section>
      ) : loading ? (
        <section className="panel empty-state" data-testid="loading-state">
          <h2>Loading vehicles...</h2>
          <p>Connecting to fleet operations service</p>
        </section>
      ) : vehicles.length === 0 ? (
        <section className="panel empty-state" data-testid="empty-state">
          <h2>No vehicles registered yet</h2>
          <p>Add your first vehicle to begin tracking your fleet operations.</p>
          {canCreate ? (
            <Link href="/vehicles/new" className="primary-action">
              Create vehicle
            </Link>
          ) : null}
        </section>
      ) : filteredVehicles.length === 0 ? (
        <section className="panel empty-state" data-testid="search-no-results">
          <h2>No vehicles match your filters</h2>
          <p>Try a different registration, display ID, or status filter.</p>
        </section>
      ) : (
        <section className="panel table-panel" aria-live="polite">
          <div className="table-wrap">
            <table data-testid="vehicles-table">
              <thead>
                <tr>
                  <th>Display ID</th>
                  <th>Registration</th>
                  <th>Model</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Odometer</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedVehicles.map((vehicle) => (
                  <tr key={vehicle.id} data-testid={`vehicle-row-${vehicle.id}`}>
                    <td data-testid="vehicle-display-id">{vehicle.displayId}</td>
                    <td data-testid="vehicle-registration">{vehicle.registration}</td>
                    <td>{vehicle.model}</td>
                    <td>{vehicle.type}</td>
                    <td>
                      <span
                        className={`status-pill status-${vehicle.status.toLowerCase()}`}
                        data-testid={`status-${vehicle.status.toLowerCase()}`}
                      >
                        {vehicle.status}
                      </span>
                    </td>
                    <td>{vehicle.odometerKm.toLocaleString()} km</td>
                    <td>
                      <Link
                        href={`/vehicles/${vehicle.id}`}
                        className="table-action-link"
                        data-testid={`view-vehicle-${vehicle.id}`}
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
