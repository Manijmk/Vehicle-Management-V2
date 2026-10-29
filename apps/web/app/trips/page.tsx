'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TenantHeader } from '../../components/tenant-header';
import {
  tripApi,
  vehicleApi,
  type CurrentUserResponse,
  type TripRecord,
  type TripStatus,
} from '../../lib/api-client';

export default function TripsPage() {
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | TripStatus>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [res, user] = await Promise.all([
        tripApi.fetchTrips({ limit: 100 }),
        vehicleApi.fetchCurrentUser().catch(() => null),
      ]);
      setTrips(res.items);
      setCurrentUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trips');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const canCreate = Boolean(currentUser?.permissions.includes('trip.create'));

  const filteredTrips = useMemo(() => {
    const q = query.trim().toLowerCase();
    return trips.filter((t) => {
      const displayId = (t.displayId ?? '').toLowerCase();
      const origin = (t.origin ?? '').toLowerCase();
      const destination = (t.destination ?? '').toLowerCase();
      const purpose = (t.purpose ?? '').toLowerCase();
      const vText = t.vehicle
        ? `${t.vehicle.displayId} ${t.vehicle.registration}`.toLowerCase()
        : '';
      const dText = t.driver
        ? `${t.driver.displayId} ${t.driver.firstName} ${t.driver.lastName}`.toLowerCase()
        : '';
      const matchesText =
        !q ||
        displayId.includes(q) ||
        origin.includes(q) ||
        destination.includes(q) ||
        purpose.includes(q) ||
        vText.includes(q) ||
        dText.includes(q);
      const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
      return matchesText && matchesStatus;
    });
  }, [trips, query, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredTrips.length / pageSize));
  const paginatedTrips = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTrips.slice(start, start + pageSize);
  }, [filteredTrips, currentPage, pageSize]);

  return (
    <main className="vehicle-page">
      <TenantHeader onAuthChange={() => void loadData()} />

      <div className="page-header">
        <div>
          <p className="eyebrow">Fleet operations</p>
          <h1>Trips</h1>
        </div>
        {canCreate ? (
          <Link href="/trips/new" className="primary-action" data-testid="create-trip-link">
            Plan new trip
          </Link>
        ) : null}
      </div>

      <section className="panel controls" aria-label="Trip filters">
        <label>
          Search
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCurrentPage(1);
            }}
            placeholder="Trip ID, origin, destination, vehicle, driver"
            data-testid="search-input"
          />
        </label>
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as 'ALL' | TripStatus);
              setCurrentPage(1);
            }}
            data-testid="status-filter"
          >
            <option value="ALL">All statuses</option>
            <option value="DRAFT">DRAFT</option>
            <option value="READY">READY</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="CANCELLED">CANCELLED</option>
            <option value="ABORTED">ABORTED</option>
          </select>
        </label>
      </section>

      {error ? (
        <div className="error-banner" role="alert" data-testid="error-banner">
          {error}
        </div>
      ) : null}

      <section className="panel" aria-label="Trips table section">
        {loading ? (
          <p className="loading-state" data-testid="loading-trips">
            Loading trips...
          </p>
        ) : filteredTrips.length === 0 ? (
          <div className="empty-state" data-testid="empty-trips">
            <p>No trips found matching the filter criteria.</p>
          </div>
        ) : (
          <table className="data-table" data-testid="trips-table">
            <thead>
              <tr>
                <th scope="col">Trip ID</th>
                <th scope="col">Status</th>
                <th scope="col">Route</th>
                <th scope="col">Vehicle</th>
                <th scope="col">Driver</th>
                <th scope="col">Distance / Odo</th>
                <th scope="col">Timing</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTrips.map((trip) => {
                const statusClass =
                  trip.status === 'COMPLETED'
                    ? 'status-pill active'
                    : trip.status === 'IN_PROGRESS'
                      ? 'status-pill active'
                      : trip.status === 'READY'
                        ? 'status-pill'
                        : trip.status === 'CANCELLED' || trip.status === 'ABORTED'
                          ? 'status-pill suspended'
                          : 'status-pill draft';

                return (
                  <tr key={trip.id} data-testid={`trip-row-${trip.id}`}>
                    <td>
                      <Link
                        href={`/trips/${trip.id}`}
                        className="table-link"
                        data-testid={`trip-link-${trip.id}`}
                      >
                        {trip.displayId}
                      </Link>
                    </td>
                    <td>
                      <span className={statusClass} data-testid={`trip-status-${trip.id}`}>
                        {trip.status}
                      </span>
                    </td>
                    <td>
                      <strong>{trip.origin}</strong> &rarr; {trip.destination}
                      {trip.purpose ? (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #666)' }}>
                          {trip.purpose}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {trip.vehicle ? (
                        <Link href={`/vehicles/${trip.vehicle.id}`} className="table-link">
                          {trip.vehicle.displayId} ({trip.vehicle.registration})
                        </Link>
                      ) : (
                        trip.vehicleId.slice(0, 8)
                      )}
                    </td>
                    <td>
                      {trip.driver ? (
                        <Link href={`/drivers/${trip.driver.id}`} className="table-link">
                          {trip.driver.displayId} ({trip.driver.firstName} {trip.driver.lastName})
                        </Link>
                      ) : (
                        trip.driverId.slice(0, 8)
                      )}
                    </td>
                    <td>
                      {trip.distanceKm !== null && trip.distanceKm !== undefined ? (
                        <span>{trip.distanceKm} km</span>
                      ) : trip.startOdometerKm !== null && trip.startOdometerKm !== undefined ? (
                        <span>Start: {trip.startOdometerKm} km</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted, #999)' }}>&mdash;</span>
                      )}
                    </td>
                    <td>
                      {trip.actualStartAt ? (
                        <span title={new Date(trip.actualStartAt).toLocaleString()}>
                          Started:{' '}
                          {new Date(trip.actualStartAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      ) : trip.plannedStartAt ? (
                        <span title={new Date(trip.plannedStartAt).toLocaleString()}>
                          Planned: {new Date(trip.plannedStartAt).toLocaleDateString()}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted, #999)' }}>&mdash;</span>
                      )}
                    </td>
                    <td>
                      <Link
                        href={`/trips/${trip.id}`}
                        className="table-action"
                        data-testid={`view-trip-${trip.id}`}
                      >
                        View &rarr;
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {totalPages > 1 ? (
          <div className="pagination">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              data-testid="prev-page"
            >
              Previous
            </button>
            <span data-testid="current-page">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              data-testid="next-page"
            >
              Next
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
