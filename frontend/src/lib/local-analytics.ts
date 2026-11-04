import {
  addDaysISO,
  addMonthsISO,
  endOfMonthISO,
  money,
  percentChange,
  percentOf,
  subMoney,
  toMoneyString,
  type CategoryDTO,
} from '@expenseflow/shared';
import type Decimal from 'decimal.js';
import type { LocalTransaction } from './db';

/** All arithmetic uses decimal.js via shared helpers — never JS floats. */

export interface Summary {
  income: string;
  expense: string;
  savings: string;
  savingsRate: number | null;
  count: number;
}

const inRange = (t: LocalTransaction, start: string, end: string) => t.transactionDate >= start && t.transactionDate <= end;

export function summarize(txs: LocalTransaction[], start: string, end: string): Summary {
  let income: Decimal = money(0);
  let expense: Decimal = money(0);
  let count = 0;
  for (const t of txs) {
    if (!inRange(t, start, end)) continue;
    count++;
    if (t.type === 'income') income = income.plus(money(t.amount));
    else expense = expense.plus(money(t.amount));
  }
  const savings = subMoney(income, expense);
  return {
    income: toMoneyString(income),
    expense: toMoneyString(expense),
    savings,
    savingsRate: percentOf(savings, income),
    count,
  };
}

export function balanceOf(txs: LocalTransaction[]): string {
  let b: Decimal = money(0);
  for (const t of txs) b = t.type === 'income' ? b.plus(money(t.amount)) : b.minus(money(t.amount));
  return toMoneyString(b);
}

export function monthWindow(ym: string) {
  const start = `${ym}-01`;
  return { start, end: endOfMonthISO(start) };
}

export function previousMonth(ym: string): string {
  return addMonthsISO(`${ym}-01`, -1).slice(0, 7);
}

export interface MonthComparison {
  current: Summary;
  previous: Summary;
  change: { income: number | null; expense: number | null; savings: number | null };
}

export function compareMonths(txs: LocalTransaction[], ym: string): MonthComparison {
  const cur = monthWindow(ym);
  const prev = monthWindow(previousMonth(ym));
  const current = summarize(txs, cur.start, cur.end);
  const previous = summarize(txs, prev.start, prev.end);
  return {
    current,
    previous,
    change: {
      income: percentChange(current.income, previous.income),
      expense: percentChange(current.expense, previous.expense),
      savings: percentChange(current.savings, previous.savings),
    },
  };
}

export interface CumulativePoint {
  day: number;
  current: number | null;
  previous: number | null;
  daily: number;
}

/**
 * Cumulative daily spending for a month vs the previous month, aligned by day-of-month.
 * Values are numbers for charting only (derived from exact decimal sums).
 */
export function cumulativeSpending(txs: LocalTransaction[], ym: string, today: string): CumulativePoint[] {
  const cur = monthWindow(ym);
  const prevYm = previousMonth(ym);
  const prev = monthWindow(prevYm);
  const byDate = new Map<string, Decimal>();
  for (const t of txs) {
    if (t.type !== 'expense') continue;
    if (!inRange(t, prev.start, cur.end)) continue;
    byDate.set(t.transactionDate, (byDate.get(t.transactionDate) ?? money(0)).plus(money(t.amount)));
  }
  const curDays = Number(cur.end.slice(8));
  const prevDays = Number(prev.end.slice(8));
  const points: CumulativePoint[] = [];
  let c: Decimal = money(0);
  let p: Decimal = money(0);
  for (let d = 1; d <= Math.max(curDays, prevDays); d++) {
    const cd = d <= curDays ? addDaysISO(cur.start, d - 1) : null;
    const pd = d <= prevDays ? addDaysISO(prev.start, d - 1) : null;
    const daily = cd ? byDate.get(cd) ?? money(0) : money(0);
    if (cd) c = c.plus(daily);
    if (pd) p = p.plus(byDate.get(pd) ?? money(0));
    points.push({
      day: d,
      current: cd && cd <= today ? c.toNumber() : null,
      previous: pd ? p.toNumber() : null,
      daily: daily.toNumber(),
    });
  }
  return points;
}

export interface CategorySlice {
  category: CategoryDTO | undefined;
  categoryId: string;
  total: string;
  value: number;
  percent: number;
}

export function categoryBreakdown(
  txs: LocalTransaction[],
  categories: CategoryDTO[],
  start: string,
  end: string,
  type: 'expense' | 'income' = 'expense',
): { total: string; slices: CategorySlice[] } {
  const sums = new Map<string, Decimal>();
  let total: Decimal = money(0);
  for (const t of txs) {
    if (t.type !== type || !inRange(t, start, end)) continue;
    const a = money(t.amount);
    sums.set(t.categoryId, (sums.get(t.categoryId) ?? money(0)).plus(a));
    total = total.plus(a);
  }
  const byId = new Map(categories.map((c) => [c.id, c]));
  const slices = [...sums.entries()]
    .map(([categoryId, sum]) => ({
      categoryId,
      category: byId.get(categoryId),
      total: toMoneyString(sum),
      value: sum.toNumber(),
      percent: percentOf(sum, total) ?? 0,
    }))
    .sort((a, b) => b.value - a.value);
  return { total: toMoneyString(total), slices };
}

export function groupByDate<T extends { transactionDate: string }>(items: T[]): { date: string; items: T[] }[] {
  const groups: { date: string; items: T[] }[] = [];
  let current: { date: string; items: T[] } | null = null;
  for (const it of items) {
    if (!current || current.date !== it.transactionDate) {
      current = { date: it.transactionDate, items: [] };
      groups.push(current);
    }
    current.items.push(it);
  }
  return groups;
}

/** Net total for a day (income − expense) as an exact string. */
export function dayNet(items: LocalTransaction[]): string {
  let n: Decimal = money(0);
  for (const t of items) n = t.type === 'income' ? n.plus(money(t.amount)) : n.minus(money(t.amount));
  return toMoneyString(n);
}
