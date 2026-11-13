export interface WebhookHttpResponse {
  readonly status: number;
  readonly durationMs: number;
  readonly error?: string | undefined;
  readonly responseExcerpt?: string | undefined;
}

export interface WebhookTransportPort {
  send(
    url: string,
    headers: Record<string, string>,
    body: string,
    timeoutMs?: number,
  ): Promise<WebhookHttpResponse>;
}
