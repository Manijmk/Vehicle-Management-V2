import crypto, { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { PrismaClient, WebhookDeliveryStatus } from '@vms/database';
import type { WorkerConfig } from '@vms/config';
import { WORKER_CONFIG, WORKER_DATABASE } from '../outbox/tokens.js';
import { InvalidWebhookUrlError, sendSafeWebhookHttpRequest } from './url-validator.js';

const BACKOFF_SCHEDULE_SECONDS = [10, 30, 120, 600, 1800]; // 10s, 30s, 2m, 10m, 30m

function computeNextAttemptTime(attemptCount: number): Date {
  const baseSeconds =
    BACKOFF_SCHEDULE_SECONDS[Math.min(attemptCount - 1, BACKOFF_SCHEDULE_SECONDS.length - 1)] ?? 10;
  // Jitter up to 20%
  const jitterFactor = 1 + (Math.random() * 0.2 - 0.1);
  const delayMs = Math.round(baseSeconds * 1000 * jitterFactor);
  return new Date(Date.now() + delayMs);
}

function decryptSecret(encrypted: string, masterKey: string): string {
  try {
    const parts = encrypted.split(':');
    if (parts.length !== 4) return '';
    const [, ivHex, authTagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex!, 'hex');
    const authTag = Buffer.from(authTagHex!, 'hex');
    const keyBuffer = crypto.createHash('sha256').update(masterKey).digest();

    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertextHex!, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return '';
  }
}

interface WebhookDeliveryCandidate {
  id: string;
  organizationId: string;
  sourceEventId: string;
  eventType: string;
  payload: unknown;
  attempts: number;
  subscription: {
    endpointUrl: string;
    connection: {
      secrets: Array<{ encryptedSecret: string }>;
    };
  };
}

@Injectable()
export class WebhookDeliveryProcessorService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(WebhookDeliveryProcessorService.name);
  private readonly workerId = `webhook-worker-${randomUUID()}`;
  private timer?: NodeJS.Timeout;
  private processing = false;

  constructor(
    @Inject(WORKER_DATABASE) private readonly database: PrismaClient,
    @Inject(WORKER_CONFIG) private readonly config: WorkerConfig,
  ) {}

  onApplicationBootstrap(): void {
    const pollInterval = this.config.WEBHOOK_DELIVERY_POLL_INTERVAL_MS ?? 1000;
    this.timer = setInterval(() => void this.processBatch(), pollInterval);
    void this.processBatch();
  }

  onApplicationShutdown(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
    }
  }

  async processBatch(): Promise<number> {
    if (this.processing) return 0;
    this.processing = true;

    try {
      const now = new Date();
      const batchSize = this.config.WEBHOOK_DELIVERY_BATCH_SIZE ?? 20;
      const lockTimeoutMs = this.config.WEBHOOK_DELIVERY_LOCK_TIMEOUT_MS ?? 60000;

      // 1. Find candidates
      const candidates = await this.database.webhookDelivery.findMany({
        where: {
          deliveryStatus: { in: ['PENDING', 'RETRYING'] },
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          AND: [
            {
              OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
            },
          ],
        },
        take: batchSize,
        include: {
          subscription: {
            include: {
              connection: {
                include: {
                  secrets: {
                    where: { status: 'ACTIVE' },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      });

      if (candidates.length === 0) {
        return 0;
      }

      for (const delivery of candidates) {
        // Lease delivery
        const lockedUntil = new Date(Date.now() + lockTimeoutMs);
        const claimed = await this.database.webhookDelivery.updateMany({
          where: {
            id: delivery.id,
            OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
          },
          data: {
            lockedUntil,
            lockedBy: this.workerId,
          },
        });

        if (claimed.count === 0) {
          continue; // Claimed by another worker
        }

        await this.dispatchDelivery(delivery);
      }

      return candidates.length;
    } catch (err: unknown) {
      this.logger.error(
        `Webhook delivery batch processing error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 0;
    } finally {
      this.processing = false;
    }
  }

  private async dispatchDelivery(delivery: WebhookDeliveryCandidate): Promise<void> {
    const startTime = performance.now();
    const endpointUrl = delivery.subscription.endpointUrl;
    const encryptedSecret = delivery.subscription.connection.secrets[0]?.encryptedSecret;
    const plaintextSecret = encryptedSecret
      ? decryptSecret(encryptedSecret, this.config.INTEGRATION_MASTER_KEY)
      : '';

    const timestamp = Date.now();
    const bodyStr = JSON.stringify(delivery.payload);

    let signatureHeader = '';
    if (plaintextSecret) {
      const base = `${timestamp}.${bodyStr}`;
      const hmac = crypto.createHmac('sha256', plaintextSecret).update(base).digest('hex');
      signatureHeader = `v1=${hmac}`;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'VMS-Webhook-Delivery/1.0',
      'X-VMS-Event-ID': delivery.sourceEventId,
      'X-VMS-Event-Type': delivery.eventType,
      'X-VMS-Timestamp': String(timestamp),
    };

    if (signatureHeader) {
      headers['X-VMS-Signature'] = signatureHeader;
    }

    let httpStatus: number | null = null;
    let durationMs = 0;
    let errorCode: string | null = null;
    let responseExcerpt: string | null = null;
    let success = false;
    let ssrfBlocked = false;

    try {
      // 1. Connection-time SSRF validation and secure egress transport
      const allowLocalhost =
        this.config.NODE_ENV === 'test' || process.env.ALLOW_LOCALHOST_WEBHOOKS === 'true';

      const res = await sendSafeWebhookHttpRequest(endpointUrl, {
        method: 'POST',
        headers,
        body: bodyStr,
        timeoutMs: 10000,
        allowLocalhost,
      });

      durationMs = res.durationMs;
      httpStatus = res.status;
      success = res.status >= 200 && res.status < 300;
      responseExcerpt = res.body;

      if (!success) {
        errorCode = `HTTP_${res.status}`;
      }
    } catch (err: unknown) {
      durationMs = Math.round(performance.now() - startTime);
      if (
        err instanceof InvalidWebhookUrlError ||
        (err as { code?: string })?.code === 'INVALID_WEBHOOK_URL'
      ) {
        ssrfBlocked = true;
        errorCode = 'SSRF_BLOCKED';
      } else if (
        err instanceof Error &&
        (err.message.includes('SSRF') || err.message.includes('redirect'))
      ) {
        ssrfBlocked = true;
        errorCode = 'SSRF_BLOCKED';
      } else {
        const isTimeout =
          err instanceof Error &&
          (err.message.includes('timed out') || err.name === 'TimeoutError');
        errorCode = isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR';
      }
      responseExcerpt = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    }

    const attemptNumber = delivery.attempts + 1;
    let finalStatus: WebhookDeliveryStatus;
    let nextAttemptAt: Date | null = null;
    let deliveredAt: Date | null = null;

    if (success) {
      finalStatus = 'SUCCESS';
      deliveredAt = new Date();
    } else if (ssrfBlocked) {
      finalStatus = 'FAILED';
    } else {
      if (attemptNumber >= 5) {
        finalStatus = 'EXHAUSTED';
      } else {
        finalStatus = 'RETRYING';
        nextAttemptAt = computeNextAttemptTime(attemptNumber);
      }
    }

    try {
      await this.database.$transaction(async (tx) => {
        const updateResult = await tx.webhookDelivery.updateMany({
          where: {
            id: delivery.id,
            lockedBy: this.workerId,
          },
          data: {
            deliveryStatus: finalStatus,
            attempts: attemptNumber,
            lastHttpStatus: httpStatus,
            lastErrorCode: errorCode,
            nextAttemptAt,
            deliveredAt,
            lockedUntil: null,
            lockedBy: null,
          },
        });

        if (updateResult.count === 0) {
          this.logger.warn(
            `Delivery ${delivery.id} lease expired or claimed by another worker; discarding stale update`,
          );
          return;
        }

        await tx.webhookDeliveryAttempt.create({
          data: {
            organizationId: delivery.organizationId,
            deliveryId: delivery.id,
            attemptNumber,
            httpStatus,
            durationMs,
            errorCode,
            responseExcerpt,
          },
        });
      });
    } catch (err: unknown) {
      this.logger.error(
        `Failed to record delivery result for delivery ${delivery.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
