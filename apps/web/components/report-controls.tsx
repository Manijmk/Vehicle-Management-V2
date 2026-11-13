'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { downloadReportExport } from '../lib/api-client';

interface ReportControlsProps {
  reportKey: string;
  from?: string;
  to?: string;
  onDateChange: (from: string, to: string) => void;
  exportTitle?: string;
}

export function ReportControls({
  reportKey,
  from = '',
  to = '',
  onDateChange,
  exportTitle = 'Export',
}: ReportControlsProps) {
  const pathname = usePathname();
  const [localFrom, setLocalFrom] = useState(from);
  const [localTo, setLocalTo] = useState(to);
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    onDateChange(localFrom, localTo);
  };

  const handleQuickRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    const fromStr = start.toISOString().split('T')[0] ?? '';
    const toStr = end.toISOString().split('T')[0] ?? '';
    setLocalFrom(fromStr);
    setLocalTo(toStr);
    onDateChange(fromStr, toStr);
  };

  const handleExport = async (format: 'csv' | 'pdf') => {
    try {
      setExporting(format);
      setExportError(null);
      await downloadReportExport(reportKey, format, {
        from: from || undefined,
        to: to || undefined,
      });
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(null);
    }
  };

  const navLinks = [
    { label: 'Executive Dashboard', href: '/reports' },
    { label: 'Utilization', href: '/reports/utilization' },
    { label: 'Trips', href: '/reports/trips' },
    { label: 'Costs & Fuel', href: '/reports/costs' },
    { label: 'Maintenance', href: '/reports/maintenance' },
    { label: 'Compliance', href: '/reports/compliance' },
    { label: 'Incidents', href: '/reports/incidents' },
    { label: 'Telemetry', href: '/reports/telemetry' },
  ];

  return (
    <div style={{ marginBottom: '2rem' }}>
      {/* Sub-navigation tabs */}
      <nav
        aria-label="Reports sub-navigation"
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid #e5e7eb',
          paddingBottom: '0.5rem',
          marginBottom: '1.25rem',
          overflowX: 'auto',
          flexWrap: 'wrap',
        }}
      >
        {navLinks.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#1d4ed8' : '#4b5563',
                backgroundColor: isActive ? '#eff6ff' : 'transparent',
                textDecoration: 'none',
                border: isActive ? '1px solid #bfdbfe' : '1px solid transparent',
              }}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Filter and Export Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          backgroundColor: '#f9fafb',
          padding: '1rem',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
        }}
      >
        {/* Date Filter Form */}
        <form
          onSubmit={handleApply}
          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <label
              htmlFor="report-from"
              style={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}
            >
              From:
            </label>
            <input
              id="report-from"
              type="date"
              data-testid="input-from"
              value={localFrom}
              onChange={(e) => setLocalFrom(e.target.value)}
              style={{
                padding: '0.4rem 0.6rem',
                fontSize: '0.875rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                backgroundColor: '#fff',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <label
              htmlFor="report-to"
              style={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}
            >
              To:
            </label>
            <input
              id="report-to"
              type="date"
              data-testid="input-to"
              value={localTo}
              onChange={(e) => setLocalTo(e.target.value)}
              style={{
                padding: '0.4rem 0.6rem',
                fontSize: '0.875rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                backgroundColor: '#fff',
              }}
            />
          </div>

          <button
            type="submit"
            data-testid="btn-apply-filter"
            style={{
              padding: '0.4rem 0.85rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              backgroundColor: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Apply
          </button>

          {/* Quick presets */}
          <div style={{ display: 'flex', gap: '0.35rem', marginLeft: '0.5rem' }}>
            <button
              type="button"
              onClick={() => handleQuickRange(7)}
              style={{
                padding: '0.3rem 0.5rem',
                fontSize: '0.75rem',
                backgroundColor: '#f3f4f6',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              7d
            </button>
            <button
              type="button"
              onClick={() => handleQuickRange(30)}
              style={{
                padding: '0.3rem 0.5rem',
                fontSize: '0.75rem',
                backgroundColor: '#f3f4f6',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              30d
            </button>
            <button
              type="button"
              onClick={() => handleQuickRange(90)}
              style={{
                padding: '0.3rem 0.5rem',
                fontSize: '0.75rem',
                backgroundColor: '#f3f4f6',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              90d
            </button>
          </div>
        </form>

        {/* Export Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 }}>
            {exportTitle}:
          </span>
          <button
            type="button"
            data-testid="export-csv-btn"
            disabled={exporting !== null}
            onClick={() => handleExport('csv')}
            style={{
              padding: '0.4rem 0.85rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              backgroundColor: '#fff',
              color: '#059669',
              border: '1px solid #059669',
              borderRadius: '6px',
              cursor: exporting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            {exporting === 'csv' ? 'Exporting...' : '📥 Export CSV'}
          </button>
          <button
            type="button"
            data-testid="export-pdf-btn"
            disabled={exporting !== null}
            onClick={() => handleExport('pdf')}
            style={{
              padding: '0.4rem 0.85rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              backgroundColor: '#fff',
              color: '#dc2626',
              border: '1px solid #dc2626',
              borderRadius: '6px',
              cursor: exporting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            {exporting === 'pdf' ? 'Exporting...' : '📄 Export PDF'}
          </button>
        </div>
      </div>

      {exportError && (
        <div
          data-testid="export-error"
          style={{
            marginTop: '0.5rem',
            padding: '0.6rem 0.8rem',
            backgroundColor: '#fee2e2',
            border: '1px solid #f87171',
            borderRadius: '6px',
            color: '#b91c1c',
            fontSize: '0.875rem',
          }}
        >
          {exportError}
        </div>
      )}
    </div>
  );
}
