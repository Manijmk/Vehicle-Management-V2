import { describe, expect, it } from 'vitest';

import { deriveRecipientStatus } from './notification.js';
import {
  isMandatoryInAppNotification,
  resolveNotificationPreference,
} from './notification-preference.js';
import { escapeHtml, extractPlaceholders, renderTemplate } from './template-renderer.js';

describe('Notification Domain Units', () => {
  describe('deriveRecipientStatus', () => {
    it('returns PENDING when neither in-app nor external channels exist', () => {
      const status = deriveRecipientStatus({ inAppDelivered: false });
      expect(status).toBe('PENDING');
    });

    it('returns DELIVERED when in-app is delivered and no external channels requested', () => {
      const status = deriveRecipientStatus({ inAppDelivered: true });
      expect(status).toBe('DELIVERED');
    });

    it('returns PENDING when an external attempt is RETRYING', () => {
      const status = deriveRecipientStatus({
        inAppDelivered: true,
        externalAttempts: [{ channel: 'EMAIL', status: 'RETRYING' }],
      });
      expect(status).toBe('PENDING');
    });

    it('returns DELIVERED when external attempts are DELIVERED or SKIPPED', () => {
      const status = deriveRecipientStatus({
        inAppDelivered: true,
        externalAttempts: [
          { channel: 'EMAIL', status: 'DELIVERED' },
          { channel: 'SMS', status: 'SKIPPED' },
        ],
      });
      expect(status).toBe('DELIVERED');
    });

    it('returns PARTIALLY_DELIVERED when one channel fails but in-app or another succeeds', () => {
      const status = deriveRecipientStatus({
        inAppDelivered: true,
        externalAttempts: [{ channel: 'EMAIL', status: 'FAILED' }],
      });
      expect(status).toBe('PARTIALLY_DELIVERED');
    });

    it('returns FAILED when in-app is not delivered and all external channels failed', () => {
      const status = deriveRecipientStatus({
        inAppDelivered: false,
        externalAttempts: [
          { channel: 'EMAIL', status: 'FAILED' },
          { channel: 'SMS', status: 'FAILED' },
        ],
      });
      expect(status).toBe('FAILED');
    });
  });

  describe('resolveNotificationPreference', () => {
    it('applies safe defaults when no preference record exists', () => {
      const res = resolveNotificationPreference({
        category: 'MAINTENANCE',
        userEmail: 'tech@example.test',
      });

      expect(res.inApp).toBe(true);
      expect(res.email).toBe(true);
      expect(res.sms).toBe(false);
      expect(res.isMandatoryInApp).toBe(false);
    });

    it('disables email if user has no email registered even if default is enabled', () => {
      const res = resolveNotificationPreference({
        category: 'GENERAL',
        userEmail: null,
      });

      expect(res.inApp).toBe(true);
      expect(res.email).toBe(false);
      expect(res.sms).toBe(false);
    });

    it('enforces mandatory in-app for CRITICAL_INSPECTION even if stored preference disabled it', () => {
      expect(isMandatoryInAppNotification('CRITICAL_INSPECTION')).toBe(true);

      const res = resolveNotificationPreference({
        category: 'CRITICAL_INSPECTION',
        storedPreference: {
          organizationId: '10000000-0000-4000-8000-000000000001',
          userId: '20000000-0000-4000-8000-000000000001',
          category: 'CRITICAL_INSPECTION',
          inAppEnabled: false, // Attempted to disable!
          emailEnabled: true,
          smsEnabled: false,
        },
        userEmail: 'admin@example.test',
      });

      expect(res.inApp).toBe(true); // Policy override
      expect(res.isMandatoryInApp).toBe(true);
      expect(res.email).toBe(true);
    });

    it('enforces mandatory in-app for INCIDENT category', () => {
      expect(isMandatoryInAppNotification('INCIDENT')).toBe(true);

      const res = resolveNotificationPreference({
        category: 'INCIDENT',
        storedPreference: {
          organizationId: '10000000-0000-4000-8000-000000000001',
          userId: '20000000-0000-4000-8000-000000000001',
          category: 'INCIDENT',
          inAppEnabled: false,
          emailEnabled: false,
          smsEnabled: false,
        },
        userEmail: 'admin@example.test',
      });

      expect(res.inApp).toBe(true);
      expect(res.email).toBe(false);
    });

    it('respects user disabling in-app for non-mandatory category like MAINTENANCE', () => {
      const res = resolveNotificationPreference({
        category: 'MAINTENANCE',
        storedPreference: {
          organizationId: '10000000-0000-4000-8000-000000000001',
          userId: '20000000-0000-4000-8000-000000000001',
          category: 'MAINTENANCE',
          inAppEnabled: false,
          emailEnabled: true,
          smsEnabled: false,
        },
        userEmail: 'admin@example.test',
      });

      expect(res.inApp).toBe(false);
      expect(res.email).toBe(true);
    });
  });

  describe('Template Renderer', () => {
    it('extracts unique placeholders', () => {
      const template =
        'Alert for {{vehicleDisplayId}} on trip {{tripId}}. Vehicle: {{vehicleDisplayId}}';
      const placeholders = extractPlaceholders(template);
      expect(placeholders).toEqual(['vehicleDisplayId', 'tripId']);
    });

    it('renders normal substitution without HTML escaping by default', () => {
      const template = 'Incident {{displayId}}: {{title}} ({{severity}})';
      const result = renderTemplate(template, {
        displayId: 'INC-1001',
        title: 'Collision on Highway 101',
        severity: 'CRITICAL',
      });

      expect(result).toBe('Incident INC-1001: Collision on Highway 101 (CRITICAL)');
    });

    it('escapes HTML special characters when escapeHtml is true', () => {
      const template = 'Notification: {{message}} by user {{user}}';
      const result = renderTemplate(
        template,
        {
          message: '<script>alert("pwned")</script> & "cookies"',
          user: "O'Connor",
        },
        { escapeHtml: true },
      );

      expect(result).toBe(
        'Notification: &lt;script&gt;alert(&quot;pwned&quot;)&lt;/script&gt; &amp; &quot;cookies&quot; by user O&#39;Connor',
      );
    });

    it('throws NotificationTemplateRenderError on missing required variables', () => {
      const template = 'Work order {{workOrderId}} for vehicle {{vehicleId}}';
      expect(() => {
        renderTemplate(template, { workOrderId: 'WO-1001' });
      }).toThrowError(/Missing required template variables: vehicleId/);
    });

    it('handles multiple occurrences of the same variable', () => {
      const template = '{{code}} is {{code}} and code={{code}}';
      const result = renderTemplate(template, { code: 'ABC' });
      expect(result).toBe('ABC is ABC and code=ABC');
    });

    it('escapes html helper function directly', () => {
      expect(escapeHtml('A & B < C > D "E" \'F\'')).toBe(
        'A &amp; B &lt; C &gt; D &quot;E&quot; &#39;F&#39;',
      );
    });
  });
});
