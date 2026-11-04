import { CURRENCIES, money } from '@expenseflow/shared';
import { format, isToday, isYesterday, parseISO } from 'date-fns';

const formatterCache = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: string, compact: boolean): Intl.NumberFormat {
  const key = `${currency}:${compact}`;
  let f = formatterCache.get(key);
  if (!f) {
    const locale = CURRENCIES.find((c) => c.code === currency)?.locale ?? 'en-US';
    f = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    });
    formatterCache.set(key, f);
  }
  return f;
}

/**
 * Formats a decimal money string. Intl only accepts numbers (or numeric strings in newer engines),
 * so we format the integer and fraction parts separately to avoid float rounding on large values.
 */
export function formatMoney(value: string | null | undefined, currency = 'INR', opts: { compact?: boolean; sign?: boolean } = {}): string {
  const d = money(value ?? '0');
  const f = currencyFormatter(currency, !!opts.compact);
  let out: string;
  if (opts.compact) {
    out = f.format(d.abs().toNumber());
  } else {
    // Format the integer part precisely, then splice in the exact 2-dp fraction.
    const fixed = d.abs().toFixed(2);
    const [intPart, frac] = fixed.split('.') as [string, string];
    const parts = f.formatToParts(Number(intPart));
    out = parts
      .map((p) => (p.type === 'fraction' ? frac : p.type === 'integer' ? p.value : p.value))
      .join('');
    // Some engines collapse '.00' → ensure fraction present
    if (!parts.some((p) => p.type === 'fraction')) out = out + '.' + frac;
  }
  const negative = d.isNeg() && !d.isZero();
  if (negative) return `−${out}`;
  if (opts.sign && d.gt(0)) return `+${out}`;
  return out;
}

export function currencySymbol(currency: string): string {
  return CURRENCIES.find((c) => c.code === currency)?.symbol ?? currency;
}

export function formatPercent(value: number | null | undefined, withSign = true): string {
  if (value === null || value === undefined) return '—';
  const s = `${Math.abs(value).toFixed(Math.abs(value) < 10 ? 1 : 0)}%`;
  if (!withSign || value === 0) return s;
  return value > 0 ? `+${s}` : `−${s}`;
}

export function friendlyDate(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, d.getFullYear() === new Date().getFullYear() ? 'EEE, d MMM' : 'd MMM yyyy');
}

export function shortDate(iso: string): string {
  return format(parseISO(iso), 'd MMM');
}

export function monthLabel(ym: string): string {
  return format(parseISO(`${ym}-01`), 'MMMM yyyy');
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
