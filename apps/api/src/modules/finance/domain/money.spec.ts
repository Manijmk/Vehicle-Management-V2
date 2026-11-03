import { describe, expect, it } from 'vitest';

import {
  assertValidCurrencyCode,
  calculateFuelTotalAmount,
  getCurrencyFractionDigits,
  isSupportedCurrency,
  roundMoneyToCurrency,
  ExactDecimal,
} from './money.js';
import { InvalidCurrencyCodeError } from './finance-errors.js';

describe('Exact Money & Supported Currency Registry', () => {
  describe('ISO 4217 Currency Registry', () => {
    it('accepts valid supported currencies with exact minor unit fraction digits', () => {
      // USD -> 2 decimals
      expect(assertValidCurrencyCode('USD')).toBe('USD');
      expect(getCurrencyFractionDigits('USD')).toBe(2);

      // JPY -> 0 decimals
      expect(assertValidCurrencyCode('JPY')).toBe('JPY');
      expect(getCurrencyFractionDigits('JPY')).toBe(0);

      // KWD -> 3 decimals
      expect(assertValidCurrencyCode('KWD')).toBe('KWD');
      expect(getCurrencyFractionDigits('KWD')).toBe(3);

      // EUR -> 2 decimals
      expect(assertValidCurrencyCode('EUR')).toBe('EUR');
      expect(getCurrencyFractionDigits('EUR')).toBe(2);

      // BHD -> 3 decimals
      expect(assertValidCurrencyCode('BHD')).toBe('BHD');
      expect(getCurrencyFractionDigits('BHD')).toBe(3);

      // KRW -> 0 decimals
      expect(assertValidCurrencyCode('KRW')).toBe('KRW');
      expect(getCurrencyFractionDigits('KRW')).toBe(0);
    });

    it('normalizes lowercase currency codes correctly', () => {
      expect(assertValidCurrencyCode('usd')).toBe('USD');
      expect(assertValidCurrencyCode('  jpy  ')).toBe('JPY');
      expect(assertValidCurrencyCode('kwd')).toBe('KWD');
    });

    it('rejects fictitious or unknown 3-letter currency codes without defaulting to 2 decimals', () => {
      expect(isSupportedCurrency('ZZZ')).toBe(false);
      expect(() => assertValidCurrencyCode('ZZZ')).toThrow(InvalidCurrencyCodeError);
      expect(() => getCurrencyFractionDigits('ZZZ')).toThrow(InvalidCurrencyCodeError);

      expect(isSupportedCurrency('ABC')).toBe(false);
      expect(() => assertValidCurrencyCode('ABC')).toThrow(InvalidCurrencyCodeError);
      expect(() => getCurrencyFractionDigits('ABC')).toThrow(InvalidCurrencyCodeError);

      expect(isSupportedCurrency('FOO')).toBe(false);
      expect(() => assertValidCurrencyCode('FOO')).toThrow(InvalidCurrencyCodeError);

      expect(isSupportedCurrency('123')).toBe(false);
      expect(() => assertValidCurrencyCode('123')).toThrow(InvalidCurrencyCodeError);
    });
  });

  describe('Exact Decimal Arithmetic (Eliminating IEEE-754 Drift)', () => {
    it('computes 0.1 × 0.2 exactly as 0.02 without binary floating-point drift', () => {
      const a = ExactDecimal.from('0.1');
      const b = ExactDecimal.from('0.2');
      const product = a.mul(b);
      expect(product.toFixed(2)).toBe('0.02');
      expect(product.toNumber()).toBe(0.02);
      expect(product.equals('0.02')).toBe(true);
    });

    it('computes 45.5 × 1.45 with exact half-up rounding across currencies', () => {
      // 45.5 * 1.45 = 65.975 exact
      // In USD (2 decimals) -> 65.98
      const usdTotal = calculateFuelTotalAmount('45.5', '1.45', 'USD');
      expect(usdTotal.toFixed(2)).toBe('65.98');
      expect(usdTotal.toNumber()).toBe(65.98);

      // In JPY (0 decimals) -> 66
      const jpyTotal = calculateFuelTotalAmount('45.5', '1.45', 'JPY');
      expect(jpyTotal.toFixed(0)).toBe('66');
      expect(jpyTotal.toNumber()).toBe(66);

      // In KWD (3 decimals) -> 65.975
      const kwdTotal = calculateFuelTotalAmount('45.5', '1.45', 'KWD');
      expect(kwdTotal.toFixed(3)).toBe('65.975');
      expect(kwdTotal.toNumber()).toBe(65.975);
    });

    it('preserves fuel quantity precision independently from currency precision', () => {
      // Quantity: 45.527 L (3 decimals) at unit price 1.450 / L in USD (2 decimals)
      // 45.527 * 1.450 = 66.01415 -> rounded to USD = 66.01
      const totalUsd = calculateFuelTotalAmount('45.527', '1.450', 'USD');
      expect(totalUsd.toFixed(2)).toBe('66.01');
      expect(totalUsd.toNumber()).toBe(66.01);

      // In KWD (3 decimals) -> 66.014
      const totalKwd = calculateFuelTotalAmount('45.527', '1.450', 'KWD');
      expect(totalKwd.toFixed(3)).toBe('66.014');
      expect(totalKwd.toNumber()).toBe(66.014);

      // In JPY (0 decimals) -> 66
      const totalJpy = calculateFuelTotalAmount('45.527', '1.450', 'JPY');
      expect(totalJpy.toFixed(0)).toBe('66');
      expect(totalJpy.toNumber()).toBe(66);
    });

    it('handles large monetary amounts near supported bounds without precision degradation', () => {
      // 999,999,999.99 in USD
      const largeAmount = roundMoneyToCurrency('999999999.99', 'USD');
      expect(largeAmount.toFixed(2)).toBe('999999999.99');
      expect(largeAmount.toNumber()).toBe(999999999.99);

      // Large fuel volume: 100,000 L at 1.250 / L = 125,000.00
      const fleetFuel = calculateFuelTotalAmount('100000', '1.250', 'USD');
      expect(fleetFuel.toFixed(2)).toBe('125000.00');
      expect(fleetFuel.toNumber()).toBe(125000.0);
    });

    it('performs exact addition and subtraction across exact decimals', () => {
      const a = ExactDecimal.from('10.25');
      const b = ExactDecimal.from('20.75');
      expect(a.add(b).toFixed(2)).toBe('31.00');
      expect(b.sub(a).toFixed(2)).toBe('10.50');
    });

    it('performs exact division with specified decimal precision', () => {
      const total = ExactDecimal.from('100');
      const count = ExactDecimal.from('3');
      // 100 / 3 = 33.33333333
      const divResult = total.div(count, 4);
      expect(divResult.toFixed(4)).toBe('33.3333');
    });
  });

  describe('Money Transport Boundary and Supported Scale Constraints', () => {
    it('preserves largest supported fuel quantity (999,999,999.999) without precision loss', () => {
      const maxQuantity = ExactDecimal.from(999999999.999);
      expect(maxQuantity.toFixed(3)).toBe('999999999.999');
      expect(maxQuantity.toNumber()).toBe(999999999.999);
    });

    it('preserves largest supported unit price (99,999,999.9999) without precision loss', () => {
      const maxUnitPrice = ExactDecimal.from(99999999.9999);
      expect(maxUnitPrice.toFixed(4)).toBe('99999999.9999');
      expect(maxUnitPrice.toNumber()).toBe(99999999.9999);
    });

    it('preserves largest supported fuel total and expense amount (9,999,999,999.9999) losslessly', () => {
      const maxAmount = ExactDecimal.from(9999999999.9999);
      expect(maxAmount.toFixed(4)).toBe('9999999999.9999');
      expect(maxAmount.toNumber()).toBe(9999999999.9999);
      // Confirmed within IEEE-754 Number.MAX_SAFE_INTEGER (9,007,199,254,740,991)
      expect(Number.isSafeInteger(Math.round(maxAmount.toNumber() * 10000))).toBe(true);
    });

    it('preserves smallest supported monetary subunit for USD (0.01)', () => {
      const smallestUsd = roundMoneyToCurrency(0.01, 'USD');
      expect(smallestUsd.toFixed(2)).toBe('0.01');
      expect(smallestUsd.toNumber()).toBe(0.01);
    });

    it('preserves smallest supported monetary subunit for JPY (1)', () => {
      const smallestJpy = roundMoneyToCurrency(1, 'JPY');
      expect(smallestJpy.toFixed(0)).toBe('1');
      expect(smallestJpy.toNumber()).toBe(1);
    });

    it('preserves smallest supported monetary subunit for KWD (0.001)', () => {
      const smallestKwd = roundMoneyToCurrency(0.001, 'KWD');
      expect(smallestKwd.toFixed(3)).toBe('0.001');
      expect(smallestKwd.toNumber()).toBe(0.001);
    });

    it('verifies exact multiplications at boundary combinations across currencies', () => {
      // 10,000.500 L at 2.4550 USD/L = 24,551.2275 -> 24,551.23 USD
      const usdTotal = calculateFuelTotalAmount(10000.5, 2.455, 'USD');
      expect(usdTotal.toFixed(2)).toBe('24551.23');
      expect(usdTotal.toNumber()).toBe(24551.23);

      // 10,000.500 L at 2.4550 KWD/L = 24,551.228 KWD
      const kwdTotal = calculateFuelTotalAmount(10000.5, 2.455, 'KWD');
      expect(kwdTotal.toFixed(3)).toBe('24551.228');
      expect(kwdTotal.toNumber()).toBe(24551.228);

      // 10,000.500 L at 2.4550 JPY/L = 24,551 JPY
      const jpyTotal = calculateFuelTotalAmount(10000.5, 2.455, 'JPY');
      expect(jpyTotal.toFixed(0)).toBe('24551');
      expect(jpyTotal.toNumber()).toBe(24551);
    });
  });
});
