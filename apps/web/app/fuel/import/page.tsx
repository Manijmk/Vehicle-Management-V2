'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import { financeApi, type FuelImportPreviewResponse } from '../../../lib/api-client';

const SAMPLE_CSV = `vehicleRegistration,occurredAt,quantity,unit,unitPrice,currencyCode,odometerKm,stationName,referenceNumber
FIN-100,2026-10-30T10:00:00.000Z,45.5,LITERS,1.65,USD,12500,Shell Oasis,REF-CSV-01
FIN-100,2026-10-30T14:30:00.000Z,32.0,LITERS,1.60,USD,12900,BP Express,REF-CSV-02`;

export default function FuelCsvImportPage() {
  const router = useRouter();
  const [csvContent, setCsvContent] = useState(SAMPLE_CSV);
  const [preview, setPreview] = useState<FuelImportPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvContent(text);
      setPreview(null);
    };
    reader.readAsText(file);
  };

  const handlePreview = async () => {
    if (!csvContent.trim()) {
      setError('Please provide CSV content to preview');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      setSuccessMessage(null);
      const res = await financeApi.previewFuelCsv(csvContent);
      setPreview(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to preview CSV');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    try {
      setConfirming(true);
      setError(null);
      const res = await financeApi.confirmFuelCsv(csvContent);
      setSuccessMessage(
        `Successfully imported ${res.importedCount} fuel transactions! (${res.skippedCount} skipped)`,
      );
      setTimeout(() => {
        router.push('/fuel');
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to confirm fuel import');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '1.5rem' }}>
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
          data-testid="import-title"
        >
          Import Fuel Transactions from CSV
        </h1>
        <p style={{ color: '#4b5563', margin: '0.25rem 0 0 0' }}>
          Bulk import fuel receipts from fleet fuel card providers or accounting spreadsheets.
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
          data-testid="import-error"
        >
          {error}
        </div>
      )}

      {successMessage && (
        <div
          style={{
            padding: '1rem',
            background: '#dcfce7',
            border: '1px solid #86efac',
            borderRadius: '6px',
            color: '#166534',
            marginBottom: '1rem',
          }}
          data-testid="import-success"
        >
          {successMessage}
        </div>
      )}

      {/* CSV Input Card */}
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
            flexWrap: 'wrap',
            gap: '1rem',
          }}
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
              Upload CSV File
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              style={{ fontSize: '0.875rem' }}
              data-testid="input-csv-file"
            />
          </div>
          <button
            type="button"
            onClick={() => setCsvContent(SAMPLE_CSV)}
            style={{
              padding: '0.375rem 0.75rem',
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            Reset to Sample CSV
          </button>
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
            CSV Data Content
          </label>
          <textarea
            value={csvContent}
            onChange={(e) => {
              setCsvContent(e.target.value);
              setPreview(null);
            }}
            rows={8}
            style={{
              width: '100%',
              padding: '0.75rem',
              fontFamily: 'monospace',
              fontSize: '0.8125rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
            }}
            data-testid="textarea-csv-content"
          />
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handlePreview}
            disabled={loading || !csvContent.trim()}
            style={{
              padding: '0.625rem 1.5rem',
              background: loading ? '#93c5fd' : '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: loading || !csvContent.trim() ? 'not-allowed' : 'pointer',
            }}
            data-testid="btn-preview-import"
          >
            {loading ? 'Validating...' : 'Preview Import & Validate'}
          </button>
        </div>
      </div>

      {/* Preview Section */}
      {preview && (
        <div
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
          }}
          data-testid="preview-section"
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Import Preview</h2>
              <p style={{ color: '#4b5563', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
                Total: {preview.totalRows} rows &bull;{' '}
                <span
                  style={{ color: '#166534', fontWeight: 600 }}
                  data-testid="preview-valid-count"
                >
                  {preview.validCount ?? preview.validRows ?? 0} valid
                </span>{' '}
                &bull;{' '}
                <span
                  style={{ color: '#991b1b', fontWeight: 600 }}
                  data-testid="preview-invalid-count"
                >
                  {preview.invalidCount ?? preview.invalidRows ?? 0} invalid
                </span>
              </p>
            </div>

            {(preview.validCount ?? preview.validRows ?? 0) > 0 && (
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirming}
                style={{
                  padding: '0.625rem 1.5rem',
                  background: confirming ? '#86efac' : '#16a34a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: confirming ? 'not-allowed' : 'pointer',
                }}
                data-testid="btn-confirm-import"
              >
                {confirming
                  ? 'Importing...'
                  : `Confirm Import (${preview.validCount ?? preview.validRows ?? 0} rows)`}
              </button>
            )}
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '0.8125rem',
              }}
              data-testid="preview-table"
            >
              <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <tr>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Row</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Status</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Registration</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Date</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Quantity</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Unit Price</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Total</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Odometer</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Errors</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr
                    key={row.rowNumber}
                    style={{
                      borderBottom: '1px solid #f3f4f6',
                      background: row.isValid ? 'transparent' : '#fef2f2',
                    }}
                    data-testid="preview-row"
                  >
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>{row.rowNumber}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <span
                        style={{
                          padding: '0.15rem 0.4rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: row.isValid ? '#dcfce7' : '#fee2e2',
                          color: row.isValid ? '#166534' : '#991b1b',
                        }}
                      >
                        {row.isValid ? 'VALID' : 'INVALID'}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>
                      {row.vehicleRegistration}{' '}
                      {row.matchedVehicleId && (
                        <span style={{ color: '#059669', fontSize: '0.7rem' }}>✓ matched</span>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      {new Date(row.occurredAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      {row.quantity} {row.unit}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      {row.unitPrice} {row.currencyCode}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>
                      {row.totalAmount} {row.currencyCode}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      {row.odometerKm !== null && row.odometerKm !== undefined
                        ? `${row.odometerKm} km`
                        : '-'}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', color: '#dc2626' }}>
                      {row.errors.length > 0 ? row.errors.join(', ') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
