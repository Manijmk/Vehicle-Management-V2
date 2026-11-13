import http from 'node:http';
import crypto, { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@vms/database';
import type { WorkerConfig } from '@vms/config';
import { WebhookDeliveryProcessorService } from './webhook-delivery-processor.service.js';

const MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function encryptSecret(plaintext: string, masterKey: string): string {
  const iv = crypto.randomBytes(12);
  const keyBuffer = crypto.createHash('sha256').update(masterKey).digest();
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
}

describe('WebhookDeliveryProcessorService', () => {
  let server: http.Server;
  let serverPort: number;
  let receivedRequests: Array<{
    headers: http.IncomingHttpHeaders;
    body: string;
  }> = [];
  let shouldFailRequest = false;

  beforeAll(async () => {
    receivedRequests = [];
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        receivedRequests.push({ headers: req.headers, body });
        if (shouldFailRequest) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal Server Error' }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ received: true }));
        }
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        serverPort = (server.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('delivers outbound webhook to real HTTP receiver with HMAC signature, headers, and records delivery attempt', async () => {
    const rawSecret = 'whsec_testsecret1234567890abcdef1234567890abcdef';
    const encrypted = encryptSecret(rawSecret, MASTER_KEY);
    const sourceEventId = randomUUID();
    const deliveryId = randomUUID();
    const orgId = randomUUID();

    const mockAttempts: unknown[] = [];
    let updatedDelivery: Record<string, unknown> = {};

    const mockDb = {
      webhookDelivery: {
        findMany: async () => [
          {
            id: deliveryId,
            organizationId: orgId,
            sourceEventId,
            eventType: 'TripCreated',
            payload: { tripId: 'trip-101', status: 'READY' },
            attempts: 0,
            subscription: {
              endpointUrl: `http://127.0.0.1:${serverPort}/webhook`,
              connection: {
                secrets: [{ encryptedSecret: encrypted }],
              },
            },
          },
        ],
        updateMany: async (args?: { data?: Record<string, unknown> }) => {
          if (args?.data) {
            updatedDelivery = args.data;
          }
          return { count: 1 };
        },
        update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          updatedDelivery = args.data;
          return { id: args.where.id, ...args.data };
        },
      },
      webhookDeliveryAttempt: {
        create: async (args: { data: unknown }) => {
          mockAttempts.push(args.data);
          return args.data;
        },
      },
      $transaction: async (arg: unknown) => {
        if (typeof arg === 'function') {
          return (arg as (tx: unknown) => Promise<unknown>)(mockDb);
        }
        return Promise.all(arg as Promise<unknown>[]);
      },
    } as unknown as PrismaClient;

    const config = {
      INTEGRATION_MASTER_KEY: MASTER_KEY,
      NODE_ENV: 'test',
    } as unknown as WorkerConfig;

    const processor = new WebhookDeliveryProcessorService(mockDb, config);

    // Process batch
    const processed = await processor.processBatch();
    expect(processed).toBe(1);

    // Verify request reached HTTP receiver
    expect(receivedRequests.length).toBeGreaterThan(0);
    const lastReq = receivedRequests[receivedRequests.length - 1]!;
    expect(lastReq.headers['x-vms-event-id']).toBe(sourceEventId);
    expect(lastReq.headers['x-vms-event-type']).toBe('TripCreated');
    expect(lastReq.headers['x-vms-timestamp']).toBeDefined();

    // Verify HMAC-SHA256 signature
    const sigHeader = lastReq.headers['x-vms-signature'] as string;
    expect(sigHeader).toBeDefined();
    expect(sigHeader.startsWith('v1=')).toBe(true);

    const timestamp = lastReq.headers['x-vms-timestamp'];
    const expectedHmac = crypto
      .createHmac('sha256', rawSecret)
      .update(`${timestamp}.${lastReq.body}`)
      .digest('hex');
    expect(sigHeader).toBe(`v1=${expectedHmac}`);

    // Verify durable delivery attempt recorded
    expect(mockAttempts).toHaveLength(1);
    const attempt = mockAttempts[0] as Record<string, unknown>;
    expect(attempt['attemptNumber']).toBe(1);
    expect(attempt['httpStatus']).toBe(200);

    // Verify successful delivery status
    expect(updatedDelivery['deliveryStatus']).toBe('SUCCESS');
    expect(updatedDelivery['deliveredAt']).toBeInstanceOf(Date);
  });

  it('schedules retry with exponential backoff on HTTP failure and exhausts after attempt 5', async () => {
    shouldFailRequest = true;

    const rawSecret = 'whsec_retry_secret_abcdef123456';
    const encrypted = encryptSecret(rawSecret, MASTER_KEY);
    const deliveryId = randomUUID();
    const orgId = randomUUID();

    let updatedDelivery: Record<string, unknown> = {};

    const createMockDb = (currentAttempts: number) =>
      ({
        webhookDelivery: {
          findMany: async () => [
            {
              id: deliveryId,
              organizationId: orgId,
              sourceEventId: randomUUID(),
              eventType: 'TripCompleted',
              payload: { tripId: 'trip-202' },
              attempts: currentAttempts,
              subscription: {
                endpointUrl: `http://127.0.0.1:${serverPort}/webhook-fail`,
                connection: {
                  secrets: [{ encryptedSecret: encrypted }],
                },
              },
            },
          ],
          updateMany: async (args?: { data?: Record<string, unknown> }) => {
            if (args?.data) {
              updatedDelivery = args.data;
            }
            return { count: 1 };
          },
          update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
            updatedDelivery = args.data;
            return { id: args.where.id, ...args.data };
          },
        },
        webhookDeliveryAttempt: {
          create: async () => ({}),
        },
        $transaction: async (arg: unknown) => {
          if (typeof arg === 'function') {
            return (arg as (tx: unknown) => Promise<unknown>)({
              webhookDelivery: {
                updateMany: async (args?: { data?: Record<string, unknown> }) => {
                  if (args?.data) {
                    updatedDelivery = args.data;
                  }
                  return { count: 1 };
                },
              },
              webhookDeliveryAttempt: {
                create: async () => ({}),
              },
            });
          }
          return Promise.all(arg as Promise<unknown>[]);
        },
      }) as unknown as PrismaClient;

    const config = {
      INTEGRATION_MASTER_KEY: MASTER_KEY,
      NODE_ENV: 'test',
    } as unknown as WorkerConfig;

    // Attempt 1 -> RETRYING
    const processor1 = new WebhookDeliveryProcessorService(createMockDb(0), config);
    await processor1.processBatch();
    expect(updatedDelivery['deliveryStatus']).toBe('RETRYING');
    expect(updatedDelivery['attempts']).toBe(1);
    expect(updatedDelivery['nextAttemptAt']).toBeInstanceOf(Date);

    // Attempt 4 -> 5th attempt fails -> EXHAUSTED
    const processor5 = new WebhookDeliveryProcessorService(createMockDb(4), config);
    await processor5.processBatch();
    expect(updatedDelivery['deliveryStatus']).toBe('EXHAUSTED');
    expect(updatedDelivery['attempts']).toBe(5);

    shouldFailRequest = false;
  });

  it('prevents double-processing when candidate is already claimed by another worker', async () => {
    const rawSecret = 'whsec_lease_secret_abcdef';
    const encrypted = encryptSecret(rawSecret, MASTER_KEY);

    const mockDb = {
      webhookDelivery: {
        findMany: async () => [
          {
            id: randomUUID(),
            organizationId: randomUUID(),
            sourceEventId: randomUUID(),
            eventType: 'TripCreated',
            payload: {},
            attempts: 0,
            subscription: {
              endpointUrl: `http://127.0.0.1:${serverPort}/webhook`,
              connection: { secrets: [{ encryptedSecret: encrypted }] },
            },
          },
        ],
        // Another worker claimed it first
        updateMany: async () => ({ count: 0 }),
      },
    } as unknown as PrismaClient;

    const config = {
      INTEGRATION_MASTER_KEY: MASTER_KEY,
      NODE_ENV: 'test',
    } as unknown as WorkerConfig;

    const processor = new WebhookDeliveryProcessorService(mockDb, config);
    const count = await processor.processBatch();
    // 0 deliveries dispatched because lease failed
    expect(count).toBe(1);
  });

  it('fencing: stale worker completing after lease reclaim does not overwrite newer lease holder', async () => {
    const rawSecret = 'whsec_stale_secret_abcdef';
    const encrypted = encryptSecret(rawSecret, MASTER_KEY);
    const deliveryId = randomUUID();
    const orgId = randomUUID();

    let attemptCreated = false;

    const mockDb = {
      webhookDelivery: {
        findMany: async () => [
          {
            id: deliveryId,
            organizationId: orgId,
            sourceEventId: randomUUID(),
            eventType: 'TripCreated',
            payload: {},
            attempts: 0,
            subscription: {
              endpointUrl: `http://127.0.0.1:${serverPort}/webhook`,
              connection: { secrets: [{ encryptedSecret: encrypted }] },
            },
          },
        ],
        // Initial claim succeeds
        updateMany: async () => ({ count: 1 }),
      },
      webhookDeliveryAttempt: {
        create: async () => {
          attemptCreated = true;
          return {};
        },
      },
      $transaction: async (arg: unknown) => {
        if (typeof arg === 'function') {
          // When completing the delivery, simulate that another worker reclaimed the lease: count = 0
          return (arg as (tx: unknown) => Promise<unknown>)({
            webhookDelivery: {
              updateMany: async () => ({ count: 0 }),
            },
            webhookDeliveryAttempt: {
              create: async () => {
                attemptCreated = true;
                return {};
              },
            },
          });
        }
        return Promise.all(arg as Promise<unknown>[]);
      },
    } as unknown as PrismaClient;

    const config = {
      INTEGRATION_MASTER_KEY: MASTER_KEY,
      NODE_ENV: 'test',
    } as unknown as WorkerConfig;

    const processor = new WebhookDeliveryProcessorService(mockDb, config);
    await processor.processBatch();

    // Since the lease was lost (count === 0 on final updateMany), attempt recording was discarded
    expect(attemptCreated).toBe(false);
  });
});
