export interface AuthenticatedIdentity {
  readonly userId: string;
  readonly sessionId?: string;
  readonly issuer: string;
  readonly subject: string;
}

export interface AuthenticationPort {
  authenticate(token: string): Promise<AuthenticatedIdentity>;
}
