import { ApplicationError } from '../../foundation/domain/errors.js';

export const driverStatuses = ['DRAFT', 'ACTIVE', 'SUSPENDED', 'INACTIVE'] as const;
export type DriverStatus = (typeof driverStatuses)[number];

const transitions: Readonly<Record<DriverStatus, readonly DriverStatus[]>> = {
  DRAFT: ['ACTIVE', 'INACTIVE'],
  ACTIVE: ['SUSPENDED', 'INACTIVE'],
  SUSPENDED: ['ACTIVE', 'INACTIVE'],
  INACTIVE: [],
};

export function assertDriverTransition(from: DriverStatus, to: DriverStatus): void {
  if (from === to) return;
  if (!transitions[from].includes(to)) {
    throw new ApplicationError(
      'INVALID_DRIVER_STATUS_TRANSITION',
      `Driver cannot transition from ${from} to ${to}`,
    );
  }
}

export function normalizeDisplayId(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 40) {
    throw new ApplicationError('INVALID_DRIVER_DATA', 'Display ID must be 1-40 characters');
  }
  return trimmed;
}

export function normalizeName(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 100) {
    throw new ApplicationError(
      'INVALID_DRIVER_DATA',
      `${fieldName} must be between 1 and 100 characters`,
    );
  }
  return trimmed;
}

export function normalizeEmail(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(trimmed)) {
    throw new ApplicationError('INVALID_DRIVER_DATA', 'Invalid email address format');
  }
  return trimmed;
}

export function normalizePhone(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

export function normalizeEmployeeNumber(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

export function normalizeLicenseNumber(value: string): string {
  const trimmed = value.trim().toUpperCase();
  if (trimmed.length === 0 || trimmed.length > 50) {
    throw new ApplicationError(
      'INVALID_DRIVER_DATA',
      'License number must be between 1 and 50 characters',
    );
  }
  return trimmed;
}

export function normalizeCountry(value: string): string {
  const trimmed = value.trim().toUpperCase();
  if (!/^[A-Z]{2,3}$/u.test(trimmed)) {
    throw new ApplicationError(
      'INVALID_DRIVER_DATA',
      'Issuing country must be a 2 or 3-letter ISO code',
    );
  }
  return trimmed;
}

export function assertLicenseDateRange(issueDate: Date, expiryDate: Date): void {
  if (Number.isNaN(issueDate.getTime()) || Number.isNaN(expiryDate.getTime())) {
    throw new ApplicationError('INVALID_LICENSE_DATE_RANGE', 'License dates must be valid dates');
  }
  if (issueDate.getTime() > expiryDate.getTime()) {
    throw new ApplicationError(
      'INVALID_LICENSE_DATE_RANGE',
      'License issue date cannot be after expiry date',
    );
  }
}

export interface LicenseDateCheck {
  readonly issueDate: Date | string;
  readonly expiryDate: Date | string;
}

export function isLicenseValid(
  license: LicenseDateCheck,
  referenceDate: Date = new Date(),
): boolean {
  const issue = license.issueDate instanceof Date ? license.issueDate : new Date(license.issueDate);
  const expiry =
    license.expiryDate instanceof Date ? license.expiryDate : new Date(license.expiryDate);
  const refTime = referenceDate.getTime();
  return issue.getTime() <= refTime && expiry.getTime() >= refTime;
}

export interface DriverEligibility {
  readonly eligible: boolean;
  readonly reasonCodes: readonly string[];
}

export function calculateDriverEligibility(
  status: DriverStatus,
  licenses: readonly LicenseDateCheck[],
  referenceDate: Date = new Date(),
): DriverEligibility {
  const reasons: string[] = [];

  if (status !== 'ACTIVE') {
    reasons.push('DRIVER_NOT_ACTIVE');
    if (status === 'SUSPENDED') {
      reasons.push('DRIVER_SUSPENDED');
    } else if (status === 'DRAFT') {
      reasons.push('DRIVER_DRAFT');
    } else if (status === 'INACTIVE') {
      reasons.push('DRIVER_INACTIVE');
    }
  }

  if (licenses.length === 0) {
    reasons.push('NO_VALID_LICENSE');
  } else {
    const validCount = licenses.filter((lic) => isLicenseValid(lic, referenceDate)).length;
    if (validCount === 0) {
      reasons.push('LICENSE_EXPIRED');
      reasons.push('NO_VALID_LICENSE');
    }
  }

  return {
    eligible: reasons.length === 0,
    reasonCodes: reasons,
  };
}
