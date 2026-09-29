import type { RequestWithId } from '../../../common/request-id.middleware.js';
import type { AuthenticatedIdentity } from '../application/authentication.port.js';

export interface TrustedTenantContext {
  readonly organizationId: string;
  readonly membershipId: string;
  readonly permissions: ReadonlySet<string>;
}

export interface AuthenticatedRequest extends RequestWithId {
  principal: AuthenticatedIdentity;
  tenant?: TrustedTenantContext;
}
