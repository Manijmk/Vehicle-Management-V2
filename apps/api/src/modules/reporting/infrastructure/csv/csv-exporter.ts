import { ApplicationError } from '../../../foundation/domain/errors.js';
import { escapeCsvFormulaInjection } from '../../domain/reporting-types.js';

export const MAX_CSV_EXPORT_ROWS = 50000;

export interface CsvExportOptions {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly (string | number | boolean | null | undefined)[])[];
}

export function formatCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return '""';
  }

  if (typeof value === 'boolean') {
    return value ? '"true"' : '"false"';
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '""';
  }

  const str = String(value);
  const neutralized = escapeCsvFormulaInjection(str);
  const escaped = neutralized.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function generateCsvContent(options: CsvExportOptions): string {
  if (options.rows.length > MAX_CSV_EXPORT_ROWS) {
    throw new ApplicationError(
      'REPORT_EXPORT_TOO_LARGE',
      `Export row count (${options.rows.length}) exceeds maximum limit of ${MAX_CSV_EXPORT_ROWS}`,
    );
  }

  const lines: string[] = [];

  // Header row
  lines.push(options.headers.map((h) => formatCsvCell(h)).join(','));

  // Data rows
  for (const row of options.rows) {
    lines.push(row.map((cell) => formatCsvCell(cell)).join(','));
  }

  // UTF-8 with CRLF
  return lines.join('\r\n') + '\r\n';
}
