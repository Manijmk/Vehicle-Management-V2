import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { AUTHENTICATION_PORT } from '../../../common/tokens.js';
import { ApplicationError } from '../../foundation/domain/errors.js';
import type { AuthenticationPort } from '../application/authentication.port.js';
import { TenantContextService } from '../infrastructure/tenant-context.service.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { PUBLIC_ENDPOINT } from './security.decorators.js';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AUTHENTICATION_PORT) private readonly authentication: AuthenticationPort,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ENDPOINT, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.header('authorization');
    if (authorization === undefined || !authorization.startsWith('Bearer ')) {
      throw new ApplicationError('UNAUTHENTICATED', 'Bearer authentication is required');
    }
    const principal = await this.authentication.authenticate(authorization.slice(7));
    await this.tenantContext.assertActiveUser(principal);
    (request as AuthenticatedRequest).principal = principal;
    return true;
  }
}
