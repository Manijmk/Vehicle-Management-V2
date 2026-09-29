import { describe, expect, it } from 'vitest';

import { ApplicationError } from '../../foundation/domain/errors.js';
import {
  assertVehicleTransition,
  normalizeDisplayId,
  normalizeRegistration,
  normalizeVin,
} from './vehicle.js';

describe('vehicle domain rules', () => {
  it('allows valid vehicle state transitions and rejects forbidden ones', () => {
    expect(() => assertVehicleTransition('DRAFT', 'ACTIVE')).not.toThrow();
    expect(() => assertVehicleTransition('ACTIVE', 'RETIRED')).not.toThrow();
    expect(() => assertVehicleTransition('RETIRED', 'ACTIVE')).toThrowError(ApplicationError);
  });

  it('normalizes identifiers for stable organization-scoped uniqueness', () => {
    expect(normalizeDisplayId('  V-204  ')).toBe('V-204');
    expect(normalizeRegistration('  AB 123CD  ')).toBe('AB 123CD');
    expect(normalizeVin('  1hgbh41zxmn109186  ')).toBe('1HGBH41ZXMN109186');
  });

  it('rejects invalid vehicle registration and vin values before persistence', () => {
    expect(() => normalizeRegistration('BAD')).toThrowError(ApplicationError);
    expect(() => normalizeVin('short')).toThrowError(ApplicationError);
  });
});
