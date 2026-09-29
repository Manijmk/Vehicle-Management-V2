import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { MembershipStatus, PrincipalStatus } from '@vms/database';
import type { Prisma, PrismaClient } from '@vms/database';

import { DATABASE } from '../../../common/tokens.js';
import type {
  FoundationRepository,
  MutationMetadata,
} from '../application/foundation.repository.js';
import { ApplicationError } from '../domain/errors.js';
import { assertMembershipTransition } from '../domain/membership.js';

type Transaction = Prisma.TransactionClient;

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function auditData(metadata: MutationMetadata) {
  return {
    actorId: metadata.actorId,
    requestId: metadata.requestId,
    ...(metadata.ipAddress === undefined ? {} : { ipAddress: metadata.ipAddress }),
    ...(metadata.userAgent === undefined ? {} : { userAgent: metadata.userAgent }),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

@Injectable()
export class PrismaFoundationRepository implements FoundationRepository {
  constructor(@Inject(DATABASE) private readonly database: PrismaClient) {}

  async getMe(userId: string, organizationId: string): Promise<unknown> {
    const membership = await this.database.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      include: {
        user: true,
        organization: true,
        roleAssignments: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });
    if (membership === null)
      throw new ApplicationError('INVALID_TENANT_CONTEXT', 'Tenant context is unavailable');
    return {
      user: membership.user,
      organization: membership.organization,
      membership: { id: membership.id, status: membership.status, version: membership.version },
      roles: membership.roleAssignments.map((entry) => entry.role.name),
      permissions: [
        ...new Set(
          membership.roleAssignments.flatMap((entry) =>
            entry.role.permissions.map((item) => item.permission.code),
          ),
        ),
      ].sort(),
    };
  }

  async listOrganizations(userId: string): Promise<unknown[]> {
    return this.database.organization.findMany({
      where: {
        status: PrincipalStatus.ACTIVE,
        memberships: { some: { userId, status: MembershipStatus.ACTIVE } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getOrganization(organizationId: string): Promise<unknown> {
    const organization = await this.database.organization.findUnique({
      where: { id: organizationId },
    });
    if (organization === null)
      throw new ApplicationError('ORGANIZATION_NOT_FOUND', 'Organization was not found');
    return organization;
  }

  async updateOrganization(
    input: Parameters<FoundationRepository['updateOrganization']>[0],
  ): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      const before = await tx.organization.findUnique({ where: { id: input.organizationId } });
      if (before === null)
        throw new ApplicationError('ORGANIZATION_NOT_FOUND', 'Organization was not found');
      const result = await tx.organization.updateMany({
        where: { id: input.organizationId, version: input.version },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.slug === undefined ? {} : { slug: input.slug }),
          ...(input.status === undefined ? {} : { status: input.status as PrincipalStatus }),
          version: { increment: 1 },
        },
      });
      if (result.count !== 1)
        throw new ApplicationError(
          'CONCURRENCY_CONFLICT',
          'Organization was changed by another request',
        );
      const after = await tx.organization.findUniqueOrThrow({
        where: { id: input.organizationId },
      });
      await this.record(
        tx,
        input.organizationId,
        'organization.updated',
        'Organization',
        input.organizationId,
        before,
        after,
        'OrganizationUpdated',
        input.metadata,
      );
      return after;
    });
  }

  async listMembers(organizationId: string): Promise<unknown[]> {
    return this.database.organizationMembership.findMany({
      where: { organizationId },
      include: {
        user: { select: { id: true, email: true, displayName: true, status: true } },
        roleAssignments: { include: { role: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createMembership(
    input: Parameters<FoundationRepository['createMembership']>[0],
  ): Promise<unknown> {
    try {
      return await this.database.$transaction(async (tx) => {
        const user = await tx.user.upsert({
          where: { email: input.email },
          update: {},
          create: {
            email: input.email,
            displayName: input.displayName,
            status: PrincipalStatus.ACTIVE,
          },
        });
        const existing = await tx.organizationMembership.findUnique({
          where: {
            organizationId_userId: { organizationId: input.organizationId, userId: user.id },
          },
        });
        if (existing !== null)
          throw new ApplicationError(
            'MEMBERSHIP_ALREADY_EXISTS',
            'A membership already exists for this user',
          );
        const validRoles = await tx.role.findMany({
          where: { organizationId: input.organizationId, id: { in: input.roleIds } },
          select: {
            id: true,
            permissions: { select: { permission: { select: { code: true } } } },
          },
        });
        if (validRoles.length !== new Set(input.roleIds).size)
          throw new ApplicationError(
            'INVALID_ROLE_ASSIGNMENT',
            'Every role must belong to the selected organization',
          );
        this.assertMayGrant(
          input.metadata,
          validRoles.flatMap((role) => role.permissions.map((entry) => entry.permission.code)),
        );
        const membership = await tx.organizationMembership.create({
          data: {
            organizationId: input.organizationId,
            userId: user.id,
            status: input.status as MembershipStatus,
            roleAssignments: {
              create: validRoles.map((role) => ({
                roleId: role.id,
              })),
            },
          },
          include: { user: true, roleAssignments: { include: { role: true } } },
        });
        await this.record(
          tx,
          input.organizationId,
          'membership.created',
          'OrganizationMembership',
          membership.id,
          null,
          membership,
          'MembershipCreated',
          input.metadata,
        );
        return membership;
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ApplicationError(
          'MEMBERSHIP_ALREADY_EXISTS',
          'A membership already exists for this user',
        );
      throw error;
    }
  }

  async updateMembership(
    input: Parameters<FoundationRepository['updateMembership']>[0],
  ): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      const before = await tx.organizationMembership.findFirst({
        where: { id: input.membershipId, organizationId: input.organizationId },
      });
      if (before === null)
        throw new ApplicationError('MEMBERSHIP_NOT_FOUND', 'Membership was not found');
      assertMembershipTransition(before.status, input.status);
      const result = await tx.organizationMembership.updateMany({
        where: {
          id: input.membershipId,
          organizationId: input.organizationId,
          version: input.version,
        },
        data: { status: input.status as MembershipStatus, version: { increment: 1 } },
      });
      if (result.count !== 1)
        throw new ApplicationError(
          'CONCURRENCY_CONFLICT',
          'Membership was changed by another request',
        );
      const after = await tx.organizationMembership.findUniqueOrThrow({
        where: { id: input.membershipId },
      });
      const eventType = input.status === 'REVOKED' ? 'MembershipRevoked' : 'MembershipUpdated';
      await this.record(
        tx,
        input.organizationId,
        'membership.updated',
        'OrganizationMembership',
        input.membershipId,
        before,
        after,
        eventType,
        input.metadata,
      );
      return after;
    });
  }

  async listRoles(organizationId: string): Promise<unknown[]> {
    return this.database.role.findMany({
      where: { organizationId },
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createRole(input: Parameters<FoundationRepository['createRole']>[0]): Promise<unknown> {
    try {
      return await this.database.$transaction(async (tx) => {
        const permissions = await tx.permission.findMany({
          where: { code: { in: input.permissions } },
        });
        if (permissions.length !== new Set(input.permissions).size)
          throw new ApplicationError(
            'INVALID_ROLE_ASSIGNMENT',
            'One or more permission codes are invalid',
          );
        this.assertMayGrant(
          input.metadata,
          permissions.map((permission) => permission.code),
        );
        const role = await tx.role.create({
          data: {
            organizationId: input.organizationId,
            name: input.name,
            ...(input.description === undefined ? {} : { description: input.description }),
            permissions: {
              create: permissions.map((permission) => ({ permissionId: permission.id })),
            },
          },
          include: { permissions: { include: { permission: true } } },
        });
        await this.record(
          tx,
          input.organizationId,
          'role.created',
          'Role',
          role.id,
          null,
          role,
          'RoleCreated',
          input.metadata,
        );
        return role;
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ApplicationError('CONFLICT', 'A role with this name already exists');
      throw error;
    }
  }

  async assignRole(input: Parameters<FoundationRepository['assignRole']>[0]): Promise<void> {
    await this.changeRoleAssignment(input, true);
  }

  async removeRole(input: Parameters<FoundationRepository['removeRole']>[0]): Promise<void> {
    await this.changeRoleAssignment(input, false);
  }

  async listAuditLogs(organizationId: string): Promise<unknown[]> {
    return this.database.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  private async changeRoleAssignment(
    input: Parameters<FoundationRepository['assignRole']>[0],
    assign: boolean,
  ): Promise<void> {
    await this.database.$transaction(async (tx) => {
      const membership = await tx.organizationMembership.findFirst({
        where: { id: input.membershipId, organizationId: input.organizationId },
      });
      if (membership === null)
        throw new ApplicationError('MEMBERSHIP_NOT_FOUND', 'Membership was not found');
      const role = await tx.role.findFirst({
        where: { id: input.roleId, organizationId: input.organizationId },
        include: { permissions: { include: { permission: true } } },
      });
      if (role === null)
        throw new ApplicationError(
          'ROLE_NOT_FOUND',
          'Role was not found in the selected organization',
        );
      if (assign) {
        this.assertMayGrant(
          input.metadata,
          role.permissions.map((entry) => entry.permission.code),
        );
        const existing = await tx.membershipRole.findUnique({
          where: {
            membershipId_roleId: { membershipId: input.membershipId, roleId: input.roleId },
          },
        });
        if (existing !== null) throw new ApplicationError('CONFLICT', 'Role is already assigned');
        await tx.membershipRole.create({
          data: {
            organizationId: input.organizationId,
            membershipId: input.membershipId,
            roleId: input.roleId,
          },
        });
      } else {
        await tx.membershipRole.deleteMany({
          where: {
            organizationId: input.organizationId,
            membershipId: input.membershipId,
            roleId: input.roleId,
          },
        });
      }
      const action = assign ? 'role.assigned' : 'role.removed';
      const event = assign ? 'RoleAssigned' : 'RoleRemoved';
      await this.record(
        tx,
        input.organizationId,
        action,
        'OrganizationMembership',
        input.membershipId,
        null,
        { roleId: input.roleId },
        event,
        input.metadata,
      );
    });
  }

  private async record(
    tx: Transaction,
    organizationId: string,
    action: string,
    entityType: string,
    entityId: string,
    before: unknown,
    after: unknown,
    eventType: string,
    metadata: MutationMetadata,
  ): Promise<void> {
    const occurredAt = new Date();
    const eventId = randomUUID();
    await tx.auditLog.create({
      data: {
        organizationId,
        action,
        entityType,
        entityId,
        ...(before === null ? {} : { beforeData: json(before) }),
        ...(after === null ? {} : { afterData: json(after) }),
        ...auditData(metadata),
      },
    });
    await tx.outboxEvent.create({
      data: {
        id: eventId,
        organizationId,
        eventType,
        aggregateType: entityType,
        aggregateId: entityId,
        occurredAt,
        payload: json({
          eventId,
          organizationId,
          entityId,
          eventType,
          occurredAt: occurredAt.toISOString(),
        }),
      },
    });
  }

  private assertMayGrant(metadata: MutationMetadata, permissions: readonly string[]): void {
    const granted = new Set(metadata.actorPermissions);
    if (permissions.some((permission) => !granted.has(permission))) {
      throw new ApplicationError(
        'INVALID_ROLE_ASSIGNMENT',
        'A caller cannot grant permissions they do not possess',
      );
    }
  }
}
