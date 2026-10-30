import { InvalidCurrencyCodeError } from './finance-errors.js';

export function assertValidCurrencyCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new InvalidCurrencyCodeError(code);
  }
  return normalized;
}

export function roundTo2Decimals(value: number): number {
  return Number(Math.round(Number(`${value}e+2`)) + 'e-2');
}

export function roundTo3Decimals(value: number): number {
  return Number(Math.round(Number(`${value}e+3`)) + 'e-3');
}

export function roundTo4Decimals(value: number): number {
  return Number(Math.round(Number(`${value}e+4`)) + 'e-4');
}

export function calculateFuelTotalAmount(quantity: number, unitPrice: number): number {
  const qInt = Math.round(quantity * 1000);
  const pInt = Math.round(unitPrice * 10000);
  const cents = Math.round((qInt * pInt) / 100000);
  return cents / 100;
}

export function isAmountWithinTolerance(
  expected: number,
  actual: number,
  tolerance = 0.05,
): boolean {
  return Math.abs(expected - actual) <= tolerance;
}
