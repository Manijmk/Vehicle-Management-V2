import { ApplicationError } from './errors.js';

export const principalStatuses = ['ACTIVE', 'SUSPENDED', 'DISABLED'] as const;
export type PrincipalState = (typeof principalStatuses)[number];

export function assertOrganizationUsable(status: PrincipalState): void {
  if (status !== 'ACTIVE') {
    throw new ApplicationError('INVALID_TENANT_CONTEXT', 'Selected organization is not active');
  }
}
