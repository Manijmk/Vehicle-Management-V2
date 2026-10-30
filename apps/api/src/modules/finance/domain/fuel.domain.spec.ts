import { describe, expect, it } from 'vitest';
import { FuelQuantityUnit, FuelTransactionStatus, FuelType } from '@vms/database';
import {
  FuelTransactionAlreadyVoidedError,
  InvalidCurrencyCodeError,
  InvalidFuelTransactionStateError,
} from './finance-errors.js';
import { FuelTransaction } from './fuel-transaction.js';

describe('FuelTransaction Domain Model', () => {
  const baseParams = {
    id: '11111111-1111-4111-8111-111111111111',
    organizationId: 'org-1',
    displayId: 'FUEL-1001',
    vehicleId: 'veh-1',
    occurredAt: new Date('2026-05-10T10:00:00Z'),
    energyType: FuelType.DIESEL,
    quantity: 45.5,
    unitPrice: 1.45,
    currencyCode: 'USD',
    createdById: 'user-1',
  };

  it('creates a valid fuel transaction and automatically computes total amount', () => {
    const tx = FuelTransaction.create(baseParams);

    expect(tx.id).toBe(baseParams.id);
    expect(tx.displayId).toBe('FUEL-1001');
    expect(tx.quantity).toBe(45.5);
    expect(tx.unitPrice).toBe(1.45);
    expect(tx.totalAmount).toBe(65.98); // 45.5 * 1.45 = 65.975 -> 65.98
    expect(tx.currencyCode).toBe('USD');
    expect(tx.status).toBe(FuelTransactionStatus.POSTED);
    expect(tx.quantityUnit).toBe(FuelQuantityUnit.LITER);
    expect(tx.voidReason).toBeNull();
  });

  it('accepts a total amount matching quantity * unitPrice within tolerance', () => {
    const tx = FuelTransaction.create({
      ...baseParams,
      totalAmount: 66.0,
    });
    expect(tx.totalAmount).toBe(66.0);
  });

  it('rejects total amount that differs significantly from calculated', () => {
    expect(() =>
      FuelTransaction.create({
        ...baseParams,
        totalAmount: 100.0,
      }),
    ).toThrow(InvalidFuelTransactionStateError);
  });

  it('rejects non-positive quantity', () => {
    expect(() =>
      FuelTransaction.create({
        ...baseParams,
        quantity: 0,
      }),
    ).toThrow(InvalidFuelTransactionStateError);

    expect(() =>
      FuelTransaction.create({
        ...baseParams,
        quantity: -10,
      }),
    ).toThrow(InvalidFuelTransactionStateError);
  });

  it('rejects negative unit price', () => {
    expect(() =>
      FuelTransaction.create({
        ...baseParams,
        unitPrice: -0.5,
      }),
    ).toThrow(InvalidFuelTransactionStateError);
  });

  it('validates currency code format', () => {
    expect(() =>
      FuelTransaction.create({
        ...baseParams,
        currencyCode: 'invalid',
      }),
    ).toThrow(InvalidCurrencyCodeError);
  });

  it('rejects invalid odometer reading', () => {
    expect(() =>
      FuelTransaction.create({
        ...baseParams,
        odometerKm: -5,
      }),
    ).toThrow(InvalidFuelTransactionStateError);

    expect(() =>
      FuelTransaction.create({
        ...baseParams,
        odometerKm: 12.5,
      }),
    ).toThrow(InvalidFuelTransactionStateError);
  });

  it('voids transaction with a mandatory reason', () => {
    const tx = FuelTransaction.create(baseParams);

    expect(() => tx.voidTransaction('', 'user-2')).toThrow(InvalidFuelTransactionStateError);

    tx.voidTransaction('Duplicate entry entered by mistake', 'user-2');

    expect(tx.status).toBe(FuelTransactionStatus.VOIDED);
    expect(tx.voidReason).toBe('Duplicate entry entered by mistake');
    expect(tx.voidedBy).toBe('user-2');
    expect(tx.voidedAt).toBeInstanceOf(Date);
  });

  it('cannot void an already voided transaction', () => {
    const tx = FuelTransaction.create(baseParams);
    tx.voidTransaction('First void', 'user-1');

    expect(() => tx.voidTransaction('Second void', 'user-1')).toThrow(
      FuelTransactionAlreadyVoidedError,
    );
  });

  it('attaches and detaches receipt', () => {
    const tx = FuelTransaction.create(baseParams);

    tx.attachReceipt(
      {
        storageKey: 'tenants/org-1/finance/fuel/receipt.pdf',
        fileName: 'receipt.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1024,
      },
      'user-1',
    );

    expect(tx.receipt).toEqual({
      storageKey: 'tenants/org-1/finance/fuel/receipt.pdf',
      fileName: 'receipt.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1024,
    });

    tx.detachReceipt('user-1');
    expect(tx.receipt).toBeNull();
  });
});
