import { ComplianceConcurrencyConflictError, ComplianceDomainError } from './compliance-errors.js';

export type ComplianceSubjectType = 'VEHICLE' | 'DRIVER';
export type ComplianceDocumentTypeStatus = 'ACTIVE' | 'ARCHIVED';

export interface ComplianceDocumentTypeProps {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  description?: string | null;
  subjectType: ComplianceSubjectType;
  status: ComplianceDocumentTypeStatus;
  required: boolean;
  blocksOperation: boolean;
  requiresExpiry: boolean;
  warningDaysBeforeExpiry: number;
  version: number;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
}

export class ComplianceDocumentType {
  private constructor(private props: ComplianceDocumentTypeProps) {}

  public static create(params: {
    id: string;
    organizationId: string;
    code: string;
    name: string;
    description?: string | null;
    subjectType: ComplianceSubjectType;
    required?: boolean;
    blocksOperation?: boolean;
    requiresExpiry?: boolean;
    warningDaysBeforeExpiry?: number;
    createdBy: string;
    createdAt?: Date;
  }): ComplianceDocumentType {
    const normalizedCode = params.code.trim().toUpperCase().replace(/\s+/g, '_');
    if (!/^[A-Z0-9_-]{2,100}$/.test(normalizedCode)) {
      throw new ComplianceDomainError(
        'INVALID_DOCUMENT_TYPE_CODE',
        `Document type code '${params.code}' must be 2-100 uppercase alphanumeric characters, dashes, or underscores.`,
      );
    }

    if (!params.name.trim()) {
      throw new ComplianceDomainError(
        'INVALID_COMPLIANCE_DATA',
        'Document type name cannot be empty.',
      );
    }

    const blocksOperation = params.blocksOperation ?? false;
    const required = params.required ?? false;
    if (blocksOperation && !required) {
      throw new ComplianceDomainError(
        'INVALID_POLICY',
        'Document type with blocksOperation=true must have required=true.',
      );
    }

    const warningDays = params.warningDaysBeforeExpiry ?? 30;
    if (warningDays < 0 || !Number.isInteger(warningDays)) {
      throw new ComplianceDomainError(
        'INVALID_WARNING_DAYS',
        'Warning days before expiry must be a non-negative integer.',
      );
    }

    const now = params.createdAt ?? new Date();

    return new ComplianceDocumentType({
      id: params.id,
      organizationId: params.organizationId,
      code: normalizedCode,
      name: params.name.trim(),
      description: params.description?.trim() || null,
      subjectType: params.subjectType,
      status: 'ACTIVE',
      required,
      blocksOperation,
      requiresExpiry: params.requiresExpiry ?? false,
      warningDaysBeforeExpiry: warningDays,
      version: 1,
      createdAt: now,
      createdBy: params.createdBy,
      updatedAt: now,
      updatedBy: params.createdBy,
    });
  }

  public static rehydrate(props: ComplianceDocumentTypeProps): ComplianceDocumentType {
    return new ComplianceDocumentType({ ...props });
  }

  public updatePolicy(params: {
    name?: string;
    description?: string | null;
    required?: boolean;
    blocksOperation?: boolean;
    requiresExpiry?: boolean;
    warningDaysBeforeExpiry?: number;
    updatedBy: string;
    expectedVersion: number;
    updatedAt?: Date;
  }): void {
    this.assertVersion(params.expectedVersion);

    if (this.props.status === 'ARCHIVED') {
      throw new ComplianceDomainError(
        'DOCUMENT_TYPE_ARCHIVED',
        'Cannot update policy of an ARCHIVED document type.',
      );
    }

    if (params.name !== undefined) {
      if (!params.name.trim()) {
        throw new ComplianceDomainError(
          'INVALID_COMPLIANCE_DATA',
          'Document type name cannot be empty.',
        );
      }
      this.props.name = params.name.trim();
    }

    if (params.description !== undefined) {
      this.props.description = params.description?.trim() || null;
    }

    let nextBlocksOperation = this.props.blocksOperation;
    if (params.blocksOperation !== undefined) {
      nextBlocksOperation = params.blocksOperation;
    }

    let nextRequired = this.props.required;
    if (params.required !== undefined) {
      nextRequired = params.required;
    }

    if (nextBlocksOperation && !nextRequired) {
      throw new ComplianceDomainError(
        'INVALID_POLICY',
        'Document type with blocksOperation=true must have required=true.',
      );
    }

    this.props.blocksOperation = nextBlocksOperation;
    this.props.required = nextRequired;

    if (params.requiresExpiry !== undefined) {
      this.props.requiresExpiry = params.requiresExpiry;
    }

    if (params.warningDaysBeforeExpiry !== undefined) {
      if (params.warningDaysBeforeExpiry < 0 || !Number.isInteger(params.warningDaysBeforeExpiry)) {
        throw new ComplianceDomainError(
          'INVALID_WARNING_DAYS',
          'Warning days before expiry must be a non-negative integer.',
        );
      }
      this.props.warningDaysBeforeExpiry = params.warningDaysBeforeExpiry;
    }

    this.props.version += 1;
    this.props.updatedBy = params.updatedBy;
    this.props.updatedAt = params.updatedAt ?? new Date();
  }

  public archive(params: { updatedBy: string; expectedVersion: number; updatedAt?: Date }): void {
    this.assertVersion(params.expectedVersion);

    if (this.props.status === 'ARCHIVED') {
      throw new ComplianceDomainError(
        'DOCUMENT_TYPE_ALREADY_ARCHIVED',
        'Compliance document type is already ARCHIVED.',
      );
    }

    this.props.status = 'ARCHIVED';
    this.props.version += 1;
    this.props.updatedBy = params.updatedBy;
    this.props.updatedAt = params.updatedAt ?? new Date();
  }

  private assertVersion(expectedVersion: number): void {
    if (this.props.version !== expectedVersion) {
      throw new ComplianceConcurrencyConflictError(
        'ComplianceDocumentType',
        this.props.id,
        expectedVersion,
        this.props.version,
      );
    }
  }

  public toJSON(): ComplianceDocumentTypeProps {
    return { ...this.props };
  }

  // Getters
  public get id(): string {
    return this.props.id;
  }
  public get organizationId(): string {
    return this.props.organizationId;
  }
  public get code(): string {
    return this.props.code;
  }
  public get name(): string {
    return this.props.name;
  }
  public get description(): string | null | undefined {
    return this.props.description;
  }
  public get subjectType(): ComplianceSubjectType {
    return this.props.subjectType;
  }
  public get status(): ComplianceDocumentTypeStatus {
    return this.props.status;
  }
  public get required(): boolean {
    return this.props.required;
  }
  public get blocksOperation(): boolean {
    return this.props.blocksOperation;
  }
  public get requiresExpiry(): boolean {
    return this.props.requiresExpiry;
  }
  public get warningDaysBeforeExpiry(): number {
    return this.props.warningDaysBeforeExpiry;
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
