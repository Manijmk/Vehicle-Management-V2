import type { FuelQuantityUnit, FuelType } from '@vms/database';
import { FuelCardImportParsingError } from './integration-errors.js';

export interface FuelCardCsvRow {
  readonly externalTransactionId: string;
  readonly cardReference?: string | undefined;
  readonly vehicleRegistration: string;
  readonly occurredAt: string;
  readonly energyType: FuelType;
  readonly quantity: number;
  readonly quantityUnit: FuelQuantityUnit;
  readonly unitPrice: number;
  readonly totalAmount: number;
  readonly currencyCode: string;
  readonly stationName?: string | undefined;
  readonly odometerKm?: number | undefined;
}

export interface ValidatedFuelCardRow {
  readonly rowIndex: number;
  readonly raw: Record<string, string>;
  readonly isValid: boolean;
  readonly parsed?: FuelCardCsvRow | undefined;
  readonly errors: readonly string[];
}

export interface FuelCardPreviewResult {
  readonly totalRows: number;
  readonly validRowsCount: number;
  readonly invalidRowsCount: number;
  readonly rows: readonly ValidatedFuelCardRow[];
}

const VALID_FUEL_TYPES = new Set<FuelType>([
  'PETROL',
  'DIESEL',
  'HYBRID',
  'ELECTRIC',
  'GAS',
  'OTHER',
]);
const VALID_QUANTITY_UNITS = new Set<FuelQuantityUnit>(['LITER', 'KWH', 'KG', 'GALLON']);

/**
 * Basic RFC 4180 CSV parser handling quotes and commas.
 */
export function parseCsvText(csvContent: string): { headers: string[]; rows: string[][] } {
  if (!csvContent || !csvContent.trim()) {
    throw new FuelCardImportParsingError('CSV file is empty');
  }

  const lines = csvContent.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    throw new FuelCardImportParsingError(
      'CSV file must contain a header and at least one data row',
    );
  }

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseLine(lines[0]!).map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));
  const rows = lines.slice(1).map(parseLine);

  return { headers, rows };
}

export function parseAndValidateFuelCardCsv(csvContent: string): FuelCardPreviewResult {
  const { headers, rows } = parseCsvText(csvContent);

  // Column name mapping
  const findIndex = (possibleNames: string[]): number => {
    return headers.findIndex((h) => possibleNames.includes(h));
  };

  const extIdIdx = findIndex([
    'externaltransactionid',
    'ext_id',
    'transaction_id',
    'transactionid',
  ]);
  const regIdx = findIndex(['vehicleregistration', 'registration', 'vehicle_reg', 'license_plate']);
  const dateIdx = findIndex(['occurredat', 'occurred_at', 'date', 'transaction_date', 'timestamp']);
  const typeIdx = findIndex(['energytype', 'fueltype', 'energy_type', 'fuel_type', 'product']);
  const qtyIdx = findIndex(['quantity', 'volume', 'liters', 'gallons', 'qty']);
  const unitIdx = findIndex(['quantityunit', 'quantity_unit', 'unit', 'volume_unit']);
  const priceIdx = findIndex(['unitprice', 'unit_price', 'price_per_unit', 'price']);
  const totalIdx = findIndex(['totalamount', 'total_amount', 'total', 'amount', 'cost']);
  const currIdx = findIndex(['currencycode', 'currency_code', 'currency']);
  const stationIdx = findIndex(['stationname', 'station_name', 'merchant', 'station', 'location']);
  const odoIdx = findIndex(['odometerkm', 'odometer_km', 'odometer', 'mileage']);
  const cardIdx = findIndex(['cardreference', 'card_reference', 'card_number', 'card_no']);

  if (extIdIdx === -1 || regIdx === -1 || dateIdx === -1 || qtyIdx === -1 || totalIdx === -1) {
    throw new FuelCardImportParsingError(
      'Missing required CSV columns: externalTransactionId, vehicleRegistration, occurredAt, quantity, and totalAmount are mandatory.',
    );
  }

  const validatedRows: ValidatedFuelCardRow[] = [];
  let validCount = 0;
  let invalidCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const rowErrors: string[] = [];

    const rawMap: Record<string, string> = {};
    headers.forEach((h, hIdx) => {
      rawMap[h] = r[hIdx] ?? '';
    });

    const extId = r[extIdIdx]?.trim() ?? '';
    if (!extId) rowErrors.push('Missing externalTransactionId');

    const reg = r[regIdx]?.trim() ?? '';
    if (!reg) rowErrors.push('Missing vehicleRegistration');

    const dateStr = r[dateIdx]?.trim() ?? '';
    const dateObj = new Date(dateStr);
    if (!dateStr || Number.isNaN(dateObj.getTime())) {
      rowErrors.push('Invalid or unparseable occurredAt date');
    }

    const qtyVal = parseFloat(r[qtyIdx] ?? '0');
    if (Number.isNaN(qtyVal) || qtyVal <= 0) {
      rowErrors.push('Quantity must be a positive number');
    }

    const totalVal = parseFloat(r[totalIdx] ?? '0');
    if (Number.isNaN(totalVal) || totalVal <= 0) {
      rowErrors.push('Total amount must be a positive number');
    }

    const priceVal =
      priceIdx !== -1 && r[priceIdx] ? parseFloat(r[priceIdx]!) : totalVal / (qtyVal || 1);
    if (Number.isNaN(priceVal) || priceVal < 0) {
      rowErrors.push('Invalid unitPrice');
    }

    let rawType = typeIdx !== -1 && r[typeIdx] ? r[typeIdx]!.toUpperCase() : 'DIESEL';
    if (rawType === 'GASOLINE') rawType = 'PETROL';
    if (rawType === 'DEF') rawType = 'OTHER';
    const typeStr = rawType as FuelType;
    if (!VALID_FUEL_TYPES.has(typeStr)) {
      rowErrors.push(
        `Invalid energyType '${typeStr}'. Allowed: PETROL, DIESEL, HYBRID, ELECTRIC, GAS, OTHER`,
      );
    }

    const unitStr = (
      unitIdx !== -1 && r[unitIdx] ? r[unitIdx]!.toUpperCase() : 'LITER'
    ) as FuelQuantityUnit;
    if (!VALID_QUANTITY_UNITS.has(unitStr)) {
      rowErrors.push(`Invalid quantityUnit '${unitStr}'. Allowed: LITER, KWH, KG, GALLON`);
    }

    const currStr = (currIdx !== -1 && r[currIdx] ? r[currIdx]!.toUpperCase() : 'USD').slice(0, 3);
    if (currStr.length !== 3) {
      rowErrors.push('Currency code must be a 3-letter ISO code');
    }

    let odoVal: number | undefined;
    if (odoIdx !== -1 && r[odoIdx]?.trim()) {
      const parsedOdo = parseInt(r[odoIdx]!.trim(), 10);
      if (!Number.isNaN(parsedOdo) && parsedOdo >= 0) {
        odoVal = parsedOdo;
      }
    }

    const isValid = rowErrors.length === 0;
    if (isValid) {
      validCount++;
      validatedRows.push({
        rowIndex: i + 1,
        raw: rawMap,
        isValid: true,
        errors: [],
        parsed: {
          externalTransactionId: extId,
          cardReference: cardIdx !== -1 ? r[cardIdx]?.trim() : undefined,
          vehicleRegistration: reg,
          occurredAt: dateObj.toISOString(),
          energyType: typeStr,
          quantity: qtyVal,
          quantityUnit: unitStr,
          unitPrice: Math.round(priceVal * 10_000) / 10_000,
          totalAmount: Math.round(totalVal * 100) / 100,
          currencyCode: currStr,
          stationName: stationIdx !== -1 ? r[stationIdx]?.trim() : undefined,
          odometerKm: odoVal,
        },
      });
    } else {
      invalidCount++;
      validatedRows.push({
        rowIndex: i + 1,
        raw: rawMap,
        isValid: false,
        errors: rowErrors,
      });
    }
  }

  return {
    totalRows: rows.length,
    validRowsCount: validCount,
    invalidRowsCount: invalidCount,
    rows: validatedRows,
  };
}

export interface ParsedFuelCardRow {
  readonly externalTransactionId: string;
  readonly registration: string;
  readonly transactionDate: string;
  readonly fuelType: FuelType;
  readonly quantity: number;
  readonly quantityUnit: FuelQuantityUnit;
  readonly unitPrice: number;
  readonly totalAmount: number;
  readonly currencyCode: string;
  readonly stationName?: string | null | undefined;
  readonly odometerKm?: number | null | undefined;
  readonly validationError?: string | undefined;
  readonly vehicleId?: string | undefined;
  readonly vehicleRegistration?: string | undefined;
  readonly isDuplicate?: boolean | undefined;
}

export function parseFuelCardCsv(csvContent: string): {
  readonly totalRows: number;
  readonly rows: readonly ParsedFuelCardRow[];
} {
  const preview = parseAndValidateFuelCardCsv(csvContent);
  const rows: ParsedFuelCardRow[] = preview.rows.map((r) => {
    if (!r.isValid || !r.parsed) {
      return {
        externalTransactionId: r.raw['externaltransactionid'] || r.raw['ext_id'] || 'UNKNOWN',
        registration: r.raw['vehicleregistration'] || r.raw['registration'] || '',
        transactionDate: r.raw['occurredat'] || r.raw['date'] || new Date().toISOString(),
        fuelType: 'DIESEL' as FuelType,
        quantity: 0,
        quantityUnit: 'LITER' as FuelQuantityUnit,
        unitPrice: 0,
        totalAmount: 0,
        currencyCode: 'USD',
        validationError: r.errors.join('; '),
      };
    }
    return {
      externalTransactionId: r.parsed.externalTransactionId,
      registration: r.parsed.vehicleRegistration,
      transactionDate: r.parsed.occurredAt,
      fuelType: r.parsed.energyType,
      quantity: r.parsed.quantity,
      quantityUnit: r.parsed.quantityUnit,
      unitPrice: r.parsed.unitPrice,
      totalAmount: r.parsed.totalAmount,
      currencyCode: r.parsed.currencyCode,
      stationName: r.parsed.stationName,
      odometerKm: r.parsed.odometerKm,
    };
  });

  return {
    totalRows: preview.totalRows,
    rows,
  };
}
