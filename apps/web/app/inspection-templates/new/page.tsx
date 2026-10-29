'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import { api, type InspectionItemSeverity, type InspectionType } from '../../../lib/api-client';

interface TemplateItemDraft {
  category: string;
  prompt: string;
  description: string;
  required: boolean;
  severity: InspectionItemSeverity;
}

export default function NewInspectionTemplatePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<InspectionType>('PRE_TRIP');
  const [items, setItems] = useState<TemplateItemDraft[]>([
    {
      category: 'Safety',
      prompt: 'Check braking system and warning lights',
      description: '',
      required: true,
      severity: 'CRITICAL',
    },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        category: 'General',
        prompt: '',
        description: '',
        required: true,
        severity: 'NORMAL',
      },
    ]);
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, patch: Partial<TemplateItemDraft>) => {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Template name is required');
      return;
    }
    if (items.length === 0) {
      setError('At least one checklist item is required');
      return;
    }
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item || !item.category.trim() || !item.prompt.trim()) {
        setError(`Item #${i + 1} category and prompt are required`);
        return;
      }
    }

    try {
      setSubmitting(true);
      setError(null);
      const res = await api.createInspectionTemplate({
        name: name.trim(),
        description: description.trim() || undefined,
        type,
        items: items.map((item, index) => ({
          category: item.category.trim(),
          prompt: item.prompt.trim(),
          description: item.description.trim() || undefined,
          required: item.required,
          severity: item.severity,
          sortOrder: index + 1,
        })),
      });
      router.push(`/inspection-templates/${res.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create template');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="vehicle-page">
      <TenantHeader />

      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <Link
            href="/inspection-templates"
            style={{ color: '#1a56db', textDecoration: 'none', fontSize: '0.875rem' }}
          >
            ← Back to Templates
          </Link>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 600, marginTop: '0.5rem' }}>
            New Inspection Template
          </h1>
          <p style={{ color: '#64748b', marginTop: '0.25rem' }}>
            Templates define structured checklist requirements for vehicle operations.
          </p>
        </div>

        {error && (
          <div
            className="error-banner"
            data-testid="error-banner"
            style={{
              background: '#fef2f2',
              border: '1px solid #f87171',
              color: '#991b1b',
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              marginBottom: '1rem',
            }}
          >
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
        >
          <div
            style={{
              background: '#fff',
              padding: '1.5rem',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Template Details</h2>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '0.25rem',
                }}
              >
                Template Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Daily Pre-Trip Safety Checklist"
                data-testid="template-name-input"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '4px',
                  border: '1px solid #cbd5e1',
                }}
                required
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '0.25rem',
                }}
              >
                Inspection Type *
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as InspectionType)}
                data-testid="template-type-select"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '4px',
                  border: '1px solid #cbd5e1',
                }}
              >
                <option value="PRE_TRIP">Pre-Trip (Required before Trip Start)</option>
                <option value="POST_TRIP">Post-Trip (Required before Trip Complete)</option>
                <option value="PERIODIC">Periodic (Scheduled / Maintenance)</option>
                <option value="SAFETY">Safety (Audit / Routine)</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '0.25rem',
                }}
              >
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description of when and how this template is used..."
                data-testid="template-description-input"
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '4px',
                  border: '1px solid #cbd5e1',
                }}
              />
            </div>
          </div>

          <div
            style={{
              background: '#fff',
              padding: '1.5rem',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>
                Checklist Items ({items.length})
              </h2>
              <button
                type="button"
                onClick={addItem}
                data-testid="add-item-button"
                style={{
                  padding: '0.375rem 0.75rem',
                  borderRadius: '4px',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                + Add Item
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {items.map((item, idx) => (
                <div
                  key={idx}
                  data-testid={`template-item-row-${idx}`}
                  style={{
                    padding: '1rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    background: '#f8fafc',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Item #{idx + 1}</span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        data-testid={`remove-item-${idx}`}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#dc2626',
                          cursor: 'pointer',
                          fontSize: '0.8125rem',
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          marginBottom: '0.2rem',
                        }}
                      >
                        Category *
                      </label>
                      <input
                        type="text"
                        value={item.category}
                        onChange={(e) => updateItem(idx, { category: e.target.value })}
                        placeholder="e.g. Brakes, Tires"
                        data-testid={`item-category-${idx}`}
                        style={{
                          width: '100%',
                          padding: '0.4rem',
                          borderRadius: '4px',
                          border: '1px solid #cbd5e1',
                        }}
                        required
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          marginBottom: '0.2rem',
                        }}
                      >
                        Checklist Prompt *
                      </label>
                      <input
                        type="text"
                        value={item.prompt}
                        onChange={(e) => updateItem(idx, { prompt: e.target.value })}
                        placeholder="e.g. Check for fluid leaks or brake pad wear"
                        data-testid={`item-prompt-${idx}`}
                        style={{
                          width: '100%',
                          padding: '0.4rem',
                          borderRadius: '4px',
                          border: '1px solid #cbd5e1',
                        }}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                    <div>
                      <label
                        style={{ fontSize: '0.75rem', fontWeight: 500, marginRight: '0.5rem' }}
                      >
                        Severity:
                      </label>
                      <select
                        value={item.severity}
                        onChange={(e) =>
                          updateItem(idx, { severity: e.target.value as InspectionItemSeverity })
                        }
                        data-testid={`item-severity-${idx}`}
                        style={{
                          padding: '0.3rem',
                          borderRadius: '4px',
                          border: '1px solid #cbd5e1',
                        }}
                      >
                        <option value="NORMAL">NORMAL (Defect does not fail pre-trip)</option>
                        <option value="CRITICAL">CRITICAL (Failure causes immediate fail)</option>
                      </select>
                    </div>

                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        fontSize: '0.8125rem',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={item.required}
                        onChange={(e) => updateItem(idx, { required: e.target.checked })}
                        data-testid={`item-required-${idx}`}
                      />
                      Response Required
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <Link
              href="/inspection-templates"
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
                textDecoration: 'none',
                color: '#334155',
              }}
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              data-testid="submit-template-button"
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: '4px',
                background: '#1a56db',
                color: '#fff',
                border: 'none',
                fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Creating...' : 'Create Inspection Template'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
