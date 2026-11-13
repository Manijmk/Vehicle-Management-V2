import { ApplicationError } from '../../foundation/domain/errors.js';

export class IntegrationConnectionNotFoundError extends ApplicationError {
  constructor(id: string) {
    super('INTEGRATION_CONNECTION_NOT_FOUND', `Integration connection ${id} was not found`);
  }
}

export class IntegrationConnectionInvalidStateError extends ApplicationError {
  constructor(message: string) {
    super('INTEGRATION_INVALID_STATE', message);
  }
}

export class IntegrationVersionConflictError extends ApplicationError {
  constructor(message = 'Integration connection version conflict. Please reload and try again.') {
    super('INTEGRATION_VERSION_CONFLICT', message);
  }
}

export class IntegrationConcurrencyError extends ApplicationError {
  constructor(id: string, currentVersion: number, expectedVersion: number) {
    super(
      'INTEGRATION_VERSION_CONFLICT',
      `Integration connection ${id} version mismatch. Expected ${expectedVersion}, found ${currentVersion}`,
    );
  }
}

export class IntegrationSecretNotFoundError extends ApplicationError {
  constructor(message = 'Active integration secret was not found') {
    super('INTEGRATION_SECRET_NOT_FOUND', message);
  }
}

export class IntegrationSecretInvalidError extends ApplicationError {
  constructor(message = 'Invalid integration secret') {
    super('INTEGRATION_SECRET_INVALID', message);
  }
}

export class InvalidWebhookUrlError extends ApplicationError {
  constructor(message: string) {
    super('INVALID_WEBHOOK_URL', message);
  }
}

export class InvalidWebhookEventTypesError extends ApplicationError {
  constructor(message: string) {
    super('INVALID_WEBHOOK_EVENT_TYPES', message);
  }
}

export class WebhookSubscriptionNotFoundError extends ApplicationError {
  constructor(id: string) {
    super('WEBHOOK_SUBSCRIPTION_NOT_FOUND', `Webhook subscription ${id} was not found`);
  }
}

export class WebhookDeliveryNotFoundError extends ApplicationError {
  constructor(id: string) {
    super('WEBHOOK_DELIVERY_NOT_FOUND', `Webhook delivery ${id} was not found`);
  }
}

export class WebhookDeliveryNotRetryableError extends ApplicationError {
  constructor(message: string) {
    super('WEBHOOK_DELIVERY_NOT_RETRYABLE', message);
  }
}

export class InboundTelematicsSignatureInvalidError extends ApplicationError {
  constructor(message = 'Invalid inbound telematics signature') {
    super('INBOUND_TELEMATICS_SIGNATURE_INVALID', message);
  }
}

export class InboundTelematicsTimestampExpiredError extends ApplicationError {
  constructor(message = 'Inbound telematics timestamp is missing or outside allowed clock skew') {
    super('INBOUND_TELEMATICS_TIMESTAMP_EXPIRED', message);
  }
}

export class InboundTelematicsReplayConflictError extends ApplicationError {
  constructor(
    message = 'Inbound event already processed with conflicting payload under the same external event ID',
  ) {
    super('INBOUND_TELEMATICS_REPLAY_CONFLICT', message);
  }
}

export class InboundTelematicsPayloadInvalidError extends ApplicationError {
  constructor(message: string) {
    super('INBOUND_TELEMATICS_PAYLOAD_INVALID', message);
  }
}

export class IntegrationMappingNotFoundError extends ApplicationError {
  constructor(providerDeviceId: string) {
    super(
      'INTEGRATION_MAPPING_NOT_FOUND',
      `No active device mapping found for provider device ID: ${providerDeviceId}`,
    );
  }
}

export class IntegrationMappingAlreadyExistsError extends ApplicationError {
  constructor(providerDeviceId: string) {
    super(
      'INTEGRATION_MAPPING_ALREADY_EXISTS',
      `A mapping already exists for provider device ID: ${providerDeviceId}`,
    );
  }
}

export class FuelCardImportBatchNotFoundError extends ApplicationError {
  constructor(id: string) {
    super('FUEL_CARD_IMPORT_BATCH_NOT_FOUND', `Fuel card import batch ${id} was not found`);
  }
}

export class FuelCardImportParsingError extends ApplicationError {
  constructor(message: string, details?: unknown) {
    super('FUEL_CARD_IMPORT_PARSING_ERROR', message, details);
  }
}

export class DuplicateExternalTransactionError extends ApplicationError {
  constructor(externalTransactionId: string) {
    super(
      'DUPLICATE_EXTERNAL_TRANSACTION',
      `Fuel transaction with external ID ${externalTransactionId} has already been imported`,
    );
  }
}
