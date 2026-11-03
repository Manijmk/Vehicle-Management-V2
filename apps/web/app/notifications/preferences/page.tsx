'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import {
  apiClient,
  type NotificationCategory,
  type NotificationPreferenceItem,
} from '../../../lib/api-client';

const CATEGORY_INFO: Record<
  NotificationCategory,
  { label: string; description: string; mandatoryInApp: boolean }
> = {
  CRITICAL_INSPECTION: {
    label: 'Critical Inspection Failures',
    description: 'Immediate notification when an inspection fails critical safety items.',
    mandatoryInApp: true,
  },
  INCIDENT: {
    label: 'Incidents & Safety Violations',
    description: 'Notifications for critical vehicle or driver safety incidents.',
    mandatoryInApp: true,
  },
  COMPLIANCE_EXPIRY: {
    label: 'Compliance Expiration Warnings',
    description: 'Scheduled reminders for documents expiring in 30, 14, 7, or 1 day.',
    mandatoryInApp: false,
  },
  MAINTENANCE: {
    label: 'Maintenance & Work Orders',
    description: 'Work order creation, assignment updates, and completions.',
    mandatoryInApp: false,
  },
  GENERAL: {
    label: 'General System Notices',
    description: 'Administrative announcements and general system updates.',
    mandatoryInApp: false,
  },
};

export default function NotificationPreferencesPage() {
  const [preferences, setPreferences] = useState<NotificationPreferenceItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingCategory, setSavingCategory] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  const loadPreferences = useCallback(async () => {
    try {
      setLoading(true);
      setFeedback(null);
      const res = await apiClient.fetchNotificationPreferences();
      setPreferences(res.items);
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load preferences',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  const handleToggle = async (
    category: NotificationCategory,
    channel: 'inApp' | 'email' | 'sms',
    currentValue: boolean,
  ) => {
    const pref = preferences.find((p) => p.category === category);
    if (!pref) return;

    if (channel === 'inApp' && pref.isMandatoryInApp) {
      return; // Cannot toggle mandatory in-app
    }

    const updated = {
      inAppEnabled: channel === 'inApp' ? !currentValue : pref.inAppEnabled,
      emailEnabled: channel === 'email' ? !currentValue : pref.emailEnabled,
      smsEnabled: channel === 'sms' ? !currentValue : pref.smsEnabled,
    };

    try {
      setSavingCategory(category);
      setFeedback(null);
      const res = await apiClient.updateNotificationPreference({
        category,
        inAppEnabled: updated.inAppEnabled,
        emailEnabled: updated.emailEnabled,
        smsEnabled: updated.smsEnabled,
      });

      setPreferences((prev) => prev.map((p) => (p.category === category ? { ...p, ...res } : p)));

      setFeedback({
        type: 'success',
        message: `Preferences for ${CATEGORY_INFO[category].label} saved successfully.`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update preference',
      });
    } finally {
      setSavingCategory(null);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <TenantHeader onAuthChange={loadPreferences} />

      <main style={{ maxWidth: '900px', margin: '2rem auto', padding: '0 1rem' }}>
        <div
          style={{
            marginBottom: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: '1.875rem',
                fontWeight: 700,
                color: '#0f172a',
                margin: '0 0 0.5rem 0',
              }}
            >
              Notification Channel Preferences
            </h1>
            <p style={{ color: '#64748b', margin: 0 }}>
              Control which notification channels receive operational alerts and reports.
            </p>
          </div>

          <Link
            href="/notifications"
            data-testid="back-to-notifications-link"
            style={{
              padding: '0.5rem 0.875rem',
              borderRadius: '0.375rem',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              textDecoration: 'none',
              fontWeight: 500,
              fontSize: '0.875rem',
            }}
          >
            &larr; Notification Feed
          </Link>
        </div>

        {feedback && (
          <div
            data-testid="pref-feedback"
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '0.375rem',
              marginBottom: '1rem',
              backgroundColor: feedback.type === 'success' ? '#f0fdf4' : '#fee2e2',
              color: feedback.type === 'success' ? '#15803d' : '#991b1b',
              border: feedback.type === 'success' ? '1px solid #bbf7d0' : '1px solid #fecaca',
              fontSize: '0.875rem',
            }}
          >
            {feedback.message}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
            Loading preferences...
          </div>
        ) : (
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '0.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              overflow: 'hidden',
              border: '1px solid #e2e8f0',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.5fr 100px 100px 100px',
                padding: '0.75rem 1.25rem',
                backgroundColor: '#f1f5f9',
                borderBottom: '1px solid #e2e8f0',
                fontWeight: 600,
                fontSize: '0.85rem',
                color: '#475569',
              }}
            >
              <div>Notification Category</div>
              <div style={{ textAlign: 'center' }}>In-App</div>
              <div style={{ textAlign: 'center' }}>Email</div>
              <div style={{ textAlign: 'center' }}>SMS</div>
            </div>

            {preferences.map((pref) => {
              const info = CATEGORY_INFO[pref.category] ?? {
                label: pref.category,
                description: '',
                mandatoryInApp: false,
              };
              const isSaving = savingCategory === pref.category;

              return (
                <div
                  key={pref.category}
                  data-testid={`pref-row-${pref.category}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.5fr 100px 100px 100px',
                    padding: '1rem 1.25rem',
                    borderBottom: '1px solid #f1f5f9',
                    alignItems: 'center',
                    opacity: isSaving ? 0.6 : 1,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.95rem' }}>
                      {info.label}
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.15rem' }}>
                      {info.description}
                    </div>
                    {pref.isMandatoryInApp && (
                      <span
                        style={{
                          display: 'inline-block',
                          marginTop: '0.25rem',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          color: '#b45309',
                          background: '#fef3c7',
                          padding: '0.1rem 0.4rem',
                          borderRadius: '0.25rem',
                        }}
                      >
                        Mandatory In-App
                      </span>
                    )}
                  </div>

                  {/* In-App Toggle */}
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        cursor: pref.isMandatoryInApp ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        data-testid={`pref-inapp-${pref.category}`}
                        checked={pref.inAppEnabled}
                        disabled={pref.isMandatoryInApp}
                        onChange={() =>
                          void handleToggle(pref.category, 'inApp', pref.inAppEnabled)
                        }
                      />
                    </label>
                  </div>

                  {/* Email Toggle */}
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <label
                      style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        data-testid={`pref-email-${pref.category}`}
                        checked={pref.emailEnabled}
                        onChange={() =>
                          void handleToggle(pref.category, 'email', pref.emailEnabled)
                        }
                      />
                    </label>
                  </div>

                  {/* SMS Toggle */}
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <label
                      style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        data-testid={`pref-sms-${pref.category}`}
                        checked={pref.smsEnabled}
                        onChange={() => void handleToggle(pref.category, 'sms', pref.smsEnabled)}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div
          style={{
            marginTop: '1.5rem',
            padding: '1rem',
            borderRadius: '0.5rem',
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
          }}
        >
          <h4 style={{ margin: '0 0 0.25rem 0', color: '#1e40af', fontSize: '0.875rem' }}>
            Operational Safety Policy
          </h4>
          <p style={{ margin: 0, color: '#1e3a8a', fontSize: '0.8rem', lineHeight: 1.4 }}>
            In-app notifications for Critical Inspections and Incidents cannot be disabled by user
            preference to guarantee operational compliance and safety accountability across active
            fleet operators.
          </p>
        </div>
      </main>
    </div>
  );
}
