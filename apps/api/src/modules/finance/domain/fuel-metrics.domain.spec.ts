import { describe, expect, it } from 'vitest';
import { computeIntervalMetrics, computeVehicleEfficiency } from './fuel-metrics.js';

describe('Fuel Metrics Domain Calculator', () => {
  it('computes interval metrics across chronological transactions', () => {
    const transactions = [
      {
        id: 'tx-1',
        occurredAt: new Date('2026-05-01T10:00:00Z'),
        odometerKm: 10000,
        quantity: 50,
        totalAmount: 75.0,
        currencyCode: 'USD',
        status: 'POSTED',
      },
      {
        id: 'tx-2',
        occurredAt: new Date('2026-05-08T10:00:00Z'),
        odometerKm: 10500, // 500 km elapsed
        quantity: 50,
        totalAmount: 80.0,
        currencyCode: 'USD',
        status: 'POSTED',
      },
      {
        id: 'tx-3',
        occurredAt: new Date('2026-05-15T10:00:00Z'),
        odometerKm: 11100, // 600 km elapsed
        quantity: 60,
        totalAmount: 90.0,
        currencyCode: 'USD',
        status: 'POSTED',
      },
    ];

    const intervals = computeIntervalMetrics(transactions);

    expect(intervals).toHaveLength(3);
    // First refuel has no previous refuel
    expect(intervals[0]?.distanceKm).toBeNull();
    expect(intervals[0]?.kmPerUnit).toBeNull();

    // Second refuel: 500 km / 50 L = 10 km/L, 10 L/100km, 80 / 500 = 0.16 USD/km
    expect(intervals[1]?.distanceKm).toBe(500);
    expect(intervals[1]?.kmPerUnit).toBe(10);
    expect(intervals[1]?.unitsPer100Km).toBe(10);
    expect(intervals[1]?.costPerKm).toBe(0.16);

    // Third refuel: 600 km / 60 L = 10 km/L, 90 / 600 = 0.15 USD/km
    expect(intervals[2]?.distanceKm).toBe(600);
    expect(intervals[2]?.kmPerUnit).toBe(10);
    expect(intervals[2]?.costPerKm).toBe(0.15);
  });

  it('computes aggregate vehicle efficiency', () => {
    const transactions = [
      {
        id: 'tx-1',
        occurredAt: new Date('2026-05-01T10:00:00Z'),
        odometerKm: 10000,
        quantity: 50,
        totalAmount: 75.0,
        currencyCode: 'USD',
        status: 'POSTED',
      },
      {
        id: 'tx-2',
        occurredAt: new Date('2026-05-08T10:00:00Z'),
        odometerKm: 10500,
        quantity: 50,
        totalAmount: 80.0,
        currencyCode: 'USD',
        status: 'POSTED',
      },
    ];

    const efficiency = computeVehicleEfficiency('veh-1', transactions);

    expect(efficiency.vehicleId).toBe('veh-1');
    expect(efficiency.totalDistanceKm).toBe(500);
    expect(efficiency.totalQuantity).toBe(100);
    expect(efficiency.averageKmPerUnit).toBe(5); // 500 / 100
    expect(efficiency.averageUnitsPer100Km).toBe(20); // (100 / 500) * 100
    expect(efficiency.currencySpend).toEqual([
      {
        currencyCode: 'USD',
        totalAmount: 155.0,
        averageCostPerKm: 0.31, // 155 / 500
      },
    ]);
  });
});
