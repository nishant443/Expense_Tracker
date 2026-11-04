/**
 * Pure date-only helpers operating on 'YYYY-MM-DD' strings in UTC so results never depend on
 * the host timezone. Used by the recurring scheduler, budget windows, and analytics ranges.
 */
import type { BudgetPeriod, Frequency } from './constants';

export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function parseISODate(value: string): Date {
  if (!DATE_REGEX.test(value)) throw new Error(`Invalid date: ${value}`);
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date;
}

export function isValidISODate(value: string): boolean {
  try {
    parseISODate(value);
    return true;
  } catch {
    return false;
  }
}

export function formatISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today's date in a given IANA timezone (defaults to UTC). */
export function todayISO(timeZone = 'UTC', now = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Local calendar date of the running device (browser). */
export function localTodayISO(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysISO(value: string, days: number): string {
  const d = parseISODate(value);
  d.setUTCDate(d.getUTCDate() + days);
  return formatISODate(d);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Adds months, clamping the day to the end of shorter months (Jan 31 + 1 → Feb 28/29). */
export function addMonthsISO(value: string, months: number): string {
  const d = parseISODate(value);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  target.setUTCDate(Math.min(day, daysInMonth(target.getUTCFullYear(), target.getUTCMonth())));
  return formatISODate(target);
}

export function addYearsISO(value: string, years: number): string {
  return addMonthsISO(value, years * 12);
}

export function compareISO(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function diffDaysISO(a: string, b: string): number {
  return Math.round((parseISODate(a).getTime() - parseISODate(b).getTime()) / 86_400_000);
}

export function startOfMonthISO(value: string): string {
  return value.slice(0, 8) + '01';
}

export function endOfMonthISO(value: string): string {
  const d = parseISODate(value);
  return formatISODate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

/** Weeks start on Monday. */
export function startOfWeekISO(value: string): string {
  const dow = (parseISODate(value).getUTCDay() + 6) % 7;
  return addDaysISO(value, -dow);
}

export function startOfYearISO(value: string): string {
  return value.slice(0, 4) + '-01-01';
}

/** n-th occurrence (0-based) of a schedule anchored on `start`. Anchoring avoids month-end drift. */
export function occurrenceAt(start: string, frequency: Frequency, n: number): string {
  switch (frequency) {
    case 'daily':
      return addDaysISO(start, n);
    case 'weekly':
      return addDaysISO(start, n * 7);
    case 'monthly':
      return addMonthsISO(start, n);
    case 'yearly':
      return addYearsISO(start, n);
  }
}

/** Index of the first occurrence that is >= `onOrAfter`. */
export function occurrenceIndexOnOrAfter(start: string, frequency: Frequency, onOrAfter: string): number {
  if (compareISO(onOrAfter, start) <= 0) return 0;
  const days = diffDaysISO(onOrAfter, start);
  let n: number;
  switch (frequency) {
    case 'daily':
      n = days;
      break;
    case 'weekly':
      n = Math.floor(days / 7);
      break;
    case 'monthly':
      n = Math.max(0, Math.floor(days / 31) - 1);
      break;
    case 'yearly':
      n = Math.max(0, Math.floor(days / 366) - 1);
      break;
  }
  while (compareISO(occurrenceAt(start, frequency, n), onOrAfter) < 0) n++;
  return n;
}

/** All occurrence dates in [from, to] inclusive, at most `limit`. */
export function occurrencesBetween(start: string, frequency: Frequency, from: string, to: string, limit = 366): string[] {
  const out: string[] = [];
  let n = occurrenceIndexOnOrAfter(start, frequency, from);
  for (;;) {
    const date = occurrenceAt(start, frequency, n);
    if (compareISO(date, to) > 0 || out.length >= limit) break;
    out.push(date);
    n++;
  }
  return out;
}

export function nextOccurrenceAfter(start: string, frequency: Frequency, after: string): string {
  return occurrenceAt(start, frequency, occurrenceIndexOnOrAfter(start, frequency, addDaysISO(after, 1)));
}

export interface DateWindow {
  start: string;
  end: string;
}

/**
 * The budget period that contains `ref`. Recurring periods are anchored on the budget's start date
 * (a monthly budget starting on the 5th runs 5th → 4th). Returns null if `ref` lies outside the
 * budget's lifetime.
 */
export function budgetWindow(
  budget: { period: BudgetPeriod; startDate: string; endDate: string | null },
  ref: string,
): DateWindow | null {
  if (compareISO(ref, budget.startDate) < 0) return null;
  if (budget.endDate && compareISO(ref, budget.endDate) > 0) return null;
  if (budget.period === 'custom') {
    return { start: budget.startDate, end: budget.endDate ?? budget.startDate };
  }
  const freq: Frequency = budget.period;
  let n = occurrenceIndexOnOrAfter(budget.startDate, freq, ref);
  if (compareISO(occurrenceAt(budget.startDate, freq, n), ref) > 0) n--;
  const start = occurrenceAt(budget.startDate, freq, n);
  let end = addDaysISO(occurrenceAt(budget.startDate, freq, n + 1), -1);
  if (budget.endDate && compareISO(end, budget.endDate) > 0) end = budget.endDate;
  return { start, end };
}

export const RANGE_PRESETS = ['this_week', 'this_month', 'last_month', 'last_3_months', 'last_6_months', 'this_year'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  this_week: 'This week',
  this_month: 'This month',
  last_month: 'Last month',
  last_3_months: 'Last 3 months',
  last_6_months: 'Last 6 months',
  this_year: 'This year',
};

export function presetRange(preset: RangePreset, today: string): DateWindow {
  switch (preset) {
    case 'this_week':
      return { start: startOfWeekISO(today), end: addDaysISO(startOfWeekISO(today), 6) };
    case 'this_month':
      return { start: startOfMonthISO(today), end: endOfMonthISO(today) };
    case 'last_month': {
      const s = addMonthsISO(startOfMonthISO(today), -1);
      return { start: s, end: endOfMonthISO(s) };
    }
    case 'last_3_months':
      return { start: addMonthsISO(startOfMonthISO(today), -2), end: endOfMonthISO(today) };
    case 'last_6_months':
      return { start: addMonthsISO(startOfMonthISO(today), -5), end: endOfMonthISO(today) };
    case 'this_year':
      return { start: startOfYearISO(today), end: today.slice(0, 4) + '-12-31' };
  }
}

/** The window immediately preceding `w`: previous calendar months for whole-month windows, else equal-length span. */
export function previousWindow(w: DateWindow): DateWindow {
  if (w.start.endsWith('-01') && w.end === endOfMonthISO(w.end)) {
    const months =
      (Number(w.end.slice(0, 4)) - Number(w.start.slice(0, 4))) * 12 +
      Number(w.end.slice(5, 7)) -
      Number(w.start.slice(5, 7)) +
      1;
    return { start: addMonthsISO(w.start, -months), end: addDaysISO(w.start, -1) };
  }
  const len = diffDaysISO(w.end, w.start) + 1;
  return { start: addDaysISO(w.start, -len), end: addDaysISO(w.start, -1) };
}
