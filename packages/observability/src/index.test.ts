import { describe, expect, it } from 'vitest';

import { startObservability } from './index.js';

describe('startObservability', () => {
  it('provides a safe no-op handle when telemetry is disabled', async () => {
    const handle = startObservability({
      enabled: false,
      serviceName: 'test-service',
      otlpEndpoint: 'http://localhost:4318',
    });

    await expect(handle.shutdown()).resolves.toBeUndefined();
  });
});
