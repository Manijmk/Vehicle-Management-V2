import { Controller, Get, Inject, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { FoundationService } from '../application/foundation.service.js';
import type { AuthenticatedRequest } from '../../identity/transport/authenticated-request.js';
import { TenantScoped } from '../../identity/transport/security.decorators.js';

@ApiTags('identity')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Bearer token is absent, invalid, or belongs to an inactive user',
})
@Controller()
export class IdentityController {
  constructor(@Inject(FoundationService) private readonly foundation: FoundationService) {}

  @Get('me')
  @TenantScoped()
  @ApiHeader({ name: 'x-organization-id', required: true })
  @ApiOperation({ summary: 'Return the active principal and trusted tenant context' })
  @ApiOkResponse({ description: 'Principal, membership, roles, and effective permissions' })
  getMe(@Req() request: AuthenticatedRequest): Promise<unknown> {
    return this.foundation.getMe(request.principal.userId, request.tenant!.organizationId);
  }

  @Get('organizations')
  @ApiOperation({ summary: 'List organizations with an active membership for the principal' })
  @ApiOkResponse({ description: 'Organizations available to the principal' })
  listOrganizations(@Req() request: AuthenticatedRequest): Promise<unknown[]> {
    return this.foundation.listOrganizations(request.principal.userId);
  }
}
