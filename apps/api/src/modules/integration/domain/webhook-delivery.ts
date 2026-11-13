import crypto from 'node:crypto';

export interface OutboundWebhookEnvelope {
  readonly eventId: string;
  readonly eventType: string;
  readonly eventVersion: string;
  readonly occurredAt: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly data: Record<string, unknown>;
}

export const SIGNATURE_VERSION = 'v1';
export const MAX_DELIVERY_ATTEMPTS = 5;

/**
 * Creates the signing base string: `${timestamp}.${rawBody}`
 */
export function buildSignatureBase(timestamp: number, rawBody: string): string {
  return `${timestamp}.${rawBody}`;
}

/**
 * Signs the webhook payload using HMAC-SHA256.
 * Returns `v1=${hexDigest}`.
 */
export function signWebhookPayload(timestamp: number, rawBody: string, secret: string): string {
  const base = buildSignatureBase(timestamp, rawBody);
  const hmac = crypto.createHmac('sha256', secret).update(base).digest('hex');
  return `${SIGNATURE_VERSION}=${hmac}`;
}

/**
 * Verifies an incoming HMAC-SHA256 signature using timing-safe comparison.
 */
export function verifyWebhookSignature(
  timestamp: number,
  rawBody: string,
  secret: string,
  providedSignature: string,
): boolean {
  if (!providedSignature || typeof providedSignature !== 'string') {
    return false;
  }
  const expected = signWebhookPayload(timestamp, rawBody, secret);
  if (expected.length !== providedSignature.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(providedSignature));
}

/**
 * Builds the data-minimized envelope from an outbox event.
 */
export function buildWebhookEnvelope(sourceEvent: {
  readonly id: string;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly occurredAt: Date;
  readonly payload: unknown;
}): OutboundWebhookEnvelope {
  const rawPayload = (
    sourceEvent.payload && typeof sourceEvent.payload === 'object' ? sourceEvent.payload : {}
  ) as Record<string, unknown>;

  // Data minimization: clean out sensitive credentials, full storage paths, contact numbers
  const cleanedData: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(rawPayload)) {
    const k = key.toLowerCase();
    if (
      k.includes('secret') ||
      k.includes('password') ||
      k.includes('token') ||
      k.includes('storagekey') ||
      k.includes('phonenumber') ||
      k.includes('ssn')
    ) {
      continue;
    }
    cleanedData[key] = val;
  }

  return {
    eventId: sourceEvent.id,
    eventType: sourceEvent.eventType,
    eventVersion: '1.0',
    occurredAt: sourceEvent.occurredAt.toISOString(),
    resourceType: sourceEvent.aggregateType,
    resourceId: sourceEvent.aggregateId,
    data: cleanedData,
  };
}

/**
 * Computes next attempt time with exponential backoff and jitter.
 * Base delays: 10s, 30s, 120s, 600s, 1800s.
 */
export function calculateNextAttemptAt(attemptNumber: number, now = new Date()): Date {
  const baseDelaysMs = [10_000, 30_000, 120_000, 600_000, 1_800_000];
  const idx = Math.min(attemptNumber - 1, baseDelaysMs.length - 1);
  const baseMs = baseDelaysMs[Math.max(0, idx)] ?? 10_000;
  // Apply +/- 15% jitter
  const jitterFactor = 0.85 + Math.random() * 0.3;
  const delayMs = Math.round(baseMs * jitterFactor);

  return new Date(now.getTime() + delayMs);
}
