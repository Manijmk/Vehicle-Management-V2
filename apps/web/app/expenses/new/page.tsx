'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import {
  financeApi,
  vehicleApi,
  type ExpenseCategoryRecord,
  type VehicleRecord,
} from '../../../lib/api-client';

export default function NewExpensePage() {
  const router = useRouter();
  const [categories, setCategories] = useState<ExpenseCategoryRecord[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [categoryId, setCategoryId] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number | ''>(25.0);
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [vendorName, setVendorName] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [status, setStatus] = useState<'DRAFT' | 'POSTED'>('POSTED');

  // Attributions
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [tripId, setTripId] = useState('');
  const [workOrderId, setWorkOrderId] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const [cats, vehs] = await Promise.all([
          financeApi.fetchExpenseCategories(false),
          vehicleApi.fetchVehicles(),
        ]);
        setCategories(cats);
        const first = cats[0];
        if (first) {
          setCategoryId(first.id);
        }
        setVehicles(vehs);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load form prerequisites');
      }
    }
    void init();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId) {
      setError('Expense category is required');
      return;
    }
    if (!description.trim()) {
      setError('Description is required');
      return;
    }
    if (typeof amount !== 'number' || amount <= 0) {
      setError('Valid amount is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const created = await financeApi.createExpense({
        categoryId,
        vehicleId: vehicleId || undefined,
        driverId: driverId || undefined,
        tripId: tripId || undefined,
        maintenanceWorkOrderId: workOrderId || undefined,
        occurredAt: new Date(occurredAt).toISOString(),
        description: description.trim(),
        amount,
        currencyCode: currencyCode.toUpperCase(),
        vendorName: vendorName.trim() || undefined,
        referenceNumber: referenceNumber.trim() || undefined,
        status,
      });

      // Upload receipt if provided
      if (receiptFile) {
        const fd = new FormData();
        fd.append('file', receiptFile);
        await financeApi.uploadExpenseReceipt(created.id, fd);
      }

      router.push(`/expenses/${created.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record expense');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1.5rem' }}>
      <TenantHeader />

      <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <Link
          href="/expenses"
          style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.875rem' }}
        >
          &larr; Back to Fleet Expenses
        </Link>
        <h1
          style={{ fontSize: '1.875rem', fontWeight: 700, margin: '0.5rem 0 0 0' }}
          data-testid="new-expense-title"
        >
          Record Fleet Expense
        </h1>
        <p style={{ color: '#4b5563', margin: '0.25rem 0 0 0' }}>
          Log tolls, parking, cleaning, maintenance parts, fines, or operational expenses.
        </p>
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
          data-testid="expense-error"
        >
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
        }}
        data-testid="expense-form"
      >
        {/* Category & Status */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                marginBottom: '0.25rem',
              }}
            >
              Category *
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              data-testid="input-category"
            >
              <option value="">Select Category</option>
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
              Initial Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'DRAFT' | 'POSTED')}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              data-testid="input-status"
            >
              <option value="POSTED">POSTED (Final)</option>
              <option value="DRAFT">DRAFT (Editable)</option>
            </select>
          </div>
        </div>

        {/* Description */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 600,
              marginBottom: '0.25rem',
            }}
          >
            Description *
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Bridge crossing toll - eastbound"
            required
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
            }}
            data-testid="input-description"
          />
        </div>

        {/* Amount, Currency, Date */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr', gap: '1rem' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                marginBottom: '0.25rem',
              }}
            >
              Amount *
            </label>
            <input
              type="number"
              step="any"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
              required
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              data-testid="input-amount"
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
              Currency *
            </label>
            <input
              type="text"
              maxLength={3}
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
              required
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                textTransform: 'uppercase',
              }}
              data-testid="input-currency"
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
              Date & Time *
            </label>
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              data-testid="input-occurred-at"
            />
          </div>
        </div>

        {/* Vendor and Reference */}
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
              Vendor / Payee Name
            </label>
            <input
              type="text"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="e.g. Metro Highway Authority"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              data-testid="input-vendor"
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
              Reference / Invoice #
            </label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="e.g. TOLL-2026-99"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              data-testid="input-reference"
            />
          </div>
        </div>

        {/* Attributions Section */}
        <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '1rem' }}>
          <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', color: '#4b5563' }}>
            Optional Fleet Attribution Links
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  marginBottom: '0.25rem',
                }}
              >
                Attributed Vehicle
              </label>
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                }}
                data-testid="input-vehicle"
              >
                <option value="">None (General Organization Cost)</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.displayId} ({v.registration})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  marginBottom: '0.25rem',
                }}
              >
                Attributed Trip ID (UUID)
              </label>
              <input
                type="text"
                value={tripId}
                onChange={(e) => setTripId(e.target.value)}
                placeholder="Optional Trip UUID"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                }}
                data-testid="input-trip"
              />
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
              marginTop: '0.75rem',
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  marginBottom: '0.25rem',
                }}
              >
                Attributed Driver ID (UUID)
              </label>
              <input
                type="text"
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                placeholder="Optional Driver UUID"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                }}
                data-testid="input-driver"
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  marginBottom: '0.25rem',
                }}
              >
                Attributed Work Order ID (UUID)
              </label>
              <input
                type="text"
                value={workOrderId}
                onChange={(e) => setWorkOrderId(e.target.value)}
                placeholder="Optional Work Order UUID"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                }}
                data-testid="input-work-order"
              />
            </div>
          </div>
        </div>

        {/* Optional Receipt Attachment */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 600,
              marginBottom: '0.25rem',
            }}
          >
            Receipt Attachment (PDF, PNG, JPEG)
          </label>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px dashed #d1d5db',
              borderRadius: '6px',
            }}
            data-testid="input-receipt-file"
          />
        </div>

        <div
          style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}
        >
          <Link
            href="/expenses"
            style={{
              padding: '0.625rem 1.25rem',
              background: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '0.625rem 1.5rem',
              background: loading ? '#6ee7b7' : '#059669',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
            data-testid="submit-expense"
          >
            {loading ? 'Submitting...' : 'Save Expense'}
          </button>
        </div>
      </form>
    </div>
  );
}
