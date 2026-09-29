import { Inject, Injectable } from '@nestjs/common';

import { FOUNDATION_REPOSITORY } from '../../../common/tokens.js';
import type { FoundationRepository, MutationMetadata } from './foundation.repository.js';
import type { MembershipState } from '../domain/membership.js';
import { normalizeEmail } from '../domain/membership.js';
import type { PermissionCode } from '../domain/permissions.js';
import type { PrincipalState } from '../domain/organization.js';

@Injectable()
export class FoundationService {
  constructor(@Inject(FOUNDATION_REPOSITORY) private readonly repository: FoundationRepository) {}

  getMe(userId: string, organizationId: string): Promise<unknown> {
    return this.repository.getMe(userId, organizationId);
  }
  listOrganizations(userId: string): Promise<unknown[]> {
    return this.repository.listOrganizations(userId);
  }
  getOrganization(organizationId: string): Promise<unknown> {
    return this.repository.getOrganization(organizationId);
  }
  updateOrganization(input: {
    organizationId: string;
    name?: string;
    slug?: string;
    status?: PrincipalState;
    version: number;
    metadata: MutationMetadata;
  }): Promise<unknown> {
    return this.repository.updateOrganization(input);
  }
  listMembers(organizationId: string): Promise<unknown[]> {
    return this.repository.listMembers(organizationId);
  }
  createMembership(input: {
    organizationId: string;
    email: string;
    displayName: string;
    status: MembershipState;
    roleIds: string[];
    metadata: MutationMetadata;
  }): Promise<unknown> {
    return this.repository.createMembership({ ...input, email: normalizeEmail(input.email) });
  }
  updateMembership(input: {
    organizationId: string;
    membershipId: string;
    status: MembershipState;
    version: number;
    metadata: MutationMetadata;
  }): Promise<unknown> {
    return this.repository.updateMembership(input);
  }
  listRoles(organizationId: string): Promise<unknown[]> {
    return this.repository.listRoles(organizationId);
  }
  createRole(input: {
    organizationId: string;
    name: string;
    description?: string;
    permissions: PermissionCode[];
    metadata: MutationMetadata;
  }): Promise<unknown> {
    return this.repository.createRole(input);
  }
  assignRole(input: {
    organizationId: string;
    membershipId: string;
    roleId: string;
    metadata: MutationMetadata;
  }): Promise<void> {
    return this.repository.assignRole(input);
  }
  removeRole(input: {
    organizationId: string;
    membershipId: string;
    roleId: string;
    metadata: MutationMetadata;
  }): Promise<void> {
    return this.repository.removeRole(input);
  }
  listAuditLogs(organizationId: string): Promise<unknown[]> {
    return this.repository.listAuditLogs(organizationId);
  }
}
