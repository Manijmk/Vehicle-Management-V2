import type { IntegrationStatus } from '@vms/database';
import { IntegrationConnectionInvalidStateError } from './integration-errors.js';

export const VALID_CONNECTION_TRANSITIONS: Record<IntegrationStatus, readonly IntegrationStatus[]> =
  {
    DRAFT: ['ACTIVE', 'DISABLED'],
    ACTIVE: ['SUSPENDED', 'DISABLED'],
    SUSPENDED: ['ACTIVE', 'DISABLED'],
    DISABLED: [],
  };

export function canTransitionConnectionStatus(
  current: IntegrationStatus,
  target: IntegrationStatus,
): boolean {
  if (current === target) return false;
  const allowed = VALID_CONNECTION_TRANSITIONS[current];
  return allowed ? allowed.includes(target) : false;
}

export function assertValidConnectionTransition(
  current: IntegrationStatus,
  target: IntegrationStatus,
): void {
  if (!canTransitionConnectionStatus(current, target)) {
    throw new IntegrationConnectionInvalidStateError(
      `Cannot transition connection from ${current} to ${target}`,
    );
  }
}

export function assertValidConnectionName(name: string): void {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 200) {
    throw new IntegrationConnectionInvalidStateError(
      'Connection name must be a non-empty string of up to 200 characters',
    );
  }
}

export const validateConnectionName = assertValidConnectionName;

export function assertValidProvider(provider: string): void {
  if (typeof provider !== 'string' || !provider.trim() || provider.trim().length > 100) {
    throw new IntegrationConnectionInvalidStateError(
      'Connection provider must be a non-empty string of up to 100 characters',
    );
  }
}
