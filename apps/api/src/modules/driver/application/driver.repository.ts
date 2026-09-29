import type { DriverStatus } from '../domain/driver.js';

export interface MutationMetadata {
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly requestId: string;
  readonly ipAddress?: string | undefined;
  readonly userAgent?: string | undefined;
}

export interface DriverLicenseRecord {
  readonly id: string;
  readonly driverId: string;
  readonly organizationId: string;
  readonly licenseNumber: string;
  readonly issuingCountry: string;
  readonly issuingRegion: string | null;
  readonly licenseClasses: readonly string[];
  readonly issueDate: Date;
  readonly expiryDate: Date;
  readonly notes: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly isValid?: boolean;
}

export interface DriverRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly displayId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly employeeNumber: string | null;
  readonly status: DriverStatus;
  readonly notes: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly licenses?: readonly DriverLicenseRecord[];
  readonly eligible?: boolean;
  readonly eligibilityReasons?: readonly string[];
}

export interface DriverStatusHistoryEntry {
  readonly id: string;
  readonly organizationId: string;
  readonly driverId: string;
  readonly fromStatus: DriverStatus | null;
  readonly toStatus: DriverStatus;
  readonly reason: string;
  readonly changedBy: string;
  readonly requestId: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
}

export interface ListDriversFilter {
  readonly status?: DriverStatus;
  readonly search?: string;
  readonly page?: number;
  readonly limit?: number;
}

export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

export interface DriverRepository {
  listDrivers(
    organizationId: string,
    filter?: ListDriversFilter,
  ): Promise<PaginatedResult<DriverRecord>>;

  getDriver(organizationId: string, driverId: string): Promise<DriverRecord>;

  createDriver(input: {
    organizationId: string;
    displayId?: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    employeeNumber?: string | null;
    notes?: string;
    metadata: MutationMetadata;
  }): Promise<DriverRecord>;

  updateDriver(input: {
    organizationId: string;
    driverId: string;
    displayId?: string;
    firstName?: string;
    lastName?: string;
    email?: string | null;
    phone?: string | null;
    employeeNumber?: string | null;
    notes?: string | null;
    version: number;
    metadata: MutationMetadata;
  }): Promise<DriverRecord>;

  activateDriver(input: {
    organizationId: string;
    driverId: string;
    version?: number;
    metadata: MutationMetadata;
  }): Promise<DriverRecord>;

  suspendDriver(input: {
    organizationId: string;
    driverId: string;
    reason: string;
    version: number;
    metadata: MutationMetadata;
  }): Promise<DriverRecord>;

  deactivateDriver(input: {
    organizationId: string;
    driverId: string;
    reason: string;
    version: number;
    metadata: MutationMetadata;
  }): Promise<DriverRecord>;

  listStatusHistory(organizationId: string, driverId: string): Promise<DriverStatusHistoryEntry[]>;

  listLicenses(organizationId: string, driverId: string): Promise<DriverLicenseRecord[]>;

  addLicense(input: {
    organizationId: string;
    driverId: string;
    licenseNumber: string;
    issuingCountry: string;
    issuingRegion?: string | null;
    licenseClasses: string[];
    issueDate: Date;
    expiryDate: Date;
    notes?: string | null;
    metadata: MutationMetadata;
  }): Promise<DriverLicenseRecord>;

  updateLicense(input: {
    organizationId: string;
    driverId: string;
    licenseId: string;
    licenseNumber?: string;
    issuingCountry?: string;
    issuingRegion?: string | null;
    licenseClasses?: string[];
    issueDate?: Date;
    expiryDate?: Date;
    notes?: string | null;
    version: number;
    metadata: MutationMetadata;
  }): Promise<DriverLicenseRecord>;

  removeLicense(input: {
    organizationId: string;
    driverId: string;
    licenseId: string;
    metadata: MutationMetadata;
  }): Promise<void>;
}
