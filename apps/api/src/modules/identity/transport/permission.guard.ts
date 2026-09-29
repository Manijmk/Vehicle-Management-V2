import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ApplicationError } from '../../foundation/domain/errors.js';
import { hasPermissions } from '../../foundation/domain/permissions.js';
import type { PermissionCode } from '../../foundation/domain/permissions.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { REQUIRED_PERMISSIONS } from './security.decorators.js';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<readonly PermissionCode[]>(REQUIRED_PERMISSIONS, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (required.length === 0) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.tenant === undefined || !hasPermissions(request.tenant.permissions, required)) {
      throw new ApplicationError('PERMISSION_DENIED', 'Required permission is not granted');
    }
    return true;
  }
}
