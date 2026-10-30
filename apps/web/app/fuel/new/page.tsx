'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import {
  financeApi,
  vehicleApi,
  type FuelQuantityUnit,
  type VehicleRecord,
} from '../../../lib/api-client';

export default function NewFuelTransactionPage() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [vehicleId, setVehicleId] = useState('');
  const [tripId, setTripId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [energyType, setEnergyType] = useState('DIESEL');
  const [quantity, setQuantity] = useState<number | ''>(45);
  const [quantityUnit, setQuantityUnit] = useState<FuelQuantityUnit>('LITER');
  const [unitPrice, setUnitPrice] = useState<number | ''>(1.55);
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [odometerKm, setOdometerKm] = useState<number | ''>('');
  const [stationName, setStationName] = useState('Shell Highway Oasis');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  // Auto-calculated total amount
  const computedTotal =
    typeof quantity === 'number' && typeof unitPrice === 'number'
      ? (quantity * unitPrice).toFixed(2)
      : '0.00';

  useEffect(() => {
    async function init() {
      try {
        const vehList = await vehicleApi.fetchVehicles();
        setVehicles(vehList);
        const first = vehList[0];
        if (first) {
          setVehicleId(first.id);
          if (first.odometerKm) {
            setOdometerKm(first.odometerKm + 450);
          }
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load form prerequisites');
      }
    }
    void init();
  }, []);

  const handleVehicleChange = (vId: string) => {
    setVehicleId(vId);
    const sel = vehicles.find((v) => v.id === vId);
    if (sel?.odometerKm) {
      setOdometerKm(sel.odometerKm + 450);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleId) {
      setError('Vehicle is required');
      return;
    }
    if (typeof quantity !== 'number' || quantity <= 0) {
      setError('Valid quantity is required');
      return;
    }
    if (typeof unitPrice !== 'number' || unitPrice <= 0) {
      setError('Valid unit price is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const created = await financeApi.createFuelTransaction({
        vehicleId,
        driverId: driverId || undefined,
        tripId: tripId || undefined,
        occurredAt: new Date(occurredAt).toISOString(),
        energyType,
        quantity,
        quantityUnit,
        unitPrice,
        currencyCode: currencyCode.toUpperCase(),
        odometerKm: typeof odometerKm === 'number' ? odometerKm : undefined,
        stationName: stationName || undefined,
        referenceNumber: referenceNumber || undefined,
      });

      // If user uploaded a receipt, upload it right after creation
      if (receiptFile) {
        const fd = new FormData();
        fd.append('file', receiptFile);
        await financeApi.uploadFuelReceipt(created.id, fd);
      }

      router.push(`/fuel/${created.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record fuel transaction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1.5rem' }}>
      <TenantHeader />

      <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <Link
          href="/fuel"
          style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.875rem' }}
        >
          &larr; Back to Fuel Transactions
        </Link>
        <h1
          style={{ fontSize: '1.875rem', fontWeight: 700, margin: '0.5rem 0 0 0' }}
          data-testid="new-fuel-title"
        >
          Log Fuel Transaction
        </h1>
        <p style={{ color: '#4b5563', margin: '0.25rem 0 0 0' }}>
          Record vehicle fuel purchase, odometer reading, and receipt attachment.
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
          data-testid="fuel-error"
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
        data-testid="fuel-form"
      >
        {/* Vehicle Selection */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 600,
              marginBottom: '0.25rem',
            }}
          >
            Vehicle *
          </label>
          <select
            value={vehicleId}
            onChange={(e) => handleVehicleChange(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
            }}
            data-testid="input-vehicle"
          >
            <option value="">Select Vehicle</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.displayId} — {v.model} ({v.registration})
              </option>
            ))}
          </select>
        </div>

        {/* Date and Energy Type */}
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
              Transaction Date & Time *
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
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                marginBottom: '0.25rem',
              }}
            >
              Energy Type *
            </label>
            <select
              value={energyType}
              onChange={(e) => setEnergyType(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              data-testid="input-energy-type"
            >
              <option value="DIESEL">DIESEL</option>
              <option value="PETROL">PETROL</option>
              <option value="ELECTRIC">ELECTRIC</option>
              <option value="GAS">GAS</option>
              <option value="OTHER">OTHER</option>
            </select>
          </div>
        </div>

        {/* Quantity, Unit, Unit Price, Currency */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                marginBottom: '0.25rem',
              }}
            >
              Quantity *
            </label>
            <input
              type="number"
              step="any"
              min="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value === '' ? '' : parseFloat(e.target.value))}
              required
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              data-testid="input-quantity"
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
              Unit *
            </label>
            <select
              value={quantityUnit}
              onChange={(e) => setQuantityUnit(e.target.value as FuelQuantityUnit)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              data-testid="input-unit"
            >
              <option value="LITER">LITER</option>
              <option value="GALLON">GALLON</option>
              <option value="KWH">KWH</option>
              <option value="KG">KG</option>
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
              Unit Price *
            </label>
            <input
              type="number"
              step="any"
              min="0.0001"
              value={unitPrice}
              onChange={(e) =>
                setUnitPrice(e.target.value === '' ? '' : parseFloat(e.target.value))
              }
              required
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              data-testid="input-unit-price"
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
        </div>

        {/* Total Amount Computed Box */}
        <div
          style={{
            background: '#f9fafb',
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            border: '1px dashed #d1d5db',
          }}
        >
          <span style={{ fontSize: '0.875rem', color: '#4b5563' }}>Computed Total: </span>
          <strong style={{ fontSize: '1.125rem', color: '#111827' }} data-testid="computed-total">
            {computedTotal} {currencyCode}
          </strong>
        </div>

        {/* Odometer, Station, Reference */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                marginBottom: '0.25rem',
              }}
            >
              Odometer (km)
            </label>
            <input
              type="number"
              step="1"
              min="0"
              value={odometerKm}
              onChange={(e) =>
                setOdometerKm(e.target.value === '' ? '' : parseInt(e.target.value, 10))
              }
              placeholder="e.g. 15400"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              data-testid="input-odometer"
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
              Station / Vendor Name
            </label>
            <input
              type="text"
              value={stationName}
              onChange={(e) => setStationName(e.target.value)}
              placeholder="e.g. BP Express #402"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              data-testid="input-station"
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
              Reference / Receipt #
            </label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="e.g. REC-9921"
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

        {/* Optional Attributions */}
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
              Driver ID (UUID)
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
                fontSize: '0.875rem',
                fontWeight: 600,
                marginBottom: '0.25rem',
              }}
            >
              Trip ID (UUID)
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
            href="/fuel"
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
              background: loading ? '#93c5fd' : '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
            data-testid="submit-fuel"
          >
            {loading ? 'Submitting...' : 'Record Fuel Purchase'}
          </button>
        </div>
      </form>
    </div>
  );
}
