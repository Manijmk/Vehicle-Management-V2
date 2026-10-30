import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';

import { ApplicationError } from '../../foundation/domain/errors.js';
import type { OperationalComplianceGate } from '../../trip/application/operational-compliance-gate.port.js';
import { COMPLIANCE_REPOSITORY, OBJECT_STORAGE_PORT } from '../compliance.tokens.js';
import {
  ComplianceDocument,
  type ComplianceDocumentStatus,
} from '../domain/compliance-document.js';
import {
  ComplianceDocumentType,
  type ComplianceDocumentTypeStatus,
  type ComplianceSubjectType,
} from '../domain/compliance-document-type.js';
import {
  ActiveDocumentAlreadyExistsError,
  ComplianceDocumentNotActiveError,
  ComplianceDocumentNotFoundError,
  DocumentTypeArchivedError,
  DocumentTypeCodeAlreadyExistsError,
  DocumentTypeNotFoundError,
  DocumentTypeSubjectMismatchError,
} from '../domain/compliance-errors.js';
import {
  evaluateSubjectCompliance,
  type SubjectComplianceEvaluation,
} from '../domain/compliance-evaluation.js';
import type {
  ComplianceExceptionItem,
  ComplianceMutationMetadata,
  ComplianceRepository,
  ComplianceSummaryData,
} from './compliance.repository.js';
import { validateUploadedDocumentFile } from './file-validation.js';
import type { ObjectStoragePort } from './object-storage.port.js';

export interface CreateDocumentTypeInput {
  code: string;
  name: string;
  description?: string | null | undefined;
  subjectType: ComplianceSubjectType;
  required?: boolean | undefined;
  expires?: boolean | undefined;
  defaultValidityDays?: number | null | undefined;
  warningDaysBeforeExpiry?: number | undefined;
  blocksOperation?: boolean | undefined;
}

export interface UpdateDocumentTypeInput {
  name?: string | undefined;
  description?: string | null | undefined;
  required?: boolean | undefined;
  expires?: boolean | undefined;
  defaultValidityDays?: number | null | undefined;
  warningDaysBeforeExpiry?: number | undefined;
  blocksOperation?: boolean | undefined;
}

export interface UploadDocumentInput {
  subjectType: ComplianceSubjectType;
  subjectId: string;
  documentTypeId: string;
  documentNumber?: string | null | undefined;
  issuingAuthority?: string | null | undefined;
  issuedOn?: Date | string | null | undefined;
  expiresOn?: Date | string | null | undefined;
  notes?: string | null | undefined;
}

export interface ReplaceDocumentInput {
  documentNumber?: string | null | undefined;
  issuingAuthority?: string | null | undefined;
  issuedOn?: Date | string | null | undefined;
  expiresOn?: Date | string | null | undefined;
  notes?: string | null | undefined;
}

export interface RevokeDocumentInput {
  reason: string;
}

function parseDateInput(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    throw new ApplicationError('INVALID_COMPLIANCE_DATA', `Invalid date format: ${value}`);
  }
  return d;
}

function sanitizeFileName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_');
}

@Injectable()
export class ComplianceService implements OperationalComplianceGate {
  constructor(
    @Inject(COMPLIANCE_REPOSITORY)
    private readonly repository: ComplianceRepository,
    @Inject(OBJECT_STORAGE_PORT)
    private readonly objectStorage: ObjectStoragePort,
  ) {}

  // =========================================================================
  // Operational Compliance Gate Implementation (for Trip readiness & start)
  // =========================================================================

  public async assertVehicleCompliance(vehicleId: string, organizationId: string): Promise<void> {
    const { evaluation } = await this.evaluateSubjectCompliance(
      organizationId,
      'VEHICLE',
      vehicleId,
    );

    if (evaluation.operationallyBlocked) {
      const reasonMsg = evaluation.blockingReasons.join('; ');
      throw new ApplicationError(
        'VEHICLE_COMPLIANCE_BLOCKED',
        `Vehicle is operationally blocked by compliance: ${reasonMsg}`,
        { vehicleId, blockingReasons: evaluation.blockingReasons },
      );
    }
  }

  public async assertDriverCompliance(driverId: string, organizationId: string): Promise<void> {
    const { evaluation } = await this.evaluateSubjectCompliance(organizationId, 'DRIVER', driverId);

    if (evaluation.operationallyBlocked) {
      const reasonMsg = evaluation.blockingReasons.join('; ');
      throw new ApplicationError(
        'DRIVER_COMPLIANCE_BLOCKED',
        `Driver is operationally blocked by compliance: ${reasonMsg}`,
        { driverId, blockingReasons: evaluation.blockingReasons },
      );
    }
  }

  public async isVehicleBlocked(vehicleId: string, organizationId: string): Promise<boolean> {
    try {
      await this.assertVehicleCompliance(vehicleId, organizationId);
      return false;
    } catch {
      return true;
    }
  }

  public async isDriverBlocked(driverId: string, organizationId: string): Promise<boolean> {
    try {
      await this.assertDriverCompliance(driverId, organizationId);
      return false;
    } catch {
      return true;
    }
  }

  // =========================================================================
  // Subject Compliance Evaluation
  // =========================================================================

  public async evaluateVehicleCompliance(
    organizationId: string,
    vehicleId: string,
    referenceDate?: Date,
  ) {
    return this.evaluateSubjectCompliance(organizationId, 'VEHICLE', vehicleId, referenceDate);
  }

  public async evaluateDriverCompliance(
    organizationId: string,
    driverId: string,
    referenceDate?: Date,
  ) {
    return this.evaluateSubjectCompliance(organizationId, 'DRIVER', driverId, referenceDate);
  }

  public async evaluateSubjectCompliance(
    organizationId: string,
    subjectType: ComplianceSubjectType,
    subjectId: string,
    referenceDate: Date = new Date(),
  ): Promise<{
    subject: { id: string; displayId: string; status: string; name?: string };
    evaluation: SubjectComplianceEvaluation;
    documentTypes: ReturnType<ComplianceDocumentType['toJSON']>[];
    activeDocuments: ReturnType<ComplianceDocument['toJSON']>[];
  }> {
    let subject: { id: string; displayId: string; status: string; name?: string } | null = null;
    if (subjectType === 'VEHICLE') {
      const v = await this.repository.vehicleExists(organizationId, subjectId);
      if (!v) {
        throw new ApplicationError('VEHICLE_NOT_FOUND', `Vehicle ${subjectId} not found.`);
      }
      subject = { id: subjectId, displayId: v.displayId, status: v.status };
    } else {
      const d = await this.repository.driverExists(organizationId, subjectId);
      if (!d) {
        throw new ApplicationError('DRIVER_NOT_FOUND', `Driver ${subjectId} not found.`);
      }
      subject = { id: subjectId, displayId: d.displayId, status: d.status, name: d.name };
    }

    const { items: activeTypes } = await this.repository.listDocumentTypes({
      organizationId,
      subjectType,
      status: 'ACTIVE',
    });

    const activeDocs = await this.repository.listActiveDocumentsForSubject(
      organizationId,
      subjectType,
      subjectId,
    );

    const evaluation = evaluateSubjectCompliance({
      subjectType,
      subjectId,
      documentTypes: activeTypes,
      activeDocuments: activeDocs,
      referenceDate,
    });

    return {
      subject,
      evaluation,
      documentTypes: activeTypes.map((t) => t.toJSON()),
      activeDocuments: activeDocs.map((d) => d.toJSON()),
    };
  }

  // =========================================================================
  // Document Types Catalog
  // =========================================================================

  public async createDocumentType(
    organizationId: string,
    input: CreateDocumentTypeInput,
    metadata: ComplianceMutationMetadata,
  ): Promise<ReturnType<ComplianceDocumentType['toJSON']>> {
    const existing = await this.repository.findDocumentTypeByCode(organizationId, input.code);
    if (existing) {
      throw new DocumentTypeCodeAlreadyExistsError(input.code);
    }

    const docType = ComplianceDocumentType.create({
      id: randomUUID(),
      organizationId,
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      subjectType: input.subjectType,
      required: input.required ?? false,
      requiresExpiry: input.expires ?? false,
      warningDaysBeforeExpiry: input.warningDaysBeforeExpiry ?? 30,
      blocksOperation: input.blocksOperation ?? false,
      createdBy: metadata.actorId,
    });

    await this.repository.saveDocumentType(docType, metadata, 'ComplianceDocumentTypeCreated');

    return docType.toJSON();
  }

  public async updateDocumentType(
    organizationId: string,
    id: string,
    input: UpdateDocumentTypeInput,
    metadata: ComplianceMutationMetadata,
  ): Promise<ReturnType<ComplianceDocumentType['toJSON']>> {
    const docType = await this.repository.findDocumentTypeById(organizationId, id);
    if (!docType) {
      throw new DocumentTypeNotFoundError(id);
    }

    const updateParams: {
      name?: string;
      description?: string | null;
      required?: boolean;
      blocksOperation?: boolean;
      requiresExpiry?: boolean;
      warningDaysBeforeExpiry?: number;
      updatedBy: string;
      expectedVersion: number;
    } = {
      updatedBy: metadata.actorId,
      expectedVersion: docType.version,
    };

    if (input.name !== undefined) updateParams.name = input.name;
    if (input.description !== undefined) updateParams.description = input.description;
    if (input.required !== undefined) updateParams.required = input.required;
    if (input.expires !== undefined) updateParams.requiresExpiry = input.expires;
    if (input.warningDaysBeforeExpiry !== undefined) {
      updateParams.warningDaysBeforeExpiry = input.warningDaysBeforeExpiry;
    }
    if (input.blocksOperation !== undefined) {
      updateParams.blocksOperation = input.blocksOperation;
    }

    docType.updatePolicy(updateParams);

    await this.repository.saveDocumentType(
      docType,
      metadata,
      'ComplianceDocumentTypePolicyChanged',
    );

    return docType.toJSON();
  }

  public async archiveDocumentType(
    organizationId: string,
    id: string,
    metadata: ComplianceMutationMetadata,
  ): Promise<ReturnType<ComplianceDocumentType['toJSON']>> {
    const docType = await this.repository.findDocumentTypeById(organizationId, id);
    if (!docType) {
      throw new DocumentTypeNotFoundError(id);
    }

    docType.archive({
      updatedBy: metadata.actorId,
      expectedVersion: docType.version,
    });

    await this.repository.saveDocumentType(docType, metadata, 'ComplianceDocumentTypeArchived');

    return docType.toJSON();
  }

  public async getDocumentType(
    organizationId: string,
    id: string,
  ): Promise<ReturnType<ComplianceDocumentType['toJSON']>> {
    const docType = await this.repository.findDocumentTypeById(organizationId, id);
    if (!docType) {
      throw new DocumentTypeNotFoundError(id);
    }
    return docType.toJSON();
  }

  public async listDocumentTypes(
    organizationId: string,
    params: {
      subjectType?: ComplianceSubjectType | undefined;
      status?: ComplianceDocumentTypeStatus | undefined;
      limit?: number | undefined;
      offset?: number | undefined;
    },
  ) {
    const filter: {
      organizationId: string;
      subjectType?: ComplianceSubjectType;
      status?: ComplianceDocumentTypeStatus;
      limit?: number;
      offset?: number;
    } = { organizationId };

    if (params.subjectType !== undefined) filter.subjectType = params.subjectType;
    if (params.status !== undefined) filter.status = params.status;
    if (params.limit !== undefined) filter.limit = params.limit;
    if (params.offset !== undefined) filter.offset = params.offset;

    const res = await this.repository.listDocumentTypes(filter);
    return {
      items: res.items.map((i) => i.toJSON()),
      total: res.total,
    };
  }

  // =========================================================================
  // Compliance Document Management
  // =========================================================================

  public async uploadDocument(
    organizationId: string,
    input: UploadDocumentInput,
    file: { buffer: Buffer; originalname: string; mimetype?: string },
    metadata: ComplianceMutationMetadata,
  ): Promise<ReturnType<ComplianceDocument['toJSON']>> {
    // 1. File Validation
    const { detectedMimeType, sizeBytes } = validateUploadedDocumentFile(
      file.buffer,
      file.mimetype || 'application/octet-stream',
    );

    // 2. Validate Subject
    if (input.subjectType === 'VEHICLE') {
      const v = await this.repository.vehicleExists(organizationId, input.subjectId);
      if (!v)
        throw new ApplicationError('VEHICLE_NOT_FOUND', `Vehicle ${input.subjectId} not found.`);
    } else {
      const d = await this.repository.driverExists(organizationId, input.subjectId);
      if (!d)
        throw new ApplicationError('DRIVER_NOT_FOUND', `Driver ${input.subjectId} not found.`);
    }

    // 3. Validate Document Type
    const docType = await this.repository.findDocumentTypeById(
      organizationId,
      input.documentTypeId,
    );
    if (!docType) {
      throw new DocumentTypeNotFoundError(input.documentTypeId);
    }
    if (docType.status === 'ARCHIVED') {
      throw new DocumentTypeArchivedError(docType.id);
    }
    if (docType.subjectType !== input.subjectType) {
      throw new DocumentTypeSubjectMismatchError(docType.subjectType, input.subjectType);
    }

    // 4. Check whether active doc of this type already exists for subject
    const existingActive = await this.repository.findActiveDocumentForSubject(
      organizationId,
      input.subjectType,
      input.subjectId,
      input.documentTypeId,
    );
    if (existingActive) {
      throw new ActiveDocumentAlreadyExistsError(input.subjectType, input.subjectId, docType.code);
    }

    // 5. Store File
    const displayId = await this.repository.generateNextDisplayId(organizationId, 'DOC');
    const safeName = sanitizeFileName(file.originalname);
    const objectKey = `${organizationId}/compliance/${input.subjectType.toLowerCase()}/${input.subjectId}/${randomUUID()}-${safeName}`;

    const { etag } = await this.objectStorage.putObject({
      objectKey,
      body: file.buffer,
      contentType: detectedMimeType,
    });

    // 6. Create Document Entity
    const doc = ComplianceDocument.create({
      id: randomUUID(),
      organizationId,
      displayId,
      documentTypeId: docType.id,
      subjectType: input.subjectType,
      vehicleId: input.subjectType === 'VEHICLE' ? input.subjectId : null,
      driverId: input.subjectType === 'DRIVER' ? input.subjectId : null,
      documentNumber: input.documentNumber || null,
      issuerName: input.issuingAuthority || null,
      issuedOn: parseDateInput(input.issuedOn),
      expiresOn: parseDateInput(input.expiresOn),
      notes: input.notes || null,
      objectKey,
      originalFileName: file.originalname,
      mimeType: detectedMimeType,
      sizeBytes,
      storageETag: etag ?? null,
      createdBy: metadata.actorId,
    });

    await this.repository.saveDocument(doc, metadata, 'ComplianceDocumentUploaded');

    return doc.toJSON();
  }

  public async replaceDocument(
    organizationId: string,
    existingDocumentId: string,
    input: ReplaceDocumentInput,
    file: { buffer: Buffer; originalname: string; mimetype?: string },
    metadata: ComplianceMutationMetadata,
  ): Promise<ReturnType<ComplianceDocument['toJSON']>> {
    // 1. File Validation
    const { detectedMimeType, sizeBytes } = validateUploadedDocumentFile(
      file.buffer,
      file.mimetype || 'application/octet-stream',
    );

    // 2. Fetch Existing Document
    const oldDoc = await this.repository.findDocumentById(organizationId, existingDocumentId);
    if (!oldDoc) {
      throw new ComplianceDocumentNotFoundError(existingDocumentId);
    }
    if (oldDoc.status !== 'ACTIVE') {
      throw new ComplianceDocumentNotActiveError(existingDocumentId, oldDoc.status);
    }

    // 3. Validate Document Type
    const docType = await this.repository.findDocumentTypeById(
      organizationId,
      oldDoc.documentTypeId,
    );
    if (!docType) {
      throw new DocumentTypeNotFoundError(oldDoc.documentTypeId);
    }

    // 4. Store File
    const displayId = await this.repository.generateNextDisplayId(organizationId, 'DOC');
    const safeName = sanitizeFileName(file.originalname);
    const subjectId = (oldDoc.subjectType === 'VEHICLE' ? oldDoc.vehicleId : oldDoc.driverId)!;
    const objectKey = `${organizationId}/compliance/${oldDoc.subjectType.toLowerCase()}/${subjectId}/${randomUUID()}-${safeName}`;

    const { etag } = await this.objectStorage.putObject({
      objectKey,
      body: file.buffer,
      contentType: detectedMimeType,
    });

    // 5. Create New Document Entity
    const newDoc = ComplianceDocument.create({
      id: randomUUID(),
      organizationId,
      displayId,
      documentTypeId: docType.id,
      subjectType: oldDoc.subjectType,
      vehicleId: oldDoc.vehicleId ?? null,
      driverId: oldDoc.driverId ?? null,
      documentNumber:
        input.documentNumber !== undefined
          ? input.documentNumber || null
          : (oldDoc.documentNumber ?? null),
      issuerName:
        input.issuingAuthority !== undefined
          ? input.issuingAuthority || null
          : (oldDoc.issuerName ?? null),
      issuedOn:
        input.issuedOn !== undefined ? parseDateInput(input.issuedOn) : (oldDoc.issuedOn ?? null),
      expiresOn:
        input.expiresOn !== undefined
          ? parseDateInput(input.expiresOn)
          : (oldDoc.expiresOn ?? null),
      notes: input.notes !== undefined ? input.notes || null : (oldDoc.notes ?? null),
      objectKey,
      originalFileName: file.originalname,
      mimeType: detectedMimeType,
      sizeBytes,
      storageETag: etag ?? null,
      createdBy: metadata.actorId,
    });

    // 6. Supersede Old Document
    oldDoc.supersede({
      newDocumentId: newDoc.id,
      supersededBy: metadata.actorId,
    });

    // 7. Atomic Transactional Save
    await this.repository.saveDocumentReplacement(oldDoc, newDoc, metadata);

    return newDoc.toJSON();
  }

  public async revokeDocument(
    organizationId: string,
    documentId: string,
    input: RevokeDocumentInput,
    metadata: ComplianceMutationMetadata,
  ): Promise<ReturnType<ComplianceDocument['toJSON']>> {
    const doc = await this.repository.findDocumentById(organizationId, documentId);
    if (!doc) {
      throw new ComplianceDocumentNotFoundError(documentId);
    }

    doc.revoke({
      reason: input.reason,
      revokedBy: metadata.actorId,
      expectedVersion: doc.version,
    });

    await this.repository.saveDocument(doc, metadata, 'ComplianceDocumentRevoked');

    return doc.toJSON();
  }

  public async getDocument(
    organizationId: string,
    id: string,
  ): Promise<ReturnType<ComplianceDocument['toJSON']>> {
    const doc = await this.repository.findDocumentById(organizationId, id);
    if (!doc) {
      throw new ComplianceDocumentNotFoundError(id);
    }
    return doc.toJSON();
  }

  public async getSignedDownloadUrl(
    organizationId: string,
    documentId: string,
    metadata: ComplianceMutationMetadata,
  ): Promise<{
    downloadUrl: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    expiresInSeconds: number;
  }> {
    const doc = await this.repository.findDocumentById(organizationId, documentId);
    if (!doc) {
      throw new ComplianceDocumentNotFoundError(documentId);
    }

    const expiresInSeconds = 300;
    const downloadUrl = await this.objectStorage.getSignedDownloadUrl({
      objectKey: doc.objectKey,
      expiresInSeconds,
    });

    await this.repository.recordDownloadAudit(organizationId, doc, metadata);

    return {
      downloadUrl,
      fileName: doc.originalFileName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      expiresInSeconds,
    };
  }

  public async listDocumentsForSubject(
    organizationId: string,
    subjectType: ComplianceSubjectType,
    subjectId: string,
    params: {
      status?: ComplianceDocumentStatus | undefined;
      limit?: number | undefined;
      offset?: number | undefined;
    },
  ) {
    const filter: {
      organizationId: string;
      subjectType: ComplianceSubjectType;
      subjectId: string;
      status?: ComplianceDocumentStatus;
      limit?: number;
      offset?: number;
    } = { organizationId, subjectType, subjectId };

    if (params.status !== undefined) filter.status = params.status;
    if (params.limit !== undefined) filter.limit = params.limit;
    if (params.offset !== undefined) filter.offset = params.offset;

    const res = await this.repository.listDocumentsForSubject(filter);
    return {
      items: res.items.map((i) => i.toJSON()),
      total: res.total,
    };
  }

  public async listDocuments(
    organizationId: string,
    params: {
      subjectType?: ComplianceSubjectType | undefined;
      documentTypeId?: string | undefined;
      status?: ComplianceDocumentStatus | undefined;
      limit?: number | undefined;
      offset?: number | undefined;
    },
  ) {
    const filter: {
      organizationId: string;
      subjectType?: ComplianceSubjectType;
      documentTypeId?: string;
      status?: ComplianceDocumentStatus;
      limit?: number;
      offset?: number;
    } = { organizationId };

    if (params.subjectType !== undefined) filter.subjectType = params.subjectType;
    if (params.documentTypeId !== undefined) filter.documentTypeId = params.documentTypeId;
    if (params.status !== undefined) filter.status = params.status;
    if (params.limit !== undefined) filter.limit = params.limit;
    if (params.offset !== undefined) filter.offset = params.offset;

    const res = await this.repository.listDocuments(filter);
    return {
      items: res.items.map((i) => i.toJSON()),
      total: res.total,
    };
  }

  // =========================================================================
  // Fleet Summary & Exceptions
  // =========================================================================

  public async getComplianceSummary(
    organizationId: string,
    referenceDate: Date = new Date(),
  ): Promise<ComplianceSummaryData> {
    return this.repository.getComplianceSummary(organizationId, referenceDate);
  }

  public async getComplianceExceptions(
    organizationId: string,
    params: {
      subjectType?: ComplianceSubjectType | undefined;
      operationallyBlocked?: boolean | undefined;
      limit?: number | undefined;
      offset?: number | undefined;
      referenceDate?: Date | undefined;
    },
  ): Promise<{ items: ComplianceExceptionItem[]; total: number }> {
    const filter: {
      organizationId: string;
      subjectType?: ComplianceSubjectType;
      operationallyBlocked?: boolean;
      limit?: number;
      offset?: number;
      referenceDate: Date;
    } = { organizationId, referenceDate: params.referenceDate || new Date() };

    if (params.subjectType !== undefined) filter.subjectType = params.subjectType;
    if (params.operationallyBlocked !== undefined) {
      filter.operationallyBlocked = params.operationallyBlocked;
    }
    if (params.limit !== undefined) filter.limit = params.limit;
    if (params.offset !== undefined) filter.offset = params.offset;

    return this.repository.getComplianceExceptions(filter);
  }
}
