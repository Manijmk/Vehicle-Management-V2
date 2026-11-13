import type {
  FuelCardImportBatchStatus,
  IntegrationKind,
  IntegrationMappingStatus,
  IntegrationStatus,
  WebhookDeliveryStatus,
} from '@vms/database';
import type { ExportExpenseItem, ExportFuelItem } from '../domain/accounting-export.js';

export interface IntegrationConnectionRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly displayId: string;
  readonly name: string;
  readonly kind: IntegrationKind;
  readonly provider: string;
  readonly status: IntegrationStatus;
  readonly configuration: Record<string, unknown>;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly disabledAt?: Date | null | undefined;
  readonly lastSuccessfulActivityAt?: Date | null | undefined;
  readonly createdBy: string;
  readonly updatedBy?: string | null | undefined;
  readonly hasActiveSecret?: boolean | undefined;
}

export interface IntegrationSecretRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly connectionId: string;
  readonly keyVersion: number;
  readonly encryptedSecret: string;
  readonly secretHash: string;
  readonly status: string;
  readonly createdAt: Date;
  readonly revokedAt?: Date | null | undefined;
  readonly revokedBy?: string | null | undefined;
}

export interface WebhookSubscriptionRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly connectionId: string;
  readonly endpointUrl: string;
  readonly status: string;
  readonly eventTypes: readonly string[];
  readonly secretReference?: string | null | undefined;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface WebhookDeliveryRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly subscriptionId: string;
  readonly sourceEventId: string;
  readonly eventType: string;
  readonly deliveryStatus: WebhookDeliveryStatus;
  readonly attempts: number;
  readonly nextAttemptAt?: Date | null | undefined;
  readonly deliveredAt?: Date | null | undefined;
  readonly lastHttpStatus?: number | null | undefined;
  readonly lastErrorCode?: string | null | undefined;
  readonly payload: Record<string, unknown>;
  readonly lockedUntil?: Date | null | undefined;
  readonly lockedBy?: string | null | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly attemptsList?: readonly WebhookDeliveryAttemptRecord[] | undefined;
}

export interface WebhookDeliveryAttemptRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly deliveryId: string;
  readonly attemptNumber: number;
  readonly httpStatus?: number | null | undefined;
  readonly durationMs: number;
  readonly errorCode?: string | null | undefined;
  readonly responseExcerpt?: string | null | undefined;
  readonly attemptedAt: Date;
}

export interface InboundReceiptRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly connectionId: string;
  readonly externalEventId: string;
  readonly payloadHash: string;
  readonly status: string;
  readonly processedPositionsCount: number;
  readonly createdAt: Date;
}

export interface IntegrationDeviceMappingRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly connectionId: string;
  readonly providerDeviceId: string;
  readonly telemetryDeviceId: string;
  readonly status: IntegrationMappingStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly telemetryDevice?:
    | {
        readonly id: string;
        readonly displayId: string;
        readonly name: string;
        readonly identifier: string;
      }
    | undefined;
}

export interface FuelCardBatchRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly connectionId: string;
  readonly status: FuelCardImportBatchStatus;
  readonly fileName: string;
  readonly totalRows: number;
  readonly validRows: number;
  readonly importedRows: number;
  readonly errorSummary?: unknown;
  readonly createdAt: Date;
  readonly confirmedAt?: Date | null | undefined;
  readonly confirmedBy?: string | null | undefined;
}

export interface AccountingExportRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly connectionId: string;
  readonly actorId: string;
  readonly format: string;
  readonly fromUtc: Date;
  readonly toUtc: Date;
  readonly rowCount: number;
  readonly createdAt: Date;
}

export interface ListConnectionsFilter {
  readonly kind?: IntegrationKind | undefined;
  readonly status?: IntegrationStatus | undefined;
  readonly search?: string | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

export interface ListDeliveriesFilter {
  readonly status?: WebhookDeliveryStatus | undefined;
  readonly eventType?: string | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

export interface CreateConnectionParams {
  readonly organizationId: string;
  readonly name: string;
  readonly kind: IntegrationKind;
  readonly provider?: string | undefined;
  readonly configuration?: Record<string, unknown> | null | undefined;
  readonly createdBy: string;
}

export interface UpdateConnectionParams {
  readonly name?: string | undefined;
  readonly provider?: string | undefined;
  readonly configuration?: Record<string, unknown> | null | undefined;
  readonly status?: IntegrationStatus | undefined;
  readonly disabledAt?: Date | null | undefined;
  readonly updatedBy: string;
}

export interface AuditLogParams {
  readonly organizationId: string;
  readonly actorId: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly beforeData?: unknown;
  readonly afterData?: unknown;
  readonly requestId?: string | undefined;
  readonly ipAddress?: string | null | undefined;
  readonly userAgent?: string | null | undefined;
}

export interface IntegrationRepository {
  // Connections
  createConnection(
    params: CreateConnectionParams,
    audit?: AuditLogParams | undefined,
  ): Promise<IntegrationConnectionRecord>;
  getConnectionById(orgId: string, id: string): Promise<IntegrationConnectionRecord | null>;
  getConnectionByIdUnscoped(id: string): Promise<IntegrationConnectionRecord | null>;
  listConnections(
    orgId: string,
    filter?: ListConnectionsFilter | undefined,
  ): Promise<{ items: readonly IntegrationConnectionRecord[]; total: number }>;
  updateConnection(
    orgId: string,
    id: string,
    expectedVersion: number,
    data: UpdateConnectionParams,
    audit?: AuditLogParams | undefined,
  ): Promise<IntegrationConnectionRecord>;
  recordActivity(orgId: string, id: string): Promise<void>;

  // Secrets
  createSecret(
    data: {
      organizationId: string;
      connectionId: string;
      keyVersion: number;
      encryptedSecret: string;
      secretHash: string;
    },
    audit?: AuditLogParams | undefined,
  ): Promise<IntegrationSecretRecord>;
  getActiveSecret(orgId: string, connectionId: string): Promise<IntegrationSecretRecord | null>;
  listSecrets(orgId: string, connectionId: string): Promise<readonly IntegrationSecretRecord[]>;
  revokeSecret(
    orgId: string,
    secretId: string,
    revokedBy: string,
    audit?: AuditLogParams | undefined,
  ): Promise<void>;
  revokeAllActiveSecrets(
    orgId: string,
    connectionId: string,
    revokedBy: string,
    audit?: AuditLogParams | undefined,
  ): Promise<void>;

  // Webhook subscriptions
  createSubscription(
    data: {
      organizationId: string;
      connectionId: string;
      endpointUrl: string;
      eventTypes: readonly string[];
      secretReference?: string | null | undefined;
    },
    audit?: AuditLogParams | undefined,
  ): Promise<WebhookSubscriptionRecord>;
  getSubscriptionById(orgId: string, id: string): Promise<WebhookSubscriptionRecord | null>;
  listSubscriptions(
    orgId: string,
    connectionId: string,
  ): Promise<readonly WebhookSubscriptionRecord[]>;
  deleteSubscription(orgId: string, id: string, audit?: AuditLogParams | undefined): Promise<void>;
  listActiveSubscriptionsForEvent(
    orgId: string,
    eventType: string,
  ): Promise<readonly WebhookSubscriptionRecord[]>;

  // Webhook deliveries
  createDelivery(data: {
    organizationId: string;
    subscriptionId: string;
    sourceEventId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<WebhookDeliveryRecord>;
  getDeliveryById(orgId: string, id: string): Promise<WebhookDeliveryRecord | null>;
  listDeliveries(
    orgId: string,
    connectionId: string,
    filter?: ListDeliveriesFilter | undefined,
  ): Promise<{ items: readonly WebhookDeliveryRecord[]; total: number }>;
  recordDeliveryAttempt(data: {
    organizationId: string;
    deliveryId: string;
    attemptNumber: number;
    httpStatus?: number | null | undefined;
    durationMs: number;
    errorCode?: string | null | undefined;
    responseExcerpt?: string | null | undefined;
    status: WebhookDeliveryStatus;
    nextAttemptAt?: Date | null | undefined;
    deliveredAt?: Date | null | undefined;
  }): Promise<void>;
  resetDeliveryForRetry(
    orgId: string,
    deliveryId: string,
    audit?: AuditLogParams | undefined,
  ): Promise<WebhookDeliveryRecord>;

  // Telematics receipts
  findReceipt(
    orgId: string,
    connectionId: string,
    externalEventId: string,
  ): Promise<InboundReceiptRecord | null>;
  createReceipt(data: {
    organizationId: string;
    connectionId: string;
    externalEventId: string;
    payloadHash: string;
    status?: string | undefined;
    processedPositionsCount?: number | undefined;
  }): Promise<InboundReceiptRecord>;
  updateReceiptStatus(
    orgId: string,
    id: string,
    status: string,
    processedCount: number,
  ): Promise<void>;
  ingestTelematicsBatchAtomic(params: {
    organizationId: string;
    connectionId: string;
    externalEventId: string;
    payloadHash: string;
    positions: ReadonlyArray<{
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
  }): Promise<{
    receipt: InboundReceiptRecord;
    processedCount: number;
    duplicate: boolean;
  }>;

  // Device mappings
  upsertDeviceMapping(
    data: {
      organizationId: string;
      connectionId: string;
      providerDeviceId: string;
      telemetryDeviceId: string;
      status?: IntegrationMappingStatus | undefined;
    },
    audit?: AuditLogParams | undefined,
  ): Promise<IntegrationDeviceMappingRecord>;
  getDeviceMapping(
    orgId: string,
    connectionId: string,
    providerDeviceId: string,
  ): Promise<IntegrationDeviceMappingRecord | null>;
  listDeviceMappings(
    orgId: string,
    connectionId: string,
  ): Promise<readonly IntegrationDeviceMappingRecord[]>;

  // Fuel card batch
  createFuelCardBatch(data: {
    organizationId: string;
    connectionId: string;
    fileName: string;
    totalRows: number;
    validRows: number;
    errorSummary?: unknown;
  }): Promise<FuelCardBatchRecord>;
  getFuelCardBatchById(orgId: string, id: string): Promise<FuelCardBatchRecord | null>;
  listFuelCardBatches(orgId: string, connectionId: string): Promise<readonly FuelCardBatchRecord[]>;
  confirmFuelCardBatch(
    orgId: string,
    id: string,
    confirmedBy: string,
    importedRows: number,
    audit?: AuditLogParams | undefined,
  ): Promise<FuelCardBatchRecord>;
  createExternalTransactionIdentity(data: {
    organizationId: string;
    connectionId: string;
    externalTransactionId: string;
    fuelTransactionId: string;
  }): Promise<void>;
  findExternalTransaction(
    orgId: string,
    connectionId: string,
    externalTransactionId: string,
  ): Promise<boolean>;
  findVehicleByRegistration(
    orgId: string,
    registration: string,
  ): Promise<{ id: string; displayId: string; registration: string; model: string } | null>;

  // Accounting export
  findPostedTransactionsForExport(
    orgId: string,
    fromUtc: Date,
    toUtc: Date,
    currencyCode?: string | undefined,
  ): Promise<{
    readonly expenses: readonly ExportExpenseItem[];
    readonly fuelTransactions: readonly ExportFuelItem[];
  }>;
  logAccountingExport(
    data: {
      organizationId: string;
      connectionId: string;
      actorId: string;
      format: string;
      fromUtc: Date;
      toUtc: Date;
      rowCount: number;
    },
    audit?: AuditLogParams | undefined,
  ): Promise<AccountingExportRecord>;
  listAccountingExports(
    orgId: string,
    connectionId: string,
  ): Promise<readonly AccountingExportRecord[]>;

  // General audit
  recordAuditLog(params: AuditLogParams): Promise<void>;
}
