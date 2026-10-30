'use client';

import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import {
  maintenanceApi,
  vehicleApi,
  type CurrentUserResponse,
  type MaintenanceVendorRecord,
  type MaintenanceVendorStatus,
} from '../../../lib/api-client';

export default function MaintenanceVendorsPage() {
  const [vendors, setVendors] = useState<MaintenanceVendorRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | MaintenanceVendorStatus>('ALL');

  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [res, user] = await Promise.all([
        maintenanceApi.fetchVendors({
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          limit: 100,
        }),
        vehicleApi.fetchCurrentUser().catch(() => null),
      ]);
      setVendors(res.items);
      setCurrentUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vendors');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const canManage = Boolean(currentUser?.permissions.includes('maintenance.vendor.manage'));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      setSubmitting(true);
      setError(null);
      await maintenanceApi.createVendor({
        name: name.trim(),
        contactName: contactName.trim() ? contactName.trim() : undefined,
        phone: phone.trim() ? phone.trim() : undefined,
        email: email.trim() ? email.trim() : undefined,
        notes: notes.trim() ? notes.trim() : undefined,
      });
      setShowCreateModal(false);
      setName('');
      setContactName('');
      setPhone('');
      setEmail('');
      setNotes('');
      setSuccess('Vendor registered successfully');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create vendor');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (vendor: MaintenanceVendorRecord) => {
    try {
      setError(null);
      const nextStatus: MaintenanceVendorStatus =
        vendor.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await maintenanceApi.updateVendor(vendor.id, {
        version: vendor.version,
        status: nextStatus,
      });
      setSuccess(`Vendor updated to ${nextStatus}`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update vendor');
    }
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
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
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 600 }}>
            Maintenance Vendors & Garages
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280' }}>
            External service providers, internal workshops, and repair centers.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: '0.5rem 1rem',
              background: '#2563eb',
              border: '1px solid #1d4ed8',
              borderRadius: '6px',
              color: '#fff',
              fontWeight: 500,
              cursor: 'pointer',
            }}
            data-testid="btn-create-vendor"
          >
            + Register Vendor
          </button>
        )}
      </div>

      {error && (
        <div
          style={{
            background: '#fee2e2',
            border: '1px solid #ef4444',
            color: '#b91c1c',
            padding: '1rem',
            borderRadius: '6px',
            marginBottom: '1.5rem',
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            background: '#d1fae5',
            border: '1px solid #10b981',
            color: '#065f46',
            padding: '1rem',
            borderRadius: '6px',
            marginBottom: '1.5rem',
          }}
        >
          {success}
        </div>
      )}

      {/* Filter */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1.5rem',
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
        }}
      >
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#4b5563',
              marginBottom: '0.25rem',
            }}
          >
            Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | MaintenanceVendorStatus)}
            style={{ padding: '0.4rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
            data-testid="filter-vendor-status"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </div>

      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            Loading vendors...
          </div>
        ) : vendors.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            No maintenance vendors registered.
          </div>
        ) : (
          <table
            style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}
            data-testid="table-vendors"
          >
            <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th
                  style={{
                    padding: '0.75rem 1rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#4b5563',
                  }}
                >
                  ID
                </th>
                <th
                  style={{
                    padding: '0.75rem 1rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#4b5563',
                  }}
                >
                  NAME
                </th>
                <th
                  style={{
                    padding: '0.75rem 1rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#4b5563',
                  }}
                >
                  CONTACT
                </th>
                <th
                  style={{
                    padding: '0.75rem 1rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#4b5563',
                  }}
                >
                  PHONE
                </th>
                <th
                  style={{
                    padding: '0.75rem 1rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#4b5563',
                  }}
                >
                  EMAIL
                </th>
                <th
                  style={{
                    padding: '0.75rem 1rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#4b5563',
                  }}
                >
                  STATUS
                </th>
                {canManage && (
                  <th
                    style={{
                      padding: '0.75rem 1rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#4b5563',
                      textAlign: 'right',
                    }}
                  >
                    ACTIONS
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#111827' }}>
                    {v.displayId}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{v.name}</td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>
                    {v.contactName || '-'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>
                    {v.phone || '-'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>
                    {v.email || '-'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background: v.status === 'ACTIVE' ? '#d1fae5' : '#f3f4f6',
                        color: v.status === 'ACTIVE' ? '#065f46' : '#4b5563',
                      }}
                      data-testid={`badge-vendor-status-${v.id}`}
                    >
                      {v.status}
                    </span>
                  </td>
                  {canManage && (
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(v)}
                        style={{
                          padding: '0.35rem 0.75rem',
                          background: v.status === 'ACTIVE' ? '#ef4444' : '#059669',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                        data-testid={`btn-toggle-vendor-${v.id}`}
                      >
                        {v.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Vendor Modal */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '500px',
            }}
          >
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: 600 }}>
              Register Maintenance Vendor
            </h3>
            <form
              onSubmit={handleCreate}
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    marginBottom: '0.25rem',
                  }}
                >
                  Vendor / Garage Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Apex Fleet Repairs"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                  }}
                  data-testid="input-vendor-name"
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    marginBottom: '0.25rem',
                  }}
                >
                  Contact Person
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="e.g., Jane Smith"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                  }}
                  data-testid="input-vendor-contact"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      marginBottom: '0.25rem',
                    }}
                  >
                    Phone
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g., +1 555-0199"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                    }}
                    data-testid="input-vendor-phone"
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      marginBottom: '0.25rem',
                    }}
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g., service@apexfleet.com"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                    }}
                    data-testid="input-vendor-email"
                  />
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    marginBottom: '0.25rem',
                  }}
                >
                  Notes / Capabilities
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g., Engine rebuilds, electrical systems"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                  }}
                  data-testid="input-vendor-notes"
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.75rem',
                  marginTop: '0.5rem',
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    background: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '0.5rem 1.25rem',
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  data-testid="btn-submit-vendor"
                >
                  {submitting ? 'Registering...' : 'Register Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
