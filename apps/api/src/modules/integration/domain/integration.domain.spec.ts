import { describe, expect, it } from 'vitest';
import {
  canTransitionConnectionStatus,
  assertValidConnectionTransition,
  assertValidConnectionName,
  assertValidProvider,
} from './integration-connection.js';
import {
  generateRawSecret,
  hashSecret,
  verifySecretHash,
  encryptSecret,
  decryptSecret,
} from './integration-secret.js';
import { validateWebhookUrl, isPrivateOrReservedIp } from './url-validator.js';
import { validateWebhookEventTypes, isAllowedWebhookEventType } from './webhook-subscription.js';
import {
  signWebhookPayload,
  verifyWebhookSignature,
  buildWebhookEnvelope,
  calculateNextAttemptAt,
} from './webhook-delivery.js';
import {
  validateTimestampFreshness,
  validateInboundTelematicsPayload,
} from './telematics-webhook.js';
import { parseAndValidateFuelCardCsv } from './fuel-card-import.js';
import { generateAccountingCsv, sanitizeCsvCell } from './accounting-export.js';

describe('Integration Domain', () => {
  describe('Connection Lifecycle', () => {
    it('allows valid state transitions', () => {
      expect(canTransitionConnectionStatus('DRAFT', 'ACTIVE')).toBe(true);
      expect(canTransitionConnectionStatus('ACTIVE', 'SUSPENDED')).toBe(true);
      expect(canTransitionConnectionStatus('SUSPENDED', 'ACTIVE')).toBe(true);
      expect(canTransitionConnectionStatus('ACTIVE', 'DISABLED')).toBe(true);
      expect(canTransitionConnectionStatus('SUSPENDED', 'DISABLED')).toBe(true);
      expect(canTransitionConnectionStatus('DRAFT', 'DISABLED')).toBe(true);
    });

    it('rejects invalid or terminal transitions', () => {
      expect(canTransitionConnectionStatus('DRAFT', 'SUSPENDED')).toBe(false);
      expect(canTransitionConnectionStatus('DISABLED', 'ACTIVE')).toBe(false);
      expect(canTransitionConnectionStatus('DISABLED', 'DRAFT')).toBe(false);
      expect(canTransitionConnectionStatus('ACTIVE', 'ACTIVE')).toBe(false);

      expect(() => assertValidConnectionTransition('DISABLED', 'ACTIVE')).toThrow();
    });

    it('validates connection name and provider', () => {
      expect(() => assertValidConnectionName('GPS Fleet Integration')).not.toThrow();
      expect(() => assertValidConnectionName('')).toThrow();
      expect(() => assertValidConnectionName('   ')).toThrow();

      expect(() => assertValidProvider('GENERIC_SIGNED_WEBHOOK')).not.toThrow();
      expect(() => assertValidProvider('')).toThrow();
    });
  });

  describe('Secret Management and AES-256-GCM Encryption', () => {
    const masterKey = 'test-master-key-32-chars-long-123456';

    it('generates high-entropy secrets and hashes them with sha256', () => {
      const secret = generateRawSecret();
      expect(secret.startsWith('whsec_')).toBe(true);
      const hash = hashSecret(secret);
      expect(hash).toHaveLength(64);
      expect(verifySecretHash(secret, hash)).toBe(true);
      expect(verifySecretHash('wrong-secret', hash)).toBe(false);
    });

    it('encrypts and decrypts secret cleanly with key versioning', () => {
      const secret = generateRawSecret();
      const encrypted = encryptSecret(secret, masterKey, 1);
      expect(encrypted.startsWith('v1:')).toBe(true);

      const decrypted = decryptSecret(encrypted, masterKey);
      expect(decrypted).toBe(secret);
    });

    it('fails decryption on tampered ciphertext or auth tag', () => {
      const secret = generateRawSecret();
      const encrypted = encryptSecret(secret, masterKey, 1);
      const parts = encrypted.split(':');
      // tamper with ciphertext
      parts[3] = parts[3]!.slice(0, -2) + '00';
      const tampered = parts.join(':');

      expect(() => decryptSecret(tampered, masterKey)).toThrow();
    });
  });

  describe('SSRF and URL Validation', () => {
    it('detects private and reserved IPs accurately', () => {
      expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('10.0.0.5')).toBe(true);
      expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('172.31.255.255')).toBe(true);
      expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true);
      expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
      expect(isPrivateOrReservedIp('::1')).toBe(true);
      expect(isPrivateOrReservedIp('fe80::1')).toBe(true);

      expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
      expect(isPrivateOrReservedIp('93.184.216.34')).toBe(false);
    });

    it('rejects loopback, private IPs, and credentials in URL in production mode', async () => {
      await expect(validateWebhookUrl('http://127.0.0.1:8080/webhook')).rejects.toThrow();
      await expect(validateWebhookUrl('http://10.1.2.3/webhook')).rejects.toThrow();
      await expect(validateWebhookUrl('http://user:pass@example.com/webhook')).rejects.toThrow();
      await expect(validateWebhookUrl('ftp://example.com/webhook')).rejects.toThrow();
    });

    it('permits localhost when allowLocalhost option is set (for test environments)', async () => {
      const url = await validateWebhookUrl('http://localhost:9999/hook', { allowLocalhost: true });
      expect(url).toBe('http://localhost:9999/hook');
    });
  });

  describe('Webhook Subscriptions and Event Allowlist', () => {
    it('validates allowed event types', () => {
      expect(isAllowedWebhookEventType('TripStarted')).toBe(true);
      expect(isAllowedWebhookEventType('IncidentReported')).toBe(true);
      expect(isAllowedWebhookEventType('FuelAnomalyDetected')).toBe(true);
      expect(isAllowedWebhookEventType('UnknownEvent')).toBe(false);

      expect(validateWebhookEventTypes(['TripStarted', 'IncidentReported'])).toEqual([
        'TripStarted',
        'IncidentReported',
      ]);
      expect(() => validateWebhookEventTypes(['TripStarted', 'FakeEvent'])).toThrow();
      expect(() => validateWebhookEventTypes([])).toThrow();
    });
  });

  describe('HMAC-SHA256 Webhook Delivery Signing and Payload Minimization', () => {
    const secret = 'whsec_test_secret_1234567890abcdef';
    const timestamp = 1794480000000;
    const body = JSON.stringify({ eventId: 'ev-1', eventType: 'TripStarted' });

    it('signs and verifies HMAC signatures with timingSafeEqual', () => {
      const sig = signWebhookPayload(timestamp, body, secret);
      expect(sig.startsWith('v1=')).toBe(true);
      expect(verifyWebhookSignature(timestamp, body, secret, sig)).toBe(true);
      expect(verifyWebhookSignature(timestamp + 1000, body, secret, sig)).toBe(false);
      expect(verifyWebhookSignature(timestamp, body + ' ', secret, sig)).toBe(false);
      expect(verifyWebhookSignature(timestamp, body, 'other-secret', sig)).toBe(false);
    });

    it('rejects malformed, empty, or missing signatures', () => {
      expect(verifyWebhookSignature(timestamp, body, secret, '')).toBe(false);
      expect(verifyWebhookSignature(timestamp, body, secret, null as unknown as string)).toBe(
        false,
      );
      expect(verifyWebhookSignature(timestamp, body, secret, undefined as unknown as string)).toBe(
        false,
      );
      expect(verifyWebhookSignature(timestamp, body, secret, 'malformed-signature')).toBe(false);
      expect(verifyWebhookSignature(timestamp, body, secret, 'v1=tooshort')).toBe(false);
      expect(verifyWebhookSignature(timestamp, body, secret, 'v2=0123456789abcdef')).toBe(false);
    });

    it('enforces exact transmitted raw bytes (whitespace variations produce distinct signatures)', () => {
      const canonicalBody = '{"tripId":"trip-01","status":"READY"}';
      const spacedBody = '{"tripId": "trip-01", "status": "READY"}';
      const sigCanonical = signWebhookPayload(timestamp, canonicalBody, secret);
      expect(verifyWebhookSignature(timestamp, canonicalBody, secret, sigCanonical)).toBe(true);
      expect(verifyWebhookSignature(timestamp, spacedBody, secret, sigCanonical)).toBe(false);
    });

    it('builds minimized envelope excluding sensitive fields', () => {
      const envelope = buildWebhookEnvelope({
        id: 'outbox-1',
        eventType: 'DriverCreated',
        aggregateType: 'Driver',
        aggregateId: 'driver-1',
        occurredAt: new Date('2026-11-12T12:00:00Z'),
        payload: {
          driverId: 'driver-1',
          name: 'Jane Doe',
          phoneNumber: '+15551234567', // sensitive -> should be excluded
          secretToken: 'secret-xyz', // sensitive -> should be excluded
        },
      });

      expect(envelope.eventId).toBe('outbox-1');
      expect(envelope.data['name']).toBe('Jane Doe');
      expect(envelope.data['phoneNumber']).toBeUndefined();
      expect(envelope.data['secretToken']).toBeUndefined();
    });

    it('calculates next attempt time with backoff', () => {
      const now = new Date('2026-11-12T12:00:00Z');
      const next1 = calculateNextAttemptAt(1, now);
      const next2 = calculateNextAttemptAt(2, now);
      expect(next1.getTime()).toBeGreaterThan(now.getTime());
      expect(next2.getTime()).toBeGreaterThan(next1.getTime());
    });
  });

  describe('Inbound Telematics Webhook Validation', () => {
    it('validates timestamp freshness against clock skew', () => {
      const now = new Date('2026-11-12T12:00:00Z');
      const validTime = now.getTime() - 60_000; // 1 min ago
      expect(validateTimestampFreshness(validTime, now)).toBe(validTime);

      const expiredTime = now.getTime() - 10 * 60 * 1000; // 10 min ago (> 5 min skew)
      expect(() => validateTimestampFreshness(expiredTime, now)).toThrow();
    });

    it('validates inbound telematics batch payload', () => {
      const validPayload = {
        externalEventId: 'ext-evt-1001',
        positions: [
          {
            providerDeviceId: 'prov-dev-1',
            capturedAt: '2026-11-12T11:59:00Z',
            latitude: 37.7749,
            longitude: -122.4194,
            speedKmh: 45.5,
          },
        ],
      };

      const parsed = validateInboundTelematicsPayload(validPayload);
      expect(parsed.externalEventId).toBe('ext-evt-1001');
      expect(parsed.positions).toHaveLength(1);

      // Empty batch
      expect(() =>
        validateInboundTelematicsPayload({ externalEventId: '1', positions: [] }),
      ).toThrow();
      // Invalid lat
      expect(() =>
        validateInboundTelematicsPayload({
          externalEventId: '1',
          positions: [
            {
              providerDeviceId: 'd1',
              capturedAt: '2026-11-12T11:59:00Z',
              latitude: 95,
              longitude: 0,
            },
          ],
        }),
      ).toThrow();
    });
  });

  describe('Fuel Card CSV Import', () => {
    it('parses valid CSV and detects errors in malformed rows', () => {
      const csv = `externalTransactionId,vehicleRegistration,occurredAt,energyType,quantity,quantityUnit,unitPrice,totalAmount,currencyCode,stationName
TX-1001,REG-1234,2026-11-10T10:00:00Z,DIESEL,50.0,LITER,1.50,75.00,USD,Shell Central
TX-1002,REG-5678,invalid-date,GASOLINE,-10,LITER,1.20,12.00,USD,BP Station`;

      const result = parseAndValidateFuelCardCsv(csv);
      expect(result.totalRows).toBe(2);
      expect(result.validRowsCount).toBe(1);
      expect(result.invalidRowsCount).toBe(1);

      const row1 = result.rows[0]!;
      expect(row1.isValid).toBe(true);
      expect(row1.parsed?.externalTransactionId).toBe('TX-1001');
      expect(row1.parsed?.totalAmount).toBe(75.0);

      const row2 = result.rows[1]!;
      expect(row2.isValid).toBe(false);
      expect(row2.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Accounting CSV Export and Sanitization', () => {
    it('neutralizes spreadsheet formula injection', () => {
      expect(sanitizeCsvCell('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
      expect(sanitizeCsvCell('+12345')).toBe("'+12345");
      expect(sanitizeCsvCell('-50.00')).toBe("'-50.00");
      expect(sanitizeCsvCell('@evil')).toBe("'@evil");
      expect(sanitizeCsvCell('Normal Text')).toBe('Normal Text');
    });

    it('generates formatted accounting CSV with headers', () => {
      const csv = generateAccountingCsv([
        {
          id: 'exp-1',
          dateUtc: '2026-11-10T12:00:00Z',
          type: 'EXPENSE',
          category: 'TOLL',
          vehicleDisplay: 'VEH-101',
          amount: '25.00',
          currency: 'USD',
          referenceNumber: 'REF-889',
          merchantOrVendor: 'FastToll',
          description: 'Highway toll',
        },
      ]);

      expect(csv).toContain('Transaction ID,Date (UTC),Type,Category,Vehicle,Amount,Currency');
      expect(csv).toContain('exp-1,2026-11-10T12:00:00Z,EXPENSE,TOLL,VEH-101,25.00,USD');
    });
  });
});
