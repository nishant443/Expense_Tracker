import Decimal from 'decimal.js';

/**
 * Money is always represented as a decimal string with up to 2 fraction digits ("1234.50").
 * Never use JS numbers for arithmetic on money — use these helpers.
 */
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const MONEY_REGEX = /^\d{1,12}(\.\d{1,2})?$/;
export const MAX_AMOUNT = '999999999999.99';

export type MoneyInput = string | number | Decimal;

export function money(value: MoneyInput | null | undefined): Decimal {
  if (value === null || value === undefined || value === '') return new D(0);
  return new D(value);
}

/** Canonical 2dp string, rounded half-up (matches Postgres numeric rounding). */
export function toMoneyString(value: MoneyInput): string {
  return money(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

export function addMoney(...values: MoneyInput[]): string {
  return toMoneyString(values.reduce<Decimal>((acc, v) => acc.plus(money(v)), new D(0)));
}

export function subMoney(a: MoneyInput, b: MoneyInput): string {
  return toMoneyString(money(a).minus(money(b)));
}

export function sumMoney(values: MoneyInput[]): string {
  return addMoney(...values);
}

export function compareMoney(a: MoneyInput, b: MoneyInput): number {
  return money(a).comparedTo(money(b));
}

export function isPositiveMoney(value: string): boolean {
  return MONEY_REGEX.test(value) && money(value).gt(0) && money(value).lte(MAX_AMOUNT);
}

/**
 * Percentage of `part` relative to `whole`, rounded to `dp` decimals. Returns a plain number which is
 * fine for display-only ratios (never fed back into money math). Returns null when whole is zero.
 */
export function percentOf(part: MoneyInput, whole: MoneyInput, dp = 1): number | null {
  const w = money(whole);
  if (w.isZero()) return null;
  return money(part).div(w).times(100).toDecimalPlaces(dp, Decimal.ROUND_HALF_UP).toNumber();
}

/** Relative change from previous to current, in percent. null when previous is zero. */
export function percentChange(current: MoneyInput, previous: MoneyInput, dp = 1): number | null {
  const p = money(previous);
  if (p.isZero()) return null;
  return money(current).minus(p).div(p.abs()).times(100).toDecimalPlaces(dp, Decimal.ROUND_HALF_UP).toNumber();
}

/** Normalises user input like "1,234.5" or " 12 " into a canonical money string, or null if invalid. */
export function parseMoneyInput(raw: string): string | null {
  const cleaned = raw.replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const d = new D(cleaned || '0');
  if (d.gt(MAX_AMOUNT)) return null;
  return d.toFixed(2);
}

/** Convert a money string to a number for chart rendering ONLY. */
export function moneyToChartNumber(value: MoneyInput): number {
  return money(value).toNumber();
}
