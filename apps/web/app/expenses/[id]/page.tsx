'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import {
  financeApi,
  type ExpenseCategoryRecord,
  type ExpenseRecord,
} from '../../../lib/api-client';

export default function ExpenseDetailPage() {
  const params = useParams();
  const expenseId = params['id'] as string;

  const [expense, setExpense] = useState<ExpenseRecord | null>(null);
  const [categories, setCategories] = useState<ExpenseCategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit draft state
  const [isEditing, setIsEditing] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState<number | ''>('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Void modal state
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  // Receipt state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadData = useCallback(async () => {
    if (!expenseId) return;
    try {
      setLoading(true);
      setError(null);
      const [exp, cats] = await Promise.all([
        financeApi.fetchExpense(expenseId),
        financeApi.fetchExpenseCategories(true),
      ]);
      setExpense(exp);
      setCategories(cats);
      setEditDescription(exp.description);
      setEditAmount(exp.amount);
      setEditCategoryId(exp.categoryId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load expense');
    } finally {
      setLoading(false);
    }
  }, [expenseId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSaveDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expense) return;
    if (typeof editAmount !== 'number' || editAmount <= 0) {
      setError('Amount must be positive number');
      return;
    }
    try {
      setSavingEdit(true);
      setError(null);
      await financeApi.updateExpenseDraft(expenseId, {
        description: editDescription,
        amount: editAmount,
        categoryId: editCategoryId,
        version: expense.version,
      });
      setIsEditing(false);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update draft expense');
    } finally {
      setSavingEdit(false);
    }
  };

  const handlePost = async () => {
    try {
      setLoading(true);
      setError(null);
      await financeApi.postExpense(expenseId);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to post expense');
    } finally {
      setLoading(false);
    }
  };

  const handleVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidReason.trim()) {
      setError('Void reason is mandatory');
      return;
    }
    try {
      setVoiding(true);
      setError(null);
      await financeApi.voidExpense(expenseId, voidReason.trim());
      setShowVoidModal(false);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to void expense');
    } finally {
      setVoiding(false);
    }
  };

  const handleDownloadReceipt = async () => {
    try {
      const res = await financeApi.getExpenseReceiptUrl(expenseId);
      window.open(res.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to get receipt download URL');
    }
  };

  const handleUploadReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    try {
      setUploading(true);
      setError(null);
      const fd = new FormData();
      fd.append('file', uploadFile);
      await financeApi.uploadExpenseReceipt(expenseId, fd);
      setUploadFile(null);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to upload receipt');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem' }}>
      <TenantHeader onAuthChange={loadData} />

      <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <Link
          href="/expenses"
          style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.875rem' }}
        >
          &larr; Back to Fleet Expenses
        </Link>
      </div>

      {error && (
        <div
          style={{
            padding: '1rem',
            background: '#fee2e2',
            border: '1px solid #ef4444',
            borderRadius: '6px',
            color: '#991b1b',
            marginBottom: '1rem',
          }}
          data-testid="expense-detail-error"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div
          style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}
          data-testid="expense-loading"
        >
          Loading expense details...
        </div>
      ) : !expense ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
          Expense not found.
        </div>
      ) : (
        <>
          {/* Header Bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid #e5e7eb',
              paddingBottom: '1rem',
              marginBottom: '1.5rem',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <h1
                  style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}
                  data-testid="expense-display-id"
                >
                  {expense.displayId}
                </h1>
                <span
                  style={{
                    padding: '0.25rem 0.625rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    background:
                      expense.status === 'POSTED'
                        ? '#dcfce7'
                        : expense.status === 'DRAFT'
                          ? '#fef3c7'
                          : '#f3f4f6',
                    color:
                      expense.status === 'POSTED'
                        ? '#166534'
                        : expense.status === 'DRAFT'
                          ? '#92400e'
                          : '#4b5563',
                  }}
                  data-testid="expense-status"
                >
                  {expense.status}
                </span>
              </div>
              <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
                Recorded on {new Date(expense.createdAt).toLocaleString()} &bull; Version{' '}
                {expense.version}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              {expense.status === 'DRAFT' && !isEditing && (
                <>
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#fff',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                    data-testid="btn-edit-draft"
                  >
                    Edit Draft
                  </button>
                  <button
                    type="button"
                    onClick={handlePost}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#059669',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    data-testid="btn-post-expense"
                  >
                    Post Expense
                  </button>
                </>
              )}

              {expense.status === 'POSTED' && (
                <button
                  type="button"
                  onClick={() => setShowVoidModal(true)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#fee2e2',
                    color: '#991b1b',
                    border: '1px solid #f87171',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  data-testid="btn-void-expense"
                >
                  Void Expense
                </button>
              )}
            </div>
          </div>

          {/* Voided Banner */}
          {expense.status === 'VOIDED' && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fca5a5',
                borderRadius: '8px',
                padding: '1rem',
                marginBottom: '1.5rem',
                color: '#991b1b',
              }}
              data-testid="void-reason-banner"
            >
              <strong>Expense Voided:</strong> {expense.voidReason}
              <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: '#b91c1c' }}>
                Voided on {expense.voidedAt ? new Date(expense.voidedAt).toLocaleString() : 'N/A'}
              </div>
            </div>
          )}

          {/* Edit Form (if editing draft) */}
          {isEditing ? (
            <form
              onSubmit={handleSaveDraft}
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.5rem',
                marginBottom: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
              data-testid="edit-draft-form"
            >
              <h3 style={{ margin: 0, fontSize: '1.125rem' }}>Edit Draft Expense</h3>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    marginBottom: '0.25rem',
                  }}
                >
                  Category
                </label>
                <select
                  value={editCategoryId}
                  onChange={(e) => setEditCategoryId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                  }}
                  data-testid="edit-input-category"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
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
                  Description
                </label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                  }}
                  data-testid="edit-input-description"
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
                  Amount ({expense.currencyCode})
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  value={editAmount}
                  onChange={(e) =>
                    setEditAmount(e.target.value === '' ? '' : parseFloat(e.target.value))
                  }
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                  }}
                  data-testid="edit-input-amount"
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
                  onClick={() => setIsEditing(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#f3f4f6',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  style={{
                    padding: '0.5rem 1.25rem',
                    background: savingEdit ? '#93c5fd' : '#2563eb',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                  }}
                  data-testid="btn-save-draft"
                >
                  {savingEdit ? 'Saving...' : 'Save Draft Changes'}
                </button>
              </div>
            </form>
          ) : (
            /* Details Grid */
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '1.5rem',
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.5rem',
                marginBottom: '1.5rem',
              }}
            >
              <div>
                <h4
                  style={{
                    margin: '0 0 0.75rem 0',
                    fontSize: '0.875rem',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                  }}
                >
                  Expense Overview
                </h4>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    fontSize: '0.875rem',
                  }}
                >
                  <div>
                    <span style={{ color: '#4b5563' }}>Category: </span>
                    <strong data-testid="expense-category">
                      {expense.category ? expense.category.name : 'Unknown'} (
                      {expense.category?.code})
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#4b5563' }}>Description: </span>
                    <strong data-testid="expense-description">{expense.description}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#4b5563' }}>Amount: </span>
                    <strong
                      style={{ fontSize: '1.25rem', color: '#111827' }}
                      data-testid="expense-amount"
                    >
                      {expense.amount.toFixed(2)} {expense.currencyCode}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#4b5563' }}>Occurred At: </span>
                    <span>{new Date(expense.occurredAt).toLocaleString()}</span>
                  </div>
                  <div>
                    <span style={{ color: '#4b5563' }}>Vendor: </span>
                    <span>{expense.vendorName || 'N/A'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#4b5563' }}>Reference #: </span>
                    <span>{expense.referenceNumber || 'N/A'}</span>
                  </div>
                </div>
              </div>

              <div>
                <h4
                  style={{
                    margin: '0 0 0.75rem 0',
                    fontSize: '0.875rem',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                  }}
                >
                  Fleet Attributions
                </h4>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    fontSize: '0.875rem',
                  }}
                >
                  <div>
                    <span style={{ color: '#4b5563' }}>Vehicle: </span>
                    {expense.vehicle ? (
                      <Link
                        href={`/vehicles/${expense.vehicle.id}`}
                        style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}
                        data-testid="expense-vehicle"
                      >
                        {expense.vehicle.displayId} ({expense.vehicle.registration})
                      </Link>
                    ) : (
                      'None (General Fleet)'
                    )}
                  </div>
                  <div>
                    <span style={{ color: '#4b5563' }}>Trip: </span>
                    {expense.trip ? (
                      <Link
                        href={`/trips/${expense.trip.id}`}
                        style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}
                        data-testid="expense-trip"
                      >
                        {expense.trip.displayId}
                      </Link>
                    ) : (
                      'None'
                    )}
                  </div>
                  <div>
                    <span style={{ color: '#4b5563' }}>Maintenance Work Order: </span>
                    {expense.maintenanceWorkOrder ? (
                      <Link
                        href={`/maintenance/work-orders/${expense.maintenanceWorkOrderId}`}
                        style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}
                        data-testid="expense-work-order"
                      >
                        {expense.maintenanceWorkOrder.displayId} —{' '}
                        {expense.maintenanceWorkOrder.title}
                      </Link>
                    ) : (
                      'None'
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Receipt Section */}
          <div
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1.5rem',
              marginBottom: '1.5rem',
            }}
            data-testid="receipt-section"
          >
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.125rem', fontWeight: 600 }}>
              Receipt Documentation
            </h3>
            {expense.receiptStorageKey ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div>
                  <p style={{ margin: 0, fontWeight: 500 }}>
                    Attached file: {expense.receiptFileName || 'receipt.pdf'}
                  </p>
                  <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280', fontSize: '0.75rem' }}>
                    {expense.receiptContentType} &bull;{' '}
                    {expense.receiptFileSize
                      ? `${(expense.receiptFileSize / 1024).toFixed(1)} KB`
                      : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadReceipt}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                  data-testid="btn-download-receipt"
                >
                  Download Signed Receipt &darr;
                </button>
              </div>
            ) : (
              <div>
                <p style={{ color: '#6b7280', margin: '0 0 1rem 0', fontSize: '0.875rem' }}>
                  No receipt attached to this expense.
                </p>
                {expense.status !== 'VOIDED' && (
                  <form
                    onSubmit={handleUploadReceipt}
                    style={{
                      display: 'flex',
                      gap: '0.75rem',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                    data-testid="upload-receipt-form"
                  >
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                      required
                      style={{
                        padding: '0.25rem',
                        border: '1px dashed #d1d5db',
                        borderRadius: '4px',
                      }}
                    />
                    <button
                      type="submit"
                      disabled={uploading || !uploadFile}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#059669',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 500,
                        cursor: uploading || !uploadFile ? 'not-allowed' : 'pointer',
                      }}
                      data-testid="btn-upload-receipt"
                    >
                      {uploading ? 'Uploading...' : 'Upload Receipt'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Void Modal */}
          {showVoidModal && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 50,
                padding: '1rem',
              }}
              data-testid="void-modal"
            >
              <div
                style={{
                  background: '#fff',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  maxWidth: '500px',
                  width: '100%',
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                }}
              >
                <h3
                  style={{
                    margin: '0 0 0.5rem 0',
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: '#991b1b',
                  }}
                >
                  Void Expense
                </h3>
                <p style={{ color: '#4b5563', fontSize: '0.875rem', margin: '0 0 1rem 0' }}>
                  Voiding an expense cannot be undone. An explanation is required for the audit
                  record.
                </p>
                <form onSubmit={handleVoid}>
                  <div style={{ marginBottom: '1rem' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        marginBottom: '0.25rem',
                      }}
                    >
                      Reason for Voiding *
                    </label>
                    <textarea
                      value={voidReason}
                      onChange={(e) => setVoidReason(e.target.value)}
                      placeholder="e.g. Invoiced incorrectly by vendor, credit issued"
                      required
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                      }}
                      data-testid="input-void-reason"
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button
                      type="button"
                      onClick={() => setShowVoidModal(false)}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#f3f4f6',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={voiding || !voidReason.trim()}
                      style={{
                        padding: '0.5rem 1rem',
                        background: voiding ? '#f87171' : '#dc2626',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 600,
                        cursor: voiding || !voidReason.trim() ? 'not-allowed' : 'pointer',
                      }}
                      data-testid="confirm-void-btn"
                    >
                      {voiding ? 'Voiding...' : 'Confirm Void'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
