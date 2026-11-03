import { FuelQuantityUnit, FuelType } from '@vms/database';
import {
  calculateFuelTotalAmount,
  isSupportedCurrency,
  roundMoneyToCurrency,
  roundTo3Decimals,
  roundTo4Decimals,
} from './money.js';

export const MAX_CSV_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_CSV_ROWS = 5000;
export const MAX_CSV_COLUMNS = 20;
export const MAX_CELL_LENGTH = 255;

export function sanitizeCsvField(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[=+\-@]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

export interface CsvFuelRow {
  rowNumber: number;
  date: Date;
  registration: string;
  energyType: FuelType;
  quantity: number;
  unit: FuelQuantityUnit;
  unitPrice: number;
  totalAmount: number;
  currency: string;
  odometerKm?: number | null;
  stationName?: string | null;
  referenceNumber?: string | null;
  driverNumber?: string | null;
}

export interface CsvRowError {
  row: number;
  column?: string;
  message: string;
  rawLine?: string;
}

export interface CsvParseResult {
  totalRows: number;
  validRows: CsvFuelRow[];
  errors: CsvRowError[];
}

export function parseCsvLines(csvContent: string): string[][] {
  const lines: string[][] = [];
  const rawLines = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const row: string[] = [];
    let insideQuotes = false;
    let currentToken = '';

    for (let i = 0; i < trimmed.length; i++) {
      const char = trimmed[i];

      if (char === '"') {
        if (insideQuotes && trimmed[i + 1] === '"') {
          currentToken += '"';
          i++; // skip escaped quote
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        row.push(currentToken.trim());
        currentToken = '';
      } else {
        currentToken += char;
      }
    }
    row.push(currentToken.trim());
    lines.push(row);
  }

  return lines;
}

export function parseFuelCsv(csvContent: string): CsvParseResult {
  if (
    typeof csvContent === 'string' &&
    Buffer.byteLength(csvContent, 'utf8') > MAX_CSV_SIZE_BYTES
  ) {
    return {
      totalRows: 0,
      validRows: [],
      errors: [{ row: 1, message: 'CSV file size exceeds maximum 5MB limit' }],
    };
  }

  const rows = parseCsvLines(csvContent);
  const firstRow = rows[0];
  if (!firstRow || rows.length === 0) {
    return {
      totalRows: 0,
      validRows: [],
      errors: [{ row: 1, message: 'CSV file is empty' }],
    };
  }

  if (rows.length - 1 > MAX_CSV_ROWS) {
    return {
      totalRows: rows.length - 1,
      validRows: [],
      errors: [{ row: 1, message: `CSV exceeds maximum limit of ${MAX_CSV_ROWS} rows` }],
    };
  }

  const header = firstRow.map((h) => h.toLowerCase().replace(/[\s_-]+/g, ''));

  const findColumn = (...aliases: string[]): number => {
    for (const alias of aliases) {
      const idx = header.indexOf(alias);
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const dateIdx = findColumn('date', 'occurredat', 'transactiondate', 'timestamp');
  const regIdx = findColumn('registration', 'vehicleregistration', 'vehiclereg', 'reg', 'vehicle');
  const energyIdx = findColumn('energytype', 'fueltype', 'fuel');
  const qtyIdx = findColumn('quantity', 'qty', 'liters', 'gallons', 'amount');
  const unitIdx = findColumn('unit', 'quantityunit');
  const unitPriceIdx = findColumn('unitprice', 'price', 'rate');
  const totalIdx = findColumn('totalamount', 'total', 'cost');
  const currIdx = findColumn('currency', 'currencycode', 'curr');
  const odoIdx = findColumn('odometer', 'odometerkm', 'odo');
  const stationIdx = findColumn('station', 'stationname', 'vendor');
  const refIdx = findColumn('referencenumber', 'reference', 'ref', 'receiptnumber', 'receipt');
  const driverIdx = findColumn('drivernumber', 'driver', 'driverid');

  if (dateIdx < 0) {
    return {
      totalRows: 0,
      validRows: [],
      errors: [{ row: 1, message: "Missing required column 'date' or 'occurredAt' in CSV header" }],
    };
  }
  if (regIdx < 0) {
    return {
      totalRows: 0,
      validRows: [],
      errors: [
        {
          row: 1,
          message: "Missing required column 'registration' or 'vehicleRegistration' in CSV header",
        },
      ],
    };
  }
  if (qtyIdx < 0) {
    return {
      totalRows: 0,
      validRows: [],
      errors: [{ row: 1, message: "Missing required column 'quantity' in CSV header" }],
    };
  }
  if (unitPriceIdx < 0) {
    return {
      totalRows: 0,
      validRows: [],
      errors: [{ row: 1, message: "Missing required column 'unitPrice' in CSV header" }],
    };
  }
  if (currIdx < 0) {
    return {
      totalRows: 0,
      validRows: [],
      errors: [
        { row: 1, message: "Missing required column 'currency' or 'currencyCode' in CSV header" },
      ],
    };
  }

  const validRows: CsvFuelRow[] = [];
  const errors: CsvRowError[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const rowNum = i + 1; // 1-based index (header is 1)

    if (row.length > MAX_CSV_COLUMNS) {
      errors.push({
        row: rowNum,
        message: `Row exceeds maximum column limit of ${MAX_CSV_COLUMNS}`,
      });
      continue;
    }

    if (row.some((cell) => cell && cell.length > MAX_CELL_LENGTH)) {
      errors.push({
        row: rowNum,
        message: `Cell length exceeds maximum ${MAX_CELL_LENGTH} characters`,
      });
      continue;
    }

    // Check date
    const rawDate = row[dateIdx] ?? '';
    const parsedDate = new Date(rawDate);
    if (!rawDate || isNaN(parsedDate.getTime())) {
      errors.push({ row: rowNum, column: 'date', message: `Invalid date '${rawDate}'` });
      continue;
    }

    // Check registration
    const reg = (row[regIdx] ?? '').trim();
    if (!reg) {
      errors.push({
        row: rowNum,
        column: 'registration',
        message: 'Vehicle registration is required',
      });
      continue;
    }

    // Check energy type (default to DIESEL if omitted in CSV)
    let energyType: FuelType = FuelType.DIESEL;
    if (energyIdx >= 0) {
      const rawEnergy = (row[energyIdx] ?? '').trim().toUpperCase();
      const validEnergies = Object.values(FuelType) as string[];
      if (rawEnergy && !validEnergies.includes(rawEnergy)) {
        errors.push({
          row: rowNum,
          column: 'energy_type',
          message: `Invalid energy type '${rawEnergy}'. Must be one of: ${validEnergies.join(', ')}`,
        });
        continue;
      }
      if (rawEnergy) {
        energyType = rawEnergy as FuelType;
      }
    }

    // Check quantity
    const rawQty = row[qtyIdx] ?? '';
    const qty = parseFloat(rawQty);
    if (isNaN(qty) || qty <= 0) {
      errors.push({
        row: rowNum,
        column: 'quantity',
        message: `Quantity must be a positive number: '${rawQty}'`,
      });
      continue;
    }

    // Check unit
    let unit: FuelQuantityUnit = FuelQuantityUnit.LITER;
    const rawUnitVal = unitIdx >= 0 ? row[unitIdx] : undefined;
    if (rawUnitVal) {
      let rawUnit = rawUnitVal.trim().toUpperCase();
      if (rawUnit === 'LITERS') rawUnit = 'LITER';
      if (rawUnit === 'GALLONS' || rawUnit === 'GAL') rawUnit = 'GALLON';
      if (Object.values(FuelQuantityUnit).includes(rawUnit as FuelQuantityUnit)) {
        unit = rawUnit as FuelQuantityUnit;
      } else {
        errors.push({ row: rowNum, column: 'unit', message: `Invalid quantity unit '${rawUnit}'` });
        continue;
      }
    }

    // Check unit price
    const rawUnitPrice = row[unitPriceIdx] ?? '';
    const unitPrice = parseFloat(rawUnitPrice);
    if (isNaN(unitPrice) || unitPrice < 0) {
      errors.push({
        row: rowNum,
        column: 'unit_price',
        message: `Unit price must be non-negative: '${rawUnitPrice}'`,
      });
      continue;
    }

    // Check currency
    const curr = (row[currIdx] ?? '').trim().toUpperCase();
    if (!curr || !/^[A-Z]{3}$/.test(curr) || !isSupportedCurrency(curr)) {
      errors.push({
        row: rowNum,
        column: 'currency',
        message: `Unsupported or invalid ISO 4217 currency code: '${row[currIdx] ?? ''}'`,
      });
      continue;
    }

    // Total amount
    const calcTotal = calculateFuelTotalAmount(qty, unitPrice, curr);
    let totalAmount = calcTotal;
    const rawTotal = totalIdx >= 0 ? row[totalIdx] : undefined;
    if (rawTotal) {
      const parsedTotal = parseFloat(rawTotal);
      if (isNaN(parsedTotal) || parsedTotal < 0) {
        errors.push({
          row: rowNum,
          column: 'total_amount',
          message: `Total amount must be non-negative: '${rawTotal}'`,
        });
        continue;
      }
      const roundedProvidedTotal = roundMoneyToCurrency(parsedTotal, curr);
      if (!roundedProvidedTotal.equals(calcTotal)) {
        errors.push({
          row: rowNum,
          column: 'total_amount',
          message: `Provided total amount ${roundedProvidedTotal.toFixed()} does not match calculated total ${calcTotal.toFixed()} for currency ${curr}`,
        });
        continue;
      }
      totalAmount = roundedProvidedTotal;
    }

    // Odometer
    let odometerKm: number | null = null;
    const rawOdo = odoIdx >= 0 ? row[odoIdx] : undefined;
    if (rawOdo) {
      const parsedOdo = parseInt(rawOdo, 10);
      if (isNaN(parsedOdo) || parsedOdo < 0) {
        errors.push({
          row: rowNum,
          column: 'odometer',
          message: `Odometer must be a non-negative integer: '${rawOdo}'`,
        });
        continue;
      }
      odometerKm = parsedOdo;
    }

    // Station
    const stationName = sanitizeCsvField(stationIdx >= 0 ? row[stationIdx] : undefined);

    // Reference number
    const referenceNumber = sanitizeCsvField(refIdx >= 0 ? row[refIdx] : undefined);

    // Driver number
    const driverNumber = sanitizeCsvField(driverIdx >= 0 ? row[driverIdx] : undefined);

    validRows.push({
      rowNumber: rowNum,
      date: parsedDate,
      registration: reg,
      energyType,
      quantity: roundTo3Decimals(qty).toNumber(),
      unit,
      unitPrice: roundTo4Decimals(unitPrice).toNumber(),
      totalAmount: totalAmount.toNumber(),
      currency: curr,
      odometerKm,
      stationName,
      referenceNumber,
      driverNumber,
    });
  }

  return {
    totalRows: rows.length - 1,
    validRows,
    errors,
  };
}
