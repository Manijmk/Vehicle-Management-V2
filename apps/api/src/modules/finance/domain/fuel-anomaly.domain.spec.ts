import { describe, expect, it } from 'vitest';
import { FuelAnomalyCode, FuelAnomalySeverity } from '@vms/database';
import { detectFuelAnomalies } from './fuel-anomaly-detector.js';

describe('Fuel Anomaly Detector', () => {
  const baseTx = {
    occurredAt: new Date('2026-05-10T10:00:00Z'),
    odometerKm: 15000,
    referenceNumber: 'REC-999',
    unitPrice: 1.5,
    quantity: 40,
    totalAmount: 60,
  };

  const fixedNow = new Date('2026-05-10T12:00:00Z');

  it('detects no anomalies for clean sequential transaction', () => {
    const anomalies = detectFuelAnomalies(
      baseTx,
      {
        previousTransaction: {
          id: 'tx-prev',
          occurredAt: new Date('2026-05-01T10:00:00Z'),
          odometerKm: 14500,
        },
        vehicleAuthoritativeOdometer: 14500,
        isDuplicateReference: false,
        averageUnitPriceForEnergyType: 1.5,
      },
      fixedNow,
    );

    expect(anomalies).toHaveLength(0);
  });

  it('detects ODOMETER_REGRESSION when current odometer is lower than previous', () => {
    const anomalies = detectFuelAnomalies(
      {
        ...baseTx,
        odometerKm: 14000, // lower than 14500!
      },
      {
        previousTransaction: {
          id: 'tx-prev',
          occurredAt: new Date('2026-05-01T10:00:00Z'),
          odometerKm: 14500,
        },
      },
      fixedNow,
    );

    expect(anomalies.some((a) => a.code === FuelAnomalyCode.ODOMETER_REGRESSION)).toBe(true);
    expect(anomalies.find((a) => a.code === FuelAnomalyCode.ODOMETER_REGRESSION)?.severity).toBe(
      FuelAnomalySeverity.CRITICAL,
    );
  });

  it('detects ZERO_DISTANCE_REFUEL when odometer is unchanged', () => {
    const anomalies = detectFuelAnomalies(
      {
        ...baseTx,
        odometerKm: 14500, // identical to previous
      },
      {
        previousTransaction: {
          id: 'tx-prev',
          occurredAt: new Date('2026-05-01T10:00:00Z'),
          odometerKm: 14500,
        },
      },
      fixedNow,
    );

    expect(anomalies.some((a) => a.code === FuelAnomalyCode.ZERO_DISTANCE_REFUEL)).toBe(true);
  });

  it('detects DUPLICATE_REFERENCE', () => {
    const anomalies = detectFuelAnomalies(
      baseTx,
      {
        isDuplicateReference: true,
      },
      fixedNow,
    );

    expect(anomalies.some((a) => a.code === FuelAnomalyCode.DUPLICATE_REFERENCE)).toBe(true);
  });

  it('detects FUTURE_TRANSACTION_DATE', () => {
    const anomalies = detectFuelAnomalies(
      {
        ...baseTx,
        occurredAt: new Date('2026-05-11T12:00:00Z'), // tomorrow relative to fixedNow
      },
      {},
      fixedNow,
    );

    expect(anomalies.some((a) => a.code === FuelAnomalyCode.FUTURE_TRANSACTION_DATE)).toBe(true);
  });

  it('detects UNUSUAL_UNIT_PRICE when far from historical average', () => {
    const anomaliesHigh = detectFuelAnomalies(
      {
        ...baseTx,
        unitPrice: 5.5, // > 3 * 1.5
      },
      {
        averageUnitPriceForEnergyType: 1.5,
      },
      fixedNow,
    );

    expect(anomaliesHigh.some((a) => a.code === FuelAnomalyCode.UNUSUAL_UNIT_PRICE)).toBe(true);

    const anomaliesLow = detectFuelAnomalies(
      {
        ...baseTx,
        unitPrice: 0.2, // < 0.25 * 1.5
      },
      {
        averageUnitPriceForEnergyType: 1.5,
      },
      fixedNow,
    );

    expect(anomaliesLow.some((a) => a.code === FuelAnomalyCode.UNUSUAL_UNIT_PRICE)).toBe(true);
  });
});

