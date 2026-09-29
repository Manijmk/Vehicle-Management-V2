import { SetMetadata } from '@nestjs/common';

import type { PermissionCode } from '../../foundation/domain/permissions.js';

export const PUBLIC_ENDPOINT = 'public-endpoint';
export const TENANT_SCOPED = 'tenant-scoped';
export const REQUIRED_PERMISSIONS = 'required-permissions';

export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_ENDPOINT, true);
export const TenantScoped = (): MethodDecorator & ClassDecorator =>
  SetMetadata(TENANT_SCOPED, true);
export const RequirePermissions = (
  ...permissions: PermissionCode[]
): MethodDecorator & ClassDecorator => SetMetadata(REQUIRED_PERMISSIONS, permissions);
