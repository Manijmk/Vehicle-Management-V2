import { describe, expect, it } from 'vitest';
import type { ApiConfig } from '@vms/config';

import { LocalJwtAuthenticationAdapter } from './local-jwt-authentication.adapter.js';

const config = {
  AUTH_LOCAL_SIGNING_KEY: 'unit-test-signing-key-that-is-at-least-32-characters',
  AUTH_ISSUER: 'unit-test',
  AUTH_AUDIENCE: 'unit-test-api',
} as ApiConfig;

describe('local JWT authentication adapter', () => {
  it('round-trips a signed development token into a provider-neutral principal', async () => {
    const adapter = new LocalJwtAuthenticationAdapter(config);
    const token = await adapter.issueDevelopmentToken('20000000-0000-4000-8000-000000000001');
    await expect(adapter.authenticate(token)).resolves.toMatchObject({
      userId: '20000000-0000-4000-8000-000000000001',
      issuer: 'unit-test',
    });
  });

  it('rejects untrusted tokens', async () => {
    const adapter = new LocalJwtAuthenticationAdapter(config);
    await expect(adapter.authenticate('not-a-token')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });
});
