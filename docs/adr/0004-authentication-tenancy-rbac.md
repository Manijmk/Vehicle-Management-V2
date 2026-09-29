# ADR 0004: Provider-neutral authentication, trusted tenancy, and permission RBAC

- Status: Accepted
- Date: 2026-08-18

## Context

Every future business module needs a stable identity boundary, server-trusted tenant selection, and authorization that is not coupled to role display names or one hosted identity vendor.

## Decision

Application code consumes an `AuthenticationPort`. Milestone 1 supplies a local/test HS256 JWT adapter with configured issuer, audience, expiry validation, and a signing key of at least 32 characters. This adapter is development infrastructure, not a production password system. A production OIDC verifier will implement the same port.

Organization-scoped requests select a tenant with `x-organization-id`. The server validates its UUID, requires it to match an organization route parameter, and resolves an active user, organization, and membership from PostgreSQL. Request bodies and query strings never establish identity or tenancy.

Authorization uses permission codes attached to organization-scoped roles. Global guards run in this order: authentication, tenant resolution, permission evaluation. Composite database foreign keys ensure a membership-role assignment cannot cross organizations.

## Consequences

- Future modules receive a reusable trusted principal and tenant context.
- Role names remain configurable data and never become authorization rules.
- The local JWT issuer must be replaced with an asymmetric OIDC/JWKS adapter, key rotation, and production session controls before internet production use.
- Organization discovery is authenticated but not tenant-scoped; organization resource endpoints are tenant-scoped.
