import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@vms/database';
import {
  type PrismaClient,
  type ComplianceDocumentStatus as PrismaComplianceDocumentStatus,
  type ComplianceDocumentTypeStatus as PrismaComplianceDocumentTypeStatus,
  type ComplianceSubjectType as PrismaComplianceSubjectType,
} from '@vms/database';
import { DATABASE } from '../../../common/tokens.js';
import type {
  ComplianceExceptionItem,
  ComplianceMutationMetadata,
  ComplianceRepository,
  ComplianceSummaryData,
} from '../application/compliance.repository.js';
import type { ComplianceDocumentStatus } from '../domain/compliance-document.js';
import { ComplianceDocument, normalizeToDateOnly } from '../domain/compliance-document.js';
import type {
  ComplianceDocumentTypeStatus,
  ComplianceSubjectType,
} from '../domain/compliance-document-type.js';
import { ComplianceDocumentType } from '../domain/compliance-document-type.js';
import { evaluateSubjectCompliance } from '../domain/compliance-evaluation.js';

function json<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class PrismaComplianceRepository implements ComplianceRepository {
  constructor(@Inject(DATABASE) private readonly db: PrismaClient) {}

  // ----------------------------------------------------
  // Document Types
  // ----------------------------------------------------

  public async saveDocumentType(
    type: ComplianceDocumentType,
    metadata: ComplianceMutationMetadata,
    eventType:
      | 'ComplianceDocumentTypeCreated'
      | 'ComplianceDocumentTypePolicyChanged'
      | 'ComplianceDocumentTypeArchived',
  ): Promise<void> {
    const raw = type.toJSON();
    const action =
      eventType === 'ComplianceDocumentTypeCreated'
        ? 'compliance.type.created'
        : eventType === 'ComplianceDocumentTypeArchived'
          ? 'compliance.type.archived'
          : 'compliance.type.policy_changed';

    await this.db.$transaction(async (tx) => {
      await tx.complianceDocumentType.upsert({
        where: { id: raw.id },
        create: {
          id: raw.id,
          organizationId: raw.organizationId,
          code: raw.code,
          name: raw.name,
          description: raw.description ?? null,
          subjectType: raw.subjectType as PrismaComplianceSubjectType,
          status: raw.status as PrismaComplianceDocumentTypeStatus,
          required: raw.required,
          blocksOperation: raw.blocksOperation,
          requiresExpiry: raw.requiresExpiry,
          warningDaysBeforeExpiry: raw.warningDaysBeforeExpiry,
          version: raw.version,
          createdAt: raw.createdAt,
          createdBy: raw.createdBy,
          updatedAt: raw.updatedAt,
          updatedBy: raw.updatedBy,
        },
        update: {
          name: raw.name,
          description: raw.description ?? null,
          status: raw.status as PrismaComplianceDocumentTypeStatus,
          required: raw.required,
          blocksOperation: raw.blocksOperation,
          requiresExpiry: raw.requiresExpiry,
          warningDaysBeforeExpiry: raw.warningDaysBeforeExpiry,
          version: raw.version,
          updatedAt: raw.updatedAt,
          updatedBy: raw.updatedBy,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          id: randomUUID(),
          organizationId: raw.organizationId,
          entityType: 'ComplianceDocumentType',
          entityId: raw.id,
          action,
          afterData: json(raw),
          actorId: metadata.actorId,
          requestId: metadata.requestId,
          ipAddress: metadata.ipAddress ?? null,
          userAgent: metadata.userAgent ?? null,
        },
      });

      // Transactional Outbox Event
      const outboxEventId = randomUUID();
      await tx.outboxEvent.create({
        data: {
          id: outboxEventId,
          organizationId: raw.organizationId,
          eventType,
          aggregateType: 'ComplianceDocumentType',
          aggregateId: raw.id,
          occurredAt: raw.updatedAt,
          payload: json({
            eventId: outboxEventId,
            organizationId: raw.organizationId,
            documentTypeId: raw.id,
            code: raw.code,
            subjectType: raw.subjectType,
            status: raw.status,
            required: raw.required,
            blocksOperation: raw.blocksOperation,
            occurredAt: raw.updatedAt.toISOString(),
            actorId: metadata.actorId,
            requestId: metadata.requestId,
          }),
        },
      });
    });
  }

  public async findDocumentTypeById(
    organizationId: string,
    id: string,
  ): Promise<ComplianceDocumentType | null> {
    const raw = await this.db.complianceDocumentType.findFirst({
      where: { id, organizationId },
    });
    return raw ? this.mapDocumentType(raw) : null;
  }

  public async findDocumentTypeByCode(
    organizationId: string,
    code: string,
  ): Promise<ComplianceDocumentType | null> {
    const normalized = code.trim().toUpperCase().replace(/\s+/g, '_');
    const raw = await this.db.complianceDocumentType.findFirst({
      where: { organizationId, code: normalized },
    });
    return raw ? this.mapDocumentType(raw) : null;
  }

  public async listDocumentTypes(params: {
    organizationId: string;
    subjectType?: ComplianceSubjectType;
    status?: ComplianceDocumentTypeStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ items: ComplianceDocumentType[]; total: number }> {
    const where: Prisma.ComplianceDocumentTypeWhereInput = {
      organizationId: params.organizationId,
      ...(params.subjectType
        ? { subjectType: params.subjectType as PrismaComplianceSubjectType }
        : {}),
      ...(params.status ? { status: params.status as PrismaComplianceDocumentTypeStatus } : {}),
    };

    const [items, total] = await Promise.all([
      this.db.complianceDocumentType.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        take: params.limit ?? 50,
        skip: params.offset ?? 0,
      }),
      this.db.complianceDocumentType.count({ where }),
    ]);

    return {
      items: items.map((i) => this.mapDocumentType(i)),
      total,
    };
  }

  // ----------------------------------------------------
  // Compliance Documents
  // ----------------------------------------------------

  public async saveDocument(
    doc: ComplianceDocument,
    metadata: ComplianceMutationMetadata,
    eventType: 'ComplianceDocumentUploaded' | 'ComplianceDocumentRevoked',
  ): Promise<void> {
    const raw = doc.toJSON();
    const action =
      eventType === 'ComplianceDocumentUploaded'
        ? 'compliance.document.uploaded'
        : 'compliance.document.revoked';

    await this.db.$transaction(async (tx) => {
      await tx.complianceDocument.upsert({
        where: { id: raw.id },
        create: {
          id: raw.id,
          organizationId: raw.organizationId,
          displayId: raw.displayId,
          documentTypeId: raw.documentTypeId,
          subjectType: raw.subjectType as PrismaComplianceSubjectType,
          vehicleId: raw.vehicleId ?? null,
          driverId: raw.driverId ?? null,
          documentNumber: raw.documentNumber ?? null,
          issuerName: raw.issuerName ?? null,
          issuedOn: raw.issuedOn ?? null,
          expiresOn: raw.expiresOn ?? null,
          status: raw.status as PrismaComplianceDocumentStatus,
          notes: raw.notes ?? null,
          objectKey: raw.objectKey,
          originalFileName: raw.originalFileName,
          mimeType: raw.mimeType,
          sizeBytes: raw.sizeBytes,
          storageETag: raw.storageETag ?? null,
          supersededAt: raw.supersededAt ?? null,
          supersededById: raw.supersededById ?? null,
          revokedAt: raw.revokedAt ?? null,
          revokedBy: raw.revokedBy ?? null,
          revocationReason: raw.revocationReason ?? null,
          version: raw.version,
          createdAt: raw.createdAt,
          createdBy: raw.createdBy,
          updatedAt: raw.updatedAt,
          updatedBy: raw.updatedBy,
        },
        update: {
          status: raw.status as PrismaComplianceDocumentStatus,
          notes: raw.notes ?? null,
          supersededAt: raw.supersededAt ?? null,
          supersededById: raw.supersededById ?? null,
          revokedAt: raw.revokedAt ?? null,
          revokedBy: raw.revokedBy ?? null,
          revocationReason: raw.revocationReason ?? null,
          version: raw.version,
          updatedAt: raw.updatedAt,
          updatedBy: raw.updatedBy,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          id: randomUUID(),
          organizationId: raw.organizationId,
          entityType: 'ComplianceDocument',
          entityId: raw.id,
          action,
          afterData: json({
            id: raw.id,
            displayId: raw.displayId,
            documentTypeId: raw.documentTypeId,
            subjectType: raw.subjectType,
            subjectId: raw.vehicleId ?? raw.driverId,
            documentNumber: raw.documentNumber,
            status: raw.status,
            issuedOn: raw.issuedOn?.toISOString(),
            expiresOn: raw.expiresOn?.toISOString(),
            revocationReason: raw.revocationReason,
          }),
          actorId: metadata.actorId,
          requestId: metadata.requestId,
          ipAddress: metadata.ipAddress ?? null,
          userAgent: metadata.userAgent ?? null,
        },
      });

      // Outbox Event
      const outboxEventId = randomUUID();
      await tx.outboxEvent.create({
        data: {
          id: outboxEventId,
          organizationId: raw.organizationId,
          eventType,
          aggregateType: 'ComplianceDocument',
          aggregateId: raw.id,
          occurredAt: raw.updatedAt,
          payload: json({
            eventId: outboxEventId,
            organizationId: raw.organizationId,
            documentId: raw.id,
            displayId: raw.displayId,
            documentTypeId: raw.documentTypeId,
            subjectType: raw.subjectType,
            subjectId: raw.vehicleId ?? raw.driverId,
            status: raw.status,
            occurredAt: raw.updatedAt.toISOString(),
            actorId: metadata.actorId,
            requestId: metadata.requestId,
          }),
        },
      });
    });
  }

  public async saveDocumentReplacement(
    oldDoc: ComplianceDocument,
    newDoc: ComplianceDocument,
    metadata: ComplianceMutationMetadata,
  ): Promise<void> {
    const oldRaw = oldDoc.toJSON();
    const newRaw = newDoc.toJSON();

    await this.db.$transaction(async (tx) => {
      // 1. Update old document to SUPERSEDED (first without supersededById to satisfy FK constraint)
      await tx.complianceDocument.update({
        where: { id: oldRaw.id },
        data: {
          status: oldRaw.status as PrismaComplianceDocumentStatus,
          supersededAt: oldRaw.supersededAt ?? null,
          version: oldRaw.version,
          updatedAt: oldRaw.updatedAt,
          updatedBy: oldRaw.updatedBy,
        },
      });

      // 2. Insert new ACTIVE document
      await tx.complianceDocument.create({
        data: {
          id: newRaw.id,
          organizationId: newRaw.organizationId,
          displayId: newRaw.displayId,
          documentTypeId: newRaw.documentTypeId,
          subjectType: newRaw.subjectType as PrismaComplianceSubjectType,
          vehicleId: newRaw.vehicleId ?? null,
          driverId: newRaw.driverId ?? null,
          documentNumber: newRaw.documentNumber ?? null,
          issuerName: newRaw.issuerName ?? null,
          issuedOn: newRaw.issuedOn ?? null,
          expiresOn: newRaw.expiresOn ?? null,
          status: newRaw.status as PrismaComplianceDocumentStatus,
          notes: newRaw.notes ?? null,
          objectKey: newRaw.objectKey,
          originalFileName: newRaw.originalFileName,
          mimeType: newRaw.mimeType,
          sizeBytes: newRaw.sizeBytes,
          storageETag: newRaw.storageETag ?? null,
          version: newRaw.version,
          createdAt: newRaw.createdAt,
          createdBy: newRaw.createdBy,
          updatedAt: newRaw.updatedAt,
          updatedBy: newRaw.updatedBy,
        },
      });

      // 3. Set supersededById on old document now that new document exists
      await tx.complianceDocument.update({
        where: { id: oldRaw.id },
        data: {
          supersededById: newRaw.id,
        },
      });

      // 3. Audit Log
      await tx.auditLog.create({
        data: {
          id: randomUUID(),
          organizationId: newRaw.organizationId,
          entityType: 'ComplianceDocument',
          entityId: newRaw.id,
          action: 'compliance.document.replaced',
          beforeData: json({ id: oldRaw.id, status: oldRaw.status, supersededById: newRaw.id }),
          afterData: json({
            id: newRaw.id,
            status: newRaw.status,
            supersededDocumentId: oldRaw.id,
          }),
          actorId: metadata.actorId,
          requestId: metadata.requestId,
          ipAddress: metadata.ipAddress ?? null,
          userAgent: metadata.userAgent ?? null,
        },
      });

      // 4. Outbox Event
      const outboxEventId = randomUUID();
      await tx.outboxEvent.create({
        data: {
          id: outboxEventId,
          organizationId: newRaw.organizationId,
          eventType: 'ComplianceDocumentReplaced',
          aggregateType: 'ComplianceDocument',
          aggregateId: newRaw.id,
          occurredAt: newRaw.createdAt,
          payload: json({
            eventId: outboxEventId,
            organizationId: newRaw.organizationId,
            newDocumentId: newRaw.id,
            previousDocumentId: oldRaw.id,
            documentTypeId: newRaw.documentTypeId,
            subjectType: newRaw.subjectType,
            subjectId: newRaw.vehicleId ?? newRaw.driverId,
            occurredAt: newRaw.createdAt.toISOString(),
            actorId: metadata.actorId,
            requestId: metadata.requestId,
          }),
        },
      });
    });
  }

  public async recordDownloadAudit(
    organizationId: string,
    doc: ComplianceDocument,
    metadata: ComplianceMutationMetadata,
  ): Promise<void> {
    const raw = doc.toJSON();
    await this.db.auditLog.create({
      data: {
        id: randomUUID(),
        organizationId,
        entityType: 'ComplianceDocument',
        entityId: raw.id,
        action: 'compliance.document.download_access_issued',
        afterData: json({
          documentId: raw.id,
          displayId: raw.displayId,
          documentTypeId: raw.documentTypeId,
          subjectType: raw.subjectType,
          subjectId: raw.vehicleId ?? raw.driverId,
          originalFileName: raw.originalFileName,
          mimeType: raw.mimeType,
          sizeBytes: raw.sizeBytes,
        }),
        actorId: metadata.actorId,
        requestId: metadata.requestId,
        ipAddress: metadata.ipAddress ?? null,
        userAgent: metadata.userAgent ?? null,
      },
    });
  }

  public async findDocumentById(
    organizationId: string,
    id: string,
  ): Promise<ComplianceDocument | null> {
    const raw = await this.db.complianceDocument.findFirst({
      where: { id, organizationId },
    });
    return raw ? this.mapDocument(raw) : null;
  }

  public async findActiveDocumentForSubject(
    organizationId: string,
    subjectType: ComplianceSubjectType,
    subjectId: string,
    documentTypeId: string,
  ): Promise<ComplianceDocument | null> {
    const raw = await this.db.complianceDocument.findFirst({
      where: {
        organizationId,
        documentTypeId,
        status: 'ACTIVE',
        ...(subjectType === 'VEHICLE' ? { vehicleId: subjectId } : { driverId: subjectId }),
      },
    });
    return raw ? this.mapDocument(raw) : null;
  }

  public async listActiveDocumentsForSubject(
    organizationId: string,
    subjectType: ComplianceSubjectType,
    subjectId: string,
  ): Promise<ComplianceDocument[]> {
    const items = await this.db.complianceDocument.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        ...(subjectType === 'VEHICLE' ? { vehicleId: subjectId } : { driverId: subjectId }),
      },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((i) => this.mapDocument(i));
  }

  public async listDocumentsForSubject(params: {
    organizationId: string;
    subjectType: ComplianceSubjectType;
    subjectId: string;
    status?: ComplianceDocumentStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ items: ComplianceDocument[]; total: number }> {
    const where: Prisma.ComplianceDocumentWhereInput = {
      organizationId: params.organizationId,
      ...(params.subjectType === 'VEHICLE'
        ? { vehicleId: params.subjectId }
        : { driverId: params.subjectId }),
      ...(params.status ? { status: params.status as PrismaComplianceDocumentStatus } : {}),
    };

    const [items, total] = await Promise.all([
      this.db.complianceDocument.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        take: params.limit ?? 50,
        skip: params.offset ?? 0,
      }),
      this.db.complianceDocument.count({ where }),
    ]);

    return {
      items: items.map((i) => this.mapDocument(i)),
      total,
    };
  }

  public async listDocuments(params: {
    organizationId: string;
    subjectType?: ComplianceSubjectType;
    documentTypeId?: string;
    status?: ComplianceDocumentStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ items: ComplianceDocument[]; total: number }> {
    const where: Prisma.ComplianceDocumentWhereInput = {
      organizationId: params.organizationId,
      ...(params.subjectType
        ? { subjectType: params.subjectType as PrismaComplianceSubjectType }
        : {}),
      ...(params.documentTypeId ? { documentTypeId: params.documentTypeId } : {}),
      ...(params.status ? { status: params.status as PrismaComplianceDocumentStatus } : {}),
    };

    const [items, total] = await Promise.all([
      this.db.complianceDocument.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        take: params.limit ?? 50,
        skip: params.offset ?? 0,
      }),
      this.db.complianceDocument.count({ where }),
    ]);

    return {
      items: items.map((i) => this.mapDocument(i)),
      total,
    };
  }

  // ----------------------------------------------------
  // Summary & Exceptions
  // ----------------------------------------------------

  public async getComplianceSummary(
    organizationId: string,
    referenceDate: Date,
  ): Promise<ComplianceSummaryData> {
    const [vehicles, drivers, docTypes, activeDocs] = await Promise.all([
      this.db.vehicle.findMany({
        where: { organizationId, status: 'ACTIVE' },
        select: { id: true },
      }),
      this.db.driver.findMany({
        where: { organizationId, status: { in: ['ACTIVE', 'SUSPENDED'] } },
        select: { id: true },
      }),
      this.db.complianceDocumentType.findMany({
        where: { organizationId, status: 'ACTIVE' },
      }),
      this.db.complianceDocument.findMany({
        where: { organizationId, status: 'ACTIVE' },
      }),
    ]);

    const domainDocTypes = docTypes.map((t) => this.mapDocumentType(t));
    const domainDocs = activeDocs.map((d) => this.mapDocument(d));

    const vehicleDocs = domainDocs.filter((d) => d.subjectType === 'VEHICLE');
    const driverDocs = domainDocs.filter((d) => d.subjectType === 'DRIVER');

    let nonCompliantVehicles = 0;
    let blockedVehicles = 0;
    for (const v of vehicles) {
      const vActive = vehicleDocs.filter((d) => d.vehicleId === v.id);
      const evalRes = evaluateSubjectCompliance({
        subjectType: 'VEHICLE',
        subjectId: v.id,
        documentTypes: domainDocTypes,
        activeDocuments: vActive,
        referenceDate,
      });
      if (evalRes.overallState === 'NON_COMPLIANT') nonCompliantVehicles++;
      if (evalRes.operationallyBlocked) blockedVehicles++;
    }

    let nonCompliantDrivers = 0;
    let blockedDrivers = 0;
    for (const d of drivers) {
      const dActive = driverDocs.filter((doc) => doc.driverId === d.id);
      const evalRes = evaluateSubjectCompliance({
        subjectType: 'DRIVER',
        subjectId: d.id,
        documentTypes: domainDocTypes,
        activeDocuments: dActive,
        referenceDate,
      });
      if (evalRes.overallState === 'NON_COMPLIANT') nonCompliantDrivers++;
      if (evalRes.operationallyBlocked) blockedDrivers++;
    }

    // Counts across all active documents
    let expiringDocuments = 0;
    let expiredDocuments = 0;
    for (const doc of domainDocs) {
      const type = domainDocTypes.find((t) => t.id === doc.documentTypeId);
      const warningDays = type?.warningDaysBeforeExpiry ?? 30;
      const state = doc.evaluateCurrentState(referenceDate, warningDays);
      if (state === 'EXPIRING_SOON') expiringDocuments++;
      if (state === 'EXPIRED') expiredDocuments++;
    }

    // Missing required documents count
    let missingRequiredDocuments = 0;
    const requiredVehicleTypes = domainDocTypes.filter(
      (t) => t.subjectType === 'VEHICLE' && t.required,
    );
    for (const v of vehicles) {
      for (const t of requiredVehicleTypes) {
        const hasDoc = vehicleDocs.some((d) => d.vehicleId === v.id && d.documentTypeId === t.id);
        if (!hasDoc) missingRequiredDocuments++;
      }
    }
    const requiredDriverTypes = domainDocTypes.filter(
      (t) => t.subjectType === 'DRIVER' && t.required,
    );
    for (const d of drivers) {
      for (const t of requiredDriverTypes) {
        const hasDoc = driverDocs.some(
          (doc) => doc.driverId === d.id && doc.documentTypeId === t.id,
        );
        if (!hasDoc) missingRequiredDocuments++;
      }
    }

    return {
      nonCompliantVehicles,
      nonCompliantDrivers,
      blockedVehicles,
      blockedDrivers,
      expiringDocuments,
      expiredDocuments,
      missingRequiredDocuments,
    };
  }

  public async getComplianceExceptions(params: {
    organizationId: string;
    subjectType?: ComplianceSubjectType;
    operationallyBlocked?: boolean;
    limit?: number;
    offset?: number;
    referenceDate?: Date;
  }): Promise<{ items: ComplianceExceptionItem[]; total: number }> {
    const referenceDate = params.referenceDate ?? new Date();

    const [vehicles, drivers, docTypes, activeDocs] = await Promise.all([
      this.db.vehicle.findMany({
        where: { organizationId: params.organizationId, status: 'ACTIVE' },
        select: { id: true, displayId: true, registration: true, model: true },
      }),
      this.db.driver.findMany({
        where: { organizationId: params.organizationId, status: { in: ['ACTIVE', 'SUSPENDED'] } },
        select: { id: true, displayId: true, firstName: true, lastName: true },
      }),
      this.db.complianceDocumentType.findMany({
        where: { organizationId: params.organizationId, status: 'ACTIVE' },
      }),
      this.db.complianceDocument.findMany({
        where: { organizationId: params.organizationId, status: 'ACTIVE' },
      }),
    ]);

    const domainDocTypes = docTypes.map((t) => this.mapDocumentType(t));
    const domainDocs = activeDocs.map((d) => this.mapDocument(d));

    const exceptions: ComplianceExceptionItem[] = [];

    // Evaluate Vehicles
    if (!params.subjectType || params.subjectType === 'VEHICLE') {
      const vDocs = domainDocs.filter((d) => d.subjectType === 'VEHICLE');
      for (const v of vehicles) {
        const evalRes = evaluateSubjectCompliance({
          subjectType: 'VEHICLE',
          subjectId: v.id,
          documentTypes: domainDocTypes,
          activeDocuments: vDocs.filter((d) => d.vehicleId === v.id),
          referenceDate,
        });

        if (evalRes.overallState !== 'COMPLIANT' || evalRes.operationallyBlocked) {
          if (
            params.operationallyBlocked === undefined ||
            evalRes.operationallyBlocked === params.operationallyBlocked
          ) {
            const issuesCount = evalRes.requirements.filter(
              (r) => r.derivedState !== 'VALID',
            ).length;

            exceptions.push({
              subjectType: 'VEHICLE',
              subjectId: v.id,
              subjectDisplayId: v.displayId,
              subjectName: `${v.registration} (${v.model})`,
              overallState: evalRes.overallState,
              operationallyBlocked: evalRes.operationallyBlocked,
              blockingReasons: evalRes.blockingReasons,
              issuesCount,
            });
          }
        }
      }
    }

    // Evaluate Drivers
    if (!params.subjectType || params.subjectType === 'DRIVER') {
      const dDocs = domainDocs.filter((d) => d.subjectType === 'DRIVER');
      for (const d of drivers) {
        const evalRes = evaluateSubjectCompliance({
          subjectType: 'DRIVER',
          subjectId: d.id,
          documentTypes: domainDocTypes,
          activeDocuments: dDocs.filter((doc) => doc.driverId === d.id),
          referenceDate,
        });

        if (evalRes.overallState !== 'COMPLIANT' || evalRes.operationallyBlocked) {
          if (
            params.operationallyBlocked === undefined ||
            evalRes.operationallyBlocked === params.operationallyBlocked
          ) {
            const issuesCount = evalRes.requirements.filter(
              (r) => r.derivedState !== 'VALID',
            ).length;

            exceptions.push({
              subjectType: 'DRIVER',
              subjectId: d.id,
              subjectDisplayId: d.displayId,
              subjectName: `${d.firstName} ${d.lastName}`,
              overallState: evalRes.overallState,
              operationallyBlocked: evalRes.operationallyBlocked,
              blockingReasons: evalRes.blockingReasons,
              issuesCount,
            });
          }
        }
      }
    }

    const total = exceptions.length;
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 50;
    const paginated = exceptions.slice(offset, offset + limit);

    return { items: paginated, total };
  }

  // ----------------------------------------------------
  // Subject existence & display
  // ----------------------------------------------------

  public async vehicleExists(
    organizationId: string,
    vehicleId: string,
  ): Promise<{ exists: boolean; displayId: string; status: string } | null> {
    const raw = await this.db.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true, displayId: true, status: true },
    });
    return raw ? { exists: true, displayId: raw.displayId, status: raw.status } : null;
  }

  public async driverExists(
    organizationId: string,
    driverId: string,
  ): Promise<{ exists: boolean; displayId: string; status: string; name: string } | null> {
    const raw = await this.db.driver.findFirst({
      where: { id: driverId, organizationId },
      select: { id: true, displayId: true, status: true, firstName: true, lastName: true },
    });
    return raw
      ? {
          exists: true,
          displayId: raw.displayId,
          status: raw.status,
          name: `${raw.firstName} ${raw.lastName}`,
        }
      : null;
  }

  // ----------------------------------------------------
  // Display ID generator
  // ----------------------------------------------------

  public async generateNextDisplayId(organizationId: string, prefix: string): Promise<string> {
    const count = await this.db.complianceDocument.count({
      where: { organizationId },
    });
    return `${prefix}-${String(count + 1).padStart(5, '0')}`;
  }

  // ----------------------------------------------------
  // Helpers / Mappers
  // ----------------------------------------------------

  private mapDocumentType(
    raw: Prisma.ComplianceDocumentTypeGetPayload<Record<string, never>>,
  ): ComplianceDocumentType {
    return ComplianceDocumentType.rehydrate({
      id: raw.id,
      organizationId: raw.organizationId,
      code: raw.code,
      name: raw.name,
      description: raw.description ?? null,
      subjectType: raw.subjectType as ComplianceSubjectType,
      status: raw.status as ComplianceDocumentTypeStatus,
      required: raw.required,
      blocksOperation: raw.blocksOperation,
      requiresExpiry: raw.requiresExpiry,
      warningDaysBeforeExpiry: raw.warningDaysBeforeExpiry,
      version: raw.version,
      createdAt: raw.createdAt,
      createdBy: raw.createdBy,
      updatedAt: raw.updatedAt,
      updatedBy: raw.updatedBy,
    });
  }

  private mapDocument(
    raw: Prisma.ComplianceDocumentGetPayload<Record<string, never>>,
  ): ComplianceDocument {
    return ComplianceDocument.rehydrate({
      id: raw.id,
      organizationId: raw.organizationId,
      displayId: raw.displayId,
      documentTypeId: raw.documentTypeId,
      subjectType: raw.subjectType as ComplianceSubjectType,
      vehicleId: raw.vehicleId ?? null,
      driverId: raw.driverId ?? null,
      documentNumber: raw.documentNumber ?? null,
      issuerName: raw.issuerName ?? null,
      issuedOn: raw.issuedOn ? normalizeToDateOnly(raw.issuedOn) : null,
      expiresOn: raw.expiresOn ? normalizeToDateOnly(raw.expiresOn) : null,
      status: raw.status as ComplianceDocumentStatus,
      notes: raw.notes ?? null,
      objectKey: raw.objectKey,
      originalFileName: raw.originalFileName,
      mimeType: raw.mimeType,
      sizeBytes: raw.sizeBytes,
      storageETag: raw.storageETag ?? null,
      supersededAt: raw.supersededAt ?? null,
      supersededById: raw.supersededById ?? null,
      revokedAt: raw.revokedAt ?? null,
      revokedBy: raw.revokedBy ?? null,
      revocationReason: raw.revocationReason ?? null,
      version: raw.version,
      createdAt: raw.createdAt,
      createdBy: raw.createdBy,
      updatedAt: raw.updatedAt,
      updatedBy: raw.updatedBy,
    });
  }
}
