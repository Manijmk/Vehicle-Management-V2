import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ApplicationError } from '../../foundation/domain/errors.js';
import { TenantContextService } from '../infrastructure/tenant-context.service.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { TENANT_SCOPED } from './security.decorators.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TenantContextService) private readonly resolver: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      !this.reflector.getAllAndOverride<boolean>(TENANT_SCOPED, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const organizationId = request.header('x-organization-id');
    if (organizationId === undefined || !uuid.test(organizationId)) {
      throw new ApplicationError(
        'INVALID_TENANT_CONTEXT',
        'A valid x-organization-id header is required',
      );
    }
    const routeOrganizationId = request.params['id'];
    if (routeOrganizationId !== undefined && routeOrganizationId !== organizationId) {
      throw new ApplicationError(
        'INVALID_TENANT_CONTEXT',
        'Route organization does not match selected organization',
      );
    }
    request.tenant = await this.resolver.resolve(request.principal.userId, organizationId);
    return true;
  }
}
