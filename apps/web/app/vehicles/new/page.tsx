'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import {
  ApiClientError,
  vehicleApi,
  type FuelType,
  type VehicleType,
} from '../../../lib/api-client';

export default function NewVehiclePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    displayId: '',
    registration: '',
    vin: '',
    model: '',
    type: 'VAN' as VehicleType,
    fuelType: 'DIESEL' as FuelType,
    year: new Date().getFullYear(),
    odometerKm: 0,
    notes: '',
  });

  const validateClient = (): boolean => {
    const errors: Record<string, string> = {};
    const trimmedDisplay = formData.displayId.trim();
    if (!trimmedDisplay) {
      errors.displayId = 'Display ID is required';
    } else if (trimmedDisplay.length > 40) {
      errors.displayId = 'Display ID cannot exceed 40 characters';
    }

    const trimmedReg = formData.registration.trim().toUpperCase();
    if (!trimmedReg) {
      errors.registration = 'Registration is required';
    } else if (!/^[A-Z]{2,3}[-\s]?[0-9A-Z]{2,8}$/u.test(trimmedReg)) {
      errors.registration = 'Registration must be in a valid plate format (e.g., AB-123CD)';
    }

    const trimmedVin = formData.vin.trim().toUpperCase();
    if (!trimmedVin) {
      errors.vin = 'VIN is required';
    } else if (!/^[A-HJ-NPR-Z0-9]{17}$/u.test(trimmedVin)) {
      errors.vin = 'VIN must be 17 characters (excluding I, O, Q)';
    }

    if (!formData.model.trim()) {
      errors.model = 'Model is required';
    }

    if (formData.year < 1900 || formData.year > 2100) {
      errors.year = 'Year must be between 1900 and 2100';
    }

    if (formData.odometerKm < 0 || !Number.isInteger(formData.odometerKm)) {
      errors.odometerKm = 'Odometer must be a non-negative integer';
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
      const newVehicle = await vehicleApi.createVehicle({
        displayId: formData.displayId.trim(),
        registration: formData.registration.trim().toUpperCase(),
        vin: formData.vin.trim().toUpperCase(),
        model: formData.model.trim(),
        type: formData.type,
        fuelType: formData.fuelType,
        year: Number(formData.year),
        odometerKm: Number(formData.odometerKm),
        notes: formData.notes.trim() || undefined,
      });

      router.push(`/vehicles/${newVehicle.id}`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'VEHICLE_ALREADY_EXISTS') {
          setErrorMessage('A vehicle with this display ID, registration, or VIN already exists.');
        } else if (err.code === 'PERMISSION_DENIED') {
          setErrorMessage(
            'You do not have permission to create vehicles (vehicle.create required).',
          );
        } else {
          setErrorMessage(err.message);
        }
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to save vehicle');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="vehicle-page narrow">
      <TenantHeader />

      <div className="page-header compact">
        <div>
          <p className="eyebrow">Fleet operations</p>
          <h1>New vehicle</h1>
        </div>
        <Link href="/vehicles" className="secondary-action">
          Back to vehicles
        </Link>
      </div>

      <section className="panel">
        <form
          className="vehicle-form"
          onSubmit={handleSubmit}
          data-testid="new-vehicle-form"
          noValidate
        >
          {errorMessage ? (
            <div className="error-banner" role="alert" data-testid="form-error-banner">
              <p>{errorMessage}</p>
            </div>
          ) : null}

          <label>
            Display ID
            <input
              name="displayId"
              value={formData.displayId}
              onChange={(e) => setFormData({ ...formData, displayId: e.target.value })}
              placeholder="e.g. V-1009"
              required
              data-testid="input-display-id"
            />
            {fieldErrors.displayId ? (
              <span className="field-error" data-testid="error-display-id">
                {fieldErrors.displayId}
              </span>
            ) : null}
          </label>

          <label>
            Registration
            <input
              name="registration"
              value={formData.registration}
              onChange={(e) => setFormData({ ...formData, registration: e.target.value })}
              placeholder="e.g. AB-123CD"
              required
              data-testid="input-registration"
            />
            {fieldErrors.registration ? (
              <span className="field-error" data-testid="error-registration">
                {fieldErrors.registration}
              </span>
            ) : null}
          </label>

          <label>
            VIN
            <input
              name="vin"
              value={formData.vin}
              onChange={(e) => setFormData({ ...formData, vin: e.target.value })}
              placeholder="17-character VIN"
              maxLength={17}
              required
              data-testid="input-vin"
            />
            {fieldErrors.vin ? (
              <span className="field-error" data-testid="error-vin">
                {fieldErrors.vin}
              </span>
            ) : null}
          </label>

          <label>
            Model
            <input
              name="model"
              value={formData.model}
              onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              placeholder="e.g. Transit Custom"
              required
              data-testid="input-model"
            />
            {fieldErrors.model ? (
              <span className="field-error" data-testid="error-model">
                {fieldErrors.model}
              </span>
            ) : null}
          </label>

          <label>
            Type
            <select
              name="type"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as VehicleType })}
              data-testid="select-type"
            >
              <option value="CAR">Car</option>
              <option value="VAN">Van</option>
              <option value="TRUCK">Truck</option>
              <option value="BUS">Bus</option>
              <option value="MOTORCYCLE">Motorcycle</option>
              <option value="OTHER">Other</option>
            </select>
          </label>

          <label>
            Fuel type
            <select
              name="fuelType"
              value={formData.fuelType}
              onChange={(e) => setFormData({ ...formData, fuelType: e.target.value as FuelType })}
              data-testid="select-fuel-type"
            >
              <option value="PETROL">Petrol</option>
              <option value="DIESEL">Diesel</option>
              <option value="HYBRID">Hybrid</option>
              <option value="ELECTRIC">Electric</option>
              <option value="GAS">Gas</option>
              <option value="OTHER">Other</option>
            </select>
          </label>

          <label>
            Year
            <input
              name="year"
              type="number"
              value={formData.year}
              onChange={(e) => setFormData({ ...formData, year: Number(e.target.value) })}
              min={1900}
              max={2100}
              required
              data-testid="input-year"
            />
            {fieldErrors.year ? (
              <span className="field-error" data-testid="error-year">
                {fieldErrors.year}
              </span>
            ) : null}
          </label>

          <label>
            Odometer (km)
            <input
              name="odometerKm"
              type="number"
              value={formData.odometerKm}
              onChange={(e) => setFormData({ ...formData, odometerKm: Number(e.target.value) })}
              min={0}
              required
              data-testid="input-odometer"
            />
            {fieldErrors.odometerKm ? (
              <span className="field-error" data-testid="error-odometer">
                {fieldErrors.odometerKm}
              </span>
            ) : null}
          </label>

          <label>
            Notes
            <textarea
              name="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Optional notes or fleet operational allocation details"
              data-testid="input-notes"
            />
          </label>

          <div className="form-actions">
            <button
              type="submit"
              className="primary-action"
              disabled={submitting}
              data-testid="submit-vehicle-btn"
            >
              {submitting ? 'Saving vehicle...' : 'Save vehicle'}
            </button>
            <Link href="/vehicles" className="secondary-action">
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
