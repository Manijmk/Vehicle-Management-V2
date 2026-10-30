'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../../../components/tenant-header';
import {
  maintenanceApi,
  vehicleApi,
  type CurrentUserResponse,
  type MaintenanceRequestRecord,
  type MaintenanceVendorRecord,
} from '../../../../lib/api-client';

export default function MaintenanceRequestDetailPage() {
  const params = useParams();
  const requestId = params['requestId'] as string;
  const router = useRouter();

  const [request, setRequest] = useState<MaintenanceRequestRecord | null>(null);
  const [vendors, setVendors] = useState<MaintenanceVendorRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [vendorId, setVendorId] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!requestId) return;
    try {
      setLoading(true);
      setError(null);
      const [req, vendorList, user] = await Promise.all([
        maintenanceApi.fetchRequest(requestId),
        maintenanceApi.fetchVendors({ status: 'ACTIVE', limit: 100 }),
        vehicleApi.fetchCurrentUser().catch(() => null),
      ]);
      setRequest(req);
      setVendors(vendorList.items);
      setCurrentUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load request details');
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const canManage = Boolean(currentUser?.permissions.includes('maintenance.request.manage'));
  const canCreateWO = Boolean(currentUser?.permissions.includes('maintenance.work-order.create'));

  const handleCancel = async () => {
    if (!request || !cancelReason.trim()) return;
    try {
      setActionLoading(true);
      setError(null);
      const updated = await maintenanceApi.cancelRequest(request.id, {
        version: request.version,
        cancelReason: cancelReason.trim(),
      });
      setRequest(updated);
      setShowCancelModal(false);
      setCancelReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConvert = async () => {
    if (!request) return;
    try {
      setActionLoading(true);
      setError(null);
      const res = await maintenanceApi.convertRequestToWorkOrder(request.id, {
        version: request.version,
        vendorId: vendorId || undefined,
        title: request.title,
        priority: request.priority,
        blocksOperation: request.blocksOperation,
      });
      router.push(`/maintenance/work-orders/${res.workOrder.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to convert request');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !request) {
    return (
      <div style={{ padding: '1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
        <TenantHeader />
        <p style={{ marginTop: '2rem', textAlign: 'center', color: '#6b7280' }}>
          Loading request details...
        </p>
      </div>
    );
  }

  if (!request) {
    return (
      <div style={{ padding: '1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
        <TenantHeader />
        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <h2>Request Not Found</h2>
          <Link href="/maintenance/requests" style={{ color: '#2563eb' }}>
            &larr; Back to Requests
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
      <TenantHeader onAuthChange={loadData} />

      <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <Link
          href="/maintenance/requests"
          style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.875rem' }}
        >
          &larr; Back to Requests
        </Link>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginTop: '0.5rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h1
                style={{ margin: 0, fontSize: '1.75rem', fontWeight: 600 }}
                data-testid="text-request-display-id"
              >
                {request.displayId}
              </h1>
              <span
                style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  background:
                    request.status === 'OPEN'
                      ? '#eff6ff'
                      : request.status === 'CONVERTED'
                        ? '#dcfce7'
                        : '#f3f4f6',
                  color:
                    request.status === 'OPEN'
                      ? '#1d4ed8'
                      : request.status === 'CONVERTED'
                        ? '#15803d'
                        : '#6b7280',
                }}
                data-testid="badge-request-status"
              >
                {request.status}
              </span>
            </div>
            <p
              style={{
                margin: '0.25rem 0 0 0',
                color: '#4b5563',
                fontSize: '1.1rem',
                fontWeight: 500,
              }}
            >
              {request.title}
            </p>
          </div>

          {/* Action Buttons for OPEN status */}
          {request.status === 'OPEN' && (
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setShowCancelModal(true)}
                  style={{
                    padding: '0.5rem 1rem',
                    border: '1px solid #ef4444',
                    color: '#b91c1c',
                    background: '#fff',
                    borderRadius: '6px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                  data-testid="btn-open-cancel-modal"
                >
                  Cancel Request
                </button>
              )}
              {canCreateWO && (
                <button
                  type="button"
                  onClick={() => setShowConvertModal(true)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  data-testid="btn-open-convert-modal"
                >
                  Convert to Work Order &rarr;
                </button>
              )}
            </div>
          )}
        </div>
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

      {/* Operation Blocking Notice */}
      {request.blocksOperation && request.status === 'OPEN' && (
        <div
          style={{
            background: '#fff1f2',
            border: '1px solid #fecdd3',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            color: '#9f1239',
          }}
          data-testid="notice-blocking"
        >
          <strong>Trip Dispatch Blocked:</strong> This request is marked as operationally blocking.
          The associated vehicle cannot be dispatched on trips until this defect is addressed or
          cancelled.
        </div>
      )}

      {/* Converted Work Order Link */}
      {request.convertedWorkOrderId && (
        <div
          style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
          data-testid="notice-converted"
        >
          <span style={{ color: '#166534', fontWeight: 500 }}>
            This request was converted into Work Order{' '}
            <strong>{request.convertedWorkOrderDisplayId ?? request.convertedWorkOrderId}</strong>.
          </span>
          <Link
            href={`/maintenance/work-orders/${request.convertedWorkOrderId}`}
            style={{ color: '#15803d', fontWeight: 600, textDecoration: 'none' }}
            data-testid="link-converted-work-order"
          >
            View Work Order &rarr;
          </Link>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        {/* Left Column: Details */}
        <div
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1.5rem',
          }}
        >
          <h2 style={{ fontSize: '1.1rem', margin: '0 0 1rem 0', fontWeight: 600 }}>
            Description & Diagnosis
          </h2>
          <p
            style={{
              color: '#374151',
              whiteSpace: 'pre-wrap',
              margin: '0 0 1.5rem 0',
              lineHeight: 1.6,
            }}
          >
            {request.description || 'No additional details provided.'}
          </p>

          {request.cancelReason && (
            <div
              style={{
                background: '#f9fafb',
                borderLeft: '4px solid #ef4444',
                padding: '0.75rem 1rem',
                marginTop: '1rem',
              }}
              data-testid="box-cancel-reason"
            >
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#dc2626',
                  textTransform: 'uppercase',
                }}
              >
                Cancellation Reason
              </span>
              <p style={{ margin: '0.25rem 0 0 0', color: '#4b5563' }}>{request.cancelReason}</p>
            </div>
          )}
        </div>

        {/* Right Column: Metadata */}
        <div
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1.5rem',
          }}
        >
          <h2 style={{ fontSize: '1.1rem', margin: '0 0 1rem 0', fontWeight: 600 }}>
            Vehicle & Context
          </h2>

          <div style={{ marginBottom: '1rem' }}>
            <span
              style={{
                display: 'block',
                fontSize: '0.75rem',
                color: '#6b7280',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              Vehicle
            </span>
            <Link
              href={`/vehicles/${request.vehicleId}`}
              style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}
              data-testid="link-vehicle"
            >
              {request.vehicleDisplayId ?? request.vehicleRegistration ?? request.vehicleId}
            </Link>
            {request.vehicleModel && (
              <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                {' '}
                ({request.vehicleModel})
              </span>
            )}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <span
              style={{
                display: 'block',
                fontSize: '0.75rem',
                color: '#6b7280',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              Priority
            </span>
            <span style={{ fontWeight: 600 }} data-testid="text-priority">
              {request.priority}
            </span>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <span
              style={{
                display: 'block',
                fontSize: '0.75rem',
                color: '#6b7280',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              Operational Block
            </span>
            <span
              style={{ fontWeight: 600, color: request.blocksOperation ? '#dc2626' : '#16a34a' }}
            >
              {request.blocksOperation ? 'Yes — Dispatch Prohibited' : 'No — Operational'}
            </span>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <span
              style={{
                display: 'block',
                fontSize: '0.75rem',
                color: '#6b7280',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              Intake Source
            </span>
            <span style={{ fontWeight: 500 }}>{request.sourceType}</span>
            {request.sourceInspectionId && (
              <div style={{ marginTop: '0.25rem' }}>
                <Link
                  href={`/inspections/${request.sourceInspectionId}`}
                  style={{ color: '#2563eb', fontSize: '0.875rem' }}
                  data-testid="link-source-inspection"
                >
                  Linked Inspection:{' '}
                  {request.sourceInspectionDisplayId ?? request.sourceInspectionId}
                </Link>
              </div>
            )}
          </div>

          <div>
            <span
              style={{
                display: 'block',
                fontSize: '0.75rem',
                color: '#6b7280',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              Reported Date
            </span>
            <span style={{ color: '#4b5563', fontSize: '0.875rem' }}>
              {new Date(request.createdAt).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Cancel Modal */}
      {showCancelModal && (
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
          data-testid="modal-cancel"
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '1.5rem',
              maxWidth: '500px',
              width: '90%',
            }}
          >
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: 600 }}>
              Cancel Maintenance Request
            </h3>
            <p style={{ margin: '0 0 1rem 0', color: '#6b7280', fontSize: '0.875rem' }}>
              Please state why this request is being cancelled or dismissed without repair.
            </p>
            <textarea
              placeholder="e.g. Diagnostic revealed false alarm; repaired on-site; duplicate entry..."
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                marginBottom: '1rem',
              }}
              data-testid="input-cancel-reason"
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                style={{
                  padding: '0.5rem 1rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={actionLoading || !cancelReason.trim()}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                data-testid="btn-confirm-cancel"
              >
                {actionLoading ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert to Work Order Modal */}
      {showConvertModal && (
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
          data-testid="modal-convert"
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '1.5rem',
              maxWidth: '500px',
              width: '90%',
            }}
          >
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: 600 }}>
              Convert into Work Order
            </h3>
            <p style={{ margin: '0 0 1rem 0', color: '#6b7280', fontSize: '0.875rem' }}>
              This will transition the request to CONVERTED and create an actionable Work Order.
            </p>

            <div style={{ marginBottom: '1.25rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  marginBottom: '0.25rem',
                }}
              >
                Assign Repair Vendor (Optional)
              </label>
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                }}
                data-testid="select-vendor"
              >
                <option value="">Internal Fleet Depot (No external vendor)</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.displayId})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowConvertModal(false)}
                style={{
                  padding: '0.5rem 1rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConvert}
                disabled={actionLoading}
                style={{
                  padding: '0.5rem 1.25rem',
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                data-testid="btn-confirm-convert"
              >
                {actionLoading ? 'Converting...' : 'Generate Work Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
