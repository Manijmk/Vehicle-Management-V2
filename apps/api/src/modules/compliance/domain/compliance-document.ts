import type { ComplianceSubjectType } from './compliance-document-type.js';
import {
  ComplianceConcurrencyConflictError,
  ComplianceDocumentAlreadyRevokedError,
  ComplianceDocumentNotActiveError,
  ComplianceDomainError,
  InvalidDocumentDateRangeError,
} from './compliance-errors.js';

export type ComplianceDocumentStatus = 'ACTIVE' | 'SUPERSEDED' | 'REVOKED';

export type ComplianceDerivedDocumentState =
  'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'SUPERSEDED' | 'REVOKED';

export interface ComplianceDocumentProps {
  id: string;
  organizationId: string;
  displayId: string;
  documentTypeId: string;
  subjectType: ComplianceSubjectType;
  vehicleId?: string | null;
  driverId?: string | null;
  documentNumber?: string | null;
  issuerName?: string | null;
  issuedOn?: Date | null;
  expiresOn?: Date | null;
  status: ComplianceDocumentStatus;
  notes?: string | null;
  objectKey: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  storageETag?: string | null;
  supersededAt?: Date | null;
  supersededById?: string | null;
  revokedAt?: Date | null;
  revokedBy?: string | null;
  revocationReason?: string | null;
  version: number;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
}

export class ComplianceDocument {
  private constructor(private props: ComplianceDocumentProps) {}

  public static create(params: {
    id: string;
    organizationId: string;
    displayId: string;
    documentTypeId: string;
    subjectType: ComplianceSubjectType;
    vehicleId?: string | null;
    driverId?: string | null;
    documentNumber?: string | null;
    issuerName?: string | null;
    issuedOn?: Date | null;
    expiresOn?: Date | null;
    notes?: string | null;
    objectKey: string;
    originalFileName: string;
    mimeType: string;
    sizeBytes: number;
    storageETag?: string | null;
    createdBy: string;
    createdAt?: Date;
  }): ComplianceDocument {
    // Subject integrity check: exactly one of vehicleId or driverId matching subjectType
    if (params.subjectType === 'VEHICLE') {
      if (!params.vehicleId || params.driverId) {
        throw new ComplianceDomainError(
          'INVALID_SUBJECT_LINK',
          'Vehicle document must have vehicleId and must not have driverId.',
        );
      }
    } else if (params.subjectType === 'DRIVER') {
      if (!params.driverId || params.vehicleId) {
        throw new ComplianceDomainError(
          'INVALID_SUBJECT_LINK',
          'Driver document must have driverId and must not have vehicleId.',
        );
      }
    }

    // Date range check: inclusive calendar date
    if (params.issuedOn && params.expiresOn) {
      const issued = normalizeToDateOnly(params.issuedOn);
      const expires = normalizeToDateOnly(params.expiresOn);
      if (expires < issued) {
        throw new InvalidDocumentDateRangeError(
          issued.toISOString().slice(0, 10),
          expires.toISOString().slice(0, 10),
        );
      }
    }

    const now = params.createdAt ?? new Date();

    return new ComplianceDocument({
      id: params.id,
      organizationId: params.organizationId,
      displayId: params.displayId,
      documentTypeId: params.documentTypeId,
      subjectType: params.subjectType,
      vehicleId: params.vehicleId || null,
      driverId: params.driverId || null,
      documentNumber: params.documentNumber?.trim() || null,
      issuerName: params.issuerName?.trim() || null,
      issuedOn: params.issuedOn ? normalizeToDateOnly(params.issuedOn) : null,
      expiresOn: params.expiresOn ? normalizeToDateOnly(params.expiresOn) : null,
      status: 'ACTIVE',
      notes: params.notes?.trim() || null,
      objectKey: params.objectKey,
      originalFileName: params.originalFileName,
      mimeType: params.mimeType,
      sizeBytes: params.sizeBytes,
      storageETag: params.storageETag || null,
      supersededAt: null,
      supersededById: null,
      revokedAt: null,
      revokedBy: null,
      revocationReason: null,
      version: 1,
      createdAt: now,
      createdBy: params.createdBy,
      updatedAt: now,
      updatedBy: params.createdBy,
    });
  }

  public static rehydrate(props: ComplianceDocumentProps): ComplianceDocument {
    return new ComplianceDocument({
      ...props,
      issuedOn: props.issuedOn ? normalizeToDateOnly(props.issuedOn) : null,
      expiresOn: props.expiresOn ? normalizeToDateOnly(props.expiresOn) : null,
    });
  }

  public supersede(params: { newDocumentId: string; supersededBy: string; at?: Date }): void {
    if (this.props.status !== 'ACTIVE') {
      throw new ComplianceDocumentNotActiveError(this.props.id, this.props.status);
    }

    const now = params.at ?? new Date();
    this.props.status = 'SUPERSEDED';
    this.props.supersededById = params.newDocumentId;
    this.props.supersededAt = now;
    this.props.version += 1;
    this.props.updatedBy = params.supersededBy;
    this.props.updatedAt = now;
  }

  public revoke(params: {
    reason: string;
    revokedBy: string;
    expectedVersion: number;
    at?: Date;
  }): void {
    this.assertVersion(params.expectedVersion);

    if (this.props.status === 'REVOKED') {
      throw new ComplianceDocumentAlreadyRevokedError(this.props.id);
    }

    if (this.props.status !== 'ACTIVE') {
      throw new ComplianceDocumentNotActiveError(this.props.id, this.props.status);
    }

    if (!params.reason.trim()) {
      throw new ComplianceDomainError(
        'INVALID_REVOCATION_REASON',
        'Revocation reason is mandatory and cannot be empty.',
      );
    }

    const now = params.at ?? new Date();
    this.props.status = 'REVOKED';
    this.props.revocationReason = params.reason.trim();
    this.props.revokedBy = params.revokedBy;
    this.props.revokedAt = now;
    this.props.version += 1;
    this.props.updatedBy = params.revokedBy;
    this.props.updatedAt = now;
  }

  /**
   * Evaluate the current derived state of this document.
   * Inclusive calendar expiry semantics:
   * Document is valid on referenceDate <= expiresOn.
   * Document is expired on referenceDate > expiresOn.
   */
  public evaluateCurrentState(
    referenceDate: Date = new Date(),
    warningDaysBeforeExpiry = 30,
  ): ComplianceDerivedDocumentState {
    if (this.props.status === 'SUPERSEDED') {
      return 'SUPERSEDED';
    }
    if (this.props.status === 'REVOKED') {
      return 'REVOKED';
    }

    if (!this.props.expiresOn) {
      return 'VALID';
    }

    const ref = normalizeToDateOnly(referenceDate);
    const exp = normalizeToDateOnly(this.props.expiresOn);

    if (ref > exp) {
      return 'EXPIRED';
    }

    // Days until expiry
    const diffMs = exp.getTime() - ref.getTime();
    const daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry <= warningDaysBeforeExpiry) {
      return 'EXPIRING_SOON';
    }

    return 'VALID';
  }

  private assertVersion(expectedVersion: number): void {
    if (this.props.version !== expectedVersion) {
      throw new ComplianceConcurrencyConflictError(
        'ComplianceDocument',
        this.props.id,
        expectedVersion,
        this.props.version,
      );
    }
  }

  public toJSON(): ComplianceDocumentProps {
    return { ...this.props };
  }

  // Getters
  public get id(): string {
    return this.props.id;
  }
  public get organizationId(): string {
    return this.props.organizationId;
  }
  public get displayId(): string {
    return this.props.displayId;
  }
  public get documentTypeId(): string {
    return this.props.documentTypeId;
  }
  public get subjectType(): ComplianceSubjectType {
    return this.props.subjectType;
  }
  public get vehicleId(): string | null | undefined {
    return this.props.vehicleId;
  }
  public get driverId(): string | null | undefined {
    return this.props.driverId;
  }
  public get documentNumber(): string | null | undefined {
    return this.props.documentNumber;
  }
  public get issuerName(): string | null | undefined {
    return this.props.issuerName;
  }
  public get issuedOn(): Date | null | undefined {
    return this.props.issuedOn;
  }
  public get expiresOn(): Date | null | undefined {
    return this.props.expiresOn;
  }
  public get status(): ComplianceDocumentStatus {
    return this.props.status;
  }
  public get notes(): string | null | undefined {
    return this.props.notes;
  }
  public get objectKey(): string {
    return this.props.objectKey;
  }
  public get originalFileName(): string {
    return this.props.originalFileName;
  }
  public get mimeType(): string {
    return this.props.mimeType;
  }
  public get sizeBytes(): number {
    return this.props.sizeBytes;
  }
  public get storageETag(): string | null | undefined {
    return this.props.storageETag;
  }
  public get supersededAt(): Date | null | undefined {
    return this.props.supersededAt;
  }
  public get supersededById(): string | null | undefined {
    return this.props.supersededById;
  }
  public get revokedAt(): Date | null | undefined {
    return this.props.revokedAt;
  }
  public get revokedBy(): string | null | undefined {
    return this.props.revokedBy;
  }
  public get revocationReason(): string | null | undefined {
    return this.props.revocationReason;
  }
  public get version(): number {
    return this.props.version;
  }
  public get createdAt(): Date {
    return this.props.createdAt;
  }
  public get createdBy(): string {
    return this.props.createdBy;
  }
  public get updatedAt(): Date {
    return this.props.updatedAt;
  }
  public get updatedBy(): string {
    return this.props.updatedBy;
  }
}

export function normalizeToDateOnly(d: Date): Date {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const date = d.getUTCDate();
  return new Date(Date.UTC(year, month, date, 0, 0, 0, 0));
}
