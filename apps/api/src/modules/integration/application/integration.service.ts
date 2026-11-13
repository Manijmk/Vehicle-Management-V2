import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type FuelQuantityUnit,
  FuelTransactionSource,
  type IntegrationKind,
  IntegrationStatus,
} from '@vms/database';
import { ApplicationError } from '../../foundation/domain/errors.js';
import { FinanceService } from '../../finance/application/finance.service.js';
import { TelemetryService } from '../../telemetry/application/telemetry.service.js';
import { buildAccountingExportCsv } from '../domain/accounting-export.js';
import {
  assertValidConnectionName,
  assertValidConnectionTransition,
} from '../domain/integration-connection.js';
import {
  FuelCardImportBatchNotFoundError,
  InboundTelematicsPayloadInvalidError,
  IntegrationConnectionInvalidStateError,
  IntegrationConnectionNotFoundError,
  IntegrationSecretNotFoundError,
  WebhookDeliveryNotFoundError,
  WebhookSubscriptionNotFoundError,
} from '../domain/integration-errors.js';
import {
  computeTelematicsPayloadHash,
  verifyTelematicsWebhookHeaders,
} from '../domain/telematics-webhook.js';
import { assertSafeEndpointUrl } from '../domain/url-validator.js';
import { assertValidWebhookEventTypes } from '../domain/webhook-subscription.js';
import { parseFuelCardCsv, type ParsedFuelCardRow } from '../domain/fuel-card-import.js';
import {
  INTEGRATION_REPOSITORY,
  INTEGRATION_SECRET_PORT,
  WEBHOOK_TRANSPORT_PORT,
} from '../integration.tokens.js';
import { IntegrationMetricsService } from '../infrastructure/integration-metrics.service.js';
import type {
  AccountingExportRecord,
  AuditLogParams,
  FuelCardBatchRecord,
  IntegrationConnectionRecord,
  IntegrationDeviceMappingRecord,
  IntegrationRepository,
  ListConnectionsFilter,
  ListDeliveriesFilter,
  WebhookDeliveryRecord,
  WebhookSubscriptionRecord,
} from './integration.repository.js';
import type { IntegrationSecretPort } from './ports/integration-secret.port.js';
import type { WebhookTransportPort } from './ports/webhook-transport.port.js';

export interface ActorContext {
  readonly actorId: string;
  readonly requestId?: string | undefined;
  readonly ipAddress?: string | null | undefined;
  readonly userAgent?: string | null | undefined;
}

export interface CreateConnectionInput {
  readonly name: string;
  readonly kind: IntegrationKind;
  readonly provider?: string | undefined;
  readonly configuration?: Record<string, unknown> | null | undefined;
  readonly config?: Record<string, unknown> | null | undefined;
}

export interface UpdateConnectionInput {
  readonly name?: string | undefined;
  readonly provider?: string | undefined;
  readonly configuration?: Record<string, unknown> | null | undefined;
  readonly config?: Record<string, unknown> | null | undefined;
}

export interface ProvisionSecretResult {
  readonly secretId: string;
  readonly plaintextSecret: string;
  readonly keyVersion: number;
  readonly createdAt: Date;
}

export interface InboundTelematicsPayloadDto {
  readonly eventId: string;
  readonly timestamp: string;
  readonly positions: ReadonlyArray<{
    readonly providerDeviceId?: string | undefined;
    readonly deviceId?: string | undefined;
    readonly vehicleId?: string | undefined;
    readonly capturedAt: string;
    readonly latitude: number;
    readonly longitude: number;
    readonly speedKmh?: number | null | undefined;
    readonly heading?: number | null | undefined;
    readonly altitudeM?: number | null | undefined;
    readonly accuracyM?: number | null | undefined;
    readonly ignition?: boolean | null | undefined;
    readonly odometerKm?: number | null | undefined;
    readonly providerMessageId?: string | null | undefined;
    readonly rawMetadata?: Record<string, unknown> | null | undefined;
  }>;
}

@Injectable()
export class IntegrationService {
  private readonly logger = new Logger(IntegrationService.name);

  constructor(
    @Inject(INTEGRATION_REPOSITORY)
    private readonly repository: IntegrationRepository,
    @Inject(INTEGRATION_SECRET_PORT)
    private readonly secretPort: IntegrationSecretPort,
    @Inject(WEBHOOK_TRANSPORT_PORT)
    private readonly transportPort: WebhookTransportPort,
    @Inject(TelemetryService)
    private readonly telemetryService: TelemetryService,
    @Inject(FinanceService)
    private readonly financeService: FinanceService,
    @Inject(IntegrationMetricsService)
    private readonly metricsService: IntegrationMetricsService,
  ) {}

  // ===========================================================================
  // 1. Connection Management & Lifecycle
  // ===========================================================================

  async createConnection(
    organizationId: string,
    input: CreateConnectionInput,
    actor: ActorContext,
  ): Promise<IntegrationConnectionRecord> {
    assertValidConnectionName(input.name);

    const audit: AuditLogParams = {
      organizationId,
      actorId: actor.actorId,
      action: 'integration.connection.create',
      entityType: 'IntegrationConnection',
      entityId: '',
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    };

    return this.repository.createConnection(
      {
        organizationId,
        name: input.name.trim(),
        kind: input.kind,
        provider: input.provider?.trim() ?? 'CUSTOM',
        configuration: input.configuration ?? input.config ?? {},
        createdBy: actor.actorId,
      },
      audit,
    );
  }

  async getConnection(
    organizationId: string,
    connectionId: string,
  ): Promise<IntegrationConnectionRecord> {
    const conn = await this.repository.getConnectionById(organizationId, connectionId);
    if (!conn) {
      throw new IntegrationConnectionNotFoundError(connectionId);
    }
    return conn;
  }

  async listConnections(
    organizationId: string,
    filter?: ListConnectionsFilter | undefined,
  ): Promise<{ items: readonly IntegrationConnectionRecord[]; total: number }> {
    return this.repository.listConnections(organizationId, filter);
  }

  async updateConnection(
    organizationId: string,
    connectionId: string,
    expectedVersion: number,
    input: UpdateConnectionInput,
    actor: ActorContext,
  ): Promise<IntegrationConnectionRecord> {
    const conn = await this.getConnection(organizationId, connectionId);
    if (input.name !== undefined) {
      assertValidConnectionName(input.name);
    }

    const audit: AuditLogParams = {
      organizationId,
      actorId: actor.actorId,
      action: 'integration.connection.update',
      entityType: 'IntegrationConnection',
      entityId: connectionId,
      beforeData: {
        name: conn.name,
        provider: conn.provider,
        configuration: conn.configuration,
      },
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    };

    return this.repository.updateConnection(
      organizationId,
      connectionId,
      expectedVersion,
      {
        name: input.name?.trim(),
        provider: input.provider?.trim(),
        configuration: input.configuration ?? input.config,
        updatedBy: actor.actorId,
      },
      audit,
    );
  }

  async activateConnection(
    organizationId: string,
    connectionId: string,
    expectedVersion: number,
    actor: ActorContext,
  ): Promise<IntegrationConnectionRecord> {
    const conn = await this.getConnection(organizationId, connectionId);
    assertValidConnectionTransition(conn.status, IntegrationStatus.ACTIVE);

    const audit: AuditLogParams = {
      organizationId,
      actorId: actor.actorId,
      action: 'integration.connection.activate',
      entityType: 'IntegrationConnection',
      entityId: connectionId,
      beforeData: { status: conn.status },
      afterData: { status: IntegrationStatus.ACTIVE },
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    };

    return this.repository.updateConnection(
      organizationId,
      connectionId,
      expectedVersion,
      {
        status: IntegrationStatus.ACTIVE,
        updatedBy: actor.actorId,
      },
      audit,
    );
  }

  async suspendConnection(
    organizationId: string,
    connectionId: string,
    expectedVersion: number,
    actor: ActorContext,
  ): Promise<IntegrationConnectionRecord> {
    const conn = await this.getConnection(organizationId, connectionId);
    assertValidConnectionTransition(conn.status, IntegrationStatus.SUSPENDED);

    const audit: AuditLogParams = {
      organizationId,
      actorId: actor.actorId,
      action: 'integration.connection.suspend',
      entityType: 'IntegrationConnection',
      entityId: connectionId,
      beforeData: { status: conn.status },
      afterData: { status: IntegrationStatus.SUSPENDED },
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    };

    return this.repository.updateConnection(
      organizationId,
      connectionId,
      expectedVersion,
      {
        status: IntegrationStatus.SUSPENDED,
        updatedBy: actor.actorId,
      },
      audit,
    );
  }

  async disableConnection(
    organizationId: string,
    connectionId: string,
    expectedVersion: number,
    actor: ActorContext,
  ): Promise<IntegrationConnectionRecord> {
    const conn = await this.getConnection(organizationId, connectionId);
    assertValidConnectionTransition(conn.status, IntegrationStatus.DISABLED);

    const audit: AuditLogParams = {
      organizationId,
      actorId: actor.actorId,
      action: 'integration.connection.disable',
      entityType: 'IntegrationConnection',
      entityId: connectionId,
      beforeData: { status: conn.status },
      afterData: { status: IntegrationStatus.DISABLED },
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    };

    return this.repository.updateConnection(
      organizationId,
      connectionId,
      expectedVersion,
      {
        status: IntegrationStatus.DISABLED,
        disabledAt: new Date(),
        updatedBy: actor.actorId,
      },
      audit,
    );
  }

  // ===========================================================================
  // 2. Secret Lifecycle (Provision, Rotate, Revoke)
  // ===========================================================================

  async provisionSecret(
    organizationId: string,
    connectionId: string,
    actor: ActorContext,
  ): Promise<ProvisionSecretResult> {
    await this.getConnection(organizationId, connectionId);

    // Revoke any existing active secrets first
    await this.repository.revokeAllActiveSecrets(organizationId, connectionId, actor.actorId);

    const plaintextSecret = this.secretPort.generateSecret();
    const encrypted = this.secretPort.encryptSecret(plaintextSecret);

    const audit: AuditLogParams = {
      organizationId,
      actorId: actor.actorId,
      action: 'integration.secret.provision',
      entityType: 'IntegrationSecret',
      entityId: '',
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    };

    const secretRecord = await this.repository.createSecret(
      {
        organizationId,
        connectionId,
        keyVersion: encrypted.keyVersion,
        encryptedSecret: encrypted.encryptedSecret,
        secretHash: encrypted.secretHash,
      },
      audit,
    );

    return {
      secretId: secretRecord.id,
      plaintextSecret,
      keyVersion: secretRecord.keyVersion,
      createdAt: secretRecord.createdAt,
    };
  }

  async rotateSecret(
    organizationId: string,
    connectionId: string,
    actor: ActorContext,
  ): Promise<ProvisionSecretResult> {
    await this.getConnection(organizationId, connectionId);

    // Revoke existing active secrets
    await this.repository.revokeAllActiveSecrets(organizationId, connectionId, actor.actorId);

    const plaintextSecret = this.secretPort.generateSecret();
    const encrypted = this.secretPort.encryptSecret(plaintextSecret);

    const audit: AuditLogParams = {
      organizationId,
      actorId: actor.actorId,
      action: 'integration.secret.rotate',
      entityType: 'IntegrationSecret',
      entityId: '',
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    };

    const secretRecord = await this.repository.createSecret(
      {
        organizationId,
        connectionId,
        keyVersion: encrypted.keyVersion,
        encryptedSecret: encrypted.encryptedSecret,
        secretHash: encrypted.secretHash,
      },
      audit,
    );

    return {
      secretId: secretRecord.id,
      plaintextSecret,
      keyVersion: secretRecord.keyVersion,
      createdAt: secretRecord.createdAt,
    };
  }

  async revokeSecret(
    organizationId: string,
    connectionId: string,
    secretId: string,
    actor: ActorContext,
  ): Promise<void> {
    await this.getConnection(organizationId, connectionId);

    const audit: AuditLogParams = {
      organizationId,
      actorId: actor.actorId,
      action: 'integration.secret.revoke',
      entityType: 'IntegrationSecret',
      entityId: secretId,
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    };

    await this.repository.revokeSecret(organizationId, secretId, actor.actorId, audit);
  }

  // ===========================================================================
  // 3. Webhook Subscriptions & Deliveries
  // ===========================================================================

  async createSubscription(
    organizationId: string,
    connectionId: string,
    input: { endpointUrl: string; eventTypes: readonly string[] },
    actor: ActorContext,
  ): Promise<WebhookSubscriptionRecord> {
    const conn = await this.getConnection(organizationId, connectionId);
    if (conn.status === IntegrationStatus.DISABLED) {
      throw new IntegrationConnectionInvalidStateError(
        'Cannot add webhook subscriptions to a disabled connection',
      );
    }

    await assertSafeEndpointUrl(input.endpointUrl);
    assertValidWebhookEventTypes(input.eventTypes);

    const audit: AuditLogParams = {
      organizationId,
      actorId: actor.actorId,
      action: 'integration.subscription.create',
      entityType: 'WebhookSubscription',
      entityId: '',
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    };

    return this.repository.createSubscription(
      {
        organizationId,
        connectionId,
        endpointUrl: input.endpointUrl.trim(),
        eventTypes: input.eventTypes,
      },
      audit,
    );
  }

  async listSubscriptions(
    organizationId: string,
    connectionId: string,
  ): Promise<readonly WebhookSubscriptionRecord[]> {
    await this.getConnection(organizationId, connectionId);
    return this.repository.listSubscriptions(organizationId, connectionId);
  }

  async deleteSubscription(
    organizationId: string,
    connectionId: string,
    subscriptionId: string,
    actor: ActorContext,
  ): Promise<void> {
    await this.getConnection(organizationId, connectionId);
    const sub = await this.repository.getSubscriptionById(organizationId, subscriptionId);
    if (!sub || sub.connectionId !== connectionId) {
      throw new WebhookSubscriptionNotFoundError(subscriptionId);
    }

    const audit: AuditLogParams = {
      organizationId,
      actorId: actor.actorId,
      action: 'integration.subscription.delete',
      entityType: 'WebhookSubscription',
      entityId: subscriptionId,
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    };

    await this.repository.deleteSubscription(organizationId, subscriptionId, audit);
  }

  async listDeliveries(
    organizationId: string,
    connectionId: string,
    filter?: ListDeliveriesFilter | undefined,
  ): Promise<{ items: readonly WebhookDeliveryRecord[]; total: number }> {
    await this.getConnection(organizationId, connectionId);
    return this.repository.listDeliveries(organizationId, connectionId, filter);
  }

  async getDelivery(
    organizationId: string,
    connectionId: string,
    deliveryId: string,
  ): Promise<WebhookDeliveryRecord> {
    await this.getConnection(organizationId, connectionId);
    const delivery = await this.repository.getDeliveryById(organizationId, deliveryId);
    if (!delivery) {
      throw new WebhookDeliveryNotFoundError(deliveryId);
    }
    return delivery;
  }

  async retryDelivery(
    organizationId: string,
    connectionId: string,
    deliveryId: string,
    actor: ActorContext,
  ): Promise<WebhookDeliveryRecord> {
    await this.getConnection(organizationId, connectionId);
    const delivery = await this.repository.getDeliveryById(organizationId, deliveryId);
    if (!delivery) {
      throw new WebhookDeliveryNotFoundError(deliveryId);
    }

    const audit: AuditLogParams = {
      organizationId,
      actorId: actor.actorId,
      action: 'integration.delivery.retry',
      entityType: 'WebhookDelivery',
      entityId: deliveryId,
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    };

    return this.repository.resetDeliveryForRetry(organizationId, deliveryId, audit);
  }

  // ===========================================================================
  // 4. Inbound Telematics Webhook (M2M)
  // ===========================================================================

  async handleTelematicsWebhook(
    connectionId: string,
    signatureHeader: string | undefined,
    timestampHeader: string | undefined,
    rawBody: string,
  ): Promise<{
    status: string;
    eventId: string;
    duplicate: boolean;
    processedPositionsCount: number;
  }> {
    const conn = await this.repository.getConnectionByIdUnscoped(connectionId);
    if (!conn) {
      throw new IntegrationConnectionNotFoundError(connectionId);
    }
    if (conn.status !== IntegrationStatus.ACTIVE) {
      throw new IntegrationConnectionInvalidStateError(
        `Connection ${connectionId} is ${conn.status}, cannot receive events`,
      );
    }

    const activeSecret = await this.repository.getActiveSecret(conn.organizationId, conn.id);
    if (!activeSecret) {
      throw new IntegrationSecretNotFoundError('Connection has no active secret provisioned');
    }

    const plaintextSecret = this.secretPort.decryptSecret(activeSecret.encryptedSecret);

    verifyTelematicsWebhookHeaders({
      signatureHeader,
      timestampHeader,
      rawBody,
      secret: plaintextSecret,
    });

    let payload: InboundTelematicsPayloadDto;
    try {
      payload = JSON.parse(rawBody) as InboundTelematicsPayloadDto;
    } catch {
      throw new InboundTelematicsPayloadInvalidError('Invalid JSON in payload');
    }

    if (!payload.eventId || typeof payload.eventId !== 'string') {
      throw new InboundTelematicsPayloadInvalidError('Missing or invalid eventId');
    }
    if (!Array.isArray(payload.positions) || payload.positions.length === 0) {
      throw new InboundTelematicsPayloadInvalidError('Positions must be a non-empty array');
    }
    if (payload.positions.length > 100) {
      throw new InboundTelematicsPayloadInvalidError('Batch size cannot exceed 100 positions');
    }

    const payloadHash = computeTelematicsPayloadHash(rawBody);

    const result = await this.repository.ingestTelematicsBatchAtomic({
      organizationId: conn.organizationId,
      connectionId: conn.id,
      externalEventId: payload.eventId,
      payloadHash,
      positions: payload.positions,
    });

    await this.repository.recordActivity(conn.organizationId, conn.id);
    this.metricsService.recordTelematicsIngested(
      result.processedCount,
      result.duplicate ? 'duplicate' : 'success',
    );

    return {
      status: result.receipt.status,
      eventId: payload.eventId,
      duplicate: result.duplicate,
      processedPositionsCount: result.processedCount,
    };
  }

  // ===========================================================================
  // 5. Provider-Device Mapping
  // ===========================================================================

  async upsertDeviceMapping(
    organizationId: string,
    connectionId: string,
    input: { providerDeviceId: string; telemetryDeviceId: string },
    actor: ActorContext,
  ): Promise<IntegrationDeviceMappingRecord> {
    await this.getConnection(organizationId, connectionId);

    const audit: AuditLogParams = {
      organizationId,
      actorId: actor.actorId,
      action: 'integration.mapping.upsert',
      entityType: 'IntegrationDeviceMapping',
      entityId: '',
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    };

    return this.repository.upsertDeviceMapping(
      {
        organizationId,
        connectionId,
        providerDeviceId: input.providerDeviceId.trim(),
        telemetryDeviceId: input.telemetryDeviceId,
      },
      audit,
    );
  }

  async listDeviceMappings(
    organizationId: string,
    connectionId: string,
  ): Promise<readonly IntegrationDeviceMappingRecord[]> {
    await this.getConnection(organizationId, connectionId);
    return this.repository.listDeviceMappings(organizationId, connectionId);
  }

  // ===========================================================================
  // 6. Fuel Card Import (Preview & Confirm)
  // ===========================================================================

  async previewFuelCardImport(
    organizationId: string,
    connectionId: string,
    fileBuffer: Buffer,
    fileName: string,
  ): Promise<{
    batchId: string;
    fileName: string;
    totalRows: number;
    validRows: number;
    invalidRows: number;
    rows: readonly (ParsedFuelCardRow & {
      vehicleId?: string | undefined;
      vehicleRegistration?: string | undefined;
      isDuplicate?: boolean | undefined;
    })[];
  }> {
    await this.getConnection(organizationId, connectionId);

    const csvContent = fileBuffer.toString('utf8');
    const parsed = parseFuelCardCsv(csvContent);

    const validatedRows: Array<
      ParsedFuelCardRow & {
        vehicleId?: string | undefined;
        vehicleRegistration?: string | undefined;
        isDuplicate?: boolean | undefined;
      }
    > = [];

    let validCount = 0;

    for (const row of parsed.rows) {
      if (row.validationError) {
        validatedRows.push(row);
        continue;
      }

      const vehicle = await this.repository.findVehicleByRegistration(
        organizationId,
        row.registration,
      );

      if (!vehicle) {
        validatedRows.push({
          ...row,
          validationError: `Vehicle with registration '${row.registration}' not found in organization`,
        });
        continue;
      }

      const isDuplicate = await this.repository.findExternalTransaction(
        organizationId,
        connectionId,
        row.externalTransactionId,
      );

      if (isDuplicate) {
        validatedRows.push({
          ...row,
          vehicleId: vehicle.id,
          vehicleRegistration: vehicle.registration,
          isDuplicate: true,
          validationError: `Transaction ID '${row.externalTransactionId}' already imported`,
        });
        continue;
      }

      validCount++;
      validatedRows.push({
        ...row,
        vehicleId: vehicle.id,
        vehicleRegistration: vehicle.registration,
      });
    }

    const batch = await this.repository.createFuelCardBatch({
      organizationId,
      connectionId,
      fileName,
      totalRows: parsed.totalRows,
      validRows: validCount,
      errorSummary: {
        totalRows: parsed.totalRows,
        validRows: validCount,
        invalidRows: parsed.totalRows - validCount,
        parsedRows: validatedRows,
      },
    });

    this.metricsService.recordFuelCardImport(parsed.totalRows, 'preview');

    return {
      batchId: batch.id,
      fileName,
      totalRows: parsed.totalRows,
      validRows: validCount,
      invalidRows: parsed.totalRows - validCount,
      rows: validatedRows,
    };
  }

  async confirmFuelCardImport(
    organizationId: string,
    connectionId: string,
    batchId: string,
    actor: ActorContext,
  ): Promise<{
    batchId: string;
    importedRows: number;
    status: string;
  }> {
    await this.getConnection(organizationId, connectionId);

    const batch = await this.repository.getFuelCardBatchById(organizationId, batchId);
    if (!batch) {
      throw new FuelCardImportBatchNotFoundError(batchId);
    }
    if (batch.status === 'CONFIRMED') {
      return {
        batchId: batch.id,
        importedRows: batch.importedRows,
        status: batch.status,
      };
    }

    const summary = batch.errorSummary as { parsedRows?: readonly ParsedFuelCardRow[] } | null;
    const rows = summary?.parsedRows ?? [];

    let importedCount = 0;

    for (const row of rows) {
      if (row.validationError || !row.vehicleId) {
        continue;
      }

      const alreadyImported = await this.repository.findExternalTransaction(
        organizationId,
        connectionId,
        row.externalTransactionId,
      );
      if (alreadyImported) {
        continue;
      }

      try {
        const fuelTx = await this.financeService.createFuelTransaction(
          organizationId,
          {
            vehicleId: row.vehicleId,
            occurredAt: new Date(row.transactionDate),
            energyType: row.fuelType,
            quantity: row.quantity,
            quantityUnit: row.quantityUnit as FuelQuantityUnit,
            unitPrice: row.unitPrice,
            totalAmount: row.totalAmount,
            currencyCode: row.currencyCode,
            odometerKm: row.odometerKm ?? undefined,
            stationName: row.stationName ?? undefined,
            referenceNumber: row.externalTransactionId,
            source: FuelTransactionSource.FUEL_CARD_IMPORT,
            importBatchId: batch.id,
          },
          {
            actorId: actor.actorId,
            requestId: actor.requestId ?? 'fuel-card-confirm',
            ipAddress: actor.ipAddress ?? null,
            userAgent: actor.userAgent ?? null,
          },
        );

        await this.repository.createExternalTransactionIdentity({
          organizationId,
          connectionId,
          externalTransactionId: row.externalTransactionId,
          fuelTransactionId: fuelTx.id,
        });

        importedCount++;
      } catch (err: unknown) {
        this.logger.warn(
          `Failed to import row for vehicle ${row.vehicleId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const audit: AuditLogParams = {
      organizationId,
      actorId: actor.actorId,
      action: 'integration.fuelcard.confirm',
      entityType: 'FuelCardImportBatch',
      entityId: batchId,
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    };

    const updated = await this.repository.confirmFuelCardBatch(
      organizationId,
      batchId,
      actor.actorId,
      importedCount,
      audit,
    );

    this.metricsService.recordFuelCardImport(importedCount, 'success');

    return {
      batchId: updated.id,
      importedRows: updated.importedRows,
      status: updated.status,
    };
  }

  async listFuelCardBatches(
    organizationId: string,
    connectionId: string,
  ): Promise<readonly FuelCardBatchRecord[]> {
    await this.getConnection(organizationId, connectionId);
    return this.repository.listFuelCardBatches(organizationId, connectionId);
  }

  // ===========================================================================
  // 7. Accounting CSV Export
  // ===========================================================================

  async exportAccountingCsv(
    organizationId: string,
    connectionId: string,
    fromUtc: Date,
    toUtc: Date,
    currencyCode: string | undefined,
    actor: ActorContext,
  ): Promise<{
    csvContent: string;
    fileName: string;
    rowCount: number;
  }> {
    await this.getConnection(organizationId, connectionId);

    if (fromUtc >= toUtc) {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'fromUtc must be strictly before toUtc in reporting window',
      );
    }

    const diffDays = (toUtc.getTime() - fromUtc.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 366) {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'Accounting export date range cannot exceed 366 days',
      );
    }

    const { expenses, fuelTransactions } = await this.repository.findPostedTransactionsForExport(
      organizationId,
      fromUtc,
      toUtc,
      currencyCode,
    );

    const csvContent = buildAccountingExportCsv(expenses, fuelTransactions);
    const rowCount = expenses.length + fuelTransactions.length;

    const fromStr = fromUtc.toISOString().slice(0, 10);
    const toStr = toUtc.toISOString().slice(0, 10);
    const currPart = currencyCode ? `_${currencyCode}` : '';
    const fileName = `accounting_export_${fromStr}_${toStr}${currPart}.csv`;

    const audit: AuditLogParams = {
      organizationId,
      actorId: actor.actorId,
      action: 'integration.accounting.export',
      entityType: 'AccountingExportLog',
      entityId: '',
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    };

    await this.repository.logAccountingExport(
      {
        organizationId,
        connectionId,
        actorId: actor.actorId,
        format: 'CSV',
        fromUtc,
        toUtc,
        rowCount,
      },
      audit,
    );

    this.metricsService.recordAccountingExport(rowCount, 'CSV');

    return {
      csvContent,
      fileName,
      rowCount,
    };
  }

  async listAccountingExports(
    organizationId: string,
    connectionId: string,
  ): Promise<readonly AccountingExportRecord[]> {
    await this.getConnection(organizationId, connectionId);
    return this.repository.listAccountingExports(organizationId, connectionId);
  }
}
