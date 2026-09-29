export const permissionCodes = [
  'organization.read',
  'organization.update',
  'user.read',
  'user.manage',
  'membership.read',
  'membership.manage',
  'role.read',
  'role.manage',
  'audit.read',
  'vehicle.read',
  'vehicle.create',
  'vehicle.update',
  'vehicle.activate',
  'vehicle.retire',
  'vehicle.history.read',
  'driver.read',
  'driver.create',
  'driver.update',
  'driver.activate',
  'driver.suspend',
  'driver.deactivate',
  'driver.license.manage',
  'driver.history.read',
] as const;

export type PermissionCode = (typeof permissionCodes)[number];

export function hasPermissions(
  granted: ReadonlySet<string>,
  required: readonly PermissionCode[],
): boolean {
  return required.every((permission) => granted.has(permission));
}
