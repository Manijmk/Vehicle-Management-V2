'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import { apiClient, type NotificationTemplateItem } from '../../../lib/api-client';

export default function NotificationTemplatesPage() {
  const [templates, setTemplates] = useState<NotificationTemplateItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplateItem | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editBody, setEditBody] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editEnabled, setEditEnabled] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setFeedback(null);
      const res = await apiClient.fetchNotificationTemplates();
      setTemplates(res.items);
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Failed to load templates (requires admin permissions)',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const startEdit = (t: NotificationTemplateItem) => {
    setEditingTemplate(t);
    setEditTitle(t.titleTemplate);
    setEditBody(t.bodyTemplate);
    setEditDescription(t.description ?? '');
    setEditEnabled(t.enabled);
  };

  const cancelEdit = () => {
    setEditingTemplate(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate) return;

    if (editTitle.trim().length === 0) {
      alert('Title template cannot be empty');
      return;
    }
    if (editBody.trim().length === 0) {
      alert('Body template cannot be empty');
      return;
    }

    try {
      setSaving(true);
      setFeedback(null);
      const updated = await apiClient.updateNotificationTemplate(editingTemplate.key, {
        titleTemplate: editTitle.trim(),
        bodyTemplate: editBody.trim(),
        description: editDescription.trim() || undefined,
        enabled: editEnabled,
      });

      setTemplates((prev) =>
        prev.map((t) => (t.key === editingTemplate.key ? { ...t, ...updated } : t)),
      );
      setEditingTemplate(null);
      setFeedback({
        type: 'success',
        message: `Template '${editingTemplate.key}' updated successfully.`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update template',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <TenantHeader onAuthChange={loadTemplates} />

      <main style={{ maxWidth: '1000px', margin: '2rem auto', padding: '0 1rem' }}>
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
              Notification Templates
            </h1>
            <p style={{ color: '#64748b', margin: 0 }}>
              Customize operational notification titles, bodies, and placeholder mappings.
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
            data-testid="template-feedback"
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

        {/* Edit Modal / Form */}
        {editingTemplate && (
          <div
            data-testid="edit-template-modal"
            style={{
              marginBottom: '1.5rem',
              backgroundColor: '#ffffff',
              padding: '1.5rem',
              borderRadius: '0.5rem',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
              border: '2px solid var(--accent, #1a56db)',
            }}
          >
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                margin: '0 0 1rem 0',
                color: '#0f172a',
              }}
            >
              Edit Template: {editingTemplate.key}
            </h2>

            <form onSubmit={handleSave}>
              <div style={{ marginBottom: '1rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    color: '#334155',
                    marginBottom: '0.35rem',
                  }}
                >
                  Title Template
                </label>
                <input
                  type="text"
                  data-testid="title-template-input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.875rem',
                  }}
                  required
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    color: '#334155',
                    marginBottom: '0.35rem',
                  }}
                >
                  Body Template
                </label>
                <textarea
                  rows={3}
                  data-testid="body-template-input"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.875rem',
                    fontFamily: 'inherit',
                  }}
                  required
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    color: '#334155',
                    marginBottom: '0.35rem',
                  }}
                >
                  Description
                </label>
                <input
                  type="text"
                  data-testid="description-template-input"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    color: '#334155',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    data-testid="template-enabled-toggle"
                    checked={editEnabled}
                    onChange={(e) => setEditEnabled(e.target.checked)}
                  />
                  Template Enabled
                </label>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={cancelEdit}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="save-template-btn"
                  disabled={saving}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    border: 'none',
                    background: 'var(--accent, #1a56db)',
                    color: 'white',
                    fontWeight: 600,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  {saving ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
            Loading templates...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {templates.map((t) => (
              <div
                key={t.key}
                data-testid={`template-item-${t.key}`}
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '0.5rem',
                  padding: '1.25rem',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '1rem' }}>
                      {t.key}
                    </span>
                    <span
                      style={{
                        padding: '0.15rem 0.45rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor: '#e2e8f0',
                        color: '#334155',
                      }}
                    >
                      {t.category}
                    </span>
                    <span
                      style={{
                        padding: '0.15rem 0.45rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor: t.enabled ? '#dcfce7' : '#fee2e2',
                        color: t.enabled ? '#15803d' : '#991b1b',
                      }}
                    >
                      {t.enabled ? 'ACTIVE' : 'DISABLED'}
                    </span>
                  </div>

                  <button
                    type="button"
                    data-testid={`edit-template-btn-${t.key}`}
                    onClick={() => startEdit(t)}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      padding: '0.35rem 0.75rem',
                      borderRadius: '0.375rem',
                      fontSize: '0.8rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                      color: '#334155',
                    }}
                  >
                    Edit Template
                  </button>
                </div>

                {t.description && (
                  <p style={{ margin: '0 0 0.5rem 0', color: '#64748b', fontSize: '0.85rem' }}>
                    {t.description}
                  </p>
                )}

                <div
                  style={{
                    backgroundColor: '#f8fafc',
                    padding: '0.75rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #f1f5f9',
                    marginBottom: '0.5rem',
                  }}
                >
                  <div style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '0.25rem' }}>
                    <strong>Title:</strong> {t.titleTemplate}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                    <strong>Body:</strong> {t.bodyTemplate}
                  </div>
                </div>

                {t.placeholders && t.placeholders.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                      Variables:
                    </span>
                    {t.placeholders.map((p) => (
                      <code
                        key={p}
                        style={{
                          fontSize: '0.75rem',
                          backgroundColor: '#e0e7ff',
                          color: '#3730a3',
                          padding: '0.1rem 0.35rem',
                          borderRadius: '0.25rem',
                        }}
                      >
                        {`{{${p}}}`}
                      </code>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
