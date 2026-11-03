import { describe, expect, it } from 'vitest';
import { FuelQuantityUnit, FuelTransactionStatus, FuelType } from '@vms/database';
import {
  ConcurrencyConflictError,
  EvidenceImmutableError,
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

  it('supports explicit ISO 4217 currency fraction digits (USD=2, JPY=0, KWD=3)', () => {
    // USD (2 fraction digits): 45.5 * 1.45 = 65.98
    const txUsd = FuelTransaction.create({
      ...baseParams,
      currencyCode: 'USD',
      totalAmount: 65.98,
    });
    expect(txUsd.totalAmount).toBe(65.98);

    // JPY (0 fraction digits): 45.5 * 1.45 = 66
    const txJpy = FuelTransaction.create({
      ...baseParams,
      currencyCode: 'JPY',
      totalAmount: 66,
    });
    expect(txJpy.totalAmount).toBe(66);

    // KWD (3 fraction digits): 45.5 * 1.45 = 65.975
    const txKwd = FuelTransaction.create({
      ...baseParams,
      currencyCode: 'KWD',
      totalAmount: 65.975,
    });
    expect(txKwd.totalAmount).toBe(65.975);
  });

  it('rejects total amount that does not match exact calculated amount (no tolerance)', () => {
    expect(() =>
      FuelTransaction.create({
        ...baseParams,
        currencyCode: 'USD',
        totalAmount: 66.0, // Differed by 0.02, previously accepted by 0.05 tolerance, now strictly rejected
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

  it('attaches receipt and enforces immutability once attached', () => {
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

    // Overwriting receipt must fail
    expect(() =>
      tx.attachReceipt(
        {
          storageKey: 'tenants/org-1/finance/fuel/receipt2.pdf',
          fileName: 'receipt2.pdf',
          contentType: 'application/pdf',
          sizeBytes: 2048,
        },
        'user-1',
      ),
    ).toThrow(EvidenceImmutableError);

    // Detaching receipt must fail
    expect(() => tx.detachReceipt()).toThrow(EvidenceImmutableError);
  });

  it('enforces optimistic concurrency version on void', () => {
    const tx = FuelTransaction.create(baseParams);
    expect(tx.version).toBe(1);

    // Version mismatch throws ConcurrencyConflictError
    expect(() => tx.voidTransaction('Void attempt', 'user-1', 99)).toThrow(
      ConcurrencyConflictError,
    );

    // Matching version succeeds and increments version
    tx.voidTransaction('Void attempt', 'user-1', 1);
    expect(tx.version).toBe(2);
    expect(tx.status).toBe(FuelTransactionStatus.VOIDED);
  });
});
