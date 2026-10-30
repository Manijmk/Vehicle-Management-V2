'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../components/tenant-header';
import { financeApi, type ExpenseCategoryRecord } from '../../lib/api-client';

export default function ExpenseCategoriesPage() {
  const [categories, setCategories] = useState<ExpenseCategoryRecord[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New category form state
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await financeApi.fetchExpenseCategories(includeArchived);
      setCategories(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load expense categories');
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setError('Code and name are required');
      return;
    }
    try {
      setCreating(true);
      setError(null);
      setCreateSuccess(null);
      const created = await financeApi.createExpenseCategory({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setCreateSuccess(`Category '${created.name}' (${created.code}) created successfully!`);
      setCode('');
      setName('');
      setDescription('');
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create expense category');
    } finally {
      setCreating(false);
    }
  };

  const handleArchive = async (categoryId: string, catName: string) => {
    if (!window.confirm(`Are you sure you want to archive category '${catName}'?`)) return;
    try {
      setError(null);
      await financeApi.archiveExpenseCategory(categoryId);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to archive category');
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '1.5rem' }}>
      <TenantHeader onAuthChange={loadData} />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '1.5rem',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h1
            style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0 }}
            data-testid="categories-title"
          >
            Expense Categories Catalog
          </h1>
          <p style={{ color: '#4b5563', margin: '0.25rem 0 0 0' }}>
            Configure and manage categorization for fleet costs, tolls, parking, and maintenance
            expenses.
          </p>
        </div>
        <Link
          href="/expenses"
          style={{
            padding: '0.5rem 1rem',
            background: '#fff',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: 500,
            color: '#374151',
          }}
        >
          &larr; Back to Expenses
        </Link>
      </div>

      {error && (
        <div
          style={{
            padding: '1rem',
            background: '#fee2e2',
            border: '1px solid #ef4444',
            borderRadius: '6px',
            color: '#991b1b',
            marginBottom: '1rem',
          }}
          data-testid="categories-error"
        >
          {error}
        </div>
      )}

      {createSuccess && (
        <div
          style={{
            padding: '1rem',
            background: '#dcfce7',
            border: '1px solid #86efac',
            borderRadius: '6px',
            color: '#166534',
            marginBottom: '1rem',
          }}
        >
          {createSuccess}
        </div>
      )}

      {/* Create New Category Card */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1.5rem',
          marginBottom: '1.5rem',
        }}
      >
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.125rem', fontWeight: 600 }}>
          Add New Expense Category
        </h3>
        <form
          onSubmit={handleCreate}
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          data-testid="create-category-form"
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
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
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. FERRY_TOLL"
                required
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  textTransform: 'uppercase',
                }}
                data-testid="input-category-code"
              />
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
                Category Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ferry Crossings"
                required
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                }}
                data-testid="input-category-name"
              />
            </div>
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
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Coastal and river ferry transport fees"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              data-testid="input-category-description"
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={creating || !code.trim() || !name.trim()}
              style={{
                padding: '0.5rem 1.25rem',
                background: creating ? '#93c5fd' : '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: creating || !code.trim() || !name.trim() ? 'not-allowed' : 'pointer',
              }}
              data-testid="btn-create-category"
            >
              {creating ? 'Saving...' : 'Create Category'}
            </button>
          </div>
        </form>
      </div>

      {/* Filter Options */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            data-testid="toggle-archived"
          />
          Include Archived Categories
        </label>
      </div>

      {/* Categories Table */}
      {loading ? (
        <div
          style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}
          data-testid="categories-loading"
        >
          Loading categories...
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '0.875rem',
            }}
            data-testid="categories-table"
          >
            <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th style={{ padding: '0.75rem 1rem' }}>Code</th>
                <th style={{ padding: '0.75rem 1rem' }}>Name</th>
                <th style={{ padding: '0.75rem 1rem' }}>Description</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr
                  key={c.id}
                  style={{ borderBottom: '1px solid #f3f4f6' }}
                  data-testid={`category-row-${c.code}`}
                >
                  <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 600 }}>
                    {c.code}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>{c.name}</td>
                  <td style={{ padding: '0.75rem 1rem', color: '#4b5563' }}>
                    {c.description || '-'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background: c.status === 'ACTIVE' ? '#dcfce7' : '#f3f4f6',
                        color: c.status === 'ACTIVE' ? '#166534' : '#6b7280',
                      }}
                      data-testid={`cat-status-${c.code}`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {c.status === 'ACTIVE' && (
                      <button
                        type="button"
                        onClick={() => handleArchive(c.id, c.name)}
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: '#fee2e2',
                          color: '#991b1b',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                        data-testid={`btn-archive-${c.code}`}
                      >
                        Archive
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
