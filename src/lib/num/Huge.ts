/**
 * Exact arbitrary-precision decimal arithmetic engine
 *
 * Handles exact decimal arithmetic for game values from tiny amounts to centillion (10^303)
 * and beyond, with symbolic representation for astronomically huge values (googolplex, etc.)
 *
 * Design principles:
 * - All operations are mathematically exact (no floating-point approximations)
 * - Uses BigInt internally for unlimited precision
 * - Supports symbolic towers for values beyond physical computation limits
 * - Optimized for common game operations (<= centillion range)
 */

// ============================================================================
// Core HugeDecimal: Exact decimal arithmetic
// ============================================================================

/**
 * Represents an exact decimal number as: sign * (mantissa / 10^scale) * 10^exp10
 * where mantissa, scale, and exp10 are arbitrary-size integers.
 *
 * Normalized form:
 * - mantissa is always non-negative
 * - mantissa = 0 implies sign = 0
 * - mantissa > 0 implies no trailing zeros in mantissa
 * - scale >= 0 (represents decimal places)
 */
export class HugeDecimal {
  readonly sign: 1 | -1 | 0;
  readonly mantissa: bigint;  // non-negative, no trailing zeros
  readonly scale: bigint;      // decimal places >= 0
  readonly exp10: bigint;      // power-of-10 exponent

  private constructor(sign: 1 | -1 | 0, mantissa: bigint, scale: bigint, exp10: bigint) {
    this.sign = sign;
    this.mantissa = mantissa;
    this.scale = scale;
    this.exp10 = exp10;
  }

  /**
   * Create a HugeDecimal from components (auto-normalizes)
   */
  static fromComponents(sign: 1 | -1 | 0, mantissa: bigint, scale: bigint, exp10: bigint): HugeDecimal {
    if (mantissa < 0n) throw new Error('mantissa must be non-negative');
    if (scale < 0n) throw new Error('scale must be non-negative');

    // Normalize zero
    if (mantissa === 0n) {
      return new HugeDecimal(0, 0n, 0n, 0n);
    }

    // Remove trailing zeros from mantissa and adjust scale/exp10
    let m = mantissa;
    let s = scale;
    let e = exp10;

    while (m > 0n && m % 10n === 0n) {
      m = m / 10n;
      if (s > 0n) {
        s = s - 1n;
      } else {
        e = e + 1n;
      }
    }

    if (m === 0n) {
      return new HugeDecimal(0, 0n, 0n, 0n);
    }

    return new HugeDecimal(sign, m, s, e);
  }

  /**
   * Create from a bigint (exact)
   */
  static fromBigInt(value: bigint): HugeDecimal {
    if (value === 0n) return HugeDecimal.ZERO;
    const sign: 1 | -1 = value > 0n ? 1 : -1;
    return HugeDecimal.fromComponents(sign, sign === 1 ? value : -value, 0n, 0n);
  }

  /**
   * Create from a number (converts to exact bigint, losing fractional part)
   */
  static fromNumber(value: number): HugeDecimal {
    if (!Number.isFinite(value)) throw new Error('Cannot convert non-finite number');
    return HugeDecimal.fromBigInt(BigInt(Math.trunc(value)));
  }

  /**
   * Create from a string (exact)
   * Supports: integers, decimals, scientific notation
   * Examples: "123", "123.456", "1.23e10", "-5.67e-3"
   */
  static fromString(input: string): HugeDecimal {
    const s = input.trim();
    if (!s) throw new Error('Empty string');

    // Parse: [sign] [digits] [.digits] [e/E [sign] digits]
    const m = s.match(/^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
    if (!m) throw new Error(`Invalid number format: ${input}`);

    const [, signStr, intPart, fracPart = '', expStr = '0'] = m;
    const sign: 1 | -1 = signStr === '-' ? -1 : 1;

    // Combine integer and fractional parts into mantissa
    const combinedDigits = intPart + fracPart;
    const mantissa = BigInt(combinedDigits);
    const scale = BigInt(fracPart.length);
    const exp10 = BigInt(expStr);

    return HugeDecimal.fromComponents(sign, mantissa, scale, exp10);
  }

  // Constants
  static readonly ZERO = new HugeDecimal(0, 0n, 0n, 0n);
  static readonly ONE = new HugeDecimal(1, 1n, 0n, 0n);
  static readonly NEG_ONE = new HugeDecimal(-1, 1n, 0n, 0n);

  // ============================================================================
  // Basic properties
  // ============================================================================

  isZero(): boolean {
    return this.sign === 0;
  }

  isPositive(): boolean {
    return this.sign === 1;
  }

  isNegative(): boolean {
    return this.sign === -1;
  }

  /**
   * Get the absolute value
   */
  abs(): HugeDecimal {
    if (this.isNegative()) return this.negate();
    return this;
  }

  /**
   * Negate the value
   */
  negate(): HugeDecimal {
    if (this.isZero()) return this;
    const newSign: 1 | -1 = this.sign === 1 ? -1 : 1;
    return new HugeDecimal(newSign, this.mantissa, this.scale, this.exp10);
  }

  // ============================================================================
  // Comparison
  // ============================================================================

  /**
   * Compare this with other
   * Returns: -1 if this < other, 0 if equal, 1 if this > other
   */
  cmp(other: HugeDecimal): -1 | 0 | 1 {
    // Fast paths
    if (this.sign !== other.sign) {
      if (this.sign < other.sign) return -1;
      if (this.sign > other.sign) return 1;
      return 0;
    }
    if (this.isZero() && other.isZero()) return 0;

    // Same sign, need magnitude comparison
    const magCmp = this._cmpMagnitude(other);
    if (this.sign === -1) {
      // Both negative: flip comparison
      if (magCmp === -1) return 1;
      if (magCmp === 1) return -1;
      return 0;
    }
    return magCmp;
  }

  /**
   * Compare magnitudes (ignore signs)
   */
  private _cmpMagnitude(other: HugeDecimal): -1 | 0 | 1 {
    // Compare effective exponents first
    const thisEffExp = this.exp10 - this.scale;
    const otherEffExp = other.exp10 - other.scale;

    const expDiff = thisEffExp - otherEffExp;

    // If exponents differ by a lot, we can decide immediately
    const thisDigits = BigInt(this.mantissa.toString().length);
    const otherDigits = BigInt(other.mantissa.toString().length);

    const thisMaxExp = thisEffExp + thisDigits;
    const otherMaxExp = otherEffExp + otherDigits;

    if (thisMaxExp < otherMaxExp) return -1;
    if (thisMaxExp > otherMaxExp) return 1;

    // Need to align and compare mantissas
    // Scale both to same exponent (the larger one)
    if (expDiff === 0n) {
      if (this.mantissa < other.mantissa) return -1;
      if (this.mantissa > other.mantissa) return 1;
      return 0;
    }

    if (expDiff > 0n) {
      // this has larger exp10, so multiply this.mantissa by 10^expDiff
      const scaled = this.mantissa * (10n ** expDiff);
      if (scaled < other.mantissa) return -1;
      if (scaled > other.mantissa) return 1;
      return 0;
    } else {
      // other has larger exp10
      const scaled = other.mantissa * (10n ** (-expDiff));
      if (this.mantissa < scaled) return -1;
      if (this.mantissa > scaled) return 1;
      return 0;
    }
  }

  eq(other: HugeDecimal): boolean { return this.cmp(other) === 0; }
  lt(other: HugeDecimal): boolean { return this.cmp(other) === -1; }
  lte(other: HugeDecimal): boolean { return this.cmp(other) <= 0; }
  gt(other: HugeDecimal): boolean { return this.cmp(other) === 1; }
  gte(other: HugeDecimal): boolean { return this.cmp(other) >= 0; }

  // ============================================================================
  // Arithmetic operations
  // ============================================================================

  /**
   * Add two HugeDecimals (exact)
   */
  add(other: HugeDecimal): HugeDecimal {
    if (this.isZero()) return other;
    if (other.isZero()) return this;

    // Align to same effective exponent
    const thisEffExp = this.exp10 - this.scale;
    const otherEffExp = other.exp10 - other.scale;

    let m1 = this.mantissa;
    let m2 = other.mantissa;
    let targetEffExp = thisEffExp;

    if (thisEffExp < otherEffExp) {
      // Scale this up
      m1 = m1 * (10n ** (otherEffExp - thisEffExp));
      targetEffExp = otherEffExp;
    } else if (otherEffExp < thisEffExp) {
      // Scale other up
      m2 = m2 * (10n ** (thisEffExp - otherEffExp));
    }

    // Now both are at targetEffExp, perform signed addition
    const v1 = m1 * BigInt(this.sign);
    const v2 = m2 * BigInt(other.sign);
    const sum = v1 + v2;

    if (sum === 0n) return HugeDecimal.ZERO;

    const newSign: 1 | -1 = sum > 0n ? 1 : -1;
    const newMantissa = sum > 0n ? sum : -sum;

    return HugeDecimal.fromComponents(newSign, newMantissa, 0n, targetEffExp);
  }

  /**
   * Subtract (exact)
   */
  sub(other: HugeDecimal): HugeDecimal {
    return this.add(other.negate());
  }

  /**
   * Multiply (exact)
   */
  mul(other: HugeDecimal): HugeDecimal {
    if (this.isZero() || other.isZero()) return HugeDecimal.ZERO;

    const newSign: 1 | -1 = (this.sign === other.sign) ? 1 : -1;
    const newMantissa = this.mantissa * other.mantissa;
    const newScale = this.scale + other.scale;
    const newExp10 = this.exp10 + other.exp10;

    return HugeDecimal.fromComponents(newSign, newMantissa, newScale, newExp10);
  }

  /**
   * Divide (exact when divisor divides evenly, otherwise truncates)
   * For game purposes, we typically want floor division
   */
  div(other: HugeDecimal): HugeDecimal {
    if (other.isZero()) throw new Error('Division by zero');
    if (this.isZero()) return HugeDecimal.ZERO;

    // We want floor((this.mantissa * 10^(this.exp10 - this.scale)) / (other.mantissa * 10^(other.exp10 - other.scale)))
    // = floor((this.mantissa * 10^this.exp10) / (other.mantissa * 10^other.exp10 * 10^(this.scale - other.scale)))

    const newSign: 1 | -1 = (this.sign === other.sign) ? 1 : -1;

    // Scale difference to align decimals
    const scaleDiff = this.scale - other.scale;

    // To maintain precision, multiply numerator by a large power of 10
    // We'll use a precision of 50 decimal places for intermediate calculation
    const PRECISION = 50n;

    let num = this.mantissa;
    let denom = other.mantissa;

    // Adjust for scale difference
    if (scaleDiff > 0n) {
      denom = denom * (10n ** scaleDiff);
    } else if (scaleDiff < 0n) {
      num = num * (10n ** (-scaleDiff));
    }

    // Add precision
    num = num * (10n ** PRECISION);

    // Integer division
    const quotient = num / denom;

    // Exponent adjustment
    const newExp10 = this.exp10 - other.exp10;

    return HugeDecimal.fromComponents(newSign, quotient, PRECISION, newExp10);
  }

  /**
   * Multiply by a power of 10 (exact and fast)
   */
  mulPow10(exponent: bigint): HugeDecimal {
    if (this.isZero()) return this;
    return new HugeDecimal(this.sign, this.mantissa, this.scale, this.exp10 + exponent);
  }

  /**
   * Raise to an integer power (exact for small exponents)
   */
  pow(exponent: number): HugeDecimal {
    if (exponent === 0) return HugeDecimal.ONE;
    if (exponent === 1) return this;
    if (this.isZero()) return HugeDecimal.ZERO;
    if (exponent < 0) throw new Error('Negative exponents not supported in pow');

    let result: HugeDecimal = HugeDecimal.ONE;
    let base: HugeDecimal = this;
    let exp = exponent;

    // Binary exponentiation
    while (exp > 0) {
      if (exp % 2 === 1) {
        result = result.mul(base);
      }
      base = base.mul(base) as HugeDecimal;
      exp = Math.floor(exp / 2);
    }

    return result;
  }

  // ============================================================================
  // Conversion & Formatting
  // ============================================================================

  /**
   * Convert to a BigInt (truncates fractional part)
   */
  toBigInt(): bigint {
    if (this.isZero()) return 0n;

    // Calculate: mantissa * 10^(exp10 - scale)
    const effExp = this.exp10 - this.scale;

    let value: bigint;
    if (effExp >= 0n) {
      value = this.mantissa * (10n ** effExp);
    } else {
      // Fractional: truncate
      value = this.mantissa / (10n ** (-effExp));
    }

    return this.sign === 1 ? value : -value;
  }

  /**
   * Convert to Number (may lose precision for large values)
   */
  toNumber(): number {
    if (this.isZero()) return 0;

    // For safety, use string conversion
    const str = this.toStringExact();
    return Number(str);
  }

  /**
   * Convert to exact string representation
   * For huge values, returns scientific notation
   */
  toStringExact(): string {
    if (this.isZero()) return '0';

    const sign = this.sign === -1 ? '-' : '';
    const mantissaStr = this.mantissa.toString();

    // Calculate effective exponent
    const effExp = this.exp10 - this.scale;

    // If scale is 0 and exp10 is small, return simple integer
    if (this.scale === 0n && effExp >= 0n && effExp < 6n) {
      const value = this.mantissa * (10n ** effExp);
      return sign + value.toString();
    }

    // If we have decimal places or large exponent, use scientific notation
    if (this.scale > 0n || effExp !== 0n) {
      // Format as: ±M.MMM × 10^E
      const intPart = mantissaStr[0];
      const fracPart = mantissaStr.slice(1);
      const adjustedExp = effExp + BigInt(mantissaStr.length - 1);

      if (fracPart) {
        return `${sign}${intPart}.${fracPart}e${adjustedExp}`;
      } else {
        return `${sign}${intPart}e${adjustedExp}`;
      }
    }

    return sign + mantissaStr;
  }

  /**
   * Convert to JSON-serializable form
   */
  toJSON(): string {
    return JSON.stringify({
      t: 'hd',
      s: this.sign,
      m: this.mantissa.toString(),
      sc: this.scale.toString(),
      e: this.exp10.toString()
    });
  }

  /**
   * Parse from JSON
   */
  static fromJSON(json: string): HugeDecimal {
    const obj = JSON.parse(json);
    if (obj.t !== 'hd') throw new Error('Invalid HugeDecimal JSON');

    const sign = obj.s as 1 | -1 | 0;
    const mantissa = BigInt(obj.m);
    const scale = BigInt(obj.sc);
    const exp10 = BigInt(obj.e);

    return HugeDecimal.fromComponents(sign, mantissa, scale, exp10);
  }

  /**
   * Store to database (canonical string form)
   */
  toDbString(): string {
    return this.toJSON();
  }

  /**
   * Load from database
   */
  static fromDbString(dbValue: string): HugeDecimal {
    if (!dbValue || dbValue === '0') return HugeDecimal.ZERO;

    // Try to parse as JSON first (new format)
    if (dbValue.startsWith('{')) {
      return HugeDecimal.fromJSON(dbValue);
    }

    // Legacy: try as plain number
    try {
      const num = BigInt(dbValue);
      return HugeDecimal.fromBigInt(num);
    } catch {
      // Fallback: try as string number
      return HugeDecimal.fromString(dbValue);
    }
  }
}

// ============================================================================
// Symbolic representation for ultra-huge values (googolplex, etc.)
// ============================================================================

/**
 * Represents power towers: 10^10^10^...
 * Used when values exceed physical computation limits
 */
export type Tower =
  | { kind: 'base', value: bigint }
  | { kind: 'pow10', exp: Tower };

/**
 * Symbolic sum: used when addition of vastly different magnitudes
 * is required but exact digit expansion isn't feasible
 */
export type SymbolicExpr =
  | { kind: 'huge', value: HugeDecimal }
  | { kind: 'tower', tower: Tower }
  | { kind: 'sum', terms: SymbolicExpr[] };

/**
 * HugeSymbolic: wrapper for values that may exceed HugeDecimal's practical limits
 * Maintains exactness through symbolic representation
 */
export class HugeSymbolic {
  readonly expr: SymbolicExpr;

  private constructor(expr: SymbolicExpr) {
    this.expr = expr;
  }

  static fromHugeDecimal(hd: HugeDecimal): HugeSymbolic {
    return new HugeSymbolic({ kind: 'huge', value: hd });
  }

  static fromTower(tower: Tower): HugeSymbolic {
    return new HugeSymbolic({ kind: 'tower', tower });
  }

  /**
   * Create a power tower: 10^(10^exp)
   */
  static pow10(exp: bigint | HugeSymbolic): HugeSymbolic {
    if (typeof exp === 'bigint') {
      const tower: Tower = { kind: 'pow10', exp: { kind: 'base', value: exp } };
      return new HugeSymbolic({ kind: 'tower', tower });
    }

    // If exp is already symbolic, we're building a tower
    if (exp.expr.kind === 'tower') {
      const tower: Tower = { kind: 'pow10', exp: exp.expr.tower };
      return new HugeSymbolic({ kind: 'tower', tower });
    }

    throw new Error('pow10 with symbolic sum not supported');
  }

  /**
   * Multiply symbolic values (exact)
   */
  mul(other: HugeSymbolic): HugeSymbolic {
    // Simplify if both are HugeDecimal
    if (this.expr.kind === 'huge' && other.expr.kind === 'huge') {
      return HugeSymbolic.fromHugeDecimal(this.expr.value.mul(other.expr.value));
    }

    // Tower multiplication: add exponents
    // Note: this is a simplification; full tower arithmetic is complex
    throw new Error('Symbolic tower multiplication not yet implemented');
  }

  toString(): string {
    return this._exprToString(this.expr);
  }

  private _exprToString(expr: SymbolicExpr): string {
    switch (expr.kind) {
      case 'huge':
        return expr.value.toStringExact();
      case 'tower':
        return this._towerToString(expr.tower);
      case 'sum':
        return expr.terms.map(t => this._exprToString(t)).join(' + ');
    }
  }

  private _towerToString(tower: Tower): string {
    if (tower.kind === 'base') {
      return tower.value.toString();
    }
    return `10^(${this._towerToString(tower.exp)})`;
  }
}

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Min of two HugeDecimals
 */
export function min(a: HugeDecimal, b: HugeDecimal): HugeDecimal {
  return a.lt(b) ? a : b;
}

/**
 * Max of two HugeDecimals
 */
export function max(a: HugeDecimal, b: HugeDecimal): HugeDecimal {
  return a.gt(b) ? a : b;
}

/**
 * Clamp value between bounds
 */
export function clamp(value: HugeDecimal, lo: HugeDecimal, hi: HugeDecimal): HugeDecimal {
  if (value.lt(lo)) return lo;
  if (value.gt(hi)) return hi;
  return value;
}
