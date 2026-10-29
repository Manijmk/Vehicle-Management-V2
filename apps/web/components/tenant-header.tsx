'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  getStoredAuthToken,
  getStoredOrganizationId,
  setStoredAuthToken,
  setStoredOrganizationId,
  vehicleApi,
  type CurrentUserResponse,
} from '../lib/api-client';

export const DEV_ADMIN_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzaWQiOiJsb2NhbC0yMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJzdWIiOiIyMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJpc3MiOiJ2ZWhpY2xlLW1hbmFnZW1lbnQtbG9jYWwiLCJhdWQiOiJ2ZWhpY2xlLW1hbmFnZW1lbnQtYXBpIiwiaWF0IjoxNzkwMTQ3NjA5LCJleHAiOjE4MjE2ODM2MDl9.tHEKxYCMGub44l1Wi47dGZCZw4wCNUfKhyxXHz95z-c';

export const DEV_VIEWER_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzaWQiOiJsb2NhbC0yMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDIiLCJzdWIiOiIyMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDIiLCJpc3MiOiJ2ZWhpY2xlLW1hbmFnZW1lbnQtbG9jYWwiLCJhdWQiOiJ2ZWhpY2xlLW1hbmFnZW1lbnQtYXBpIiwiaWF0IjoxNzkwMTQ3NjE0LCJleHAiOjE4MjE2ODM2MTR9.anxxghy61bO0LNnrQaCEZtPDH30xwv3M9qMrdhzZVt0';

export const DEV_ORG_ID = '10000000-0000-4000-8000-000000000001';

export function TenantHeader({ onAuthChange }: { onAuthChange?: () => void }) {
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [activeRole, setActiveRole] = useState<'admin' | 'viewer' | 'custom'>('admin');
  const [loading, setLoading] = useState(true);

  const loadUser = async () => {
    try {
      setLoading(true);
      const user = await vehicleApi.fetchCurrentUser();
      setCurrentUser(user);
    } catch {
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const existing = getStoredAuthToken();
    if (!existing) {
      setStoredAuthToken(DEV_ADMIN_TOKEN);
      setStoredOrganizationId(DEV_ORG_ID);
      setActiveRole('admin');
    } else if (existing === DEV_VIEWER_TOKEN) {
      setActiveRole('viewer');
    } else if (existing === DEV_ADMIN_TOKEN) {
      setActiveRole('admin');
    } else {
      setActiveRole('custom');
    }
    void loadUser();
  }, []);

  const switchRole = async (role: 'admin' | 'viewer') => {
    const token = role === 'admin' ? DEV_ADMIN_TOKEN : DEV_VIEWER_TOKEN;
    setStoredAuthToken(token);
    setStoredOrganizationId(DEV_ORG_ID);
    setActiveRole(role);
    await loadUser();
    if (onAuthChange) onAuthChange();
  };

  return (
    <header className="tenant-header" aria-label="Tenant and session bar">
      <div className="tenant-info">
        <span className="tenant-badge" data-testid="tenant-badge">
          Tenant: Development Fleet ({getStoredOrganizationId().slice(0, 8)}...)
        </span>
        <span
          className={`user-badge ${!currentUser && !loading ? 'error' : ''}`}
          data-testid="user-badge"
        >
          {currentUser
            ? `User: ${currentUser.user.displayName} (${currentUser.user.email})`
            : loading
              ? 'Connecting to API...'
              : 'Unauthenticated'}
        </span>
      </div>

      <nav className="tenant-nav" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <Link
          href="/vehicles"
          style={{ color: 'var(--accent, #1a56db)', textDecoration: 'none', fontWeight: 500 }}
          data-testid="nav-vehicles"
        >
          Vehicles
        </Link>
        <Link
          href="/drivers"
          style={{ color: 'var(--accent, #1a56db)', textDecoration: 'none', fontWeight: 500 }}
          data-testid="nav-drivers"
        >
          Drivers
        </Link>
        <Link
          href="/assignments"
          style={{ color: 'var(--accent, #1a56db)', textDecoration: 'none', fontWeight: 500 }}
          data-testid="nav-assignments"
        >
          Assignments
        </Link>
        <Link
          href="/trips"
          style={{ color: 'var(--accent, #1a56db)', textDecoration: 'none', fontWeight: 500 }}
          data-testid="nav-trips"
        >
          Trips
        </Link>
        <Link
          href="/inspections"
          style={{ color: 'var(--accent, #1a56db)', textDecoration: 'none', fontWeight: 500 }}
          data-testid="nav-inspections"
        >
          Inspections
        </Link>
        <Link
          href="/inspection-templates"
          style={{ color: 'var(--accent, #1a56db)', textDecoration: 'none', fontWeight: 500 }}
          data-testid="nav-inspection-templates"
        >
          Templates
        </Link>
      </nav>

      <div className="auth-actions">
        <button
          type="button"
          className={`auth-btn ${activeRole === 'admin' ? 'active' : ''}`}
          data-testid="auth-admin-btn"
          onClick={() => void switchRole('admin')}
        >
          Dev Admin
        </button>
        <button
          type="button"
          className={`auth-btn ${activeRole === 'viewer' ? 'active' : ''}`}
          data-testid="auth-viewer-btn"
          onClick={() => void switchRole('viewer')}
        >
          Dev Viewer
        </button>
      </div>
    </header>
  );
}
