import { describe, expect, it } from 'vitest';

import { EnvironmentValidationError, loadApiConfig } from './index.js';

const validEnvironment = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/database',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'vehicle-management',
  S3_ACCESS_KEY: 'access-key',
  S3_SECRET_KEY: 'secret-key',
  AUTH_LOCAL_SIGNING_KEY: 'test-signing-key-that-is-at-least-32-characters',
};

describe('loadApiConfig', () => {
  it('applies safe defaults and parses values', () => {
    const config = loadApiConfig(validEnvironment);

    expect(config.API_PORT).toBe(3001);
    expect(config.API_CORS_ORIGINS).toEqual(['http://localhost:3000']);
    expect(config.OTEL_ENABLED).toBe(false);
  });

  it('fails fast when required infrastructure configuration is absent', () => {
    expect(() => loadApiConfig({ NODE_ENV: 'test' })).toThrow(EnvironmentValidationError);
  });
});
