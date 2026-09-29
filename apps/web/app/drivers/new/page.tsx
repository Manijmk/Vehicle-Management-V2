'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import { ApiClientError, driverApi } from '../../../lib/api-client';

export default function NewDriverPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    displayId: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    employeeNumber: '',
    notes: '',
  });

  const validateClient = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.firstName.trim()) {
      errors.firstName = 'First name is required';
    } else if (formData.firstName.trim().length > 100) {
      errors.firstName = 'First name cannot exceed 100 characters';
    }

    if (!formData.lastName.trim()) {
      errors.lastName = 'Last name is required';
    } else if (formData.lastName.trim().length > 100) {
      errors.lastName = 'Last name cannot exceed 100 characters';
    }

    if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(formData.email.trim())) {
      errors.email = 'Please provide a valid email address';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!validateClient()) {
      return;
    }

    try {
      setSubmitting(true);
      const newDriver = await driverApi.createDriver({
        ...(formData.displayId.trim() ? { displayId: formData.displayId.trim() } : {}),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        ...(formData.email.trim() ? { email: formData.email.trim() } : {}),
        ...(formData.phone.trim() ? { phone: formData.phone.trim() } : {}),
        ...(formData.employeeNumber.trim()
          ? { employeeNumber: formData.employeeNumber.trim() }
          : {}),
        ...(formData.notes.trim() ? { notes: formData.notes.trim() } : {}),
      });

      router.push(`/drivers/${newDriver.id}`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'DRIVER_ALREADY_EXISTS') {
          setErrorMessage('A driver with this display ID already exists in this organization.');
        } else if (err.code === 'DRIVER_EMPLOYEE_NUMBER_EXISTS') {
          setErrorMessage(
            'A driver with this employee number already exists in this organization.',
          );
        } else if (err.code === 'PERMISSION_DENIED') {
          setErrorMessage('You do not have permission to create drivers (driver.create required).');
        } else {
          setErrorMessage(err.message);
        }
      } else {
        setErrorMessage('An unexpected error occurred while creating the driver.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="driver-page">
      <TenantHeader />

      <div className="page-header">
        <div>
          <p className="eyebrow">Fleet operations</p>
          <h1>Create driver</h1>
        </div>
        <Link href="/drivers" className="secondary-action">
          Back to drivers
        </Link>
      </div>

      <section className="panel">
        <form onSubmit={handleSubmit} className="driver-form" data-testid="create-driver-form">
          {errorMessage ? (
            <div className="error-banner" role="alert" data-testid="form-error-banner">
              {errorMessage}
            </div>
          ) : null}

          <label>
            Display ID (optional)
            <input
              type="text"
              value={formData.displayId}
              onChange={(e) => setFormData({ ...formData, displayId: e.target.value })}
              placeholder="e.g. DRV-1001 (auto-allocated if blank)"
              data-testid="display-id-input"
            />
            {fieldErrors.displayId ? (
              <span className="field-error">{fieldErrors.displayId}</span>
            ) : null}
          </label>

          <label>
            Employee Number (optional)
            <input
              type="text"
              value={formData.employeeNumber}
              onChange={(e) => setFormData({ ...formData, employeeNumber: e.target.value })}
              placeholder="e.g. EMP-4401"
              data-testid="employee-number-input"
            />
            {fieldErrors.employeeNumber ? (
              <span className="field-error">{fieldErrors.employeeNumber}</span>
            ) : null}
          </label>

          <label>
            First Name *
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              placeholder="e.g. John"
              data-testid="first-name-input"
              required
            />
            {fieldErrors.firstName ? (
              <span className="field-error">{fieldErrors.firstName}</span>
            ) : null}
          </label>

          <label>
            Last Name *
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              placeholder="e.g. Doe"
              data-testid="last-name-input"
              required
            />
            {fieldErrors.lastName ? (
              <span className="field-error">{fieldErrors.lastName}</span>
            ) : null}
          </label>

          <label>
            Email address
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="e.g. john.doe@example.test"
              data-testid="email-input"
            />
            {fieldErrors.email ? <span className="field-error">{fieldErrors.email}</span> : null}
          </label>

          <label>
            Phone number
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="e.g. +1-555-0199"
              data-testid="phone-input"
            />
            {fieldErrors.phone ? <span className="field-error">{fieldErrors.phone}</span> : null}
          </label>

          <label>
            Notes
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              placeholder="Internal operational notes"
              data-testid="notes-input"
            />
          </label>

          <div className="form-actions">
            <button
              type="submit"
              className="primary-action"
              disabled={submitting}
              data-testid="submit-driver-button"
            >
              {submitting ? 'Creating driver...' : 'Create driver'}
            </button>
            <Link href="/drivers" className="secondary-action">
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
