export interface EmailDeliveryRequest {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
  readonly notificationId?: string;
  readonly recipientId?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface EmailDeliveryResult {
  readonly success: boolean;
  readonly messageId?: string;
  readonly provider: string;
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly isTransient: boolean;
  };
}

export interface SmsDeliveryRequest {
  readonly to: string;
  readonly message: string;
  readonly notificationId?: string;
  readonly recipientId?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface SmsDeliveryResult {
  readonly success: boolean;
  readonly messageId?: string;
  readonly provider: string;
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly isTransient: boolean;
  };
}

export interface EmailNotificationProvider {
  sendEmail(request: EmailDeliveryRequest): Promise<EmailDeliveryResult>;
}

export interface SmsNotificationProvider {
  sendSms(request: SmsDeliveryRequest): Promise<SmsDeliveryResult>;
}
