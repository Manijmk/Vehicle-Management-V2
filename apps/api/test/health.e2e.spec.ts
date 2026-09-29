import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { configureApiApplication } from '../src/bootstrap.js';

describe('health endpoint', () => {
  let application: INestApplication;

  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://vehicle_management:local_vehicle_management@localhost:55432/vehicle_management?schema=public',
      REDIS_URL: 'redis://localhost:6379',
      S3_ENDPOINT: 'http://localhost:9000',
      S3_REGION: 'us-east-1',
      S3_BUCKET: 'vehicle-management',
      S3_ACCESS_KEY: 'test',
      S3_SECRET_KEY: 'test-secret',
      AUTH_LOCAL_SIGNING_KEY: 'test-signing-key-that-is-at-least-32-characters',
    });
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    application = module.createNestApplication();
    configureApiApplication(application, { API_CORS_ORIGINS: ['http://localhost:3000'] });
    await application.init();
  }, 60_000);

  afterAll(async () => {
    await application.close();
  });

  it('reports process liveness with a request ID', async () => {
    const response = await request(application.getHttpServer())
      .get('/api/v1/health')
      .set('x-request-id', 'health-test-request')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('health-test-request');
    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'vehicle-management-api',
      version: '0.1.0',
    });
    expect(new Date(response.body.timestamp as string).toString()).not.toBe('Invalid Date');
  });

  it('returns a structured error envelope', async () => {
    const response = await request(application.getHttpServer())
      .get('/api/v1/not-found')
      .expect(404);

    expect(response.body).toMatchObject({
      error: {
        code: 'Not Found',
        message: 'Cannot GET /api/v1/not-found',
      },
      path: '/api/v1/not-found',
    });
    expect(response.body.requestId).toEqual(expect.any(String));
  });
});
