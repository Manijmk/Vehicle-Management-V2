import { describe, expect, it } from 'vitest';
import { FuelQuantityUnit, FuelType } from '@vms/database';
import { parseFuelCsv } from './csv-fuel-parser.js';

describe('CSV Fuel Parser', () => {
  it('parses valid CSV fuel rows successfully', () => {
    const csv = `date,registration,energy_type,quantity,unit,unit_price,total_amount,currency,odometer,station,reference_number,driver_number
2026-05-10,ABC-1234,DIESEL,50,LITER,1.50,75.00,USD,15000,Shell Station,REC-001,DRV-1001
2026-05-11,XYZ-5678,PETROL,40,LITER,1.60,64.00,USD,22000,BP Station,REC-002,DRV-1002`;

    const result = parseFuelCsv(csv);

    expect(result.totalRows).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(result.validRows).toHaveLength(2);

    expect(result.validRows[0]).toEqual({
      rowNumber: 2,
      date: new Date('2026-05-10'),
      registration: 'ABC-1234',
      energyType: FuelType.DIESEL,
      quantity: 50,
      unit: FuelQuantityUnit.LITER,
      unitPrice: 1.5,
      totalAmount: 75.0,
      currency: 'USD',
      odometerKm: 15000,
      stationName: 'Shell Station',
      referenceNumber: 'REC-001',
      driverNumber: 'DRV-1001',
    });
  });

  it('reports missing required headers', () => {
    const csv = `date,registration,quantity
2026-05-10,ABC-1234,50`;

    const result = parseFuelCsv(csv);
    expect(result.validRows).toHaveLength(0);
    expect(result.errors[0]?.message).toContain('Missing required column');
  });

  it('identifies invalid rows while accepting valid rows', () => {
    const csv = `date,registration,energy_type,quantity,unit_price,currency
2026-05-10,ABC-1234,DIESEL,50,1.5,USD
invalid-date,ABC-1234,DIESEL,50,1.5,USD
2026-05-12,,DIESEL,50,1.5,USD
2026-05-13,ABC-1234,INVALID_TYPE,50,1.5,USD
2026-05-14,ABC-1234,DIESEL,-5,1.5,USD
2026-05-15,ABC-1234,DIESEL,50,-1.5,USD
2026-05-16,ABC-1234,DIESEL,50,1.5,INVALID_CURR
2026-05-17,ABC-1234,DIESEL,50,1.5,USD`;

    const result = parseFuelCsv(csv);
    expect(result.totalRows).toBe(8);
    expect(result.validRows).toHaveLength(2); // rows 2 and 9
    expect(result.errors).toHaveLength(6);
  });
});
