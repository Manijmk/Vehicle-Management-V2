import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  type PrismaClient,
  Prisma,
  ExpenseCategoryStatus as PrismaExpenseCategoryStatus,
  ExpenseStatus as PrismaExpenseStatus,
  type FuelAnomalyCode as PrismaFuelAnomalyCode,
  type FuelAnomalySeverity as PrismaFuelAnomalySeverity,
  type FuelQuantityUnit as PrismaFuelQuantityUnit,
  type FuelTransactionSource as PrismaFuelTransactionSource,
  FuelTransactionStatus as PrismaFuelTransactionStatus,
  type FuelType as PrismaFuelType,
} from '@vms/database';
import { DATABASE } from '../../../common/tokens.js';
import type {
  CategorySpendSummary,
  CurrencySpendSummary,
  ExpenseCategoryDetail,
  ExpenseDetail,
  FinanceMutationMetadata,
  FinanceRepository,
  FinanceSummaryResult,
  FuelTransactionDetail,
  ListExpensesFilter,
  ListFuelTransactionsFilter,
  TripFinanceSummaryResult,
  VehicleFinanceSummaryResult,
  VehicleSpendSummary,
} from '../application/finance.repository.js';
import { ExpenseCategory } from '../domain/expense-category.js';
import { Expense } from '../domain/expense.js';
import type { FuelAnomalyItem, HistoricalFuelContext } from '../domain/fuel-anomaly-detector.js';
import { computeVehicleEfficiency } from '../domain/fuel-metrics.js';
import { FuelTransaction } from '../domain/fuel-transaction.js';

function json<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class PrismaFinanceRepository implements FinanceRepository {
  constructor(@Inject(DATABASE) private readonly db: PrismaClient) {}

  // =========================================================================
  // Fuel Transactions
  // =========================================================================

  public async allocateFuelDisplayId(organizationId: string): Promise<string> {
    const existing = await this.db.fuelTransaction.findMany({
      where: { organizationId },
      select: { displayId: true },
    });
    let maxNumber = 1000;
    for (const t of existing) {
      const match = /^FUEL-(\d+)$/i.exec(t.displayId);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (num > maxNumber) maxNumber = num;
      }
    }
    return `FUEL-${maxNumber + 1}`;
  }

  public async saveFuelTransaction(
    txEntity: FuelTransaction,
    anomalies: FuelAnomalyItem[],
    metadata: FinanceMutationMetadata,
    eventType: 'FuelTransactionCreated' | 'FuelTransactionVoided' | 'FuelTransactionReceiptUpdated',
  ): Promise<FuelTransactionDetail> {
    const action =
      eventType === 'FuelTransactionCreated'
        ? 'fuel.created'
        : eventType === 'FuelTransactionVoided'
          ? 'fuel.voided'
          : 'fuel.receipt.uploaded';

    await this.db.$transaction(async (tx) => {
      await tx.fuelTransaction.upsert({
        where: { id: txEntity.id },
        create: {
          id: txEntity.id,
          organizationId: txEntity.organizationId,
          displayId: txEntity.displayId,
          vehicleId: txEntity.vehicleId,
          driverId: txEntity.driverId,
          tripId: txEntity.tripId,
          occurredAt: txEntity.occurredAt,
          energyType: txEntity.energyType as PrismaFuelType,
          quantity: txEntity.quantity,
          quantityUnit: txEntity.quantityUnit as PrismaFuelQuantityUnit,
          unitPrice: txEntity.unitPrice,
          totalAmount: txEntity.totalAmount,
          currencyCode: txEntity.currencyCode,
          odometerKm: txEntity.odometerKm,
          stationName: txEntity.stationName,
          referenceNumber: txEntity.referenceNumber,
          source: txEntity.source as PrismaFuelTransactionSource,
          status: txEntity.status as PrismaFuelTransactionStatus,
          voidReason: txEntity.voidReason,
          voidedAt: txEntity.voidedAt,
          voidedBy: txEntity.voidedBy,
          receiptStorageKey: txEntity.receipt?.storageKey ?? null,
          receiptFileName: txEntity.receipt?.fileName ?? null,
          receiptContentType: txEntity.receipt?.contentType ?? null,
          receiptSizeBytes: txEntity.receipt?.sizeBytes ?? null,
          importBatchId: txEntity.importBatchId,
          version: txEntity.version,
          createdAt: txEntity.createdAt,
          createdBy: txEntity.createdById,
          updatedAt: txEntity.updatedAt,
          updatedBy: txEntity.updatedBy,
        },
        update: {
          status: txEntity.status as PrismaFuelTransactionStatus,
          voidReason: txEntity.voidReason,
          voidedAt: txEntity.voidedAt,
          voidedBy: txEntity.voidedBy,
          receiptStorageKey: txEntity.receipt?.storageKey ?? null,
          receiptFileName: txEntity.receipt?.fileName ?? null,
          receiptContentType: txEntity.receipt?.contentType ?? null,
          receiptSizeBytes: txEntity.receipt?.sizeBytes ?? null,
          version: txEntity.version,
          updatedAt: txEntity.updatedAt,
          updatedBy: txEntity.updatedBy,
        },
      });

      // Anomalies
      if (anomalies.length > 0) {
        for (const anomaly of anomalies) {
          const anomalyId = randomUUID();
          await tx.fuelTransactionAnomaly.create({
            data: {
              id: anomalyId,
              organizationId: txEntity.organizationId,
              fuelTransactionId: txEntity.id,
              code: anomaly.code as PrismaFuelAnomalyCode,
              severity: anomaly.severity as PrismaFuelAnomalySeverity,
              description: anomaly.description,
              metadata: anomaly.metadata ? json(anomaly.metadata) : Prisma.DbNull,
            },
          });

          // Outbox event for anomaly
          const anomalyEventId = randomUUID();
          await tx.outboxEvent.create({
            data: {
              id: anomalyEventId,
              organizationId: txEntity.organizationId,
              eventType: 'FuelAnomalyDetected',
              aggregateType: 'FuelTransaction',
              aggregateId: txEntity.id,
              occurredAt: txEntity.updatedAt,
              payload: json({
                eventId: anomalyEventId,
                organizationId: txEntity.organizationId,
                fuelTransactionId: txEntity.id,
                vehicleId: txEntity.vehicleId,
                anomalyCode: anomaly.code,
                severity: anomaly.severity,
                description: anomaly.description,
                metadata: anomaly.metadata,
                occurredAt: txEntity.updatedAt.toISOString(),
                actorId: metadata.actorId,
              }),
            },
          });
        }
      }

      // Audit Log
      await tx.auditLog.create({
        data: {
          id: randomUUID(),
          organizationId: txEntity.organizationId,
          actorId: metadata.actorId,
          action,
          entityType: 'FuelTransaction',
          entityId: txEntity.id,
          requestId: metadata.requestId,
          ipAddress: metadata.ipAddress ?? null,
          userAgent: metadata.userAgent ?? null,
          beforeData:
            eventType === 'FuelTransactionCreated'
              ? Prisma.DbNull
              : json({
                  status: 'POSTED',
                }),
          afterData: json({
            id: txEntity.id,
            displayId: txEntity.displayId,
            vehicleId: txEntity.vehicleId,
            status: txEntity.status,
            totalAmount: txEntity.totalAmount,
            currencyCode: txEntity.currencyCode,
            voidReason: txEntity.voidReason,
          }),
        },
      });

      // Outbox Event
      const outboxEventId = randomUUID();
      await tx.outboxEvent.create({
        data: {
          id: outboxEventId,
          organizationId: txEntity.organizationId,
          eventType,
          aggregateType: 'FuelTransaction',
          aggregateId: txEntity.id,
          occurredAt: txEntity.updatedAt,
          payload: json({
            eventId: outboxEventId,
            organizationId: txEntity.organizationId,
            fuelTransactionId: txEntity.id,
            displayId: txEntity.displayId,
            vehicleId: txEntity.vehicleId,
            driverId: txEntity.driverId,
            tripId: txEntity.tripId,
            status: txEntity.status,
            quantity: txEntity.quantity,
            totalAmount: txEntity.totalAmount,
            currencyCode: txEntity.currencyCode,
            occurredAt: txEntity.updatedAt.toISOString(),
            actorId: metadata.actorId,
            requestId: metadata.requestId,
          }),
        },
      });
    });

    const result = await this.findFuelTransactionById(txEntity.organizationId, txEntity.id);
    return result!;
  }

  public async findFuelTransactionById(
    organizationId: string,
    id: string,
  ): Promise<FuelTransactionDetail | null> {
    const raw = await this.db.fuelTransaction.findFirst({
      where: { id, organizationId },
      include: {
        vehicle: { select: { id: true, displayId: true, registration: true, model: true } },
        driver: {
          select: {
            id: true,
            displayId: true,
            firstName: true,
            lastName: true,
            employeeNumber: true,
          },
        },
        trip: { select: { id: true, displayId: true, origin: true, destination: true } },
        anomalies: true,
      },
    });

    if (!raw) return null;

    // Fetch previous vehicle transaction to compute metric
    const prev = await this.db.fuelTransaction.findFirst({
      where: {
        organizationId,
        vehicleId: raw.vehicleId,
        status: { not: PrismaFuelTransactionStatus.VOIDED },
        occurredAt: { lt: raw.occurredAt },
        odometerKm: { not: null },
      },
      orderBy: { occurredAt: 'desc' },
      select: { id: true, odometerKm: true },
    });

    let metrics = null;
    if (raw.odometerKm && prev?.odometerKm && raw.odometerKm > prev.odometerKm) {
      const distanceKm = raw.odometerKm - prev.odometerKm;
      const quantityNum = raw.quantity.toNumber();
      const amountNum = raw.totalAmount.toNumber();
      metrics = {
        fuelTransactionId: raw.id,
        previousTransactionId: prev.id,
        occurredAt: raw.occurredAt,
        odometerKm: raw.odometerKm,
        previousOdometerKm: prev.odometerKm,
        distanceKm,
        quantity: quantityNum,
        totalAmount: amountNum,
        currencyCode: raw.currencyCode,
        kmPerUnit: quantityNum > 0 ? Math.round((distanceKm / quantityNum) * 100) / 100 : null,
        unitsPer100Km:
          distanceKm > 0 ? Math.round((quantityNum / distanceKm) * 100 * 100) / 100 : null,
        costPerKm: distanceKm > 0 ? Math.round((amountNum / distanceKm) * 10000) / 10000 : null,
      };
    }

    return {
      id: raw.id,
      organizationId: raw.organizationId,
      displayId: raw.displayId,
      vehicleId: raw.vehicleId,
      vehicle: raw.vehicle,
      driverId: raw.driverId,
      driver: raw.driver,
      tripId: raw.tripId,
      trip: raw.trip,
      occurredAt: raw.occurredAt,
      energyType: raw.energyType,
      quantity: raw.quantity.toNumber(),
      quantityUnit: raw.quantityUnit,
      unitPrice: raw.unitPrice.toNumber(),
      totalAmount: raw.totalAmount.toNumber(),
      currencyCode: raw.currencyCode,
      odometerKm: raw.odometerKm,
      stationName: raw.stationName,
      referenceNumber: raw.referenceNumber,
      source: raw.source,
      status: raw.status,
      voidReason: raw.voidReason,
      voidedAt: raw.voidedAt,
      voidedBy: raw.voidedBy,
      hasReceipt: !!raw.receiptStorageKey,
      receiptFileName: raw.receiptFileName,
      receiptContentType: raw.receiptContentType,
      receiptSizeBytes: raw.receiptSizeBytes,
      receiptStorageKey: raw.receiptStorageKey,
      version: raw.version,
      anomalies: raw.anomalies.map((a) => ({
        id: a.id,
        code: a.code,
        severity: a.severity,
        description: a.description,
        metadata: a.metadata as Record<string, unknown> | null,
        createdAt: a.createdAt,
      })),
      metrics,
      createdAt: raw.createdAt,
      createdBy: raw.createdBy,
      updatedAt: raw.updatedAt,
      updatedBy: raw.updatedBy,
    };
  }

  public async findFuelTransactionEntityById(
    organizationId: string,
    id: string,
  ): Promise<FuelTransaction | null> {
    const raw = await this.db.fuelTransaction.findFirst({
      where: { id, organizationId },
    });
    if (!raw) return null;

    return FuelTransaction.reconstitute({
      id: raw.id,
      organizationId: raw.organizationId,
      displayId: raw.displayId,
      vehicleId: raw.vehicleId,
      driverId: raw.driverId,
      tripId: raw.tripId,
      occurredAt: raw.occurredAt,
      energyType: raw.energyType,
      quantity: raw.quantity.toNumber(),
      quantityUnit: raw.quantityUnit,
      unitPrice: raw.unitPrice.toNumber(),
      totalAmount: raw.totalAmount.toNumber(),
      currencyCode: raw.currencyCode,
      odometerKm: raw.odometerKm,
      stationName: raw.stationName,
      referenceNumber: raw.referenceNumber,
      source: raw.source,
      status: raw.status,
      voidReason: raw.voidReason,
      voidedAt: raw.voidedAt,
      voidedBy: raw.voidedBy,
      receipt: raw.receiptStorageKey
        ? {
            storageKey: raw.receiptStorageKey,
            fileName: raw.receiptFileName || 'receipt.pdf',
            contentType: raw.receiptContentType || 'application/octet-stream',
            sizeBytes: raw.receiptSizeBytes || 0,
          }
        : null,
      importBatchId: raw.importBatchId,
      createdById: raw.createdBy,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      updatedBy: raw.updatedBy,
      version: raw.version,
    });
  }

  public async listFuelTransactions(
    organizationId: string,
    filter?: ListFuelTransactionsFilter,
  ): Promise<{ items: FuelTransactionDetail[]; total: number }> {
    const where: Prisma.FuelTransactionWhereInput = {
      organizationId,
      ...(filter?.vehicleId ? { vehicleId: filter.vehicleId } : {}),
      ...(filter?.driverId ? { driverId: filter.driverId } : {}),
      ...(filter?.tripId ? { tripId: filter.tripId } : {}),
      ...(filter?.status ? { status: filter.status as PrismaFuelTransactionStatus } : {}),
      ...(filter?.hasAnomalies ? { anomalies: { some: {} } } : {}),
      ...(filter?.fromDate || filter?.toDate
        ? {
            occurredAt: {
              ...(filter.fromDate ? { gte: filter.fromDate } : {}),
              ...(filter.toDate ? { lte: filter.toDate } : {}),
            },
          }
        : {}),
      ...(filter?.search
        ? {
            OR: [
              { displayId: { contains: filter.search, mode: 'insensitive' } },
              { stationName: { contains: filter.search, mode: 'insensitive' } },
              { referenceNumber: { contains: filter.search, mode: 'insensitive' } },
              { vehicle: { registration: { contains: filter.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const limit = Math.min(filter?.limit ?? 50, 100);
    const offset = filter?.offset ?? 0;

    const [items, total] = await Promise.all([
      this.db.fuelTransaction.findMany({
        where,
        include: {
          vehicle: { select: { id: true, displayId: true, registration: true, model: true } },
          driver: {
            select: {
              id: true,
              displayId: true,
              firstName: true,
              lastName: true,
              employeeNumber: true,
            },
          },
          trip: { select: { id: true, displayId: true, origin: true, destination: true } },
          anomalies: true,
        },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      this.db.fuelTransaction.count({ where }),
    ]);

    const mapped: FuelTransactionDetail[] = items.map((raw) => ({
      id: raw.id,
      organizationId: raw.organizationId,
      displayId: raw.displayId,
      vehicleId: raw.vehicleId,
      vehicle: raw.vehicle,
      driverId: raw.driverId,
      driver: raw.driver,
      tripId: raw.tripId,
      trip: raw.trip,
      occurredAt: raw.occurredAt,
      energyType: raw.energyType,
      quantity: raw.quantity.toNumber(),
      quantityUnit: raw.quantityUnit,
      unitPrice: raw.unitPrice.toNumber(),
      totalAmount: raw.totalAmount.toNumber(),
      currencyCode: raw.currencyCode,
      odometerKm: raw.odometerKm,
      stationName: raw.stationName,
      referenceNumber: raw.referenceNumber,
      source: raw.source,
      status: raw.status,
      voidReason: raw.voidReason,
      voidedAt: raw.voidedAt,
      voidedBy: raw.voidedBy,
      hasReceipt: !!raw.receiptStorageKey,
      receiptFileName: raw.receiptFileName,
      receiptContentType: raw.receiptContentType,
      receiptSizeBytes: raw.receiptSizeBytes,
      receiptStorageKey: raw.receiptStorageKey,
      version: raw.version,
      anomalies: raw.anomalies.map((a) => ({
        id: a.id,
        code: a.code,
        severity: a.severity,
        description: a.description,
        metadata: a.metadata as Record<string, unknown> | null,
        createdAt: a.createdAt,
      })),
      createdAt: raw.createdAt,
      createdBy: raw.createdBy,
      updatedAt: raw.updatedAt,
      updatedBy: raw.updatedBy,
    }));

    return { items: mapped, total };
  }

  public async getHistoricalFuelContext(
    organizationId: string,
    vehicleId: string,
    referenceNumber?: string | null,
    energyType?: PrismaFuelType,
    occurredAt = new Date(),
  ): Promise<HistoricalFuelContext> {
    const [previousTx, duplicateRef, duplicateTx, avgPriceGroup] = await Promise.all([
      // Previous transaction for vehicle
      this.db.fuelTransaction.findFirst({
        where: {
          organizationId,
          vehicleId,
          status: { not: PrismaFuelTransactionStatus.VOIDED },
          occurredAt: { lte: occurredAt },
        },
        orderBy: { occurredAt: 'desc' },
        select: { id: true, occurredAt: true, odometerKm: true },
      }),
      // Duplicate reference check
      referenceNumber && referenceNumber.trim().length > 0
        ? this.db.fuelTransaction.findFirst({
            where: {
              organizationId,
              referenceNumber: referenceNumber.trim(),
              status: { not: PrismaFuelTransactionStatus.VOIDED },
            },
            select: { id: true },
          })
        : null,
      // Duplicate transaction check (within 15 mins)
      this.db.fuelTransaction.findFirst({
        where: {
          organizationId,
          vehicleId,
          status: { not: PrismaFuelTransactionStatus.VOIDED },
          occurredAt: {
            gte: new Date(occurredAt.getTime() - 15 * 60 * 1000),
            lte: new Date(occurredAt.getTime() + 15 * 60 * 1000),
          },
        },
        select: { id: true },
      }),
      // Average unit price for energyType
      energyType
        ? this.db.fuelTransaction.aggregate({
            where: {
              organizationId,
              energyType,
              status: { not: PrismaFuelTransactionStatus.VOIDED },
            },
            _avg: { unitPrice: true },
          })
        : null,
    ]);

    return {
      previousTransaction: previousTx ? { ...previousTx, odometerKm: previousTx.odometerKm } : null,
      isDuplicateReference: !!duplicateRef,
      duplicateTransactionId: duplicateTx?.id ?? null,
      averageUnitPriceForEnergyType: avgPriceGroup?._avg?.unitPrice?.toNumber() ?? null,
    };
  }

  // =========================================================================
  // Expenses
  // =========================================================================

  public async allocateExpenseDisplayId(organizationId: string): Promise<string> {
    const existing = await this.db.expense.findMany({
      where: { organizationId },
      select: { displayId: true },
    });
    let maxNumber = 1000;
    for (const e of existing) {
      const match = /^EXP-(\d+)$/i.exec(e.displayId);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (num > maxNumber) maxNumber = num;
      }
    }
    return `EXP-${maxNumber + 1}`;
  }

  public async saveExpense(
    expense: Expense,
    metadata: FinanceMutationMetadata,
    eventType:
      | 'ExpenseCreated'
      | 'ExpenseUpdated'
      | 'ExpensePosted'
      | 'ExpenseVoided'
      | 'ExpenseReceiptUpdated',
  ): Promise<ExpenseDetail> {
    const action =
      eventType === 'ExpenseCreated'
        ? 'expense.created'
        : eventType === 'ExpenseUpdated'
          ? 'expense.updated'
          : eventType === 'ExpensePosted'
            ? 'expense.posted'
            : eventType === 'ExpenseVoided'
              ? 'expense.voided'
              : 'expense.receipt.uploaded';

    await this.db.$transaction(async (tx) => {
      await tx.expense.upsert({
        where: { id: expense.id },
        create: {
          id: expense.id,
          organizationId: expense.organizationId,
          displayId: expense.displayId,
          categoryId: expense.categoryId,
          vehicleId: expense.vehicleId,
          driverId: expense.driverId,
          tripId: expense.tripId,
          maintenanceWorkOrderId: expense.maintenanceWorkOrderId,
          occurredAt: expense.occurredAt,
          description: expense.description,
          amount: expense.amount,
          currencyCode: expense.currencyCode,
          vendorName: expense.vendorName,
          referenceNumber: expense.referenceNumber,
          status: expense.status as PrismaExpenseStatus,
          voidReason: expense.voidReason,
          voidedAt: expense.voidedAt,
          voidedBy: expense.voidedBy,
          receiptStorageKey: expense.receipt?.storageKey ?? null,
          receiptFileName: expense.receipt?.fileName ?? null,
          receiptContentType: expense.receipt?.contentType ?? null,
          receiptSizeBytes: expense.receipt?.sizeBytes ?? null,
          version: expense.version,
          createdAt: expense.createdAt,
          createdBy: expense.createdById,
          updatedAt: expense.updatedAt,
          updatedBy: expense.updatedBy,
        },
        update: {
          categoryId: expense.categoryId,
          vehicleId: expense.vehicleId,
          driverId: expense.driverId,
          tripId: expense.tripId,
          maintenanceWorkOrderId: expense.maintenanceWorkOrderId,
          occurredAt: expense.occurredAt,
          description: expense.description,
          amount: expense.amount,
          currencyCode: expense.currencyCode,
          vendorName: expense.vendorName,
          referenceNumber: expense.referenceNumber,
          status: expense.status as PrismaExpenseStatus,
          voidReason: expense.voidReason,
          voidedAt: expense.voidedAt,
          voidedBy: expense.voidedBy,
          receiptStorageKey: expense.receipt?.storageKey ?? null,
          receiptFileName: expense.receipt?.fileName ?? null,
          receiptContentType: expense.receipt?.contentType ?? null,
          receiptSizeBytes: expense.receipt?.sizeBytes ?? null,
          version: expense.version,
          updatedAt: expense.updatedAt,
          updatedBy: expense.updatedBy,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          id: randomUUID(),
          organizationId: expense.organizationId,
          actorId: metadata.actorId,
          action,
          entityType: 'Expense',
          entityId: expense.id,
          requestId: metadata.requestId,
          ipAddress: metadata.ipAddress ?? null,
          userAgent: metadata.userAgent ?? null,
          beforeData:
            eventType === 'ExpenseCreated'
              ? Prisma.DbNull
              : json({
                  status: expense.status,
                  amount: expense.amount,
                }),
          afterData: json({
            id: expense.id,
            displayId: expense.displayId,
            status: expense.status,
            amount: expense.amount,
            currencyCode: expense.currencyCode,
            voidReason: expense.voidReason,
          }),
        },
      });

      // Outbox Event
      const outboxEventId = randomUUID();
      await tx.outboxEvent.create({
        data: {
          id: outboxEventId,
          organizationId: expense.organizationId,
          eventType,
          aggregateType: 'Expense',
          aggregateId: expense.id,
          occurredAt: expense.updatedAt,
          payload: json({
            eventId: outboxEventId,
            organizationId: expense.organizationId,
            expenseId: expense.id,
            displayId: expense.displayId,
            categoryId: expense.categoryId,
            vehicleId: expense.vehicleId,
            driverId: expense.driverId,
            tripId: expense.tripId,
            maintenanceWorkOrderId: expense.maintenanceWorkOrderId,
            amount: expense.amount,
            currencyCode: expense.currencyCode,
            status: expense.status,
            occurredAt: expense.updatedAt.toISOString(),
            actorId: metadata.actorId,
            requestId: metadata.requestId,
          }),
        },
      });
    });

    const result = await this.findExpenseById(expense.organizationId, expense.id);
    return result!;
  }

  public async findExpenseById(organizationId: string, id: string): Promise<ExpenseDetail | null> {
    const raw = await this.db.expense.findFirst({
      where: { id, organizationId },
      include: {
        category: { select: { id: true, code: true, name: true } },
        vehicle: { select: { id: true, displayId: true, registration: true, model: true } },
        driver: { select: { id: true, displayId: true, firstName: true, lastName: true } },
        trip: { select: { id: true, displayId: true, origin: true, destination: true } },
        maintenanceWorkOrder: { select: { id: true, displayId: true, description: true } },
      },
    });

    if (!raw) return null;

    return {
      id: raw.id,
      organizationId: raw.organizationId,
      displayId: raw.displayId,
      categoryId: raw.categoryId,
      category: raw.category,
      vehicleId: raw.vehicleId,
      vehicle: raw.vehicle,
      driverId: raw.driverId,
      driver: raw.driver,
      tripId: raw.tripId,
      trip: raw.trip,
      maintenanceWorkOrderId: raw.maintenanceWorkOrderId,
      maintenanceWorkOrder: raw.maintenanceWorkOrder,
      occurredAt: raw.occurredAt,
      description: raw.description,
      amount: raw.amount.toNumber(),
      currencyCode: raw.currencyCode,
      vendorName: raw.vendorName,
      referenceNumber: raw.referenceNumber,
      status: raw.status,
      voidReason: raw.voidReason,
      voidedAt: raw.voidedAt,
      voidedBy: raw.voidedBy,
      hasReceipt: !!raw.receiptStorageKey,
      receiptFileName: raw.receiptFileName,
      receiptContentType: raw.receiptContentType,
      receiptSizeBytes: raw.receiptSizeBytes,
      receiptStorageKey: raw.receiptStorageKey,
      version: raw.version,
      createdAt: raw.createdAt,
      createdBy: raw.createdBy,
      updatedAt: raw.updatedAt,
      updatedBy: raw.updatedBy,
    };
  }

  public async findExpenseEntityById(organizationId: string, id: string): Promise<Expense | null> {
    const raw = await this.db.expense.findFirst({
      where: { id, organizationId },
    });
    if (!raw) return null;

    return Expense.reconstitute({
      id: raw.id,
      organizationId: raw.organizationId,
      displayId: raw.displayId,
      categoryId: raw.categoryId,
      vehicleId: raw.vehicleId,
      driverId: raw.driverId,
      tripId: raw.tripId,
      maintenanceWorkOrderId: raw.maintenanceWorkOrderId,
      occurredAt: raw.occurredAt,
      description: raw.description,
      amount: raw.amount.toNumber(),
      currencyCode: raw.currencyCode,
      vendorName: raw.vendorName,
      referenceNumber: raw.referenceNumber,
      status: raw.status,
      voidReason: raw.voidReason,
      voidedAt: raw.voidedAt,
      voidedBy: raw.voidedBy,
      receipt: raw.receiptStorageKey
        ? {
            storageKey: raw.receiptStorageKey,
            fileName: raw.receiptFileName || 'receipt.pdf',
            contentType: raw.receiptContentType || 'application/octet-stream',
            sizeBytes: raw.receiptSizeBytes || 0,
          }
        : null,
      createdById: raw.createdBy,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      updatedBy: raw.updatedBy,
      version: raw.version,
    });
  }

  public async listExpenses(
    organizationId: string,
    filter?: ListExpensesFilter,
  ): Promise<{ items: ExpenseDetail[]; total: number }> {
    const where: Prisma.ExpenseWhereInput = {
      organizationId,
      ...(filter?.categoryId ? { categoryId: filter.categoryId } : {}),
      ...(filter?.vehicleId ? { vehicleId: filter.vehicleId } : {}),
      ...(filter?.driverId ? { driverId: filter.driverId } : {}),
      ...(filter?.tripId ? { tripId: filter.tripId } : {}),
      ...(filter?.maintenanceWorkOrderId
        ? { maintenanceWorkOrderId: filter.maintenanceWorkOrderId }
        : {}),
      ...(filter?.status ? { status: filter.status as PrismaExpenseStatus } : {}),
      ...(filter?.fromDate || filter?.toDate
        ? {
            occurredAt: {
              ...(filter.fromDate ? { gte: filter.fromDate } : {}),
              ...(filter.toDate ? { lte: filter.toDate } : {}),
            },
          }
        : {}),
      ...(filter?.search
        ? {
            OR: [
              { displayId: { contains: filter.search, mode: 'insensitive' } },
              { description: { contains: filter.search, mode: 'insensitive' } },
              { vendorName: { contains: filter.search, mode: 'insensitive' } },
              { referenceNumber: { contains: filter.search, mode: 'insensitive' } },
              { category: { name: { contains: filter.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const limit = Math.min(filter?.limit ?? 50, 100);
    const offset = filter?.offset ?? 0;

    const [items, total] = await Promise.all([
      this.db.expense.findMany({
        where,
        include: {
          category: { select: { id: true, code: true, name: true } },
          vehicle: { select: { id: true, displayId: true, registration: true, model: true } },
          driver: { select: { id: true, displayId: true, firstName: true, lastName: true } },
          trip: { select: { id: true, displayId: true, origin: true, destination: true } },
          maintenanceWorkOrder: { select: { id: true, displayId: true, description: true } },
        },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      this.db.expense.count({ where }),
    ]);

    const mapped: ExpenseDetail[] = items.map((raw) => ({
      id: raw.id,
      organizationId: raw.organizationId,
      displayId: raw.displayId,
      categoryId: raw.categoryId,
      category: raw.category,
      vehicleId: raw.vehicleId,
      vehicle: raw.vehicle,
      driverId: raw.driverId,
      driver: raw.driver,
      tripId: raw.tripId,
      trip: raw.trip,
      maintenanceWorkOrderId: raw.maintenanceWorkOrderId,
      maintenanceWorkOrder: raw.maintenanceWorkOrder,
      occurredAt: raw.occurredAt,
      description: raw.description,
      amount: raw.amount.toNumber(),
      currencyCode: raw.currencyCode,
      vendorName: raw.vendorName,
      referenceNumber: raw.referenceNumber,
      status: raw.status,
      voidReason: raw.voidReason,
      voidedAt: raw.voidedAt,
      voidedBy: raw.voidedBy,
      hasReceipt: !!raw.receiptStorageKey,
      receiptFileName: raw.receiptFileName,
      receiptContentType: raw.receiptContentType,
      receiptSizeBytes: raw.receiptSizeBytes,
      receiptStorageKey: raw.receiptStorageKey,
      version: raw.version,
      createdAt: raw.createdAt,
      createdBy: raw.createdBy,
      updatedAt: raw.updatedAt,
      updatedBy: raw.updatedBy,
    }));

    return { items: mapped, total };
  }

  // =========================================================================
  // Expense Categories
  // =========================================================================

  public async saveExpenseCategory(
    category: ExpenseCategory,
    metadata: FinanceMutationMetadata,
    eventType: 'ExpenseCategoryCreated' | 'ExpenseCategoryUpdated' | 'ExpenseCategoryArchived',
  ): Promise<ExpenseCategoryDetail> {
    const action =
      eventType === 'ExpenseCategoryCreated'
        ? 'expense.category.created'
        : eventType === 'ExpenseCategoryUpdated'
          ? 'expense.category.updated'
          : 'expense.category.archived';

    await this.db.$transaction(async (tx) => {
      await tx.expenseCategory.upsert({
        where: { id: category.id },
        create: {
          id: category.id,
          organizationId: category.organizationId,
          code: category.code,
          name: category.name,
          description: category.description,
          status: category.status as PrismaExpenseCategoryStatus,
          version: category.version,
          createdAt: category.createdAt,
          createdBy: category.createdById,
          updatedAt: category.updatedAt,
          updatedBy: category.updatedBy,
        },
        update: {
          name: category.name,
          description: category.description,
          status: category.status as PrismaExpenseCategoryStatus,
          version: category.version,
          updatedAt: category.updatedAt,
          updatedBy: category.updatedBy,
        },
      });

      await tx.auditLog.create({
        data: {
          id: randomUUID(),
          organizationId: category.organizationId,
          actorId: metadata.actorId,
          action,
          entityType: 'ExpenseCategory',
          entityId: category.id,
          requestId: metadata.requestId,
          ipAddress: metadata.ipAddress ?? null,
          userAgent: metadata.userAgent ?? null,
          beforeData:
            eventType === 'ExpenseCategoryCreated'
              ? Prisma.DbNull
              : json({
                  status: category.status,
                }),
          afterData: json({
            id: category.id,
            code: category.code,
            name: category.name,
            status: category.status,
          }),
        },
      });

      const outboxEventId = randomUUID();
      await tx.outboxEvent.create({
        data: {
          id: outboxEventId,
          organizationId: category.organizationId,
          eventType,
          aggregateType: 'ExpenseCategory',
          aggregateId: category.id,
          occurredAt: category.updatedAt,
          payload: json({
            eventId: outboxEventId,
            organizationId: category.organizationId,
            categoryId: category.id,
            code: category.code,
            name: category.name,
            status: category.status,
            occurredAt: category.updatedAt.toISOString(),
            actorId: metadata.actorId,
            requestId: metadata.requestId,
          }),
        },
      });
    });

    const res = await this.findExpenseCategoryById(category.organizationId, category.id);
    return {
      id: res!.id,
      organizationId: res!.organizationId,
      code: res!.code,
      name: res!.name,
      description: res!.description,
      status: res!.status,
      version: res!.version,
      createdAt: res!.createdAt,
      updatedAt: res!.updatedAt,
    };
  }

  public async findExpenseCategoryById(
    organizationId: string,
    id: string,
  ): Promise<ExpenseCategory | null> {
    const raw = await this.db.expenseCategory.findFirst({
      where: { id, organizationId },
    });
    if (!raw) return null;

    return ExpenseCategory.reconstitute({
      id: raw.id,
      organizationId: raw.organizationId,
      code: raw.code,
      name: raw.name,
      description: raw.description,
      status: raw.status,
      createdById: raw.createdBy,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      updatedBy: raw.updatedBy,
      version: raw.version,
    });
  }

  public async findExpenseCategoryByCode(
    organizationId: string,
    code: string,
  ): Promise<ExpenseCategory | null> {
    const raw = await this.db.expenseCategory.findFirst({
      where: { organizationId, code },
    });
    if (!raw) return null;

    return ExpenseCategory.reconstitute({
      id: raw.id,
      organizationId: raw.organizationId,
      code: raw.code,
      name: raw.name,
      description: raw.description,
      status: raw.status,
      createdById: raw.createdBy,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      updatedBy: raw.updatedBy,
      version: raw.version,
    });
  }

  public async listExpenseCategories(
    organizationId: string,
    includeArchived = false,
  ): Promise<ExpenseCategoryDetail[]> {
    const items = await this.db.expenseCategory.findMany({
      where: {
        organizationId,
        ...(includeArchived ? {} : { status: PrismaExpenseCategoryStatus.ACTIVE }),
      },
      orderBy: { name: 'asc' },
    });

    return items.map((c) => ({
      id: c.id,
      organizationId: c.organizationId,
      code: c.code,
      name: c.name,
      description: c.description,
      status: c.status,
      version: c.version,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  // =========================================================================
  // Lookups & Attribution
  // =========================================================================

  public async findVehicleByRegistration(
    organizationId: string,
    registration: string,
  ): Promise<{ id: string; displayId: string; registration: string; odometerKm: number } | null> {
    return this.db.vehicle.findFirst({
      where: { organizationId, registration: { equals: registration.trim(), mode: 'insensitive' } },
      select: { id: true, displayId: true, registration: true, odometerKm: true },
    });
  }

  public async findVehicleById(
    organizationId: string,
    id: string,
  ): Promise<{ id: string; displayId: string; registration: string; odometerKm: number } | null> {
    return this.db.vehicle.findFirst({
      where: { organizationId, id },
      select: { id: true, displayId: true, registration: true, odometerKm: true },
    });
  }

  public async findDriverByNumberOrDisplayId(
    organizationId: string,
    identifier: string,
  ): Promise<{
    id: string;
    displayId: string;
    employeeNumber: string | null;
    firstName: string;
    lastName: string;
  } | null> {
    const clean = identifier.trim();
    return this.db.driver.findFirst({
      where: {
        organizationId,
        OR: [
          { displayId: { equals: clean, mode: 'insensitive' } },
          { employeeNumber: { equals: clean, mode: 'insensitive' } },
        ],
      },
      select: { id: true, displayId: true, employeeNumber: true, firstName: true, lastName: true },
    });
  }

  public async findDriverById(
    organizationId: string,
    id: string,
  ): Promise<{
    id: string;
    displayId: string;
    employeeNumber: string | null;
    firstName: string;
    lastName: string;
  } | null> {
    return this.db.driver.findFirst({
      where: { organizationId, id },
      select: { id: true, displayId: true, employeeNumber: true, firstName: true, lastName: true },
    });
  }

  public async findTripById(
    organizationId: string,
    tripId: string,
  ): Promise<{
    id: string;
    displayId: string;
    vehicleId: string;
    driverId: string;
    origin: string;
    destination: string;
    distanceKm?: number | null;
  } | null> {
    return this.db.trip.findFirst({
      where: { organizationId, id: tripId },
      select: {
        id: true,
        displayId: true,
        vehicleId: true,
        driverId: true,
        origin: true,
        destination: true,
        distanceKm: true,
      },
    });
  }

  public async findWorkOrderById(
    organizationId: string,
    workOrderId: string,
  ): Promise<{
    id: string;
    displayId: string;
    vehicleId: string;
    description?: string | null;
  } | null> {
    return this.db.maintenanceWorkOrder.findFirst({
      where: { organizationId, id: workOrderId },
      select: { id: true, displayId: true, vehicleId: true, description: true },
    });
  }

  // =========================================================================
  // Summaries & Metrics
  // =========================================================================

  public async getFinanceSummary(
    organizationId: string,
    filter?: { fromDate?: Date; toDate?: Date },
  ): Promise<FinanceSummaryResult> {
    const dateFilter =
      filter?.fromDate || filter?.toDate
        ? {
            occurredAt: {
              ...(filter.fromDate ? { gte: filter.fromDate } : {}),
              ...(filter.toDate ? { lte: filter.toDate } : {}),
            },
          }
        : {};

    const [fuelList, expenseList, activeAnomaliesCount] = await Promise.all([
      this.db.fuelTransaction.findMany({
        where: {
          organizationId,
          status: { not: PrismaFuelTransactionStatus.VOIDED },
          ...dateFilter,
        },
        select: {
          totalAmount: true,
          currencyCode: true,
          vehicleId: true,
          vehicle: { select: { id: true, displayId: true, registration: true } },
        },
      }),
      this.db.expense.findMany({
        where: {
          organizationId,
          status: PrismaExpenseStatus.POSTED,
          ...dateFilter,
        },
        select: {
          amount: true,
          currencyCode: true,
          categoryId: true,
          category: { select: { id: true, code: true, name: true } },
          vehicleId: true,
          vehicle: { select: { id: true, displayId: true, registration: true } },
        },
      }),
      this.db.fuelTransactionAnomaly.count({
        where: {
          organizationId,
          fuelTransaction: { status: { not: PrismaFuelTransactionStatus.VOIDED } },
        },
      }),
    ]);

    // Spend by currency
    const currencyMap = new Map<string, { fuel: number; expense: number }>();

    for (const f of fuelList) {
      const c = f.currencyCode;
      const cur = currencyMap.get(c) ?? { fuel: 0, expense: 0 };
      cur.fuel += f.totalAmount.toNumber();
      currencyMap.set(c, cur);
    }

    for (const e of expenseList) {
      const c = e.currencyCode;
      const cur = currencyMap.get(c) ?? { fuel: 0, expense: 0 };
      cur.expense += e.amount.toNumber();
      currencyMap.set(c, cur);
    }

    const spendByCurrency: CurrencySpendSummary[] = Array.from(currencyMap.entries()).map(
      ([currencyCode, data]) => ({
        currencyCode,
        fuelSpend: Math.round(data.fuel * 100) / 100,
        expenseSpend: Math.round(data.expense * 100) / 100,
        totalSpend: Math.round((data.fuel + data.expense) * 100) / 100,
      }),
    );

    // Spend by category
    const catMap = new Map<
      string,
      {
        cat: { id: string; code: string; name: string };
        currency: string;
        total: number;
        count: number;
      }
    >();
    for (const e of expenseList) {
      const key = `${e.categoryId}_${e.currencyCode}`;
      const existing = catMap.get(key) ?? {
        cat: e.category,
        currency: e.currencyCode,
        total: 0,
        count: 0,
      };
      existing.total += e.amount.toNumber();
      existing.count += 1;
      catMap.set(key, existing);
    }

    const spendByCategory: CategorySpendSummary[] = Array.from(catMap.values())
      .map((item) => ({
        categoryId: item.cat.id,
        categoryCode: item.cat.code,
        categoryName: item.cat.name,
        currencyCode: item.currency,
        totalAmount: Math.round(item.total * 100) / 100,
        expenseCount: item.count,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    // Top vehicles by spend
    const vehicleSpendMap = new Map<
      string,
      {
        vehicle: { id: string; displayId: string; registration: string };
        currencyCode: string;
        fuel: number;
        expense: number;
      }
    >();

    for (const f of fuelList) {
      if (f.vehicle) {
        const key = `${f.vehicle.id}_${f.currencyCode}`;
        const cur = vehicleSpendMap.get(key) ?? {
          vehicle: f.vehicle,
          currencyCode: f.currencyCode,
          fuel: 0,
          expense: 0,
        };
        cur.fuel += f.totalAmount.toNumber();
        vehicleSpendMap.set(key, cur);
      }
    }

    for (const e of expenseList) {
      if (e.vehicle) {
        const key = `${e.vehicle.id}_${e.currencyCode}`;
        const cur = vehicleSpendMap.get(key) ?? {
          vehicle: e.vehicle,
          currencyCode: e.currencyCode,
          fuel: 0,
          expense: 0,
        };
        cur.expense += e.amount.toNumber();
        vehicleSpendMap.set(key, cur);
      }
    }

    const topVehiclesBySpend: VehicleSpendSummary[] = Array.from(vehicleSpendMap.values())
      .map((item) => ({
        vehicleId: item.vehicle.id,
        displayId: item.vehicle.displayId,
        registration: item.vehicle.registration,
        currencyCode: item.currencyCode,
        fuelSpend: Math.round(item.fuel * 100) / 100,
        expenseSpend: Math.round(item.expense * 100) / 100,
        totalSpend: Math.round((item.fuel + item.expense) * 100) / 100,
      }))
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 10);

    return {
      spendByCurrency,
      spendByCategory,
      topVehiclesBySpend,
      totalFuelTransactions: fuelList.length,
      totalExpenses: expenseList.length,
      activeAnomaliesCount,
    };
  }

  public async getVehicleFinanceSummary(
    organizationId: string,
    vehicleId: string,
  ): Promise<VehicleFinanceSummaryResult> {
    const vehicle = await this.db.vehicle.findFirst({
      where: { organizationId, id: vehicleId },
      select: { id: true, displayId: true, registration: true },
    });
    if (!vehicle) {
      throw new Error(`Vehicle ${vehicleId} not found`);
    }

    const [fuelRows, expenseRows] = await Promise.all([
      this.db.fuelTransaction.findMany({
        where: {
          organizationId,
          vehicleId,
          status: { not: PrismaFuelTransactionStatus.VOIDED },
        },
        orderBy: { occurredAt: 'asc' },
        include: {
          vehicle: { select: { id: true, displayId: true, registration: true, model: true } },
          driver: {
            select: {
              id: true,
              displayId: true,
              firstName: true,
              lastName: true,
              employeeNumber: true,
            },
          },
          trip: { select: { id: true, displayId: true, origin: true, destination: true } },
          anomalies: true,
        },
      }),
      this.db.expense.findMany({
        where: {
          organizationId,
          vehicleId,
          status: PrismaExpenseStatus.POSTED,
        },
        orderBy: { occurredAt: 'desc' },
        include: {
          category: { select: { id: true, code: true, name: true } },
          vehicle: { select: { id: true, displayId: true, registration: true, model: true } },
          driver: { select: { id: true, displayId: true, firstName: true, lastName: true } },
          trip: { select: { id: true, displayId: true, origin: true, destination: true } },
          maintenanceWorkOrder: { select: { id: true, displayId: true, description: true } },
        },
      }),
    ]);

    // Efficiency metrics
    const efficiencyInput = fuelRows.map((f) => ({
      id: f.id,
      occurredAt: f.occurredAt,
      odometerKm: f.odometerKm,
      quantity: f.quantity.toNumber(),
      totalAmount: f.totalAmount.toNumber(),
      currencyCode: f.currencyCode,
      status: f.status,
    }));
    const efficiency = computeVehicleEfficiency(vehicleId, efficiencyInput);

    // Spend by currency
    const currencyMap = new Map<string, { fuel: number; expense: number }>();
    for (const f of fuelRows) {
      const cur = currencyMap.get(f.currencyCode) ?? { fuel: 0, expense: 0 };
      cur.fuel += f.totalAmount.toNumber();
      currencyMap.set(f.currencyCode, cur);
    }
    for (const e of expenseRows) {
      const cur = currencyMap.get(e.currencyCode) ?? { fuel: 0, expense: 0 };
      cur.expense += e.amount.toNumber();
      currencyMap.set(e.currencyCode, cur);
    }
    const spendByCurrency: CurrencySpendSummary[] = Array.from(currencyMap.entries()).map(
      ([currencyCode, data]) => ({
        currencyCode,
        fuelSpend: Math.round(data.fuel * 100) / 100,
        expenseSpend: Math.round(data.expense * 100) / 100,
        totalSpend: Math.round((data.fuel + data.expense) * 100) / 100,
      }),
    );

    // Spend by category
    const catMap = new Map<
      string,
      {
        cat: { id: string; code: string; name: string };
        currency: string;
        total: number;
        count: number;
      }
    >();
    for (const e of expenseRows) {
      const key = `${e.categoryId}_${e.currencyCode}`;
      const existing = catMap.get(key) ?? {
        cat: e.category,
        currency: e.currencyCode,
        total: 0,
        count: 0,
      };
      existing.total += e.amount.toNumber();
      existing.count += 1;
      catMap.set(key, existing);
    }
    const spendByCategory: CategorySpendSummary[] = Array.from(catMap.values()).map((item) => ({
      categoryId: item.cat.id,
      categoryCode: item.cat.code,
      categoryName: item.cat.name,
      currencyCode: item.currency,
      totalAmount: Math.round(item.total * 100) / 100,
      expenseCount: item.count,
    }));

    const recentFuelTransactions = fuelRows
      .slice()
      .reverse()
      .slice(0, 10)
      .map((raw) => ({
        id: raw.id,
        organizationId: raw.organizationId,
        displayId: raw.displayId,
        vehicleId: raw.vehicleId,
        vehicle: raw.vehicle,
        driverId: raw.driverId,
        driver: raw.driver,
        tripId: raw.tripId,
        trip: raw.trip,
        occurredAt: raw.occurredAt,
        energyType: raw.energyType,
        quantity: raw.quantity.toNumber(),
        quantityUnit: raw.quantityUnit,
        unitPrice: raw.unitPrice.toNumber(),
        totalAmount: raw.totalAmount.toNumber(),
        currencyCode: raw.currencyCode,
        odometerKm: raw.odometerKm,
        stationName: raw.stationName,
        referenceNumber: raw.referenceNumber,
        source: raw.source,
        status: raw.status,
        voidReason: raw.voidReason,
        voidedAt: raw.voidedAt,
        voidedBy: raw.voidedBy,
        hasReceipt: !!raw.receiptStorageKey,
        receiptFileName: raw.receiptFileName,
        receiptContentType: raw.receiptContentType,
        receiptSizeBytes: raw.receiptSizeBytes,
        receiptStorageKey: raw.receiptStorageKey,
        version: raw.version,
        anomalies: raw.anomalies.map((a) => ({
          id: a.id,
          code: a.code,
          severity: a.severity,
          description: a.description,
          metadata: a.metadata as Record<string, unknown> | null,
          createdAt: a.createdAt,
        })),
        createdAt: raw.createdAt,
        createdBy: raw.createdBy,
        updatedAt: raw.updatedAt,
        updatedBy: raw.updatedBy,
      }));

    const recentExpenses = expenseRows.slice(0, 10).map((raw) => ({
      id: raw.id,
      organizationId: raw.organizationId,
      displayId: raw.displayId,
      categoryId: raw.categoryId,
      category: raw.category,
      vehicleId: raw.vehicleId,
      vehicle: raw.vehicle,
      driverId: raw.driverId,
      driver: raw.driver,
      tripId: raw.tripId,
      trip: raw.trip,
      maintenanceWorkOrderId: raw.maintenanceWorkOrderId,
      maintenanceWorkOrder: raw.maintenanceWorkOrder,
      occurredAt: raw.occurredAt,
      description: raw.description,
      amount: raw.amount.toNumber(),
      currencyCode: raw.currencyCode,
      vendorName: raw.vendorName,
      referenceNumber: raw.referenceNumber,
      status: raw.status,
      voidReason: raw.voidReason,
      voidedAt: raw.voidedAt,
      voidedBy: raw.voidedBy,
      hasReceipt: !!raw.receiptStorageKey,
      receiptFileName: raw.receiptFileName,
      receiptContentType: raw.receiptContentType,
      receiptSizeBytes: raw.receiptSizeBytes,
      receiptStorageKey: raw.receiptStorageKey,
      version: raw.version,
      createdAt: raw.createdAt,
      createdBy: raw.createdBy,
      updatedAt: raw.updatedAt,
      updatedBy: raw.updatedBy,
    }));

    return {
      vehicleId: vehicle.id,
      displayId: vehicle.displayId,
      registration: vehicle.registration,
      spendByCurrency,
      spendByCategory,
      efficiency,
      recentFuelTransactions,
      recentExpenses,
    };
  }

  public async getTripFinanceSummary(
    organizationId: string,
    tripId: string,
  ): Promise<TripFinanceSummaryResult> {
    const trip = await this.db.trip.findFirst({
      where: { organizationId, id: tripId },
      select: { id: true, displayId: true, origin: true, destination: true, distanceKm: true },
    });
    if (!trip) {
      throw new Error(`Trip ${tripId} not found`);
    }

    const [fuelRows, expenseRows] = await Promise.all([
      this.db.fuelTransaction.findMany({
        where: {
          organizationId,
          tripId,
          status: { not: PrismaFuelTransactionStatus.VOIDED },
        },
        include: {
          vehicle: { select: { id: true, displayId: true, registration: true, model: true } },
          driver: {
            select: {
              id: true,
              displayId: true,
              firstName: true,
              lastName: true,
              employeeNumber: true,
            },
          },
          trip: { select: { id: true, displayId: true, origin: true, destination: true } },
          anomalies: true,
        },
        orderBy: { occurredAt: 'desc' },
      }),
      this.db.expense.findMany({
        where: {
          organizationId,
          tripId,
          status: PrismaExpenseStatus.POSTED,
        },
        include: {
          category: { select: { id: true, code: true, name: true } },
          vehicle: { select: { id: true, displayId: true, registration: true, model: true } },
          driver: { select: { id: true, displayId: true, firstName: true, lastName: true } },
          trip: { select: { id: true, displayId: true, origin: true, destination: true } },
          maintenanceWorkOrder: { select: { id: true, displayId: true, description: true } },
        },
        orderBy: { occurredAt: 'desc' },
      }),
    ]);

    const currencyMap = new Map<string, { fuel: number; expense: number }>();
    for (const f of fuelRows) {
      const cur = currencyMap.get(f.currencyCode) ?? { fuel: 0, expense: 0 };
      cur.fuel += f.totalAmount.toNumber();
      currencyMap.set(f.currencyCode, cur);
    }
    for (const e of expenseRows) {
      const cur = currencyMap.get(e.currencyCode) ?? { fuel: 0, expense: 0 };
      cur.expense += e.amount.toNumber();
      currencyMap.set(e.currencyCode, cur);
    }

    const spendByCurrency: CurrencySpendSummary[] = Array.from(currencyMap.entries()).map(
      ([currencyCode, data]) => ({
        currencyCode,
        fuelSpend: Math.round(data.fuel * 100) / 100,
        expenseSpend: Math.round(data.expense * 100) / 100,
        totalSpend: Math.round((data.fuel + data.expense) * 100) / 100,
      }),
    );

    const fuelTransactions = fuelRows.map((raw) => ({
      id: raw.id,
      organizationId: raw.organizationId,
      displayId: raw.displayId,
      vehicleId: raw.vehicleId,
      vehicle: raw.vehicle,
      driverId: raw.driverId,
      driver: raw.driver,
      tripId: raw.tripId,
      trip: raw.trip,
      occurredAt: raw.occurredAt,
      energyType: raw.energyType,
      quantity: raw.quantity.toNumber(),
      quantityUnit: raw.quantityUnit,
      unitPrice: raw.unitPrice.toNumber(),
      totalAmount: raw.totalAmount.toNumber(),
      currencyCode: raw.currencyCode,
      odometerKm: raw.odometerKm,
      stationName: raw.stationName,
      referenceNumber: raw.referenceNumber,
      source: raw.source,
      status: raw.status,
      voidReason: raw.voidReason,
      voidedAt: raw.voidedAt,
      voidedBy: raw.voidedBy,
      hasReceipt: !!raw.receiptStorageKey,
      receiptFileName: raw.receiptFileName,
      receiptContentType: raw.receiptContentType,
      receiptSizeBytes: raw.receiptSizeBytes,
      receiptStorageKey: raw.receiptStorageKey,
      version: raw.version,
      anomalies: raw.anomalies.map((a) => ({
        id: a.id,
        code: a.code,
        severity: a.severity,
        description: a.description,
        metadata: a.metadata as Record<string, unknown> | null,
        createdAt: a.createdAt,
      })),
      createdAt: raw.createdAt,
      createdBy: raw.createdBy,
      updatedAt: raw.updatedAt,
      updatedBy: raw.updatedBy,
    }));

    const expenses = expenseRows.map((raw) => ({
      id: raw.id,
      organizationId: raw.organizationId,
      displayId: raw.displayId,
      categoryId: raw.categoryId,
      category: raw.category,
      vehicleId: raw.vehicleId,
      vehicle: raw.vehicle,
      driverId: raw.driverId,
      driver: raw.driver,
      tripId: raw.tripId,
      trip: raw.trip,
      maintenanceWorkOrderId: raw.maintenanceWorkOrderId,
      maintenanceWorkOrder: raw.maintenanceWorkOrder,
      occurredAt: raw.occurredAt,
      description: raw.description,
      amount: raw.amount.toNumber(),
      currencyCode: raw.currencyCode,
      vendorName: raw.vendorName,
      referenceNumber: raw.referenceNumber,
      status: raw.status,
      voidReason: raw.voidReason,
      voidedAt: raw.voidedAt,
      voidedBy: raw.voidedBy,
      hasReceipt: !!raw.receiptStorageKey,
      receiptFileName: raw.receiptFileName,
      receiptContentType: raw.receiptContentType,
      receiptSizeBytes: raw.receiptSizeBytes,
      receiptStorageKey: raw.receiptStorageKey,
      version: raw.version,
      createdAt: raw.createdAt,
      createdBy: raw.createdBy,
      updatedAt: raw.updatedAt,
      updatedBy: raw.updatedBy,
    }));

    return {
      tripId: trip.id,
      displayId: trip.displayId,
      origin: trip.origin,
      destination: trip.destination,
      distanceKm: trip.distanceKm,
      spendByCurrency,
      fuelTransactions,
      expenses,
    };
  }
}
