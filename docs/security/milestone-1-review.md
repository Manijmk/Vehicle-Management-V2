# Milestone 1 security review

## Enforced controls

- Authentication verifies issuer, audience, signature, expiry, subject, and active user. Health is the only explicitly public API.
- The tenant header is only a proposal: active organization and membership are resolved server-side, and route IDs must match trusted context.
- Controllers declare permission codes; no code authorizes by role name.
- Permission inputs are allowlisted, callers cannot grant permissions they do not possess, tenant records are resolved inside the tenant, and composite foreign keys reject cross-tenant role assignments.
- DTO validation rejects unknown properties and mutation fields are explicit.
- Suspended or disabled users, organizations, and memberships cannot authorize.
- Audit has no write API and PostgreSQL rejects normal update/delete operations.
- Bearer tokens and signing keys are never audited or logged. The publisher logs event metadata, not payloads.

Cross-tenant negative HTTP tests cover route/header mismatch, absent or inactive membership, missing permission, foreign role assignment, tenant-scoped audit reads, and membership lookup.

## Deliberate limitations

The local symmetric JWT adapter is for development and tests. Production still requires an OIDC/JWKS implementation, asymmetric key rotation, revocation/session policy, and deployment secret management. Rate limiting, audit retention/export, a dead-letter policy, and consumer inbox deduplication are operational follow-ups; delivery is explicitly at least once.
