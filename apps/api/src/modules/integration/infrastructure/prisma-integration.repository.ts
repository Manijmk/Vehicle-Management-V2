import { Inject, Injectable } from '@nestjs/common';
import {
  ExpenseStatus,
  FuelTransactionStatus,
  IntegrationMappingStatus,
  Prisma,
  type PrismaClient,
} from '@vms/database';
import { DATABASE } from '../../../common/tokens.js';
import type {
  AccountingExportRecord,
  AuditLogParams,
  CreateConnectionParams,
  FuelCardBatchRecord,
  InboundReceiptRecord,
  IntegrationConnectionRecord,
  IntegrationDeviceMappingRecord,
  IntegrationRepository,
  IntegrationSecretRecord,
  ListConnectionsFilter,
  ListDeliveriesFilter,
  UpdateConnectionParams,
  WebhookDeliveryRecord,
  WebhookSubscriptionRecord,
} from '../application/integration.repository.js';
import type { ExportExpenseItem, ExportFuelItem } from '../domain/accounting-export.js';
import {
  InboundTelematicsReplayConflictError,
  IntegrationConcurrencyError,
  WebhookDeliveryNotRetryableError,
} from '../domain/integration-errors.js';
import { ApplicationError } from '../../foundation/domain/errors.js';

@Injectable()
export class PrismaIntegrationRepository implements IntegrationRepository {
  constructor(@Inject(DATABASE) private readonly database: PrismaClient) {}

  // ---------------------------------------------------------------------------
  // Connections
  // ---------------------------------------------------------------------------

  async createConnection(
    params: CreateConnectionParams,
    audit?: AuditLogParams,
  ): Promise<IntegrationConnectionRecord> {
    const existing = await this.database.integrationConnection.findMany({
      where: { organizationId: params.organizationId },
      select: { displayId: true },
    });

    let maxNum = 0;
    for (const item of existing) {
      const match = /^INT-(\d+)$/i.exec(item.displayId);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) {
          maxNum = num;
        }
      }
    }
    const displayId = `INT-${maxNum + 1}`;

    const created = await this.database.$transaction(async (tx) => {
      const conn = await tx.integrationConnection.create({
        data: {
          organizationId: params.organizationId,
          displayId,
          name: params.name,
          kind: params.kind,
          provider: params.provider ?? 'CUSTOM',
          configuration: (params.configuration ?? {}) as Prisma.InputJsonValue,
          createdBy: params.createdBy,
        },
      });

      if (audit) {
        await tx.auditLog.create({
          data: {
            organizationId: audit.organizationId,
            actorId: audit.actorId,
            action: audit.action,
            entityType: audit.entityType,
            entityId: conn.id,
            ...(audit.beforeData ? { beforeData: audit.beforeData as Prisma.InputJsonValue } : {}),
            afterData: {
              id: conn.id,
              displayId: conn.displayId,
              name: conn.name,
              kind: conn.kind,
              provider: conn.provider,
              status: conn.status,
            } as Prisma.InputJsonValue,
            requestId: audit.requestId ?? 'system',
            ipAddress: audit.ipAddress ?? null,
            userAgent: audit.userAgent ?? null,
          },
        });
      }

      return conn;
    });

    return {
      ...created,
      configuration: (created.configuration ?? {}) as Record<string, unknown>,
    };
  }

  async getConnectionById(orgId: string, id: string): Promise<IntegrationConnectionRecord | null> {
    const conn = await this.database.integrationConnection.findFirst({
      where: { id, organizationId: orgId },
      include: {
        secrets: {
          where: { status: 'ACTIVE' },
          select: { id: true },
        },
      },
    });

    if (!conn) {
      return null;
    }

    return {
      id: conn.id,
      organizationId: conn.organizationId,
      displayId: conn.displayId,
      name: conn.name,
      kind: conn.kind,
      provider: conn.provider,
      status: conn.status,
      configuration: (conn.configuration ?? {}) as Record<string, unknown>,
      version: conn.version,
      createdAt: conn.createdAt,
      updatedAt: conn.updatedAt,
      disabledAt: conn.disabledAt,
      lastSuccessfulActivityAt: conn.lastSuccessfulActivityAt,
      createdBy: conn.createdBy,
      updatedBy: conn.updatedBy,
      hasActiveSecret: conn.secrets.length > 0,
    };
  }

  async getConnectionByIdUnscoped(id: string): Promise<IntegrationConnectionRecord | null> {
    const conn = await this.database.integrationConnection.findUnique({
      where: { id },
      include: {
        secrets: {
          where: { status: 'ACTIVE' },
          select: { id: true },
        },
      },
    });

    if (!conn) {
      return null;
    }

    return {
      id: conn.id,
      organizationId: conn.organizationId,
      displayId: conn.displayId,
      name: conn.name,
      kind: conn.kind,
      provider: conn.provider,
      status: conn.status,
      configuration: (conn.configuration ?? {}) as Record<string, unknown>,
      version: conn.version,
      createdAt: conn.createdAt,
      updatedAt: conn.updatedAt,
      disabledAt: conn.disabledAt,
      lastSuccessfulActivityAt: conn.lastSuccessfulActivityAt,
      createdBy: conn.createdBy,
      updatedBy: conn.updatedBy,
      hasActiveSecret: conn.secrets.length > 0,
    };
  }

  async listConnections(
    orgId: string,
    filter?: ListConnectionsFilter,
  ): Promise<{ items: readonly IntegrationConnectionRecord[]; total: number }> {
    const where: Prisma.IntegrationConnectionWhereInput = {
      organizationId: orgId,
      ...(filter?.kind ? { kind: filter.kind } : {}),
      ...(filter?.status ? { status: filter.status } : {}),
      ...(filter?.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { displayId: { contains: filter.search, mode: 'insensitive' } },
              { provider: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.database.integrationConnection.count({ where }),
      this.database.integrationConnection.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filter?.limit ?? 50,
        skip: filter?.offset ?? 0,
        include: {
          secrets: {
            where: { status: 'ACTIVE' },
            select: { id: true },
          },
        },
      }),
    ]);

    return {
      total,
      items: items.map((conn) => ({
        id: conn.id,
        organizationId: conn.organizationId,
        displayId: conn.displayId,
        name: conn.name,
        kind: conn.kind,
        provider: conn.provider,
        status: conn.status,
        configuration: (conn.configuration ?? {}) as Record<string, unknown>,
        version: conn.version,
        createdAt: conn.createdAt,
        updatedAt: conn.updatedAt,
        disabledAt: conn.disabledAt,
        lastSuccessfulActivityAt: conn.lastSuccessfulActivityAt,
        createdBy: conn.createdBy,
        updatedBy: conn.updatedBy,
        hasActiveSecret: conn.secrets.length > 0,
      })),
    };
  }

  async updateConnection(
    orgId: string,
    id: string,
    expectedVersion: number,
    data: UpdateConnectionParams,
    audit?: AuditLogParams,
  ): Promise<IntegrationConnectionRecord> {
    return this.database.$transaction(async (tx) => {
      const existing = await tx.integrationConnection.findFirst({
        where: { id, organizationId: orgId },
      });

      if (!existing) {
        throw new Error(`Integration connection ${id} not found`);
      }

      if (existing.version !== expectedVersion) {
        throw new IntegrationConcurrencyError(id, existing.version, expectedVersion);
      }

      const updated = await tx.integrationConnection.update({
        where: { id },
        data: {
          name: data.name ?? existing.name,
          provider: data.provider ?? existing.provider,
          configuration:
            data.configuration !== undefined
              ? (data.configuration as Prisma.InputJsonValue)
              : (existing.configuration as Prisma.InputJsonValue),
          status: data.status ?? existing.status,
          disabledAt: data.disabledAt !== undefined ? data.disabledAt : existing.disabledAt,
          updatedBy: data.updatedBy,
          version: existing.version + 1,
        },
      });

      if (audit) {
        await tx.auditLog.create({
          data: {
            organizationId: audit.organizationId,
            actorId: audit.actorId,
            action: audit.action,
            entityType: audit.entityType,
            entityId: id,
            beforeData: (audit.beforeData ?? existing) as Prisma.InputJsonValue,
            afterData: (audit.afterData ?? updated) as Prisma.InputJsonValue,
            requestId: audit.requestId ?? 'system',
            ipAddress: audit.ipAddress ?? null,
            userAgent: audit.userAgent ?? null,
          },
        });
      }

      return {
        ...updated,
        configuration: (updated.configuration ?? {}) as Record<string, unknown>,
      };
    });
  }

  async recordActivity(orgId: string, id: string): Promise<void> {
    await this.database.integrationConnection.updateMany({
      where: { id, organizationId: orgId },
      data: { lastSuccessfulActivityAt: new Date() },
    });
  }

  // ---------------------------------------------------------------------------
  // Secrets
  // ---------------------------------------------------------------------------

  async createSecret(
    data: {
      organizationId: string;
      connectionId: string;
      keyVersion: number;
      encryptedSecret: string;
      secretHash: string;
    },
    audit?: AuditLogParams,
  ): Promise<IntegrationSecretRecord> {
    return this.database.$transaction(async (tx) => {
      const secret = await tx.integrationSecret.create({
        data: {
          organizationId: data.organizationId,
          connectionId: data.connectionId,
          keyVersion: data.keyVersion,
          encryptedSecret: data.encryptedSecret,
          secretHash: data.secretHash,
          status: 'ACTIVE',
        },
      });

      if (audit) {
        await tx.auditLog.create({
          data: {
            organizationId: audit.organizationId,
            actorId: audit.actorId,
            action: audit.action,
            entityType: audit.entityType,
            entityId: secret.id,
            ...(audit.beforeData ? { beforeData: audit.beforeData as Prisma.InputJsonValue } : {}),
            afterData: {
              id: secret.id,
              connectionId: secret.connectionId,
              keyVersion: secret.keyVersion,
              status: secret.status,
            } as Prisma.InputJsonValue,
            requestId: audit.requestId ?? 'system',
            ipAddress: audit.ipAddress ?? null,
            userAgent: audit.userAgent ?? null,
          },
        });
      }

      return secret;
    });
  }

  async getActiveSecret(
    orgId: string,
    connectionId: string,
  ): Promise<IntegrationSecretRecord | null> {
    return this.database.integrationSecret.findFirst({
      where: {
        organizationId: orgId,
        connectionId,
        status: 'ACTIVE',
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listSecrets(
    orgId: string,
    connectionId: string,
  ): Promise<readonly IntegrationSecretRecord[]> {
    return this.database.integrationSecret.findMany({
      where: { organizationId: orgId, connectionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeSecret(
    orgId: string,
    secretId: string,
    revokedBy: string,
    audit?: AuditLogParams,
  ): Promise<void> {
    await this.database.$transaction(async (tx) => {
      const secret = await tx.integrationSecret.findFirst({
        where: { id: secretId, organizationId: orgId },
      });

      if (!secret) {
        return;
      }

      await tx.integrationSecret.update({
        where: { id: secretId },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokedBy,
        },
      });

      if (audit) {
        await tx.auditLog.create({
          data: {
            organizationId: audit.organizationId,
            actorId: audit.actorId,
            action: audit.action,
            entityType: audit.entityType,
            entityId: secretId,
            beforeData: { status: secret.status } as Prisma.InputJsonValue,
            afterData: { status: 'REVOKED', revokedBy } as Prisma.InputJsonValue,
            requestId: audit.requestId ?? 'system',
            ipAddress: audit.ipAddress ?? null,
            userAgent: audit.userAgent ?? null,
          },
        });
      }
    });
  }

  async revokeAllActiveSecrets(
    orgId: string,
    connectionId: string,
    revokedBy: string,
    audit?: AuditLogParams,
  ): Promise<void> {
    await this.database.$transaction(async (tx) => {
      const activeSecrets = await tx.integrationSecret.findMany({
        where: { organizationId: orgId, connectionId, status: 'ACTIVE' },
      });

      if (activeSecrets.length === 0) {
        return;
      }

      await tx.integrationSecret.updateMany({
        where: { organizationId: orgId, connectionId, status: 'ACTIVE' },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokedBy,
        },
      });

      if (audit) {
        await tx.auditLog.create({
          data: {
            organizationId: audit.organizationId,
            actorId: audit.actorId,
            action: audit.action,
            entityType: audit.entityType,
            entityId: connectionId,
            beforeData: { revokedCount: activeSecrets.length } as Prisma.InputJsonValue,
            afterData: { status: 'REVOKED', revokedBy } as Prisma.InputJsonValue,
            requestId: audit.requestId ?? 'system',
            ipAddress: audit.ipAddress ?? null,
            userAgent: audit.userAgent ?? null,
          },
        });
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Webhook Subscriptions
  // ---------------------------------------------------------------------------

  async createSubscription(
    data: {
      organizationId: string;
      connectionId: string;
      endpointUrl: string;
      eventTypes: readonly string[];
      secretReference?: string | null | undefined;
    },
    audit?: AuditLogParams,
  ): Promise<WebhookSubscriptionRecord> {
    return this.database.$transaction(async (tx) => {
      const sub = await tx.webhookSubscription.create({
        data: {
          organizationId: data.organizationId,
          connectionId: data.connectionId,
          endpointUrl: data.endpointUrl,
          eventTypes: [...data.eventTypes],
          secretReference: data.secretReference ?? null,
          status: 'ACTIVE',
        },
      });

      if (audit) {
        await tx.auditLog.create({
          data: {
            organizationId: audit.organizationId,
            actorId: audit.actorId,
            action: audit.action,
            entityType: audit.entityType,
            entityId: sub.id,
            afterData: {
              id: sub.id,
              connectionId: sub.connectionId,
              endpointUrl: sub.endpointUrl,
              eventTypes: sub.eventTypes,
            } as Prisma.InputJsonValue,
            requestId: audit.requestId ?? 'system',
            ipAddress: audit.ipAddress ?? null,
            userAgent: audit.userAgent ?? null,
          },
        });
      }

      return sub;
    });
  }

  async getSubscriptionById(orgId: string, id: string): Promise<WebhookSubscriptionRecord | null> {
    return this.database.webhookSubscription.findFirst({
      where: { id, organizationId: orgId },
    });
  }

  async listSubscriptions(
    orgId: string,
    connectionId: string,
  ): Promise<readonly WebhookSubscriptionRecord[]> {
    return this.database.webhookSubscription.findMany({
      where: { organizationId: orgId, connectionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteSubscription(orgId: string, id: string, audit?: AuditLogParams): Promise<void> {
    await this.database.$transaction(async (tx) => {
      const sub = await tx.webhookSubscription.findFirst({
        where: { id, organizationId: orgId },
      });

      if (!sub) {
        return;
      }

      await tx.webhookSubscription.delete({
        where: { id },
      });

      if (audit) {
        await tx.auditLog.create({
          data: {
            organizationId: audit.organizationId,
            actorId: audit.actorId,
            action: audit.action,
            entityType: audit.entityType,
            entityId: id,
            beforeData: {
              id: sub.id,
              endpointUrl: sub.endpointUrl,
              eventTypes: sub.eventTypes,
            } as Prisma.InputJsonValue,
            requestId: audit.requestId ?? 'system',
            ipAddress: audit.ipAddress ?? null,
            userAgent: audit.userAgent ?? null,
          },
        });
      }
    });
  }

  async listActiveSubscriptionsForEvent(
    orgId: string,
    eventType: string,
  ): Promise<readonly WebhookSubscriptionRecord[]> {
    const subscriptions = await this.database.webhookSubscription.findMany({
      where: {
        organizationId: orgId,
        status: 'ACTIVE',
        connection: {
          status: 'ACTIVE',
        },
      },
    });

    return subscriptions.filter(
      (sub) => sub.eventTypes.includes('*') || sub.eventTypes.includes(eventType),
    );
  }

  // ---------------------------------------------------------------------------
  // Webhook Deliveries
  // ---------------------------------------------------------------------------

  async createDelivery(data: {
    organizationId: string;
    subscriptionId: string;
    sourceEventId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<WebhookDeliveryRecord> {
    const delivery = await this.database.webhookDelivery.create({
      data: {
        organizationId: data.organizationId,
        subscriptionId: data.subscriptionId,
        sourceEventId: data.sourceEventId,
        eventType: data.eventType,
        payload: data.payload as Prisma.InputJsonValue,
        deliveryStatus: 'PENDING',
        attempts: 0,
        nextAttemptAt: new Date(),
      },
    });

    return {
      ...delivery,
      payload: delivery.payload as Record<string, unknown>,
    };
  }

  async getDeliveryById(orgId: string, id: string): Promise<WebhookDeliveryRecord | null> {
    const delivery = await this.database.webhookDelivery.findFirst({
      where: { id, organizationId: orgId },
      include: {
        attemptsList: {
          orderBy: { attemptedAt: 'asc' },
        },
      },
    });

    if (!delivery) {
      return null;
    }

    return {
      ...delivery,
      payload: delivery.payload as Record<string, unknown>,
      attemptsList: delivery.attemptsList,
    };
  }

  async listDeliveries(
    orgId: string,
    connectionId: string,
    filter?: ListDeliveriesFilter,
  ): Promise<{ items: readonly WebhookDeliveryRecord[]; total: number }> {
    const where: Prisma.WebhookDeliveryWhereInput = {
      organizationId: orgId,
      subscription: {
        connectionId,
      },
      ...(filter?.status ? { deliveryStatus: filter.status } : {}),
      ...(filter?.eventType ? { eventType: filter.eventType } : {}),
    };

    const [total, items] = await Promise.all([
      this.database.webhookDelivery.count({ where }),
      this.database.webhookDelivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filter?.limit ?? 50,
        skip: filter?.offset ?? 0,
        include: {
          attemptsList: {
            orderBy: { attemptedAt: 'desc' },
            take: 1,
          },
        },
      }),
    ]);

    return {
      total,
      items: items.map((d) => ({
        ...d,
        payload: d.payload as Record<string, unknown>,
        attemptsList: d.attemptsList,
      })),
    };
  }

  async recordDeliveryAttempt(data: {
    organizationId: string;
    deliveryId: string;
    attemptNumber: number;
    httpStatus?: number | null | undefined;
    durationMs: number;
    errorCode?: string | null | undefined;
    responseExcerpt?: string | null | undefined;
    status: WebhookDeliveryRecord['deliveryStatus'];
    nextAttemptAt?: Date | null | undefined;
    deliveredAt?: Date | null | undefined;
  }): Promise<void> {
    await this.database.$transaction(async (tx) => {
      await tx.webhookDeliveryAttempt.create({
        data: {
          organizationId: data.organizationId,
          deliveryId: data.deliveryId,
          attemptNumber: data.attemptNumber,
          httpStatus: data.httpStatus ?? null,
          durationMs: data.durationMs,
          errorCode: data.errorCode ?? null,
          responseExcerpt: data.responseExcerpt ?? null,
        },
      });

      await tx.webhookDelivery.update({
        where: { id: data.deliveryId },
        data: {
          deliveryStatus: data.status,
          attempts: data.attemptNumber,
          lastHttpStatus: data.httpStatus ?? null,
          lastErrorCode: data.errorCode ?? null,
          nextAttemptAt: data.nextAttemptAt ?? null,
          deliveredAt: data.deliveredAt ?? null,
          lockedUntil: null,
          lockedBy: null,
        },
      });
    });
  }

  async resetDeliveryForRetry(
    orgId: string,
    deliveryId: string,
    audit?: AuditLogParams,
  ): Promise<WebhookDeliveryRecord> {
    return this.database.$transaction(async (tx) => {
      const delivery = await tx.webhookDelivery.findFirst({
        where: { id: deliveryId, organizationId: orgId },
      });

      if (!delivery) {
        throw new Error(`Webhook delivery ${deliveryId} not found`);
      }

      if (delivery.lockedUntil && delivery.lockedUntil > new Date()) {
        throw new WebhookDeliveryNotRetryableError(
          `Webhook delivery ${deliveryId} is currently actively leased by worker ${delivery.lockedBy ?? 'unknown'}`,
        );
      }

      if (delivery.deliveryStatus === 'SUCCESS') {
        throw new WebhookDeliveryNotRetryableError(
          `Webhook delivery ${deliveryId} has already succeeded and cannot be retried`,
        );
      }

      const updated = await tx.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          deliveryStatus: 'PENDING',
          nextAttemptAt: new Date(),
          lockedUntil: null,
          lockedBy: null,
        },
      });

      if (audit) {
        await tx.auditLog.create({
          data: {
            organizationId: audit.organizationId,
            actorId: audit.actorId,
            action: audit.action,
            entityType: audit.entityType,
            entityId: deliveryId,
            beforeData: { deliveryStatus: delivery.deliveryStatus } as Prisma.InputJsonValue,
            afterData: { deliveryStatus: 'PENDING' } as Prisma.InputJsonValue,
            requestId: audit.requestId ?? 'system',
            ipAddress: audit.ipAddress ?? null,
            userAgent: audit.userAgent ?? null,
          },
        });
      }

      return {
        ...updated,
        payload: updated.payload as Record<string, unknown>,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Telematics Receipts
  // ---------------------------------------------------------------------------

  async findReceipt(
    orgId: string,
    connectionId: string,
    externalEventId: string,
  ): Promise<InboundReceiptRecord | null> {
    return this.database.inboundIntegrationReceipt.findFirst({
      where: {
        organizationId: orgId,
        connectionId,
        externalEventId,
      },
    });
  }

  async createReceipt(data: {
    organizationId: string;
    connectionId: string;
    externalEventId: string;
    payloadHash: string;
    status?: string | undefined;
    processedPositionsCount?: number | undefined;
  }): Promise<InboundReceiptRecord> {
    return this.database.inboundIntegrationReceipt.create({
      data: {
        organizationId: data.organizationId,
        connectionId: data.connectionId,
        externalEventId: data.externalEventId,
        payloadHash: data.payloadHash,
        status: data.status ?? 'PENDING',
        processedPositionsCount: data.processedPositionsCount ?? 0,
      },
    });
  }

  async updateReceiptStatus(
    orgId: string,
    id: string,
    status: string,
    processedCount: number,
  ): Promise<void> {
    await this.database.inboundIntegrationReceipt.updateMany({
      where: { id, organizationId: orgId },
      data: {
        status,
        processedPositionsCount: processedCount,
      },
    });
  }

  async ingestTelematicsBatchAtomic(params: {
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
  }> {
    // 1. Check existing receipt for duplicate
    const existing = await this.findReceipt(
      params.organizationId,
      params.connectionId,
      params.externalEventId,
    );
    if (existing) {
      if (existing.payloadHash !== params.payloadHash) {
        throw new InboundTelematicsReplayConflictError();
      }
      return {
        receipt: existing,
        processedCount: existing.processedPositionsCount,
        duplicate: true,
      };
    }

    // 2. Perform atomic insert inside a single database transaction
    try {
      return await this.database.$transaction(async (tx) => {
        // A. Create the receipt inside tx
        const receipt = await tx.inboundIntegrationReceipt.create({
          data: {
            organizationId: params.organizationId,
            connectionId: params.connectionId,
            externalEventId: params.externalEventId,
            payloadHash: params.payloadHash,
            status: 'PROCESSED',
            processedPositionsCount: params.positions.length,
          },
        });

        // B. Resolve devices, validate assignments, and insert each position
        let count = 0;
        for (const pos of params.positions) {
          let resolvedDeviceId = pos.deviceId;
          if (pos.providerDeviceId) {
            const mapping = await tx.integrationDeviceMapping.findFirst({
              where: {
                organizationId: params.organizationId,
                connectionId: params.connectionId,
                providerDeviceId: pos.providerDeviceId,
                status: 'ACTIVE',
              },
            });
            if (mapping) {
              resolvedDeviceId = mapping.telemetryDeviceId;
            }
          }

          if (!resolvedDeviceId) {
            throw new ApplicationError(
              'TELEMETRY_DEVICE_NOT_FOUND',
              `Device mapping not found for providerDeviceId: ${pos.providerDeviceId ?? 'none'}`,
            );
          }

          const device = await tx.telemetryDevice.findFirst({
            where: { id: resolvedDeviceId, organizationId: params.organizationId },
          });
          if (!device || device.status !== 'ACTIVE') {
            throw new ApplicationError(
              'TELEMETRY_DEVICE_INACTIVE',
              `Device ${resolvedDeviceId} is inactive or not found`,
            );
          }

          const assignment = await tx.telemetryDeviceVehicleAssignment.findFirst({
            where: {
              deviceId: resolvedDeviceId,
              organizationId: params.organizationId,
              unassignedAt: null,
            },
          });
          if (!assignment) {
            throw new ApplicationError(
              'TELEMETRY_DEVICE_NOT_ASSIGNED',
              `Device ${resolvedDeviceId} is not actively assigned to any vehicle`,
            );
          }

          const vehicleId = assignment.vehicleId;
          const capturedAt = new Date(pos.capturedAt);
          const receivedAt = new Date();

          if (Number.isNaN(capturedAt.getTime())) {
            throw new ApplicationError('VALIDATION_ERROR', 'Invalid capturedAt timestamp');
          }

          // Correlate historical or active trip if any at capturedAt
          const trip = await tx.trip.findFirst({
            where: {
              organizationId: params.organizationId,
              vehicleId,
              actualStartAt: { lte: capturedAt },
              OR: [
                { actualEndAt: { gte: capturedAt } },
                { actualEndAt: null, status: 'IN_PROGRESS' },
              ],
            },
            select: { id: true },
            orderBy: { actualStartAt: 'desc' },
          });

          // Check existing current position for out-of-order classification
          const existingCurrent = await tx.telemetryCurrentPosition.findUnique({
            where: {
              organizationId_vehicleId: {
                organizationId: params.organizationId,
                vehicleId,
              },
            },
            select: { capturedAt: true },
          });

          const isOutOfOrder =
            existingCurrent != null && capturedAt.getTime() < existingCurrent.capturedAt.getTime();
          const status = isOutOfOrder ? 'OUT_OF_ORDER' : 'VALID';

          const positionRow = await tx.telemetryPosition.create({
            data: {
              organizationId: params.organizationId,
              deviceId: resolvedDeviceId,
              vehicleId,
              tripId: trip?.id ?? null,
              capturedAt,
              receivedAt,
              latitude: new Prisma.Decimal(pos.latitude),
              longitude: new Prisma.Decimal(pos.longitude),
              speedKmh: pos.speedKmh != null ? new Prisma.Decimal(pos.speedKmh) : null,
              heading: pos.heading != null ? new Prisma.Decimal(pos.heading) : null,
              altitudeM: pos.altitudeM != null ? new Prisma.Decimal(pos.altitudeM) : null,
              accuracyM: pos.accuracyM != null ? new Prisma.Decimal(pos.accuracyM) : null,
              ignition: pos.ignition ?? null,
              odometerKm: pos.odometerKm ?? null,
              source: 'WEBHOOK',
              status,
              providerMessageId: pos.providerMessageId ?? null,
              rawMetadata: (pos.rawMetadata ?? Prisma.DbNull) as Prisma.InputJsonValue,
            },
          });

          // Update current position projection atomically (tie-breaker: newer captured_at wins, then received_at)
          await tx.$executeRawUnsafe(
            `INSERT INTO "telemetry_current_positions" (
              "organization_id", "vehicle_id", "device_id", "position_id",
              "latitude", "longitude", "speed_kmh", "heading", "ignition", "odometer_km",
              "captured_at", "received_at", "source", "status", "updated_at"
            ) VALUES (
              $1::uuid, $2::uuid, $3::uuid, $4::uuid,
              $5, $6, $7, $8, $9, $10,
              $11::timestamptz, $12::timestamptz, 'WEBHOOK'::"TelemetrySource", $13::"TelemetryPositionStatus", NOW()
            )
            ON CONFLICT ("organization_id", "vehicle_id")
            DO UPDATE SET
              "device_id" = EXCLUDED."device_id",
              "position_id" = EXCLUDED."position_id",
              "latitude" = EXCLUDED."latitude",
              "longitude" = EXCLUDED."longitude",
              "speed_kmh" = EXCLUDED."speed_kmh",
              "heading" = EXCLUDED."heading",
              "ignition" = EXCLUDED."ignition",
              "odometer_km" = EXCLUDED."odometer_km",
              "captured_at" = EXCLUDED."captured_at",
              "received_at" = EXCLUDED."received_at",
              "source" = EXCLUDED."source",
              "status" = EXCLUDED."status",
              "updated_at" = NOW()
            WHERE EXCLUDED."captured_at" > "telemetry_current_positions"."captured_at"
               OR (EXCLUDED."captured_at" = "telemetry_current_positions"."captured_at" AND EXCLUDED."received_at" > "telemetry_current_positions"."received_at")`,
            params.organizationId,
            vehicleId,
            resolvedDeviceId,
            positionRow.id,
            pos.latitude,
            pos.longitude,
            pos.speedKmh ?? null,
            pos.heading ?? null,
            pos.ignition ?? null,
            pos.odometerKm ?? null,
            capturedAt.toISOString(),
            receivedAt.toISOString(),
            status,
          );

          count++;
        }

        return { receipt, processedCount: count, duplicate: false };
      });
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        const winnerReceipt = await this.findReceipt(
          params.organizationId,
          params.connectionId,
          params.externalEventId,
        );
        if (winnerReceipt) {
          if (winnerReceipt.payloadHash !== params.payloadHash) {
            throw new InboundTelematicsReplayConflictError();
          }
          return {
            receipt: winnerReceipt,
            processedCount: winnerReceipt.processedPositionsCount,
            duplicate: true,
          };
        }
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Device Mappings
  // ---------------------------------------------------------------------------

  async upsertDeviceMapping(
    data: {
      organizationId: string;
      connectionId: string;
      providerDeviceId: string;
      telemetryDeviceId: string;
      status?: IntegrationMappingStatus | undefined;
    },
    audit?: AuditLogParams,
  ): Promise<IntegrationDeviceMappingRecord> {
    return this.database.$transaction(async (tx) => {
      const mapping = await tx.integrationDeviceMapping.upsert({
        where: {
          organizationId_connectionId_providerDeviceId: {
            organizationId: data.organizationId,
            connectionId: data.connectionId,
            providerDeviceId: data.providerDeviceId,
          },
        },
        update: {
          telemetryDeviceId: data.telemetryDeviceId,
          status: data.status ?? IntegrationMappingStatus.ACTIVE,
        },
        create: {
          organizationId: data.organizationId,
          connectionId: data.connectionId,
          providerDeviceId: data.providerDeviceId,
          telemetryDeviceId: data.telemetryDeviceId,
          status: data.status ?? IntegrationMappingStatus.ACTIVE,
        },
        include: {
          telemetryDevice: {
            select: {
              id: true,
              displayId: true,
              name: true,
              identifier: true,
            },
          },
        },
      });

      if (audit) {
        await tx.auditLog.create({
          data: {
            organizationId: audit.organizationId,
            actorId: audit.actorId,
            action: audit.action,
            entityType: audit.entityType,
            entityId: mapping.id,
            afterData: {
              id: mapping.id,
              connectionId: mapping.connectionId,
              providerDeviceId: mapping.providerDeviceId,
              telemetryDeviceId: mapping.telemetryDeviceId,
            } as Prisma.InputJsonValue,
            requestId: audit.requestId ?? 'system',
            ipAddress: audit.ipAddress ?? null,
            userAgent: audit.userAgent ?? null,
          },
        });
      }

      return mapping;
    });
  }

  async getDeviceMapping(
    orgId: string,
    connectionId: string,
    providerDeviceId: string,
  ): Promise<IntegrationDeviceMappingRecord | null> {
    return this.database.integrationDeviceMapping.findFirst({
      where: {
        organizationId: orgId,
        connectionId,
        providerDeviceId,
        status: IntegrationMappingStatus.ACTIVE,
      },
      include: {
        telemetryDevice: {
          select: {
            id: true,
            displayId: true,
            name: true,
            identifier: true,
          },
        },
      },
    });
  }

  async listDeviceMappings(
    orgId: string,
    connectionId: string,
  ): Promise<readonly IntegrationDeviceMappingRecord[]> {
    return this.database.integrationDeviceMapping.findMany({
      where: { organizationId: orgId, connectionId },
      orderBy: { createdAt: 'desc' },
      include: {
        telemetryDevice: {
          select: {
            id: true,
            displayId: true,
            name: true,
            identifier: true,
          },
        },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Fuel Card Batch & Identity
  // ---------------------------------------------------------------------------

  async createFuelCardBatch(data: {
    organizationId: string;
    connectionId: string;
    fileName: string;
    totalRows: number;
    validRows: number;
    errorSummary?: unknown;
  }): Promise<FuelCardBatchRecord> {
    return this.database.fuelCardImportBatch.create({
      data: {
        organizationId: data.organizationId,
        connectionId: data.connectionId,
        fileName: data.fileName,
        totalRows: data.totalRows,
        validRows: data.validRows,
        status: 'PREVIEWED',
        errorSummary: (data.errorSummary ?? null) as Prisma.InputJsonValue,
      },
    });
  }

  async getFuelCardBatchById(orgId: string, id: string): Promise<FuelCardBatchRecord | null> {
    return this.database.fuelCardImportBatch.findFirst({
      where: { id, organizationId: orgId },
    });
  }

  async listFuelCardBatches(
    orgId: string,
    connectionId: string,
  ): Promise<readonly FuelCardBatchRecord[]> {
    return this.database.fuelCardImportBatch.findMany({
      where: { organizationId: orgId, connectionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async confirmFuelCardBatch(
    orgId: string,
    id: string,
    confirmedBy: string,
    importedRows: number,
    audit?: AuditLogParams,
  ): Promise<FuelCardBatchRecord> {
    return this.database.$transaction(async (tx) => {
      const updated = await tx.fuelCardImportBatch.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          confirmedBy,
          confirmedAt: new Date(),
          importedRows,
        },
      });

      if (audit) {
        await tx.auditLog.create({
          data: {
            organizationId: audit.organizationId,
            actorId: audit.actorId,
            action: audit.action,
            entityType: audit.entityType,
            entityId: id,
            afterData: {
              id: updated.id,
              status: updated.status,
              importedRows: updated.importedRows,
              confirmedBy,
            } as Prisma.InputJsonValue,
            requestId: audit.requestId ?? 'system',
            ipAddress: audit.ipAddress ?? null,
            userAgent: audit.userAgent ?? null,
          },
        });
      }

      return updated;
    });
  }

  async createExternalTransactionIdentity(data: {
    organizationId: string;
    connectionId: string;
    externalTransactionId: string;
    fuelTransactionId: string;
  }): Promise<void> {
    await this.database.externalTransactionIdentity.create({
      data: {
        organizationId: data.organizationId,
        connectionId: data.connectionId,
        externalTransactionId: data.externalTransactionId,
        fuelTransactionId: data.fuelTransactionId,
      },
    });
  }

  async findExternalTransaction(
    orgId: string,
    connectionId: string,
    externalTransactionId: string,
  ): Promise<boolean> {
    const existing = await this.database.externalTransactionIdentity.findFirst({
      where: {
        organizationId: orgId,
        connectionId,
        externalTransactionId,
      },
      select: { id: true },
    });
    return existing !== null;
  }

  async findVehicleByRegistration(
    orgId: string,
    registration: string,
  ): Promise<{ id: string; displayId: string; registration: string; model: string } | null> {
    return this.database.vehicle.findFirst({
      where: {
        organizationId: orgId,
        registration: { equals: registration.trim(), mode: 'insensitive' },
      },
      select: {
        id: true,
        displayId: true,
        registration: true,
        model: true,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Accounting Export
  // ---------------------------------------------------------------------------

  async findPostedTransactionsForExport(
    orgId: string,
    fromUtc: Date,
    toUtc: Date,
    currencyCode?: string,
  ): Promise<{
    readonly expenses: readonly ExportExpenseItem[];
    readonly fuelTransactions: readonly ExportFuelItem[];
  }> {
    const [expenses, fuels] = await Promise.all([
      this.database.expense.findMany({
        where: {
          organizationId: orgId,
          status: ExpenseStatus.POSTED,
          occurredAt: { gte: fromUtc, lt: toUtc },
          ...(currencyCode ? { currencyCode } : {}),
        },
        orderBy: { occurredAt: 'asc' },
        include: {
          category: { select: { code: true, name: true } },
          vehicle: { select: { displayId: true, registration: true } },
          driver: { select: { displayId: true, firstName: true, lastName: true } },
        },
      }),
      this.database.fuelTransaction.findMany({
        where: {
          organizationId: orgId,
          status: FuelTransactionStatus.POSTED,
          occurredAt: { gte: fromUtc, lt: toUtc },
          ...(currencyCode ? { currencyCode } : {}),
        },
        orderBy: { occurredAt: 'asc' },
        include: {
          vehicle: { select: { displayId: true, registration: true } },
          driver: { select: { displayId: true, firstName: true, lastName: true } },
        },
      }),
    ]);

    const formattedExpenses: ExportExpenseItem[] = expenses.map((e) => ({
      id: e.id,
      displayId: e.displayId,
      occurredAt: e.occurredAt,
      categoryCode: e.category.code,
      categoryName: e.category.name,
      amount: Number(e.amount),
      currencyCode: e.currencyCode,
      description: e.description,
      vendorName: e.vendorName,
      referenceNumber: e.referenceNumber,
      vehicleDisplayId: e.vehicle?.displayId ?? null,
      vehicleRegistration: e.vehicle?.registration ?? null,
      driverDisplayId: e.driver?.displayId ?? null,
    }));

    const formattedFuels: ExportFuelItem[] = fuels.map((f) => ({
      id: f.id,
      displayId: f.displayId,
      occurredAt: f.occurredAt,
      energyType: f.energyType,
      quantity: Number(f.quantity),
      quantityUnit: f.quantityUnit,
      unitPrice: Number(f.unitPrice),
      totalAmount: Number(f.totalAmount),
      currencyCode: f.currencyCode,
      stationName: f.stationName,
      referenceNumber: f.referenceNumber,
      vehicleDisplayId: f.vehicle.displayId,
      vehicleRegistration: f.vehicle.registration,
      driverDisplayId: f.driver?.displayId ?? null,
    }));

    return {
      expenses: formattedExpenses,
      fuelTransactions: formattedFuels,
    };
  }

  async logAccountingExport(
    data: {
      organizationId: string;
      connectionId: string;
      actorId: string;
      format: string;
      fromUtc: Date;
      toUtc: Date;
      rowCount: number;
    },
    audit?: AuditLogParams,
  ): Promise<AccountingExportRecord> {
    return this.database.$transaction(async (tx) => {
      const log = await tx.accountingExportLog.create({
        data: {
          organizationId: data.organizationId,
          connectionId: data.connectionId,
          actorId: data.actorId,
          format: data.format,
          fromUtc: data.fromUtc,
          toUtc: data.toUtc,
          rowCount: data.rowCount,
        },
      });

      if (audit) {
        await tx.auditLog.create({
          data: {
            organizationId: audit.organizationId,
            actorId: audit.actorId,
            action: audit.action,
            entityType: audit.entityType,
            entityId: log.id,
            afterData: {
              id: log.id,
              connectionId: log.connectionId,
              format: log.format,
              fromUtc: log.fromUtc,
              toUtc: log.toUtc,
              rowCount: log.rowCount,
            } as Prisma.InputJsonValue,
            requestId: audit.requestId ?? 'system',
            ipAddress: audit.ipAddress ?? null,
            userAgent: audit.userAgent ?? null,
          },
        });
      }

      return log;
    });
  }

  async listAccountingExports(
    orgId: string,
    connectionId: string,
  ): Promise<readonly AccountingExportRecord[]> {
    return this.database.accountingExportLog.findMany({
      where: { organizationId: orgId, connectionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---------------------------------------------------------------------------
  // General Audit
  // ---------------------------------------------------------------------------

  async recordAuditLog(params: AuditLogParams): Promise<void> {
    await this.database.auditLog.create({
      data: {
        organizationId: params.organizationId,
        actorId: params.actorId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        ...(params.beforeData ? { beforeData: params.beforeData as Prisma.InputJsonValue } : {}),
        ...(params.afterData ? { afterData: params.afterData as Prisma.InputJsonValue } : {}),
        requestId: params.requestId ?? 'system',
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  }
}
