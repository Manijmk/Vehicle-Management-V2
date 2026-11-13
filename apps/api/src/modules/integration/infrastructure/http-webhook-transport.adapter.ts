import { Injectable, Logger } from '@nestjs/common';
import type {
  WebhookHttpResponse,
  WebhookTransportPort,
} from '../application/ports/webhook-transport.port.js';
import { sendSafeWebhookHttpRequest } from '../domain/url-validator.js';

@Injectable()
export class HttpWebhookTransportAdapter implements WebhookTransportPort {
  private readonly logger = new Logger(HttpWebhookTransportAdapter.name);

  async send(
    url: string,
    headers: Record<string, string>,
    body: string,
    timeoutMs = 10000,
  ): Promise<WebhookHttpResponse> {
    const startTime = performance.now();
    const allowLocalhost =
      process.env.NODE_ENV === 'test' || process.env.ALLOW_LOCALHOST_WEBHOOKS === 'true';

    try {
      const res = await sendSafeWebhookHttpRequest(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'VMS-Webhook-Delivery/1.0',
          ...headers,
        },
        body,
        timeoutMs,
        allowLocalhost,
      });

      return {
        status: res.status,
        durationMs: res.durationMs,
        responseExcerpt: res.body,
      };
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - startTime);
      this.logger.warn(
        `Webhook delivery failed to ${url}: ${err instanceof Error ? err.message : String(err)}`,
      );

      return {
        status: 0,
        durationMs,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
