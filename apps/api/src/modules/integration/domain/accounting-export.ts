export interface ExportExpenseItem {
  readonly id: string;
  readonly displayId: string;
  readonly occurredAt: Date;
  readonly categoryCode: string;
  readonly categoryName: string;
  readonly amount: number;
  readonly currencyCode: string;
  readonly description: string;
  readonly vendorName?: string | null | undefined;
  readonly referenceNumber?: string | null | undefined;
  readonly vehicleDisplayId?: string | null | undefined;
  readonly vehicleRegistration?: string | null | undefined;
  readonly driverDisplayId?: string | null | undefined;
}

export interface ExportFuelItem {
  readonly id: string;
  readonly displayId: string;
  readonly occurredAt: Date;
  readonly energyType: string;
  readonly quantity: number;
  readonly quantityUnit: string;
  readonly unitPrice: number;
  readonly totalAmount: number;
  readonly currencyCode: string;
  readonly stationName?: string | null | undefined;
  readonly referenceNumber?: string | null | undefined;
  readonly vehicleDisplayId: string;
  readonly vehicleRegistration: string;
  readonly driverDisplayId?: string | null | undefined;
}

export interface AccountingTransactionRow {
  readonly id: string;
  readonly dateUtc: string;
  readonly type: 'EXPENSE' | 'FUEL';
  readonly category: string;
  readonly vehicleDisplay: string;
  readonly amount: string; // exact decimal string
  readonly currency: string;
  readonly referenceNumber: string;
  readonly merchantOrVendor: string;
  readonly description: string;
  readonly linkedWorkOrderId?: string | null | undefined;
}

/**
 * Escapes values for CSV and neutralizes spreadsheet formula injection (=, +, -, @, \t, \r).
 */
export function sanitizeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let str = String(value);

  // Formula injection protection
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // Quote if contains comma, quote, or newline
  if (/[",\n\r]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export const sanitizeCsvFormulaInjection = sanitizeCsvCell;

export function generateAccountingCsv(rows: readonly AccountingTransactionRow[]): string {
  const headers = [
    'Transaction ID',
    'Date (UTC)',
    'Type',
    'Category',
    'Vehicle',
    'Amount',
    'Currency',
    'Reference Number',
    'Merchant / Vendor',
    'Description',
    'Linked Work Order',
  ];

  const lines = [headers.map(sanitizeCsvCell).join(',')];

  for (const row of rows) {
    const line = [
      row.id,
      row.dateUtc,
      row.type,
      row.category,
      row.vehicleDisplay,
      row.amount,
      row.currency,
      row.referenceNumber,
      row.merchantOrVendor,
      row.description,
      row.linkedWorkOrderId ?? '',
    ]
      .map(sanitizeCsvCell)
      .join(',');

    lines.push(line);
  }

  return lines.join('\r\n');
}

export function buildAccountingExportCsv(
  expenses: readonly ExportExpenseItem[],
  fuelTransactions: readonly ExportFuelItem[],
): string {
  const rows: AccountingTransactionRow[] = [];

  for (const exp of expenses) {
    rows.push({
      id: exp.displayId,
      dateUtc: exp.occurredAt.toISOString(),
      type: 'EXPENSE',
      category: `${exp.categoryCode} - ${exp.categoryName}`,
      vehicleDisplay: exp.vehicleDisplayId
        ? `${exp.vehicleDisplayId} (${exp.vehicleRegistration ?? ''})`
        : '',
      amount: exp.amount.toFixed(2),
      currency: exp.currencyCode,
      referenceNumber: exp.referenceNumber ?? '',
      merchantOrVendor: exp.vendorName ?? '',
      description: exp.description,
      linkedWorkOrderId: null,
    });
  }

  for (const fuel of fuelTransactions) {
    rows.push({
      id: fuel.displayId,
      dateUtc: fuel.occurredAt.toISOString(),
      type: 'FUEL',
      category: `FUEL - ${fuel.energyType}`,
      vehicleDisplay: `${fuel.vehicleDisplayId} (${fuel.vehicleRegistration})`,
      amount: fuel.totalAmount.toFixed(2),
      currency: fuel.currencyCode,
      referenceNumber: fuel.referenceNumber ?? '',
      merchantOrVendor: fuel.stationName ?? '',
      description: `${fuel.quantity} ${fuel.quantityUnit} @ ${fuel.unitPrice.toFixed(2)}/${fuel.quantityUnit}`,
      linkedWorkOrderId: null,
    });
  }

  // Sort rows by dateUtc ascending
  rows.sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));

  return generateAccountingCsv(rows);
}
