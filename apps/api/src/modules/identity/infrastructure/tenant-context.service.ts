import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@vms/database';

import { DATABASE } from '../../../common/tokens.js';
import { ApplicationError } from '../../foundation/domain/errors.js';
import { assertOrganizationUsable } from '../../foundation/domain/organization.js';
import type { AuthenticatedIdentity } from '../application/authentication.port.js';
import type { TrustedTenantContext } from '../transport/authenticated-request.js';

@Injectable()
export class TenantContextService {
  constructor(@Inject(DATABASE) private readonly database: PrismaClient) {}

  async assertActiveUser(identity: AuthenticatedIdentity): Promise<void> {
    const user = await this.database.user.findUnique({
      where: { id: identity.userId },
      select: { status: true },
    });
    if (user === null || user.status !== 'ACTIVE') {
      throw new ApplicationError('UNAUTHENTICATED', 'Authenticated user is not active');
    }
  }

  async resolve(userId: string, organizationId: string): Promise<TrustedTenantContext> {
    const membership = await this.database.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: {
        id: true,
        status: true,
        organization: { select: { status: true } },
        roleAssignments: {
          select: {
            role: {
              select: { permissions: { select: { permission: { select: { code: true } } } } },
            },
          },
        },
      },
    });
    if (membership === null) {
      throw new ApplicationError(
        'INVALID_TENANT_CONTEXT',
        'No membership exists for the selected organization',
      );
    }
    assertOrganizationUsable(membership.organization.status);
    if (membership.status !== 'ACTIVE') {
      throw new ApplicationError('INACTIVE_MEMBERSHIP', 'Organization membership is not active');
    }
    const permissions = new Set(
      membership.roleAssignments.flatMap((assignment) =>
        assignment.role.permissions.map((entry) => entry.permission.code),
      ),
    );
    return { organizationId, membershipId: membership.id, permissions };
  }
}
