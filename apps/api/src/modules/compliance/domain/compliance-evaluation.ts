import type { ComplianceDocument } from './compliance-document.js';
import type { ComplianceDocumentType, ComplianceSubjectType } from './compliance-document-type.js';

export type ComplianceRequirementDerivedState = 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'MISSING';

export type OverallComplianceState = 'COMPLIANT' | 'WARNING' | 'NON_COMPLIANT';

export interface RequirementEvaluation {
  documentTypeId: string;
  documentTypeCode: string;
  documentTypeName: string;
  subjectType: ComplianceSubjectType;
  required: boolean;
  blocksOperation: boolean;
  warningDaysBeforeExpiry: number;
  activeDocument: {
    id: string;
    displayId: string;
    documentNumber: string | null;
    issuerName: string | null;
    issuedOn: Date | null;
    expiresOn: Date | null;
    status: string;
    objectKey: string;
    originalFileName: string;
  } | null;
  derivedState: ComplianceRequirementDerivedState;
  isBlocking: boolean;
  reasonCode:
    'REQUIRED_DOCUMENT_MISSING' | 'REQUIRED_DOCUMENT_EXPIRED' | 'DOCUMENT_EXPIRING_SOON' | null;
}

export interface SubjectComplianceEvaluation {
  subjectType: ComplianceSubjectType;
  subjectId: string;
  overallState: OverallComplianceState;
  operationallyBlocked: boolean;
  blockingReasons: string[];
  referenceDate: Date;
  requirements: RequirementEvaluation[];
}

export function evaluateSubjectCompliance(params: {
  subjectType: ComplianceSubjectType;
  subjectId: string;
  documentTypes: ComplianceDocumentType[];
  activeDocuments: ComplianceDocument[];
  referenceDate?: Date;
}): SubjectComplianceEvaluation {
  const referenceDate = params.referenceDate ?? new Date();

  // Filter only active document types for this subject type
  const activeTypes = params.documentTypes.filter(
    (t) => t.status === 'ACTIVE' && t.subjectType === params.subjectType,
  );

  // Map active documents by documentTypeId
  const docsByType = new Map<string, ComplianceDocument>();
  for (const doc of params.activeDocuments) {
    if (doc.status === 'ACTIVE') {
      docsByType.set(doc.documentTypeId, doc);
    }
  }

  const requirements: RequirementEvaluation[] = [];
  const blockingReasons: string[] = [];
  let hasMissingRequired = false;
  let hasExpiredRequired = false;
  let hasExpiringSoon = false;

  for (const dt of activeTypes) {
    const doc = docsByType.get(dt.id);

    let derivedState: ComplianceRequirementDerivedState;
    if (!doc) {
      derivedState = 'MISSING';
    } else {
      const docState = doc.evaluateCurrentState(referenceDate, dt.warningDaysBeforeExpiry);
      if (docState === 'EXPIRING_SOON') {
        derivedState = 'EXPIRING_SOON';
      } else if (docState === 'EXPIRED') {
        derivedState = 'EXPIRED';
      } else {
        derivedState = 'VALID';
      }
    }

    const isBlocking =
      dt.blocksOperation && (derivedState === 'MISSING' || derivedState === 'EXPIRED');

    let reasonCode: RequirementEvaluation['reasonCode'] = null;
    if (derivedState === 'MISSING' && dt.required) {
      reasonCode = 'REQUIRED_DOCUMENT_MISSING';
      hasMissingRequired = true;
      if (isBlocking) {
        blockingReasons.push(`Required document '${dt.name}' (${dt.code}) is missing.`);
      }
    } else if (derivedState === 'EXPIRED' && dt.required) {
      reasonCode = 'REQUIRED_DOCUMENT_EXPIRED';
      hasExpiredRequired = true;
      if (isBlocking) {
        blockingReasons.push(`Required document '${dt.name}' (${dt.code}) has expired.`);
      }
    } else if (derivedState === 'EXPIRING_SOON') {
      reasonCode = 'DOCUMENT_EXPIRING_SOON';
      hasExpiringSoon = true;
    }

    requirements.push({
      documentTypeId: dt.id,
      documentTypeCode: dt.code,
      documentTypeName: dt.name,
      subjectType: dt.subjectType,
      required: dt.required,
      blocksOperation: dt.blocksOperation,
      warningDaysBeforeExpiry: dt.warningDaysBeforeExpiry,
      activeDocument: doc
        ? {
            id: doc.id,
            displayId: doc.displayId,
            documentNumber: doc.documentNumber || null,
            issuerName: doc.issuerName || null,
            issuedOn: doc.issuedOn || null,
            expiresOn: doc.expiresOn || null,
            status: doc.status,
            objectKey: doc.objectKey,
            originalFileName: doc.originalFileName,
          }
        : null,
      derivedState,
      isBlocking,
      reasonCode,
    });
  }

  // Derive overallState
  let overallState: OverallComplianceState = 'COMPLIANT';
  if (hasMissingRequired || hasExpiredRequired) {
    overallState = 'NON_COMPLIANT';
  } else if (hasExpiringSoon) {
    overallState = 'WARNING';
  }

  const operationallyBlocked = blockingReasons.length > 0;

  return {
    subjectType: params.subjectType,
    subjectId: params.subjectId,
    overallState,
    operationallyBlocked,
    blockingReasons,
    referenceDate,
    requirements,
  };
}
