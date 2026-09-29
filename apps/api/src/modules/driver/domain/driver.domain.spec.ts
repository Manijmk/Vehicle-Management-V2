import { describe, expect, it } from 'vitest';

import { ApplicationError } from '../../foundation/domain/errors.js';
import {
  assertDriverTransition,
  assertLicenseDateRange,
  calculateDriverEligibility,
  isLicenseValid,
  normalizeCountry,
  normalizeDisplayId,
  normalizeEmail,
  normalizeEmployeeNumber,
  normalizeLicenseNumber,
  normalizeName,
  normalizePhone,
} from './driver.js';

describe('driver domain rules', () => {
  describe('lifecycle transitions', () => {
    it('allows valid state transitions', () => {
      expect(() => assertDriverTransition('DRAFT', 'ACTIVE')).not.toThrow();
      expect(() => assertDriverTransition('DRAFT', 'INACTIVE')).not.toThrow();
      expect(() => assertDriverTransition('ACTIVE', 'SUSPENDED')).not.toThrow();
      expect(() => assertDriverTransition('ACTIVE', 'INACTIVE')).not.toThrow();
      expect(() => assertDriverTransition('SUSPENDED', 'ACTIVE')).not.toThrow();
      expect(() => assertDriverTransition('SUSPENDED', 'INACTIVE')).not.toThrow();
      expect(() => assertDriverTransition('ACTIVE', 'ACTIVE')).not.toThrow();
    });

    it('rejects invalid state transitions and terminal states', () => {
      expect(() => assertDriverTransition('DRAFT', 'SUSPENDED')).toThrowError(ApplicationError);
      expect(() => assertDriverTransition('INACTIVE', 'ACTIVE')).toThrowError(ApplicationError);
      expect(() => assertDriverTransition('INACTIVE', 'DRAFT')).toThrowError(ApplicationError);
      expect(() => assertDriverTransition('INACTIVE', 'SUSPENDED')).toThrowError(ApplicationError);
    });
  });

  describe('identifier and field normalization', () => {
    it('normalizes displayId, names, email, phone, and employee number', () => {
      expect(normalizeDisplayId('  DRV-1001  ')).toBe('DRV-1001');
      expect(normalizeName('  John  ', 'First name')).toBe('John');
      expect(normalizeName('  Doe  ', 'Last name')).toBe('Doe');
      expect(normalizeEmail('  John.Doe@Example.Com  ')).toBe('john.doe@example.com');
      expect(normalizeEmail('')).toBeNull();
      expect(normalizeEmail(undefined)).toBeNull();
      expect(normalizePhone('  +1-555-0199  ')).toBe('+1-555-0199');
      expect(normalizeEmployeeNumber('  EMP-4421  ')).toBe('EMP-4421');
      expect(normalizeLicenseNumber('  dl-992-881  ')).toBe('DL-992-881');
      expect(normalizeCountry('  us  ')).toBe('US');
    });

    it('rejects invalid emails and empty names', () => {
      expect(() => normalizeEmail('not-an-email')).toThrowError(ApplicationError);
      expect(() => normalizeName('', 'First name')).toThrowError(ApplicationError);
      expect(() => normalizeCountry('USA1')).toThrowError(ApplicationError);
    });
  });

  describe('license validity and date range', () => {
    const fixedReference = new Date('2026-06-15T12:00:00Z');

    it('rejects inverted license date ranges', () => {
      const issue = new Date('2026-07-01');
      const expiry = new Date('2026-01-01');
      expect(() => assertLicenseDateRange(issue, expiry)).toThrowError(ApplicationError);
    });

    it('evaluates license validity deterministically against reference date', () => {
      const validLicense = {
        issueDate: new Date('2025-01-01T00:00:00Z'),
        expiryDate: new Date('2027-01-01T00:00:00Z'),
      };
      const expiredLicense = {
        issueDate: new Date('2023-01-01T00:00:00Z'),
        expiryDate: new Date('2025-01-01T00:00:00Z'),
      };
      const futureLicense = {
        issueDate: new Date('2026-08-01T00:00:00Z'),
        expiryDate: new Date('2028-08-01T00:00:00Z'),
      };

      expect(isLicenseValid(validLicense, fixedReference)).toBe(true);
      expect(isLicenseValid(expiredLicense, fixedReference)).toBe(false);
      expect(isLicenseValid(futureLicense, fixedReference)).toBe(false);
    });
  });

  describe('eligibility policy evaluation', () => {
    const referenceDate = new Date('2026-06-15T12:00:00Z');
    const validLicense = {
      issueDate: new Date('2025-01-01T00:00:00Z'),
      expiryDate: new Date('2027-01-01T00:00:00Z'),
    };
    const expiredLicense = {
      issueDate: new Date('2023-01-01T00:00:00Z'),
      expiryDate: new Date('2025-01-01T00:00:00Z'),
    };

    it('marks active driver with valid license as eligible', () => {
      const result = calculateDriverEligibility('ACTIVE', [validLicense], referenceDate);
      expect(result.eligible).toBe(true);
      expect(result.reasonCodes).toHaveLength(0);
    });

    it('marks active driver without license as ineligible with NO_VALID_LICENSE', () => {
      const result = calculateDriverEligibility('ACTIVE', [], referenceDate);
      expect(result.eligible).toBe(false);
      expect(result.reasonCodes).toContain('NO_VALID_LICENSE');
    });

    it('marks active driver with only expired licenses as ineligible with LICENSE_EXPIRED', () => {
      const result = calculateDriverEligibility('ACTIVE', [expiredLicense], referenceDate);
      expect(result.eligible).toBe(false);
      expect(result.reasonCodes).toContain('LICENSE_EXPIRED');
      expect(result.reasonCodes).toContain('NO_VALID_LICENSE');
    });

    it('marks draft or suspended driver as ineligible regardless of license', () => {
      const draftResult = calculateDriverEligibility('DRAFT', [validLicense], referenceDate);
      expect(draftResult.eligible).toBe(false);
      expect(draftResult.reasonCodes).toContain('DRIVER_NOT_ACTIVE');
      expect(draftResult.reasonCodes).toContain('DRIVER_DRAFT');

      const suspendedResult = calculateDriverEligibility(
        'SUSPENDED',
        [validLicense],
        referenceDate,
      );
      expect(suspendedResult.eligible).toBe(false);
      expect(suspendedResult.reasonCodes).toContain('DRIVER_NOT_ACTIVE');
      expect(suspendedResult.reasonCodes).toContain('DRIVER_SUSPENDED');
    });
  });
});
