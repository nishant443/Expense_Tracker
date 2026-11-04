import { and, eq, gte, lte, sql } from 'drizzle-orm';
import {
  budgetWindow,
  money,
  percentOf,
  subMoney,
  todayISO,
  toMoneyString,
  type BudgetDTO,
  type BudgetInput,
  type DateWindow,
} from '@expenseflow/shared';
import { db, type Executor } from '../db/client';
import { budgetAlerts, budgets, categories, transactions, type BudgetRow } from '../db/schema';
import { usersRepository } from '../repositories/users.repository';
import { conflict, isUniqueViolation, notFound } from '../utils/errors';
import { categoryService } from './category.service';
import { notificationService } from './notification.service';

type BudgetStatus = NonNullable<BudgetDTO['current']>['status'];

/** Maps a consumption percentage to a status using the user's thresholds (e.g. 70/90/100). */
export function budgetStatus(percent: number, thresholds: number[]): BudgetStatus {
  const sorted = [...thresholds].sort((a, b) => a - b);
  if (percent > 100 || (percent >= 100 && sorted.includes(100))) return 'exceeded';
  const below100 = sorted.filter((t) => t < 100);
  if (below100.length >= 2 && percent >= below100[below100.length - 1]!) return 'danger';
  if (below100.length >= 1 && percent >= below100[0]!) return 'warning';
  return 'ok';
}

/** Thresholds crossed by `percent`, ascending. */
export function crossedThresholds(percent: number, thresholds: number[]): number[] {
  return [...thresholds].sort((a, b) => a - b).filter((t) => percent >= t);
}

async function spentInWindow(ex: Executor, userId: string, categoryId: string | null, w: DateWindow): Promise<string> {
  const [row] = await ex
    .select({ total: sql<string>`coalesce(sum(${transactions.amount}), 0)::text` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, 'expense'),
        sql`${transactions.deletedAt} is null`,
        gte(transactions.transactionDate, w.start),
        lte(transactions.transactionDate, w.end),
        categoryId ? eq(transactions.categoryId, categoryId) : undefined,
      ),
    );
  return toMoneyString(row?.total ?? '0');
}

async function toDTO(ex: Executor, b: BudgetRow, today: string, thresholds: number[]): Promise<BudgetDTO> {
  const w = budgetWindow(b, today);
  let current: BudgetDTO['current'] = null;
  if (w) {
    const spent = await spentInWindow(ex, b.userId, b.categoryId, w);
    const percent = percentOf(spent, b.amount, 1) ?? 0;
    current = {
      windowStart: w.start,
      windowEnd: w.end,
      spent,
      remaining: subMoney(b.amount, spent),
      percent,
      status: budgetStatus(percent, thresholds),
    };
  }
  return {
    id: b.id,
    categoryId: b.categoryId,
    amount: b.amount,
    period: b.period,
    startDate: b.startDate,
    endDate: b.endDate,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    current,
  };
}

async function userContext(userId: string) {
  const user = await usersRepository.findById(db(), userId);
  return { today: todayISO(user?.timezone ?? 'UTC'), thresholds: user?.alertThresholds ?? [70, 90, 100], user };
}

async function validateCategory(userId: string, categoryId: string | null) {
  if (categoryId) await categoryService.assertUsable(userId, categoryId, 'expense');
}

export const budgetService = {
  async list(userId: string): Promise<BudgetDTO[]> {
    const { today, thresholds } = await userContext(userId);
    const rows = await db().select().from(budgets).where(eq(budgets.userId, userId)).orderBy(sql`${budgets.categoryId} nulls first`, budgets.createdAt);
    return Promise.all(rows.map((b) => toDTO(db(), b, today, thresholds)));
  },

  async get(userId: string, id: string): Promise<BudgetDTO> {
    const { today, thresholds } = await userContext(userId);
    const [b] = await db().select().from(budgets).where(and(eq(budgets.userId, userId), eq(budgets.id, id)));
    if (!b) throw notFound('Budget');
    return toDTO(db(), b, today, thresholds);
  },

  async create(userId: string, input: BudgetInput & { amount: string }): Promise<BudgetDTO> {
    await validateCategory(userId, input.categoryId);
    try {
      const [row] = await db()
        .insert(budgets)
        .values({ userId, categoryId: input.categoryId, amount: input.amount, period: input.period, startDate: input.startDate, endDate: input.endDate })
        .returning();
      await this.evaluateAlerts(userId, [(await userContext(userId)).today]);
      return this.get(userId, row!.id);
    } catch (err) {
      if (isUniqueViolation(err, 'budgets_user_scope_uq')) throw conflict('A budget for this category and period already exists', 'DUPLICATE');
      throw err;
    }
  },

  async update(userId: string, id: string, input: BudgetInput & { amount: string }): Promise<BudgetDTO> {
    await validateCategory(userId, input.categoryId);
    try {
      const rows = await db()
        .update(budgets)
        .set({ categoryId: input.categoryId, amount: input.amount, period: input.period, startDate: input.startDate, endDate: input.endDate, updatedAt: new Date() })
        .where(and(eq(budgets.userId, userId), eq(budgets.id, id)))
        .returning({ id: budgets.id });
      if (!rows.length) throw notFound('Budget');
    } catch (err) {
      if (isUniqueViolation(err, 'budgets_user_scope_uq')) throw conflict('A budget for this category and period already exists', 'DUPLICATE');
      throw err;
    }
    await this.evaluateAlerts(userId, [(await userContext(userId)).today]);
    return this.get(userId, id);
  },

  async remove(userId: string, id: string): Promise<void> {
    const rows = await db().delete(budgets).where(and(eq(budgets.userId, userId), eq(budgets.id, id))).returning({ id: budgets.id });
    if (!rows.length) throw notFound('Budget');
  },

  /**
   * Re-evaluates budgets whose period contains any of `dates` and records each newly crossed
   * threshold exactly once per budget period (unique constraint on budget_alerts). A notification is
   * created only for the highest threshold newly crossed, so one large expense does not spam 3 alerts.
   */
  async evaluateAlerts(userId: string, dates: string[]): Promise<void> {
    const { thresholds, user } = await userContext(userId);
    if (!user) return;
    const rows = await db().select().from(budgets).where(eq(budgets.userId, userId));
    const seen = new Set<string>();

    for (const b of rows) {
      for (const d of dates) {
        const w = budgetWindow(b, d);
        if (!w) continue;
        const key = `${b.id}:${w.start}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const spent = await spentInWindow(db(), userId, b.categoryId, w);
        const percent = percentOf(spent, b.amount, 2) ?? 0;
        const crossed = crossedThresholds(percent, thresholds);
        if (!crossed.length) continue;

        const inserted = await db()
          .insert(budgetAlerts)
          .values(crossed.map((threshold) => ({ budgetId: b.id, periodStart: w.start, threshold })))
          .onConflictDoNothing()
          .returning({ threshold: budgetAlerts.threshold });
        if (!inserted.length || !user.notificationPrefs.budgetAlerts) continue;

        const top = Math.max(...inserted.map((i) => i.threshold));
        let label = 'Overall budget';
        if (b.categoryId) {
          const [c] = await db().select({ name: categories.name }).from(categories).where(eq(categories.id, b.categoryId));
          label = `${c?.name ?? 'Category'} budget`;
        }
        const exceeded = money(spent).gt(b.amount);
        await notificationService.create(db(), userId, {
          type: 'budget',
          title: exceeded ? `${label} exceeded` : `${label} at ${top}%`,
          message: exceeded
            ? `You've spent ${spent} of ${b.amount} ${user.preferredCurrency} for ${w.start} – ${w.end}.`
            : `You've used ${percent.toFixed(0)}% (${spent} of ${b.amount} ${user.preferredCurrency}) for this period.`,
        });
      }
    }
  },
};
