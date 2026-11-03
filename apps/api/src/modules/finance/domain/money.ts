import {
  assertValidCurrencyCode,
  getCurrencyFractionDigits,
  isSupportedCurrency,
  ISO_4217_CURRENCIES,
} from './currency-registry.js';
import { ExactDecimal, type ExactDecimalInput } from './exact-decimal.js';

export {
  assertValidCurrencyCode,
  getCurrencyFractionDigits,
  isSupportedCurrency,
  ISO_4217_CURRENCIES,
  ExactDecimal,
  type ExactDecimalInput,
};

/**
 * Calculates authoritative fuel transaction total amount using exact decimal arithmetic.
 *
 * Formula: totalAmount = round(quantity × unitPrice, currencyDecimals)
 *
 * Exact BigInt-backed decimal multiplication is used; zero IEEE-754 floating-point
 * arithmetic or binary floating tolerance is permitted.
 */
export function calculateFuelTotalAmount(
  quantity: ExactDecimalInput,
  unitPrice: ExactDecimalInput,
  currencyCode = 'USD',
): ExactDecimal {
  const decimals = getCurrencyFractionDigits(currencyCode);
  const q = ExactDecimal.from(quantity);
  const p = ExactDecimal.from(unitPrice);
  const total = q.mul(p);
  return total.round(decimals);
}

/**
 * Rounds monetary amounts to the exact minor unit (fraction digits) defined
 * by the authoritative ISO 4217 registry for the specified currency code.
 */
export function roundMoneyToCurrency(
  amount: ExactDecimalInput,
  currencyCode: string,
): ExactDecimal {
  const decimals = getCurrencyFractionDigits(currencyCode);
  return ExactDecimal.from(amount).round(decimals);
}

/**
 * Utility rounding functions for non-monetary quantities and rates using exact decimal arithmetic.
 */
export function roundTo2Decimals(value: ExactDecimalInput): ExactDecimal {
  return ExactDecimal.from(value).round(2);
}

export function roundTo3Decimals(value: ExactDecimalInput): ExactDecimal {
  return ExactDecimal.from(value).round(3);
}

export function roundTo4Decimals(value: ExactDecimalInput): ExactDecimal {
  return ExactDecimal.from(value).round(4);
}
