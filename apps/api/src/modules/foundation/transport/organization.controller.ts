import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { AuthenticatedRequest } from '../../identity/transport/authenticated-request.js';
import { RequirePermissions, TenantScoped } from '../../identity/transport/security.decorators.js';
import { FoundationService } from '../application/foundation.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- DTO classes are runtime validation metadata.
import {
  CreateMembershipDto,
  CreateRoleDto,
  UpdateMembershipDto,
  UpdateOrganizationDto,
} from './foundation.dto.js';
import { mutationMetadata } from './request-metadata.js';

@ApiTags('organizations')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Bearer token is absent, invalid, or inactive' })
@ApiForbiddenResponse({ description: 'Tenant context or required permission is invalid' })
@ApiHeader({
  name: 'x-organization-id',
  required: true,
  description: 'Selected tenant; verified against active membership',
})
@TenantScoped()
@Controller('organizations/:id')
export class OrganizationController {
  constructor(@Inject(FoundationService) private readonly foundation: FoundationService) {}

  @Get()
  @RequirePermissions('organization.read')
  @ApiOperation({ summary: 'Read the selected organization' })
  @ApiOkResponse({ description: 'Selected organization' })
  getOrganization(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<unknown> {
    return this.foundation.getOrganization(id);
  }

  @Patch()
  @RequirePermissions('organization.update')
  @ApiOkResponse({ description: 'Updated organization' })
  updateOrganization(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: UpdateOrganizationDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.foundation.updateOrganization({
      organizationId: id,
      ...body,
      metadata: mutationMetadata(request),
    });
  }

  @Get('members')
  @RequirePermissions('membership.read')
  @ApiOkResponse({ description: 'Organization memberships' })
  listMembers(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<unknown[]> {
    return this.foundation.listMembers(id);
  }

  @Post('members')
  @RequirePermissions('user.manage', 'membership.manage')
  @ApiCreatedResponse({ description: 'Created membership and normalized user identity' })
  createMembership(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: CreateMembershipDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.foundation.createMembership({
      organizationId: id,
      ...body,
      metadata: mutationMetadata(request),
    });
  }

  @Patch('members/:membershipId')
  @RequirePermissions('membership.manage')
  @ApiOkResponse({ description: 'Updated membership' })
  updateMembership(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('membershipId', new ParseUUIDPipe({ version: '4' })) membershipId: string,
    @Body() body: UpdateMembershipDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.foundation.updateMembership({
      organizationId: id,
      membershipId,
      ...body,
      metadata: mutationMetadata(request),
    });
  }

  @Get('roles')
  @RequirePermissions('role.read')
  @ApiOkResponse({ description: 'Organization roles and permission records' })
  listRoles(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<unknown[]> {
    return this.foundation.listRoles(id);
  }

  @Post('roles')
  @RequirePermissions('role.manage')
  @ApiCreatedResponse({ description: 'Created organization role' })
  createRole(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: CreateRoleDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.foundation.createRole({
      organizationId: id,
      ...body,
      metadata: mutationMetadata(request),
    });
  }

  @Post('members/:membershipId/roles/:roleId')
  @HttpCode(204)
  @RequirePermissions('role.manage')
  @ApiNoContentResponse({ description: 'Role assigned' })
  async assignRole(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('membershipId', new ParseUUIDPipe({ version: '4' })) membershipId: string,
    @Param('roleId', new ParseUUIDPipe({ version: '4' })) roleId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.foundation.assignRole({
      organizationId: id,
      membershipId,
      roleId,
      metadata: mutationMetadata(request),
    });
  }

  @Delete('members/:membershipId/roles/:roleId')
  @HttpCode(204)
  @RequirePermissions('role.manage')
  @ApiNoContentResponse({ description: 'Role removed' })
  async removeRole(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('membershipId', new ParseUUIDPipe({ version: '4' })) membershipId: string,
    @Param('roleId', new ParseUUIDPipe({ version: '4' })) roleId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.foundation.removeRole({
      organizationId: id,
      membershipId,
      roleId,
      metadata: mutationMetadata(request),
    });
  }

  @Get('audit-logs')
  @RequirePermissions('audit.read')
  @ApiOkResponse({ description: 'Latest organization audit records, newest first' })
  listAuditLogs(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<unknown[]> {
    return this.foundation.listAuditLogs(id);
  }
}
