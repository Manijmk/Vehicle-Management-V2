import type {
  ComplianceDocument,
  ComplianceDocumentStatus,
} from '../domain/compliance-document.js';
import type {
  ComplianceDocumentType,
  ComplianceDocumentTypeStatus,
  ComplianceSubjectType,
} from '../domain/compliance-document-type.js';
import type { OverallComplianceState } from '../domain/compliance-evaluation.js';

export interface ComplianceMutationMetadata {
  actorId: string;
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ComplianceSummaryData {
  nonCompliantVehicles: number;
  nonCompliantDrivers: number;
  blockedVehicles: number;
  blockedDrivers: number;
  expiringDocuments: number;
  expiredDocuments: number;
  missingRequiredDocuments: number;
}

export interface ComplianceExceptionItem {
  subjectType: ComplianceSubjectType;
  subjectId: string;
  subjectDisplayId: string;
  subjectName: string;
  overallState: OverallComplianceState;
  operationallyBlocked: boolean;
  blockingReasons: string[];
  issuesCount: number;
}

export interface ComplianceRepository {
  // Document Types
  saveDocumentType(
    type: ComplianceDocumentType,
    metadata: ComplianceMutationMetadata,
    eventType:
      | 'ComplianceDocumentTypeCreated'
      | 'ComplianceDocumentTypePolicyChanged'
      | 'ComplianceDocumentTypeArchived',
  ): Promise<void>;
  findDocumentTypeById(organizationId: string, id: string): Promise<ComplianceDocumentType | null>;
  findDocumentTypeByCode(
    organizationId: string,
    code: string,
  ): Promise<ComplianceDocumentType | null>;
  listDocumentTypes(params: {
    organizationId: string;
    subjectType?: ComplianceSubjectType;
    status?: ComplianceDocumentTypeStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ items: ComplianceDocumentType[]; total: number }>;

  // Compliance Documents
  saveDocument(
    doc: ComplianceDocument,
    metadata: ComplianceMutationMetadata,
    eventType: 'ComplianceDocumentUploaded' | 'ComplianceDocumentRevoked',
  ): Promise<void>;
  saveDocumentReplacement(
    oldDoc: ComplianceDocument,
    newDoc: ComplianceDocument,
    metadata: ComplianceMutationMetadata,
  ): Promise<void>;
  recordDownloadAudit(
    organizationId: string,
    doc: ComplianceDocument,
    metadata: ComplianceMutationMetadata,
  ): Promise<void>;
  findDocumentById(organizationId: string, id: string): Promise<ComplianceDocument | null>;
  findActiveDocumentForSubject(
    organizationId: string,
    subjectType: ComplianceSubjectType,
    subjectId: string,
    documentTypeId: string,
  ): Promise<ComplianceDocument | null>;
  listActiveDocumentsForSubject(
    organizationId: string,
    subjectType: ComplianceSubjectType,
    subjectId: string,
  ): Promise<ComplianceDocument[]>;
  listDocumentsForSubject(params: {
    organizationId: string;
    subjectType: ComplianceSubjectType;
    subjectId: string;
    status?: ComplianceDocumentStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ items: ComplianceDocument[]; total: number }>;
  listDocuments(params: {
    organizationId: string;
    subjectType?: ComplianceSubjectType;
    documentTypeId?: string;
    status?: ComplianceDocumentStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ items: ComplianceDocument[]; total: number }>;

  // Summary & Exceptions
  getComplianceSummary(organizationId: string, referenceDate: Date): Promise<ComplianceSummaryData>;
  getComplianceExceptions(params: {
    organizationId: string;
    subjectType?: ComplianceSubjectType;
    operationallyBlocked?: boolean;
    limit?: number;
    offset?: number;
    referenceDate?: Date;
  }): Promise<{ items: ComplianceExceptionItem[]; total: number }>;

  // Subject existence & display
  vehicleExists(
    organizationId: string,
    vehicleId: string,
  ): Promise<{ exists: boolean; displayId: string; status: string } | null>;
  driverExists(
    organizationId: string,
    driverId: string,
  ): Promise<{ exists: boolean; displayId: string; status: string; name: string } | null>;

  // Display ID generator
  generateNextDisplayId(organizationId: string, prefix: string): Promise<string>;
}
