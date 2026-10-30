import { roundTo2Decimals, roundTo3Decimals } from './money.js';

export interface FuelIntervalMetric {
  fuelTransactionId: string;
  previousTransactionId?: string | undefined;
  occurredAt: Date;
  odometerKm?: number | null | undefined;
  previousOdometerKm?: number | null | undefined;
  distanceKm?: number | null | undefined;
  quantity: number;
  totalAmount: number;
  currencyCode: string;
  kmPerUnit?: number | null | undefined;
  unitsPer100Km?: number | null | undefined;
  costPerKm?: number | null | undefined;
}

export interface VehicleEfficiencySummary {
  vehicleId: string;
  totalTransactions: number;
  totalQuantity: number;
  totalDistanceKm: number;
  averageKmPerUnit?: number | null | undefined;
  averageUnitsPer100Km?: number | null | undefined;
  currencySpend: Array<{
    currencyCode: string;
    totalAmount: number;
    averageCostPerKm?: number | null | undefined;
  }>;
}

export function computeIntervalMetrics(
  transactions: Array<{
    id: string;
    occurredAt: Date;
    odometerKm?: number | null;
    quantity: number;
    totalAmount: number;
    currencyCode: string;
    status: string;
  }>,
): FuelIntervalMetric[] {
  // Sort chronologically ascending
  const activeTx = transactions
    .filter((t) => t.status !== 'VOIDED')
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const results: FuelIntervalMetric[] = [];
  let prevOdo: number | null = null;
  let prevId: string | undefined = undefined;

  for (const tx of activeTx) {
    let distanceKm: number | null = null;
    let kmPerUnit: number | null = null;
    let unitsPer100Km: number | null = null;
    let costPerKm: number | null = null;

    if (tx.odometerKm !== null && tx.odometerKm !== undefined && prevOdo !== null) {
      const diff = tx.odometerKm - prevOdo;
      if (diff > 0) {
        distanceKm = diff;
        if (tx.quantity > 0) {
          kmPerUnit = roundTo2Decimals(diff / tx.quantity);
          unitsPer100Km = roundTo2Decimals((tx.quantity / diff) * 100);
        }
        costPerKm = roundTo4Decimals(tx.totalAmount / diff);
      }
    }

    results.push({
      fuelTransactionId: tx.id,
      previousTransactionId: prevId,
      occurredAt: tx.occurredAt,
      odometerKm: tx.odometerKm,
      previousOdometerKm: prevOdo,
      distanceKm,
      quantity: tx.quantity,
      totalAmount: tx.totalAmount,
      currencyCode: tx.currencyCode,
      kmPerUnit,
      unitsPer100Km,
      costPerKm,
    });

    if (tx.odometerKm !== null && tx.odometerKm !== undefined) {
      prevOdo = tx.odometerKm;
      prevId = tx.id;
    }
  }

  return results;
}

export function computeVehicleEfficiency(
  vehicleId: string,
  transactions: Array<{
    id: string;
    occurredAt: Date;
    odometerKm?: number | null;
    quantity: number;
    totalAmount: number;
    currencyCode: string;
    status: string;
  }>,
): VehicleEfficiencySummary {
  const intervals = computeIntervalMetrics(transactions);

  let totalDistanceKm = 0;
  let totalQuantity = 0;
  const currencyTotals = new Map<string, number>();

  for (const interval of intervals) {
    if (interval.distanceKm && interval.distanceKm > 0) {
      totalDistanceKm += interval.distanceKm;
    }
    totalQuantity += interval.quantity;

    const currentSpend = currencyTotals.get(interval.currencyCode) ?? 0;
    currencyTotals.set(interval.currencyCode, currentSpend + interval.totalAmount);
  }

  const currencySpend = Array.from(currencyTotals.entries()).map(([currencyCode, totalAmount]) => {
    const avgCost = totalDistanceKm > 0 ? roundTo4Decimals(totalAmount / totalDistanceKm) : null;
    return {
      currencyCode,
      totalAmount: roundTo2Decimals(totalAmount),
      averageCostPerKm: avgCost,
    };
  });

  let averageKmPerUnit: number | null = null;
  let averageUnitsPer100Km: number | null = null;
  if (totalDistanceKm > 0 && totalQuantity > 0) {
    averageKmPerUnit = roundTo2Decimals(totalDistanceKm / totalQuantity);
    averageUnitsPer100Km = roundTo2Decimals((totalQuantity / totalDistanceKm) * 100);
  }

  return {
    vehicleId,
    totalTransactions: intervals.length,
    totalQuantity: roundTo3Decimals(totalQuantity),
    totalDistanceKm,
    averageKmPerUnit,
    averageUnitsPer100Km,
    currencySpend,
  };
}

function roundTo4Decimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
