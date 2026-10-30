import { ApplicationError, type ApplicationErrorCode } from '../../foundation/domain/errors.js';

export class ComplianceDomainError extends ApplicationError {
  constructor(code: ApplicationErrorCode, message: string, details?: unknown) {
    super(code, message, details);
    this.name = 'ComplianceDomainError';
  }
}

export class DocumentTypeNotFoundError extends ComplianceDomainError {
  constructor(typeId: string) {
    super('DOCUMENT_TYPE_NOT_FOUND', `Compliance document type ${typeId} was not found.`, {
      typeId,
    });
  }
}

export class DocumentTypeArchivedError extends ComplianceDomainError {
  constructor(typeId: string) {
    super(
      'DOCUMENT_TYPE_ARCHIVED',
      `Compliance document type ${typeId} is ARCHIVED and cannot accept new documents.`,
      { typeId },
    );
  }
}

export class DocumentTypeSubjectMismatchError extends ComplianceDomainError {
  constructor(typeSubject: string, targetSubject: string) {
    super(
      'DOCUMENT_TYPE_SUBJECT_MISMATCH',
      `Document type is for ${typeSubject} but target subject is ${targetSubject}.`,
      { typeSubject, targetSubject },
    );
  }
}

export class DocumentTypeCodeAlreadyExistsError extends ComplianceDomainError {
  constructor(code: string) {
    super(
      'DOCUMENT_TYPE_CODE_ALREADY_EXISTS',
      `Compliance document type with code '${code}' already exists.`,
      { code },
    );
  }
}

export class ComplianceDocumentNotFoundError extends ComplianceDomainError {
  constructor(documentId: string) {
    super('COMPLIANCE_DOCUMENT_NOT_FOUND', `Compliance document ${documentId} was not found.`, {
      documentId,
    });
  }
}

export class ComplianceDocumentAlreadyRevokedError extends ComplianceDomainError {
  constructor(documentId: string) {
    super(
      'COMPLIANCE_DOCUMENT_ALREADY_REVOKED',
      `Compliance document ${documentId} is already revoked.`,
      { documentId },
    );
  }
}

export class ComplianceDocumentNotActiveError extends ComplianceDomainError {
  constructor(documentId: string, currentStatus: string) {
    super(
      'COMPLIANCE_DOCUMENT_NOT_ACTIVE',
      `Compliance document ${documentId} is in status ${currentStatus} (expected ACTIVE).`,
      { documentId, currentStatus },
    );
  }
}

export class DocumentExpiryRequiredError extends ComplianceDomainError {
  constructor(typeCode: string) {
    super(
      'DOCUMENT_EXPIRY_REQUIRED',
      `Document type '${typeCode}' requires an expiration date (expiresOn).`,
      { typeCode },
    );
  }
}

export class InvalidDocumentDateRangeError extends ComplianceDomainError {
  constructor(issuedOn: string, expiresOn: string) {
    super(
      'INVALID_DOCUMENT_DATE_RANGE',
      `Document expiresOn (${expiresOn}) must be on or after issuedOn (${issuedOn}).`,
      { issuedOn, expiresOn },
    );
  }
}

export class ActiveDocumentAlreadyExistsError extends ComplianceDomainError {
  constructor(subjectType: string, subjectId: string, typeCode: string) {
    super(
      'ACTIVE_DOCUMENT_ALREADY_EXISTS',
      `An active document of type '${typeCode}' already exists for ${subjectType} ${subjectId}. Use replace to supersede.`,
      { subjectType, subjectId, typeCode },
    );
  }
}

export class UnsupportedDocumentFileTypeError extends ComplianceDomainError {
  constructor(mimeType: string, allowedTypes: string[]) {
    super(
      'UNSUPPORTED_DOCUMENT_FILE_TYPE',
      `Unsupported file type '${mimeType}'. Allowed formats: ${allowedTypes.join(', ')}.`,
      { mimeType, allowedTypes },
    );
  }
}

export class DocumentFileTooLargeError extends ComplianceDomainError {
  constructor(sizeBytes: number, maxBytes: number) {
    super(
      'DOCUMENT_FILE_TOO_LARGE',
      `File size (${sizeBytes} bytes) exceeds maximum allowed size (${maxBytes} bytes).`,
      { sizeBytes, maxBytes },
    );
  }
}

export class DocumentStorageFailedError extends ComplianceDomainError {
  constructor(reason: string) {
    super('DOCUMENT_STORAGE_FAILED', `Failed to store document file in object storage: ${reason}`, {
      reason,
    });
  }
}

export class VehicleComplianceBlockedError extends ComplianceDomainError {
  constructor(vehicleId: string, reasons: string[]) {
    super(
      'VEHICLE_COMPLIANCE_BLOCKED',
      `Vehicle ${vehicleId} is operationally blocked by compliance requirements: ${reasons.join('; ')}`,
      { vehicleId, reasons },
    );
  }
}

export class DriverComplianceBlockedError extends ComplianceDomainError {
  constructor(driverId: string, reasons: string[]) {
    super(
      'DRIVER_COMPLIANCE_BLOCKED',
      `Driver ${driverId} is operationally blocked by compliance requirements: ${reasons.join('; ')}`,
      { driverId, reasons },
    );
  }
}

export class ComplianceConcurrencyConflictError extends ComplianceDomainError {
  constructor(entityType: string, id: string, expectedVersion: number, actualVersion: number) {
    super(
      'CONCURRENCY_CONFLICT',
      `Concurrency conflict on ${entityType} ${id}: expected version ${expectedVersion}, but actual version is ${actualVersion}.`,
      { entityType, id, expectedVersion, actualVersion },
    );
  }
}
