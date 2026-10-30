'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TenantHeader } from '../../../../components/tenant-header';
import { complianceApi, type ComplianceSubjectType } from '../../../../lib/api-client';

export default function NewDocumentTypePage() {
  const router = useRouter();

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [subjectType, setSubjectType] = useState<ComplianceSubjectType>('VEHICLE');
  const [required, setRequired] = useState(true);
  const [expires, setExpires] = useState(true);
  const [defaultValidityDays, setDefaultValidityDays] = useState('365');
  const [warningDaysBeforeExpiry, setWarningDaysBeforeExpiry] = useState('30');
  const [blocksOperation, setBlocksOperation] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBlocksOperationChange = (checked: boolean) => {
    setBlocksOperation(checked);
    if (checked) {
      setRequired(true);
    }
  };

  const handleRequiredChange = (checked: boolean) => {
    setRequired(checked);
    if (!checked) {
      setBlocksOperation(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (blocksOperation && !required) {
      setError('A document type that blocks operation must also be marked as required.');
      return;
    }

    try {
      setSubmitting(true);
      await complianceApi.createDocumentType({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim() || undefined,
        subjectType,
        required,
        expires,
        defaultValidityDays: defaultValidityDays ? parseInt(defaultValidityDays, 10) : undefined,
        warningDaysBeforeExpiry: parseInt(warningDaysBeforeExpiry, 10) || 30,
        blocksOperation,
      });

      router.push('/compliance/document-types');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create document type');
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1.5rem' }}>
      <TenantHeader />

      <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
        <Link
          href="/compliance/document-types"
          style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.875rem' }}
        >
          &larr; Back to Document Types Catalog
        </Link>
      </div>

      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '2rem',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
          Create Compliance Document Type
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          Define policy for required documents, validity durations, and operational dispatch
          blocking.
        </p>

        {error && (
          <div
            style={{
              padding: '1rem',
              marginBottom: '1.5rem',
              background: '#fee2e2',
              border: '1px solid #ef4444',
              borderRadius: '6px',
              color: '#991b1b',
              fontSize: '0.875rem',
            }}
            data-testid="error-message"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
              marginBottom: '1.25rem',
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  marginBottom: '0.25rem',
                }}
              >
                Code *
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. VEHICLE_FITNESS"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                }}
                data-testid="input-doc-type-code"
              />
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                Uppercase alphanumeric with underscores (immutable).
              </span>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  marginBottom: '0.25rem',
                }}
              >
                Subject Type *
              </label>
              <select
                value={subjectType}
                onChange={(e) => setSubjectType(e.target.value as ComplianceSubjectType)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                }}
                data-testid="select-subject-type"
              >
                <option value="VEHICLE">VEHICLE</option>
                <option value="DRIVER">DRIVER</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                marginBottom: '0.25rem',
              }}
            >
              Document Type Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Certificate of Vehicle Roadworthiness"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              data-testid="input-doc-type-name"
            />
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                marginBottom: '0.25rem',
              }}
            >
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe regulatory requirements, issuing authorities, or internal guidelines..."
              rows={3}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              data-testid="input-doc-type-description"
            />
          </div>

          <div
            style={{
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              padding: '1.25rem',
              marginBottom: '1.5rem',
            }}
          >
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem 0' }}>
              Compliance Policy Invariants
            </h3>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                marginBottom: '1.25rem',
              }}
            >
              <label
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={required}
                  onChange={(e) => handleRequiredChange(e.target.checked)}
                  data-testid="checkbox-required"
                />
                <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>Required Document</span>
                <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                  (Must be uploaded for every active subject)
                </span>
              </label>

              <label
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={blocksOperation}
                  onChange={(e) => handleBlocksOperationChange(e.target.checked)}
                  data-testid="checkbox-blocks-operation"
                />
                <span style={{ fontWeight: 500, fontSize: '0.875rem', color: '#dc2626' }}>
                  Blocks Trip Dispatch When Missing or Expired
                </span>
                <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                  (Operationally blocks Trip READY / START)
                </span>
              </label>

              <label
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={expires}
                  onChange={(e) => setExpires(e.target.checked)}
                  data-testid="checkbox-expires"
                />
                <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>Requires Expiry Date</span>
              </label>
            </div>

            {expires && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      marginBottom: '0.25rem',
                    }}
                  >
                    Warning Days Before Expiry *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    required
                    value={warningDaysBeforeExpiry}
                    onChange={(e) => setWarningDaysBeforeExpiry(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.4rem 0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                    }}
                    data-testid="input-warning-days"
                  />
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Days before expiry when status turns to WARNING.
                  </span>
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
                    Default Validity (Days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={defaultValidityDays}
                    onChange={(e) => setDefaultValidityDays(e.target.value)}
                    placeholder="e.g. 365"
                    style={{
                      width: '100%',
                      padding: '0.4rem 0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                    }}
                    data-testid="input-validity-days"
                  />
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Link
              href="/compliance/document-types"
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                background: '#fff',
                textDecoration: 'none',
                color: '#374151',
                fontWeight: 500,
              }}
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '0.5rem 1.25rem',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              data-testid="btn-submit-doc-type"
            >
              {submitting ? 'Creating...' : 'Create Document Type'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
