import type { AuthenticatedRequest } from '../../identity/transport/authenticated-request.js';
import type { MutationMetadata } from '../application/foundation.repository.js';

export function mutationMetadata(request: AuthenticatedRequest): MutationMetadata {
  const userAgent = request.header('user-agent');
  return {
    actorId: request.principal.userId,
    actorPermissions: [...(request.tenant?.permissions ?? [])],
    requestId: request.requestId,
    ...(request.ip === undefined ? {} : { ipAddress: request.ip }),
    ...(userAgent === undefined ? {} : { userAgent }),
  };
}
