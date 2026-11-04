import { and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import {
  addDaysISO,
  addMonthsISO,
  diffDaysISO,
  endOfMonthISO,
  money,
  percentChange,
  percentOf,
  previousWindow,
  startOfMonthISO,
  subMoney,
  todayISO,
  toMoneyString,
  type CategoryBreakdownDTO,
  type DailyPoint,
  type DateWindow,
  type InsightDTO,
  type MonthlyPoint,
  type OverviewDTO,
  type PeriodTotals,
  type TransactionType,
  type TrendsDTO,
} from '@expenseflow/shared';
import { db } from '../db/client';
import { categories, transactions } from '../db/schema';
import { usersRepository } from '../repositories/users.repository';
import { budgetService } from './budget.service';

const live = isNull(transactions.deletedAt);
const scope = (userId: string, w?: DateWindow) =>
  and(
    eq(transactions.userId, userId),
    live,
    w ? gte(transactions.transactionDate, w.start) : undefined,
    w ? lte(transactions.transactionDate, w.end) : undefined,
  );

async function totals(userId: string, w: DateWindow): Promise<PeriodTotals> {
  const rows = await db()
    .select({
      type: transactions.type,
      total: sql<string>`coalesce(sum(${transactions.amount}), 0)::text`,
      n: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .where(scope(userId, w))
    .groupBy(transactions.type);
  const income = toMoneyString(rows.find((r) => r.type === 'income')?.total ?? '0');
  const expense = toMoneyString(rows.find((r) => r.type === 'expense')?.total ?? '0');
  const savings = subMoney(income, expense);
  return {
    income,
    expense,
    savings,
    savingsRate: percentOf(savings, income, 1),
    transactionCount: rows.reduce((a, r) => a + Number(r.n), 0),
  };
}

async function categoryTotals(userId: string, w: DateWindow, type: TransactionType) {
  return db()
    .select({
      categoryId: transactions.categoryId,
      total: sql<string>`sum(${transactions.amount})::text`,
      n: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .where(and(scope(userId, w), eq(transactions.type, type)))
    .groupBy(transactions.categoryId);
}

async function daily(userId: string, w: DateWindow): Promise<DailyPoint[]> {
  const rows = await db()
    .select({
      date: transactions.transactionDate,
      type: transactions.type,
      total: sql<string>`sum(${transactions.amount})::text`,
    })
    .from(transactions)
    .where(scope(userId, w))
    .groupBy(transactions.transactionDate, transactions.type);
  const map = new Map<string, DailyPoint>();
  const days = Math.min(diffDaysISO(w.end, w.start), 366 * 5);
  for (let i = 0; i <= days; i++) {
    const d = addDaysISO(w.start, i);
    map.set(d, { date: d, income: '0.00', expense: '0.00' });
  }
  for (const r of rows) {
    const p = map.get(r.date);
    if (p) p[r.type] = toMoneyString(r.total);
  }
  return [...map.values()];
}

function isWholeMonth(w: DateWindow) {
  return w.start === startOfMonthISO(w.start) && w.end === endOfMonthISO(w.start);
}

export const analyticsService = {
  async overview(userId: string, w: DateWindow): Promise<OverviewDTO> {
    const prev = previousWindow(w);
    const [current, previous, allTime] = await Promise.all([
      totals(userId, w),
      totals(userId, prev),
      db()
        .select({
          balance: sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amount} else -${transactions.amount} end), 0)::text`,
        })
        .from(transactions)
        .where(scope(userId)),
    ]);
    return {
      range: { from: w.start, to: w.end },
      previousRange: { from: prev.start, to: prev.end },
      current,
      previous,
      balance: toMoneyString(allTime[0]?.balance ?? '0'),
      change: {
        income: percentChange(current.income, previous.income),
        expense: percentChange(current.expense, previous.expense),
        savings: percentChange(current.savings, previous.savings),
      },
    };
  },

  async monthly(userId: string, months: number, today: string): Promise<MonthlyPoint[]> {
    const start = addMonthsISO(startOfMonthISO(today), -(months - 1));
    const end = endOfMonthISO(today);
    const rows = await db()
      .select({
        month: sql<string>`to_char(${transactions.transactionDate}, 'YYYY-MM')`,
        type: transactions.type,
        total: sql<string>`sum(${transactions.amount})::text`,
      })
      .from(transactions)
      .where(scope(userId, { start, end }))
      .groupBy(sql`1`, transactions.type);
    const points: MonthlyPoint[] = [];
    for (let i = 0; i < months; i++) {
      const month = addMonthsISO(start, i).slice(0, 7);
      const income = toMoneyString(rows.find((r) => r.month === month && r.type === 'income')?.total ?? '0');
      const expense = toMoneyString(rows.find((r) => r.month === month && r.type === 'expense')?.total ?? '0');
      points.push({ month, income, expense, savings: subMoney(income, expense) });
    }
    return points;
  },

  async categories(userId: string, w: DateWindow, type: TransactionType): Promise<CategoryBreakdownDTO> {
    const prev = previousWindow(w);
    const [cur, before, cats] = await Promise.all([
      categoryTotals(userId, w, type),
      categoryTotals(userId, prev, type),
      db().select().from(categories).where(eq(categories.userId, userId)),
    ]);
    const total = toMoneyString(cur.reduce((acc, r) => acc.plus(money(r.total)), money(0)));
    const items = cur
      .map((r) => {
        const c = cats.find((x) => x.id === r.categoryId);
        return {
          categoryId: r.categoryId,
          name: c?.name ?? 'Unknown',
          color: c?.color ?? '#64748B',
          icon: c?.icon ?? 'circle-ellipsis',
          total: toMoneyString(r.total),
          previousTotal: toMoneyString(before.find((b) => b.categoryId === r.categoryId)?.total ?? '0'),
          percent: percentOf(r.total, total, 1) ?? 0,
          count: Number(r.n),
        };
      })
      .sort((a, b) => money(b.total).comparedTo(money(a.total)));
    return { type, total, items };
  },

  async trends(userId: string, w: DateWindow): Promise<TrendsDTO> {
    const [cur, prev] = await Promise.all([daily(userId, w), daily(userId, previousWindow(w))]);
    return { daily: cur, previousDaily: prev };
  },

  /** Data-driven insights; every message is derived from the user's actual records. */
  async insights(userId: string, w: DateWindow): Promise<InsightDTO[]> {
    const user = await usersRepository.findById(db(), userId);
    const currency = user?.preferredCurrency ?? 'INR';
    const periodLabel = isWholeMonth(w) ? 'last month' : 'the previous period';
    const [overview, breakdown, budgets, biggest] = await Promise.all([
      this.overview(userId, w),
      this.categories(userId, w, 'expense'),
      budgetService.list(userId),
      db()
        .select({ description: transactions.description, amount: transactions.amount, date: transactions.transactionDate })
        .from(transactions)
        .where(and(scope(userId, w), eq(transactions.type, 'expense')))
        .orderBy(desc(transactions.amount))
        .limit(1),
    ]);
    const out: InsightDTO[] = [];
    const fmt = (v: string) => formatMoney(v, currency);

    // 1. Top category
    const top = breakdown.items[0];
    if (top) {
      out.push({
        id: 'top-category',
        tone: 'neutral',
        icon: top.icon,
        title: `Most spent on ${top.name}`,
        message: `You spent the most on ${top.name} — ${fmt(top.total)}, ${top.percent}% of your expenses.`,
      });
    }

    // 2. Biggest category increase vs previous period (ignore tiny bases)
    const movers = breakdown.items
      .map((i) => ({ ...i, change: percentChange(i.total, i.previousTotal, 0) }))
      .filter((i) => i.change !== null && money(i.previousTotal).gt(0) && Math.abs(i.change) >= 10);
    const riser = [...movers].sort((a, b) => b.change! - a.change!)[0];
    if (riser && riser.change! > 0) {
      out.push({
        id: `rise-${riser.categoryId}`,
        tone: 'negative',
        icon: 'trending-up',
        title: `${riser.name} is up ${riser.change}%`,
        message: `Your ${riser.name.toLowerCase()} expenses increased by ${riser.change}% compared to ${periodLabel}.`,
      });
    }
    const faller = [...movers].sort((a, b) => a.change! - b.change!)[0];
    if (faller && faller.change! < 0) {
      out.push({
        id: `drop-${faller.categoryId}`,
        tone: 'positive',
        icon: 'trending-down',
        title: `${faller.name} is down ${Math.abs(faller.change!)}%`,
        message: `You cut ${faller.name.toLowerCase()} spending by ${Math.abs(faller.change!)}% compared to ${periodLabel}.`,
      });
    }

    // 3. Savings
    const { current } = overview;
    if (money(current.income).gt(0)) {
      if (money(current.savings).gte(0)) {
        out.push({
          id: 'savings-rate',
          tone: (current.savingsRate ?? 0) >= 20 ? 'positive' : 'neutral',
          icon: 'piggy-bank',
          title: `${current.savingsRate}% saved`,
          message: `You saved ${current.savingsRate}% of your income (${fmt(current.savings)}) this period.`,
        });
      } else {
        out.push({
          id: 'overspent',
          tone: 'negative',
          icon: 'alert-triangle',
          title: 'Spending exceeds income',
          message: `You spent ${fmt(subMoney(current.expense, current.income))} more than you earned this period.`,
        });
      }
    }

    // 4. Overall expense change
    if (overview.change.expense !== null && Math.abs(overview.change.expense) >= 5) {
      const up = overview.change.expense > 0;
      out.push({
        id: 'expense-change',
        tone: up ? 'warning' : 'positive',
        icon: up ? 'arrow-up-right' : 'arrow-down-right',
        title: `Spending ${up ? 'up' : 'down'} ${Math.abs(overview.change.expense)}%`,
        message: `Total expenses are ${up ? 'higher' : 'lower'} by ${Math.abs(overview.change.expense)}% compared to ${periodLabel}.`,
      });
    }

    // 5. Budgets near/over limit
    for (const b of budgets) {
      if (!b.current || b.current.status === 'ok') continue;
      const name = b.categoryId ? breakdown.items.find((i) => i.categoryId === b.categoryId)?.name ?? (await categoryName(userId, b.categoryId)) : 'overall';
      const exceeded = b.current.status === 'exceeded';
      out.push({
        id: `budget-${b.id}`,
        tone: exceeded ? 'negative' : 'warning',
        icon: 'wallet',
        title: exceeded ? `${capitalize(name)} budget exceeded` : `${capitalize(name)} budget at ${Math.round(b.current.percent)}%`,
        message: exceeded
          ? `Your ${name} budget is over by ${fmt(subMoney(b.current.spent, b.amount))}.`
          : `Your ${name} budget is almost exhausted — ${fmt(b.current.remaining)} left.`,
      });
    }

    // 6. Largest expense + daily average
    const big = biggest[0];
    if (big) {
      out.push({
        id: 'largest-expense',
        tone: 'neutral',
        icon: 'receipt',
        title: 'Largest expense',
        message: `Your biggest expense was ${big.description} (${fmt(big.amount)}) on ${big.date}.`,
      });
    }
    const today = todayISO(user?.timezone ?? 'UTC');
    const effectiveEnd = w.end < today ? w.end : today;
    const elapsed = diffDaysISO(effectiveEnd, w.start) + 1;
    if (elapsed > 1 && money(current.expense).gt(0)) {
      out.push({
        id: 'daily-average',
        tone: 'neutral',
        icon: 'calendar',
        title: 'Daily average',
        message: `You're averaging ${fmt(toMoneyString(money(current.expense).div(elapsed)))} in spending per day.`,
      });
    }
    return out;
  },
};

async function categoryName(userId: string, id: string): Promise<string> {
  const [c] = await db().select({ name: categories.name }).from(categories).where(and(eq(categories.userId, userId), eq(categories.id, id)));
  return c?.name ?? 'category';
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function formatMoney(value: string, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value));
  } catch {
    return `${currency} ${value}`;
  }
}
