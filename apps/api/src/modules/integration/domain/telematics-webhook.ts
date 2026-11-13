import crypto from 'node:crypto';
import {
  InboundTelematicsPayloadInvalidError,
  InboundTelematicsSignatureInvalidError,
  InboundTelematicsTimestampExpiredError,
} from './integration-errors.js';
import { verifyWebhookSignature } from './webhook-delivery.js';

export function computeTelematicsPayloadHash(rawBody: string): string {
  return crypto.createHash('sha256').update(rawBody).digest('hex');
}

export function verifyTelematicsWebhookHeaders(params: {
  signatureHeader: string | undefined;
  timestampHeader: string | undefined;
  rawBody: string;
  secret: string;
}): void {
  const { signatureHeader, timestampHeader, rawBody, secret } = params;

  if (!signatureHeader || !signatureHeader.trim()) {
    throw new InboundTelematicsSignatureInvalidError('Signature header is required');
  }

  const timestampNum = validateTimestampFreshness(timestampHeader);

  const isValid = verifyWebhookSignature(timestampNum, rawBody, secret, signatureHeader.trim());
  if (!isValid) {
    throw new InboundTelematicsSignatureInvalidError();
  }
}

export interface InboundTelematicsPosition {
  readonly providerDeviceId: string;
  readonly capturedAt: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly speedKmh?: number | null;
  readonly heading?: number | null;
  readonly altitudeM?: number | null;
  readonly odometerKm?: number | null;
  readonly ignition?: boolean | null;
}

export interface InboundTelematicsBatchPayload {
  readonly externalEventId: string;
  readonly schemaVersion?: string;
  readonly positions: readonly InboundTelematicsPosition[];
}

export const MAX_TELEMATICS_BATCH_SIZE = 100;
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000; // 5 minutes

export function validateTimestampFreshness(
  timestampHeader: string | number | undefined,
  now = new Date(),
): number {
  if (timestampHeader === undefined || timestampHeader === null || timestampHeader === '') {
    throw new InboundTelematicsTimestampExpiredError('Timestamp header is required');
  }

  const timestampNum =
    typeof timestampHeader === 'number' ? timestampHeader : parseInt(timestampHeader, 10);

  if (Number.isNaN(timestampNum) || !Number.isFinite(timestampNum)) {
    throw new InboundTelematicsTimestampExpiredError(
      'Timestamp must be a valid epoch millisecond integer',
    );
  }

  const diffMs = Math.abs(now.getTime() - timestampNum);
  if (diffMs > MAX_CLOCK_SKEW_MS) {
    throw new InboundTelematicsTimestampExpiredError(
      `Timestamp is outside the allowed ${MAX_CLOCK_SKEW_MS / 1000}s clock skew window`,
    );
  }

  return timestampNum;
}

export function validateInboundTelematicsPayload(payload: unknown): InboundTelematicsBatchPayload {
  if (!payload || typeof payload !== 'object') {
    throw new InboundTelematicsPayloadInvalidError('Payload must be a JSON object');
  }

  const obj = payload as Record<string, unknown>;

  if (typeof obj.externalEventId !== 'string' || !obj.externalEventId.trim()) {
    throw new InboundTelematicsPayloadInvalidError('externalEventId must be a non-empty string');
  }

  if (obj.externalEventId.length > 200) {
    throw new InboundTelematicsPayloadInvalidError('externalEventId cannot exceed 200 characters');
  }

  if (!Array.isArray(obj.positions)) {
    throw new InboundTelematicsPayloadInvalidError('positions must be an array');
  }

  if (obj.positions.length === 0) {
    throw new InboundTelematicsPayloadInvalidError('positions array cannot be empty');
  }

  if (obj.positions.length > MAX_TELEMATICS_BATCH_SIZE) {
    throw new InboundTelematicsPayloadInvalidError(
      `positions batch size exceeds maximum allowed of ${MAX_TELEMATICS_BATCH_SIZE}`,
    );
  }

  for (let i = 0; i < obj.positions.length; i++) {
    const pos = obj.positions[i] as Record<string, unknown>;
    if (!pos || typeof pos !== 'object') {
      throw new InboundTelematicsPayloadInvalidError(
        `Position at index ${i} is not a valid object`,
      );
    }

    if (typeof pos.providerDeviceId !== 'string' || !pos.providerDeviceId.trim()) {
      throw new InboundTelematicsPayloadInvalidError(
        `Position at index ${i} is missing providerDeviceId`,
      );
    }

    if (typeof pos.capturedAt !== 'string' || Number.isNaN(new Date(pos.capturedAt).getTime())) {
      throw new InboundTelematicsPayloadInvalidError(
        `Position at index ${i} has invalid capturedAt timestamp`,
      );
    }

    if (
      typeof pos.latitude !== 'number' ||
      !Number.isFinite(pos.latitude) ||
      pos.latitude < -90 ||
      pos.latitude > 90
    ) {
      throw new InboundTelematicsPayloadInvalidError(
        `Position at index ${i} has invalid latitude (must be -90 to 90)`,
      );
    }

    if (
      typeof pos.longitude !== 'number' ||
      !Number.isFinite(pos.longitude) ||
      pos.longitude < -180 ||
      pos.longitude > 180
    ) {
      throw new InboundTelematicsPayloadInvalidError(
        `Position at index ${i} has invalid longitude (must be -180 to 180)`,
      );
    }
  }

  return {
    externalEventId: obj.externalEventId.trim(),
    schemaVersion: typeof obj.schemaVersion === 'string' ? obj.schemaVersion : '1.0',
    positions: obj.positions as InboundTelematicsPosition[],
  };
}
