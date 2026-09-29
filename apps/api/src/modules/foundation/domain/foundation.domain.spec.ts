import { describe, expect, it } from 'vitest';

import { ApplicationError } from './errors.js';
import { assertMembershipTransition, normalizeEmail } from './membership.js';
import { assertOrganizationUsable } from './organization.js';
import { hasPermissions } from './permissions.js';

describe('foundation domain rules', () => {
  it('allows valid membership transitions and rejects resurrection after revocation', () => {
    expect(() => assertMembershipTransition('INVITED', 'ACTIVE')).not.toThrow();
    expect(() => assertMembershipTransition('REVOKED', 'ACTIVE')).toThrowError(ApplicationError);
  });

  it('normalizes email for stable uniqueness', () => {
    expect(normalizeEmail('  Admin@Example.TEST ')).toBe('admin@example.test');
  });

  it('requires every permission and never relies on role names', () => {
    const granted = new Set(['organization.read', 'role.read']);
    expect(hasPermissions(granted, ['organization.read', 'role.read'])).toBe(true);
    expect(hasPermissions(granted, ['organization.update'])).toBe(false);
  });

  it('rejects inactive organizations as tenant contexts', () => {
    expect(() => assertOrganizationUsable('ACTIVE')).not.toThrow();
    expect(() => assertOrganizationUsable('SUSPENDED')).toThrowError(ApplicationError);
  });
});
