import { Inject, Injectable } from '@nestjs/common';
import type { ApiConfig } from '@vms/config';
import { SignJWT, jwtVerify } from 'jose';

import { API_CONFIG } from '../../../common/tokens.js';
import { ApplicationError } from '../../foundation/domain/errors.js';
import type {
  AuthenticatedIdentity,
  AuthenticationPort,
} from '../application/authentication.port.js';

@Injectable()
export class LocalJwtAuthenticationAdapter implements AuthenticationPort {
  private readonly key: Uint8Array;

  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {
    this.key = new TextEncoder().encode(config.AUTH_LOCAL_SIGNING_KEY);
  }

  async authenticate(token: string): Promise<AuthenticatedIdentity> {
    try {
      const result = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        audience: this.config.AUTH_AUDIENCE,
        issuer: this.config.AUTH_ISSUER,
      });
      if (typeof result.payload.sub !== 'string') throw new Error('Token subject missing');
      return {
        userId: result.payload.sub,
        issuer: result.payload.iss!,
        subject: result.payload.sub,
        ...(typeof result.payload.sid === 'string' ? { sessionId: result.payload.sid } : {}),
      };
    } catch {
      throw new ApplicationError('UNAUTHENTICATED', 'Authentication token is invalid or expired');
    }
  }

  async issueDevelopmentToken(userId: string, expiresIn = '8h'): Promise<string> {
    return new SignJWT({ sid: `local-${userId}` })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(this.config.AUTH_ISSUER)
      .setAudience(this.config.AUTH_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(this.key);
  }
}
