import { ApplicationError } from './errors.js';

export const membershipStatuses = ['ACTIVE', 'INVITED', 'SUSPENDED', 'REVOKED'] as const;
export type MembershipState = (typeof membershipStatuses)[number];

const transitions: Readonly<Record<MembershipState, readonly MembershipState[]>> = {
  ACTIVE: ['SUSPENDED', 'REVOKED'],
  INVITED: ['ACTIVE', 'REVOKED'],
  SUSPENDED: ['ACTIVE', 'REVOKED'],
  REVOKED: [],
};

export function assertMembershipTransition(from: MembershipState, to: MembershipState): void {
  if (from === to) return;
  if (!transitions[from].includes(to)) {
    throw new ApplicationError(
      'INVALID_MEMBERSHIP_TRANSITION',
      `Membership cannot transition from ${from} to ${to}`,
    );
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLocaleLowerCase('en-US');
}
