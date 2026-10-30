'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../../../components/tenant-header';
import {
  financeApi,
  maintenanceApi,
  vehicleApi,
  type CurrentUserResponse,
  type ExpenseRecord,
  type MaintenanceWorkOrderRecord,
  type WorkOrderTaskStatus,
} from '../../../../lib/api-client';

export default function MaintenanceWorkOrderDetailPage() {
  const params = useParams();
  const workOrderId = params['workOrderId'] as string;

  const [workOrder, setWorkOrder] = useState<MaintenanceWorkOrderRecord | null>(null);
  const [linkedExpenses, setLinkedExpenses] = useState<ExpenseRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Task form
  const [taskDescription, setTaskDescription] = useState('');
  // Part form
  const [partDescription, setPartDescription] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [partQty, setPartQty] = useState(1);
  const [partUnitCost, setPartUnitCost] = useState('0.00');
  // Labor form
  const [laborDescription, setLaborDescription] = useState('');
  const [technicianName, setTechnicianName] = useState('');
  const [laborHours, setLaborHours] = useState('1.0');
  const [laborRate, setLaborRate] = useState('80.00');

  // Lifecycle Modals
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [odometerAtCompletion, setOdometerAtCompletion] = useState<number | ''>('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const loadData = useCallback(async () => {
    if (!workOrderId) return;
    try {
      setLoading(true);
      setError(null);
      const [wo, user, expRes] = await Promise.all([
        maintenanceApi.fetchWorkOrder(workOrderId),
        vehicleApi.fetchCurrentUser().catch(() => null),
        financeApi
          .fetchExpenses({ maintenanceWorkOrderId: workOrderId })
          .catch(() => ({ items: [], total: 0 })),
      ]);
      setWorkOrder(wo);
      setCurrentUser(user);
      setLinkedExpenses(expRes.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load work order');
    } finally {
      setLoading(false);
    }
  }, [workOrderId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const canManage = Boolean(currentUser?.permissions.includes('maintenance.work-order.manage'));
  const isTerminal = workOrder?.status === 'COMPLETED' || workOrder?.status === 'CANCELLED';

  const handleOpen = async () => {
    if (!workOrder) return;
    try {
      setActionLoading(true);
      setError(null);
      const updated = await maintenanceApi.openWorkOrder(workOrder.id, workOrder.version);
      setWorkOrder(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open work order');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStart = async () => {
    if (!workOrder) return;
    try {
      setActionLoading(true);
      setError(null);
      const updated = await maintenanceApi.startWorkOrder(workOrder.id, workOrder.version);
      setWorkOrder(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start work order');
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!workOrder || !completionNotes.trim()) return;
    try {
      setActionLoading(true);
      setError(null);
      const updated = await maintenanceApi.completeWorkOrder(workOrder.id, {
        version: workOrder.version,
        completionNotes: completionNotes.trim(),
        odometerAtCompletion:
          odometerAtCompletion === '' ? undefined : Number(odometerAtCompletion),
      });
      setWorkOrder(updated);
      setShowCompleteModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete work order');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!workOrder || !cancelReason.trim()) return;
    try {
      setActionLoading(true);
      setError(null);
      const updated = await maintenanceApi.cancelWorkOrder(workOrder.id, {
        version: workOrder.version,
        cancelReason: cancelReason.trim(),
      });
      setWorkOrder(updated);
      setShowCancelModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel work order');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workOrder || !taskDescription.trim()) return;
    try {
      setActionLoading(true);
      setError(null);
      await maintenanceApi.addTask(workOrder.id, { description: taskDescription.trim() });
      setTaskDescription('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add task');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleTask = async (taskId: string, currentStatus: WorkOrderTaskStatus) => {
    if (!workOrder || isTerminal) return;
    const nextStatus: WorkOrderTaskStatus = currentStatus === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    try {
      setError(null);
      await maintenanceApi.updateTask(workOrder.id, taskId, { status: nextStatus });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task status');
    }
  };

  const handleAddPart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workOrder || !partDescription.trim()) return;
    try {
      setActionLoading(true);
      setError(null);
      const costInCents = Math.round(parseFloat(partUnitCost) * 100);
      await maintenanceApi.addPart(workOrder.id, {
        description: partDescription.trim(),
        partNumber: partNumber.trim() ? partNumber.trim() : undefined,
        quantity: Number(partQty),
        unitCost: costInCents,
      });
      setPartDescription('');
      setPartNumber('');
      setPartQty(1);
      setPartUnitCost('0.00');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add part');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddLabor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workOrder || !laborDescription.trim()) return;
    try {
      setActionLoading(true);
      setError(null);
      const rateInCents = Math.round(parseFloat(laborRate) * 100);
      await maintenanceApi.addLabor(workOrder.id, {
        description: laborDescription.trim(),
        technicianName: technicianName.trim() ? technicianName.trim() : undefined,
        hours: parseFloat(laborHours),
        hourlyRate: rateInCents,
      });
      setLaborDescription('');
      setTechnicianName('');
      setLaborHours('1.0');
      setLaborRate('80.00');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add labor');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !workOrder) {
    return (
      <div style={{ padding: '1.5rem', maxWidth: '1100px', margin: '0 auto' }}>
        <TenantHeader />
        <p style={{ marginTop: '2rem', textAlign: 'center', color: '#6b7280' }}>
          Loading work order...
        </p>
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div style={{ padding: '1.5rem', maxWidth: '1100px', margin: '0 auto' }}>
        <TenantHeader />
        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <h2>Work Order Not Found</h2>
          <Link href="/maintenance/work-orders" style={{ color: '#2563eb' }}>
            &larr; Back to Work Orders
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1100px', margin: '0 auto' }}>
      <TenantHeader onAuthChange={loadData} />

      <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <Link
          href="/maintenance/work-orders"
          style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.875rem' }}
        >
          &larr; Back to Work Orders
        </Link>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginTop: '0.5rem',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h1
                style={{ margin: 0, fontSize: '1.75rem', fontWeight: 600 }}
                data-testid="text-work-order-display-id"
              >
                {workOrder.displayId}
              </h1>
              <span
                style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  background:
                    workOrder.status === 'COMPLETED'
                      ? '#dcfce7'
                      : workOrder.status === 'IN_PROGRESS'
                        ? '#dbeafe'
                        : workOrder.status === 'OPEN'
                          ? '#fef3c7'
                          : '#f3f4f6',
                  color:
                    workOrder.status === 'COMPLETED'
                      ? '#15803d'
                      : workOrder.status === 'IN_PROGRESS'
                        ? '#1d4ed8'
                        : workOrder.status === 'OPEN'
                          ? '#b45309'
                          : '#6b7280',
                }}
                data-testid="badge-work-order-status"
              >
                {workOrder.status}
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
              {workOrder.title}
            </p>
          </div>

          {/* Lifecycle Action Buttons */}
          {canManage && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {workOrder.status === 'DRAFT' && (
                <button
                  type="button"
                  onClick={handleOpen}
                  disabled={actionLoading}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  data-testid="btn-open-work-order"
                >
                  Open Work Order
                </button>
              )}
              {workOrder.status === 'OPEN' && (
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={actionLoading}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#16a34a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  data-testid="btn-start-work-order"
                >
                  Start Work (In Progress)
                </button>
              )}
              {workOrder.status === 'IN_PROGRESS' && (
                <button
                  type="button"
                  onClick={() => setShowCompleteModal(true)}
                  style={{
                    padding: '0.5rem 1.25rem',
                    background: '#16a34a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  data-testid="btn-complete-work-order"
                >
                  Complete Work Order &rarr;
                </button>
              )}
              {!isTerminal && (
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
                  data-testid="btn-cancel-work-order"
                >
                  Cancel
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

      {/* Blocking Alert */}
      {workOrder.blocksOperation && !isTerminal && (
        <div
          style={{
            background: '#fff1f2',
            border: '1px solid #fecdd3',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            color: '#9f1239',
          }}
          data-testid="notice-work-order-blocking"
        >
          <strong>Trip Dispatch Blocked:</strong> This active work order is blocking vehicle
          operations. Vehicle cannot depart on trips until this work order is resolved.
        </div>
      )}

      {/* Grid: Context Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1rem',
          }}
        >
          <span
            style={{
              fontSize: '0.75rem',
              color: '#6b7280',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            Vehicle
          </span>
          <div style={{ marginTop: '0.25rem' }}>
            <Link
              href={`/vehicles/${workOrder.vehicleId}`}
              style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}
              data-testid="link-vehicle"
            >
              {workOrder.vehicleDisplayId ?? workOrder.vehicleRegistration ?? workOrder.vehicleId}
            </Link>
          </div>
        </div>

        <div
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1rem',
          }}
        >
          <span
            style={{
              fontSize: '0.75rem',
              color: '#6b7280',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            Vendor / Depot
          </span>
          <div style={{ marginTop: '0.25rem', fontWeight: 600, color: '#374151' }}>
            {workOrder.vendorName ?? 'Internal Depot'}
          </div>
        </div>

        <div
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1rem',
          }}
        >
          <span
            style={{
              fontSize: '0.75rem',
              color: '#6b7280',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            Odometer At Open
          </span>
          <div
            style={{ marginTop: '0.25rem', fontWeight: 600, color: '#374151' }}
            data-testid="text-odo-open"
          >
            {workOrder.odometerAtOpen !== null && workOrder.odometerAtOpen !== undefined
              ? `${workOrder.odometerAtOpen} km`
              : '—'}
          </div>
        </div>

        <div
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1rem',
          }}
        >
          <span
            style={{
              fontSize: '0.75rem',
              color: '#6b7280',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            Total Incurred Cost
          </span>
          <div
            style={{ marginTop: '0.25rem', fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}
            data-testid="text-total-cost"
          >
            ${(workOrder.totalCost / 100).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Completion info if COMPLETED */}
      {workOrder.status === 'COMPLETED' && (
        <div
          style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '8px',
            padding: '1.25rem',
            marginBottom: '1.5rem',
          }}
          data-testid="box-completion-info"
        >
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#166534', fontSize: '1rem' }}>
            Work Order Completion Summary
          </h3>
          <p style={{ margin: '0 0 0.5rem 0', color: '#374151' }}>
            <strong>Notes:</strong> {workOrder.completionNotes}
          </p>
          {workOrder.odometerAtCompletion && (
            <p style={{ margin: 0, color: '#374151' }}>
              <strong>Closed Odometer:</strong> {workOrder.odometerAtCompletion} km
            </p>
          )}
        </div>
      )}

      {/* Tabular Sections: Tasks, Parts, Labor */}
      {/* 1. Tasks */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1.5rem',
          marginBottom: '1.5rem',
        }}
      >
        <h2 style={{ fontSize: '1.25rem', margin: '0 0 1rem 0', fontWeight: 600 }}>
          1. Repair & Service Tasks
        </h2>

        {workOrder.tasks.length === 0 ? (
          <p style={{ color: '#6b7280', margin: '0 0 1rem 0' }}>No tasks added yet.</p>
        ) : (
          <div style={{ marginBottom: '1rem' }} data-testid="list-tasks">
            {workOrder.tasks.map((task) => (
              <div
                key={task.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem',
                  borderBottom: '1px solid #f3f4f6',
                }}
                data-testid={`task-item-${task.id}`}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    cursor: isTerminal ? 'default' : 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={task.status === 'COMPLETED'}
                    onChange={() => handleToggleTask(task.id, task.status)}
                    disabled={isTerminal}
                    data-testid={`checkbox-task-${task.id}`}
                    style={{ width: '1.2rem', height: '1.2rem' }}
                  />
                  <span
                    style={{
                      textDecoration: task.status === 'COMPLETED' ? 'line-through' : 'none',
                      color: task.status === 'COMPLETED' ? '#6b7280' : '#111827',
                    }}
                  >
                    {task.description}
                  </span>
                </label>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    background: task.status === 'COMPLETED' ? '#dcfce7' : '#f3f4f6',
                    color: task.status === 'COMPLETED' ? '#15803d' : '#4b5563',
                  }}
                >
                  {task.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {!isTerminal && canManage && (
          <form
            onSubmit={handleAddTask}
            style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}
          >
            <input
              type="text"
              placeholder="Add next checklist / repair task..."
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              style={{
                flex: 1,
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              data-testid="input-task-description"
              required
            />
            <button
              type="submit"
              disabled={actionLoading}
              style={{
                padding: '0.5rem 1rem',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              data-testid="btn-add-task"
            >
              Add Task
            </button>
          </form>
        )}
      </div>

      {/* 2. Parts */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1.5rem',
          marginBottom: '1.5rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <h2 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 600 }}>
            2. Replaced Parts & Supplies
          </h2>
          <span style={{ fontWeight: 600, color: '#374151' }}>
            Parts Subtotal: ${(workOrder.partsTotal / 100).toFixed(2)}
          </span>
        </div>

        {workOrder.parts.length === 0 ? (
          <p style={{ color: '#6b7280', margin: '0 0 1rem 0' }}>No parts logged.</p>
        ) : (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              marginBottom: '1rem',
            }}
            data-testid="table-parts"
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid #e5e7eb',
                  fontSize: '0.875rem',
                  color: '#6b7280',
                }}
              >
                <th style={{ padding: '0.5rem' }}>Part #</th>
                <th style={{ padding: '0.5rem' }}>Description</th>
                <th style={{ padding: '0.5rem' }}>Qty</th>
                <th style={{ padding: '0.5rem' }}>Unit Cost</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {workOrder.parts.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>
                    {p.partNumber || '—'}
                  </td>
                  <td style={{ padding: '0.5rem' }}>{p.description}</td>
                  <td style={{ padding: '0.5rem' }}>{p.quantity}</td>
                  <td style={{ padding: '0.5rem' }}>${(p.unitCost / 100).toFixed(2)}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 600 }}>
                    ${(p.totalCost / 100).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!isTerminal && canManage && (
          <form
            onSubmit={handleAddPart}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 2fr 1fr 1fr auto',
              gap: '0.5rem',
              alignItems: 'center',
              marginTop: '1rem',
            }}
          >
            <input
              type="text"
              placeholder="Part # (Optional)"
              value={partNumber}
              onChange={(e) => setPartNumber(e.target.value)}
              style={{ padding: '0.4rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
              data-testid="input-part-number"
            />
            <input
              type="text"
              placeholder="Description *"
              value={partDescription}
              onChange={(e) => setPartDescription(e.target.value)}
              style={{ padding: '0.4rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
              data-testid="input-part-desc"
              required
            />
            <input
              type="number"
              min="1"
              value={partQty}
              onChange={(e) => setPartQty(Number(e.target.value))}
              style={{ padding: '0.4rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
              data-testid="input-part-qty"
              required
            />
            <input
              type="text"
              placeholder="Unit ($)"
              value={partUnitCost}
              onChange={(e) => setPartUnitCost(e.target.value)}
              style={{ padding: '0.4rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
              data-testid="input-part-cost"
              required
            />
            <button
              type="submit"
              disabled={actionLoading}
              style={{
                padding: '0.4rem 0.75rem',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              data-testid="btn-add-part"
            >
              Add Part
            </button>
          </form>
        )}
      </div>

      {/* 3. Labor */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1.5rem',
          marginBottom: '1.5rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <h2 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 600 }}>
            3. Labor & Technician Time
          </h2>
          <span style={{ fontWeight: 600, color: '#374151' }}>
            Labor Subtotal: ${(workOrder.laborTotal / 100).toFixed(2)}
          </span>
        </div>

        {workOrder.labor.length === 0 ? (
          <p style={{ color: '#6b7280', margin: '0 0 1rem 0' }}>No labor logged.</p>
        ) : (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              marginBottom: '1rem',
            }}
            data-testid="table-labor"
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid #e5e7eb',
                  fontSize: '0.875rem',
                  color: '#6b7280',
                }}
              >
                <th style={{ padding: '0.5rem' }}>Description</th>
                <th style={{ padding: '0.5rem' }}>Tech</th>
                <th style={{ padding: '0.5rem' }}>Hours</th>
                <th style={{ padding: '0.5rem' }}>Rate ($/hr)</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {workOrder.labor.map((l) => (
                <tr key={l.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '0.5rem' }}>{l.description}</td>
                  <td style={{ padding: '0.5rem' }}>{l.technicianName || '—'}</td>
                  <td style={{ padding: '0.5rem' }}>{l.hours} hrs</td>
                  <td style={{ padding: '0.5rem' }}>${(l.hourlyRate / 100).toFixed(2)}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 600 }}>
                    ${(l.totalCost / 100).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!isTerminal && canManage && (
          <form
            onSubmit={handleAddLabor}
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr 1fr auto',
              gap: '0.5rem',
              alignItems: 'center',
              marginTop: '1rem',
            }}
          >
            <input
              type="text"
              placeholder="Labor Description *"
              value={laborDescription}
              onChange={(e) => setLaborDescription(e.target.value)}
              style={{ padding: '0.4rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
              data-testid="input-labor-desc"
              required
            />
            <input
              type="text"
              placeholder="Tech Name"
              value={technicianName}
              onChange={(e) => setTechnicianName(e.target.value)}
              style={{ padding: '0.4rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
              data-testid="input-labor-tech"
            />
            <input
              type="text"
              placeholder="Hours"
              value={laborHours}
              onChange={(e) => setLaborHours(e.target.value)}
              style={{ padding: '0.4rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
              data-testid="input-labor-hours"
              required
            />
            <input
              type="text"
              placeholder="Rate/hr"
              value={laborRate}
              onChange={(e) => setLaborRate(e.target.value)}
              style={{ padding: '0.4rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
              data-testid="input-labor-rate"
              required
            />
            <button
              type="submit"
              disabled={actionLoading}
              style={{
                padding: '0.4rem 0.75rem',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              data-testid="btn-add-labor"
            >
              Add Labor
            </button>
          </form>
        )}
      </div>

      {/* Linked Accounting Expenses Section */}
      <div
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1.5rem',
          background: '#fff',
          marginBottom: '1.5rem',
        }}
        data-testid="section-work-order-expenses"
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>
              Linked Accounting Expenses ({linkedExpenses.length})
            </h3>
            <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
              Financial expenses, invoices, and parts receipts attributed to this work order.
            </p>
          </div>
          <Link
            href="/expenses/new"
            style={{
              padding: '0.4rem 0.8rem',
              background: '#059669',
              color: '#fff',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            + Add Expense
          </Link>
        </div>

        {linkedExpenses.length === 0 ? (
          <p style={{ color: '#6b7280', fontStyle: 'italic', fontSize: '0.875rem', margin: 0 }}>
            No expenses directly linked to this work order.
          </p>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.8125rem',
                textAlign: 'left',
              }}
            >
              <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <tr>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Display ID</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Category</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Description</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Amount</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {linkedExpenses.map((ex) => (
                  <tr key={ex.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>
                      <Link
                        href={`/expenses/${ex.id}`}
                        style={{ color: '#2563eb', textDecoration: 'none' }}
                      >
                        {ex.displayId}
                      </Link>
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{ex.category?.name || 'Expense'}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{ex.description}</td>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>
                      {ex.amount.toFixed(2)} {ex.currencyCode}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <span
                        style={{
                          padding: '0.15rem 0.4rem',
                          borderRadius: '4px',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          background: ex.status === 'POSTED' ? '#dcfce7' : '#fef3c7',
                          color: ex.status === 'POSTED' ? '#166534' : '#92400e',
                        }}
                      >
                        {ex.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Complete Modal */}
      {showCompleteModal && (
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
          data-testid="modal-complete"
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
              Complete Work Order
            </h3>
            <p style={{ margin: '0 0 1rem 0', color: '#6b7280', fontSize: '0.875rem' }}>
              Finalize work order and update vehicle service records. All tasks must be completed or
              skipped.
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  marginBottom: '0.25rem',
                }}
              >
                Completion Notes *
              </label>
              <textarea
                placeholder="Describe work performed, test drive results, or technician sign-off..."
                rows={3}
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                }}
                data-testid="input-completion-notes"
                required
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  marginBottom: '0.25rem',
                }}
              >
                Odometer at Completion (km)
              </label>
              <input
                type="number"
                placeholder={
                  workOrder.odometerAtOpen
                    ? `At least ${workOrder.odometerAtOpen}`
                    : 'Current vehicle odometer'
                }
                value={odometerAtCompletion}
                onChange={(e) =>
                  setOdometerAtCompletion(e.target.value === '' ? '' : Number(e.target.value))
                }
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                }}
                data-testid="input-completion-odometer"
              />
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                Updates vehicle current odometer. Must not regress.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowCompleteModal(false)}
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
                onClick={handleComplete}
                disabled={actionLoading || !completionNotes.trim()}
                style={{
                  padding: '0.5rem 1.25rem',
                  background: '#16a34a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                data-testid="btn-confirm-complete"
              >
                {actionLoading ? 'Completing...' : 'Sign Off & Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

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
              Cancel Work Order
            </h3>
            <p style={{ margin: '0 0 1rem 0', color: '#6b7280', fontSize: '0.875rem' }}>
              State reason for cancelling this maintenance order.
            </p>
            <textarea
              placeholder="Reason for cancellation..."
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
              required
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
                Back
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
    </div>
  );
}
