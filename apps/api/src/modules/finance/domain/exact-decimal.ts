export type ExactDecimalInput = string | number | bigint | ExactDecimal;

/**
 * Exact Decimal Value Object.
 *
 * Implements exact arbitrary-precision fixed-point decimal arithmetic backed by
 * native JavaScript BigInt to completely eliminate IEEE-754 binary floating-point
 * rounding errors and representation drift in authoritative financial calculations.
 */
export class ExactDecimal {
  public readonly unscaled: bigint;
  public readonly scale: number;

  private constructor(unscaled: bigint, scale: number) {
    if (scale < 0) {
      this.unscaled = unscaled * 10n ** BigInt(-scale);
      this.scale = 0;
    } else {
      this.unscaled = unscaled;
      this.scale = scale;
    }
  }

  public static from(input: ExactDecimalInput): ExactDecimal {
    if (input instanceof ExactDecimal) {
      return input;
    }

    if (typeof input === 'bigint') {
      return new ExactDecimal(input, 0);
    }

    let str: string;
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) {
        throw new TypeError(`Cannot create ExactDecimal from non-finite number: ${input}`);
      }
      str = input.toString();
    } else if (typeof input === 'string') {
      str = input.trim();
    } else {
      throw new TypeError(`Unsupported input type for ExactDecimal: ${typeof input}`);
    }

    if (str === '' || str === '.') {
      throw new TypeError(`Invalid decimal string: "${str}"`);
    }

    // Handle scientific notation e.g. 1e-4 or 2.5e+3
    if (/[eE]/.test(str)) {
      const [coeffStr, expStr] = str.split(/[eE]/) as [string, string];
      const exp = parseInt(expStr, 10);
      const coeff = ExactDecimal.from(coeffStr);
      if (exp >= 0) {
        return coeff.mul(10n ** BigInt(exp));
      } else {
        return new ExactDecimal(coeff.unscaled, coeff.scale + Math.abs(exp));
      }
    }

    const isNegative = str.startsWith('-');
    if (isNegative || str.startsWith('+')) {
      str = str.slice(1);
    }

    const parts = str.split('.');
    if (parts.length > 2) {
      throw new TypeError(`Invalid decimal string: "${input}"`);
    }

    const intPart = parts[0] || '0';
    const fracPart = parts[1] || '';

    if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) {
      throw new TypeError(`Invalid characters in decimal string: "${input}"`);
    }

    const scale = fracPart.length;
    const combinedStr = intPart + fracPart;
    const rawUnscaled = BigInt(combinedStr || '0');
    const unscaled = isNegative ? -rawUnscaled : rawUnscaled;

    return new ExactDecimal(unscaled, scale);
  }

  public static zero(): ExactDecimal {
    return new ExactDecimal(0n, 0);
  }

  public isZero(): boolean {
    return this.unscaled === 0n;
  }

  public isNegative(): boolean {
    return this.unscaled < 0n;
  }

  public isPositive(): boolean {
    return this.unscaled > 0n;
  }

  public abs(): ExactDecimal {
    return this.unscaled < 0n ? new ExactDecimal(-this.unscaled, this.scale) : this;
  }

  public negate(): ExactDecimal {
    return new ExactDecimal(-this.unscaled, this.scale);
  }

  public add(otherInput: ExactDecimalInput): ExactDecimal {
    const other = ExactDecimal.from(otherInput);
    const targetScale = Math.max(this.scale, other.scale);
    const a = this.rescaleUnscaled(targetScale);
    const b = other.rescaleUnscaled(targetScale);
    return new ExactDecimal(a + b, targetScale);
  }

  public sub(otherInput: ExactDecimalInput): ExactDecimal {
    const other = ExactDecimal.from(otherInput);
    const targetScale = Math.max(this.scale, other.scale);
    const a = this.rescaleUnscaled(targetScale);
    const b = other.rescaleUnscaled(targetScale);
    return new ExactDecimal(a - b, targetScale);
  }

  public mul(otherInput: ExactDecimalInput): ExactDecimal {
    const other = ExactDecimal.from(otherInput);
    return new ExactDecimal(this.unscaled * other.unscaled, this.scale + other.scale);
  }

  public div(otherInput: ExactDecimalInput, targetScale = 8): ExactDecimal {
    const other = ExactDecimal.from(otherInput);
    if (other.unscaled === 0n) {
      throw new RangeError('Division by zero in ExactDecimal');
    }

    // (unscaledA * 10^(scaleB - scaleA + targetScale + 1)) / unscaledB
    const power = targetScale + other.scale - this.scale + 1;
    let scaledDividend: bigint;
    if (power >= 0) {
      scaledDividend = this.unscaled * 10n ** BigInt(power);
    } else {
      scaledDividend = this.unscaled / 10n ** BigInt(-power);
    }

    const quotientWithGuard = scaledDividend / other.unscaled;
    const quotient = quotientWithGuard / 10n;
    const guardDigit = (quotientWithGuard < 0n ? -quotientWithGuard : quotientWithGuard) % 10n;

    let roundedQuotient = quotient;
    if (guardDigit >= 5n) {
      roundedQuotient = quotient >= 0n ? quotient + 1n : quotient - 1n;
    }

    return new ExactDecimal(roundedQuotient, targetScale);
  }

  public round(targetDecimals: number): ExactDecimal {
    if (targetDecimals < 0) {
      throw new RangeError(`Target decimals cannot be negative: ${targetDecimals}`);
    }

    if (this.scale <= targetDecimals) {
      return this;
    }

    const scaleDiff = this.scale - targetDecimals;
    const divisor = 10n ** BigInt(scaleDiff);
    const quotient = this.unscaled / divisor;
    const remainder = this.unscaled % divisor;
    const absRemainder = remainder < 0n ? -remainder : remainder;

    let rounded = quotient;
    // Half-up rounding
    if (absRemainder * 2n >= divisor) {
      rounded = this.unscaled >= 0n ? quotient + 1n : quotient - 1n;
    }

    return new ExactDecimal(rounded, targetDecimals);
  }

  public equals(otherInput: ExactDecimalInput): boolean {
    const other = ExactDecimal.from(otherInput);
    const targetScale = Math.max(this.scale, other.scale);
    return this.rescaleUnscaled(targetScale) === other.rescaleUnscaled(targetScale);
  }

  public compareTo(otherInput: ExactDecimalInput): number {
    const other = ExactDecimal.from(otherInput);
    const targetScale = Math.max(this.scale, other.scale);
    const a = this.rescaleUnscaled(targetScale);
    const b = other.rescaleUnscaled(targetScale);
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  public greaterThan(otherInput: ExactDecimalInput): boolean {
    return this.compareTo(otherInput) > 0;
  }

  public greaterThanOrEqual(otherInput: ExactDecimalInput): boolean {
    return this.compareTo(otherInput) >= 0;
  }

  public lessThan(otherInput: ExactDecimalInput): boolean {
    return this.compareTo(otherInput) < 0;
  }

  public lessThanOrEqual(otherInput: ExactDecimalInput): boolean {
    return this.compareTo(otherInput) <= 0;
  }

  public toFixed(decimals?: number): string {
    const target = decimals !== undefined ? this.round(decimals) : this;
    const isNeg = target.unscaled < 0n;
    const absVal = isNeg ? -target.unscaled : target.unscaled;
    const s = absVal.toString();

    let formatted: string;
    if (target.scale === 0) {
      formatted = s;
    } else if (s.length <= target.scale) {
      formatted = '0.' + '0'.repeat(target.scale - s.length) + s;
    } else {
      const cut = s.length - target.scale;
      formatted = s.slice(0, cut) + '.' + s.slice(cut);
    }

    return isNeg && formatted !== '0' && !formatted.startsWith('0.0000000000')
      ? '-' + formatted
      : formatted;
  }

  public toString(): string {
    return this.toFixed();
  }

  public toNumber(): number {
    return Number(this.toFixed());
  }

  private rescaleUnscaled(targetScale: number): bigint {
    if (targetScale === this.scale) return this.unscaled;
    if (targetScale > this.scale) {
      return this.unscaled * 10n ** BigInt(targetScale - this.scale);
    }
    return this.unscaled / 10n ** BigInt(this.scale - targetScale);
  }
}
