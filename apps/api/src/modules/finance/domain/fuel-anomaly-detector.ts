import { FuelAnomalyCode, FuelAnomalySeverity } from '@vms/database';

export interface FuelAnomalyItem {
  code: FuelAnomalyCode;
  severity: FuelAnomalySeverity;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface HistoricalFuelContext {
  previousTransaction?: {
    id: string;
    occurredAt: Date;
    odometerKm?: number | null;
  } | null;
  vehicleAuthoritativeOdometer?: number | null;
  isDuplicateReference?: boolean;
  duplicateTransactionId?: string | null;
  averageUnitPriceForEnergyType?: number | null;
}

export function detectFuelAnomalies(
  transaction: {
    occurredAt: Date;
    odometerKm?: number | null;
    referenceNumber?: string | null;
    unitPrice: number;
    quantity: number;
    totalAmount: number;
  },
  context: HistoricalFuelContext,
  now = new Date(),
): FuelAnomalyItem[] {
  const anomalies: FuelAnomalyItem[] = [];

  // 1. FUTURE_TRANSACTION_DATE
  // Allow 5 minutes clock skew
  const maxFutureAllowed = now.getTime() + 5 * 60 * 1000;
  if (transaction.occurredAt.getTime() > maxFutureAllowed) {
    anomalies.push({
      code: FuelAnomalyCode.FUTURE_TRANSACTION_DATE,
      severity: FuelAnomalySeverity.WARNING,
      description: `Transaction occurredAt date (${transaction.occurredAt.toISOString()}) is in the future`,
      metadata: {
        occurredAt: transaction.occurredAt.toISOString(),
        serverTime: now.toISOString(),
      },
    });
  }

  // 2. ODOMETER_REGRESSION & ZERO_DISTANCE_REFUEL
  if (transaction.odometerKm !== null && transaction.odometerKm !== undefined) {
    if (
      context.previousTransaction?.odometerKm !== null &&
      context.previousTransaction?.odometerKm !== undefined
    ) {
      const prevOdo = context.previousTransaction.odometerKm;
      if (transaction.odometerKm < prevOdo) {
        anomalies.push({
          code: FuelAnomalyCode.ODOMETER_REGRESSION,
          severity: FuelAnomalySeverity.CRITICAL,
          description: `Odometer reading (${transaction.odometerKm} km) is less than previous recorded reading (${prevOdo} km)`,
          metadata: {
            currentOdometer: transaction.odometerKm,
            previousOdometer: prevOdo,
            previousTransactionId: context.previousTransaction.id,
          },
        });
      } else if (transaction.odometerKm === prevOdo) {
        anomalies.push({
          code: FuelAnomalyCode.ZERO_DISTANCE_REFUEL,
          severity: FuelAnomalySeverity.INFO,
          description: `Odometer reading (${transaction.odometerKm} km) is identical to previous recorded reading (${prevOdo} km), zero distance elapsed`,
          metadata: {
            odometerKm: transaction.odometerKm,
            previousTransactionId: context.previousTransaction.id,
          },
        });
      }
    }
  }

  // 3. DUPLICATE_REFERENCE
  if (context.isDuplicateReference && transaction.referenceNumber) {
    anomalies.push({
      code: FuelAnomalyCode.DUPLICATE_REFERENCE,
      severity: FuelAnomalySeverity.WARNING,
      description: `Reference number '${transaction.referenceNumber}' has already been used on another fuel transaction in this organization`,
      metadata: {
        referenceNumber: transaction.referenceNumber,
      },
    });
  }

  // 4. DUPLICATE_TRANSACTION
  if (context.duplicateTransactionId) {
    anomalies.push({
      code: FuelAnomalyCode.DUPLICATE_TRANSACTION,
      severity: FuelAnomalySeverity.WARNING,
      description: `Possible duplicate transaction: matches another transaction for this vehicle within a close time window`,
      metadata: {
        matchedTransactionId: context.duplicateTransactionId,
      },
    });
  }

  // 5. UNUSUAL_UNIT_PRICE
  if (transaction.unitPrice <= 0) {
    anomalies.push({
      code: FuelAnomalyCode.UNUSUAL_UNIT_PRICE,
      severity: FuelAnomalySeverity.CRITICAL,
      description: `Unit price is zero or negative (${transaction.unitPrice})`,
      metadata: {
        unitPrice: transaction.unitPrice,
      },
    });
  } else if (
    context.averageUnitPriceForEnergyType !== null &&
    context.averageUnitPriceForEnergyType !== undefined &&
    context.averageUnitPriceForEnergyType > 0
  ) {
    const avg = context.averageUnitPriceForEnergyType;
    if (transaction.unitPrice > 3 * avg) {
      anomalies.push({
        code: FuelAnomalyCode.UNUSUAL_UNIT_PRICE,
        severity: FuelAnomalySeverity.WARNING,
        description: `Unit price (${transaction.unitPrice}) is more than 3x the fleet average (${avg})`,
        metadata: {
          unitPrice: transaction.unitPrice,
          averageUnitPrice: avg,
        },
      });
    } else if (transaction.unitPrice < 0.25 * avg) {
      anomalies.push({
        code: FuelAnomalyCode.UNUSUAL_UNIT_PRICE,
        severity: FuelAnomalySeverity.WARNING,
        description: `Unit price (${transaction.unitPrice}) is less than 25% of the fleet average (${avg})`,
        metadata: {
          unitPrice: transaction.unitPrice,
          averageUnitPrice: avg,
        },
      });
    }
  }

  return anomalies;
}
