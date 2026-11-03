export interface EmailDeliveryRequest {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
  readonly htmlBody?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface EmailDeliveryResult {
  readonly success: boolean;
  readonly provider: string;
  readonly providerMessageId?: string;
  readonly failureCode?: string;
  readonly failureMessage?: string;
  readonly isRetryable: boolean;
}

export interface SmsDeliveryRequest {
  readonly to: string;
  readonly body: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface SmsDeliveryResult {
  readonly success: boolean;
  readonly provider: string;
  readonly providerMessageId?: string;
  readonly failureCode?: string;
  readonly failureMessage?: string;
  readonly isRetryable: boolean;
}

export interface EmailNotificationProvider {
  send(request: EmailDeliveryRequest): Promise<EmailDeliveryResult>;
}

export interface SmsNotificationProvider {
  send(request: SmsDeliveryRequest): Promise<SmsDeliveryResult>;
}
