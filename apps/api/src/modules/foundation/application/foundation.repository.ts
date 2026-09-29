import type { MembershipState } from '../domain/membership.js';
import type { PermissionCode } from '../domain/permissions.js';
import type { PrincipalState } from '../domain/organization.js';

export interface MutationMetadata {
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

export interface FoundationRepository {
  getMe(userId: string, organizationId: string): Promise<unknown>;
  listOrganizations(userId: string): Promise<unknown[]>;
  getOrganization(organizationId: string): Promise<unknown>;
  updateOrganization(input: {
    organizationId: string;
    name?: string;
    slug?: string;
    status?: PrincipalState;
    version: number;
    metadata: MutationMetadata;
  }): Promise<unknown>;
  listMembers(organizationId: string): Promise<unknown[]>;
  createMembership(input: {
    organizationId: string;
    email: string;
    displayName: string;
    status: MembershipState;
    roleIds: string[];
    metadata: MutationMetadata;
  }): Promise<unknown>;
  updateMembership(input: {
    organizationId: string;
    membershipId: string;
    status: MembershipState;
    version: number;
    metadata: MutationMetadata;
  }): Promise<unknown>;
  listRoles(organizationId: string): Promise<unknown[]>;
  createRole(input: {
    organizationId: string;
    name: string;
    description?: string;
    permissions: PermissionCode[];
    metadata: MutationMetadata;
  }): Promise<unknown>;
  assignRole(input: {
    organizationId: string;
    membershipId: string;
    roleId: string;
    metadata: MutationMetadata;
  }): Promise<void>;
  removeRole(input: {
    organizationId: string;
    membershipId: string;
    roleId: string;
    metadata: MutationMetadata;
  }): Promise<void>;
  listAuditLogs(organizationId: string): Promise<unknown[]>;
}
