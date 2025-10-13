/**
 * Exact arbitrary-precision arithmetic for Restless Gambler
 *
 * Replaces all number/BigInt mixing with exact decimal arithmetic
 * Supports values from tiny amounts to centillion (10^303) and beyond
 */

export {
  HugeDecimal,
  HugeSymbolic,
  min,
  max,
  clamp
} from './Huge.js';

export type { Tower, SymbolicExpr } from './Huge.js';

export {
  parseAmount,
  parsePositiveAmount,
  AmountParseError,
  SUFFIX_TABLE,
  getAllSuffixCodes,
  getAllSuffixWords,
  getSuffixByPower
} from './parse.js';

export type { SuffixUnit, ParseAmountOptions } from './parse.js';

export {
  formatShort,
  formatExact,
  formatFull,
  formatDisplay,
  formatBalance,
  formatPercent,
  formatBasisPoints,
  formatDebug
} from './format.js';

export type { FormatOptions } from './format.js';
