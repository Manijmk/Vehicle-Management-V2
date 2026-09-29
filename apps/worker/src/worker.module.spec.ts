import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { WorkerModule } from './worker.module.js';
import { WorkerService } from './worker.service.js';

describe('WorkerModule', () => {
  it('composes the worker process', async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL:
        'postgresql://vehicle_management:local_vehicle_management@postgres:5432/vehicle_management?schema=public',
      REDIS_URL: 'redis://localhost:6379',
      S3_ENDPOINT: 'http://localhost:9000',
      S3_REGION: 'us-east-1',
      S3_BUCKET: 'vehicle-management',
      S3_ACCESS_KEY: 'test',
      S3_SECRET_KEY: 'test-secret',
    });
    const module = await Test.createTestingModule({ imports: [WorkerModule] }).compile();

    expect(module.get(WorkerService)).toBeInstanceOf(WorkerService);
    await module.close();
  });
});
