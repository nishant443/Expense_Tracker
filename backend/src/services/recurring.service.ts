import { and, eq, sql } from 'drizzle-orm';
import {
  compareISO,
  occurrenceAt,
  occurrenceIndexOnOrAfter,
  todayISO,
  type RecurringInput,
} from '@expenseflow/shared';
import { randomUUID } from 'node:crypto';
import { db } from '../db/client';
import { recurringTransactions, transactions, users, type RecurringRow } from '../db/schema';
import { recurringRepository } from '../repositories/recurring.repository';
import { usersRepository } from '../repositories/users.repository';
import { notFound } from '../utils/errors';
import { logger } from '../utils/logger';
import { budgetService } from './budget.service';
import { categoryService } from './category.service';
import { notificationService } from './notification.service';

type Input = RecurringInput & { amount: string; isActive: boolean };

const MAX_CATCH_UP = 366;

/** First occurrence on/after `from`, or null when past the end date. */
export function computeNext(rule: Pick<RecurringRow, 'startDate' | 'frequency' | 'endDate'>, from: string): string | null {
  const n = occurrenceIndexOnOrAfter(rule.startDate, rule.frequency, from);
  const next = occurrenceAt(rule.startDate, rule.frequency, n);
  if (rule.endDate && compareISO(next, rule.endDate) > 0) return null;
  return next;
}

/** Due occurrence dates up to and including `today`, starting at `next`. */
export function dueOccurrences(rule: Pick<RecurringRow, 'startDate' | 'frequency' | 'endDate'>, next: string, today: string): string[] {
  const out: string[] = [];
  let n = occurrenceIndexOnOrAfter(rule.startDate, rule.frequency, next);
  for (;;) {
    const d = occurrenceAt(rule.startDate, rule.frequency, n);
    if (compareISO(d, today) > 0) break;
    if (rule.endDate && compareISO(d, rule.endDate) > 0) break;
    out.push(d);
    if (out.length >= MAX_CATCH_UP) break;
    n++;
  }
  return out;
}

async function todayFor(userId: string): Promise<string> {
  const u = await usersRepository.findById(db(), userId);
  return todayISO(u?.timezone ?? 'UTC');
}

export const recurringService = {
  list: (userId: string) => recurringRepository.list(db(), userId),

  async create(userId: string, input: Input): Promise<RecurringRow> {
    await categoryService.assertUsable(userId, input.categoryId, input.type);
    const nextExecutionDate = computeNext({ ...input, endDate: input.endDate ?? null }, input.startDate);
    const row = await recurringRepository.create(db(), {
      ...input,
      userId,
      nextExecutionDate,
      isActive: input.isActive && nextExecutionDate !== null,
    });
    await this.processRule(row.id);
    return (await recurringRepository.findById(db(), userId, row.id))!;
  },

  async update(userId: string, id: string, input: Input): Promise<RecurringRow> {
    const existing = await recurringRepository.findById(db(), userId, id);
    if (!existing) throw notFound('Recurring transaction');
    await categoryService.assertUsable(userId, input.categoryId, input.type);

    // Resume from today (or the start date if in the future); never re-create past occurrences.
    const today = await todayFor(userId);
    const from = compareISO(input.startDate, today) > 0 ? input.startDate : today;
    const scheduleChanged = existing.startDate !== input.startDate || existing.frequency !== input.frequency;
    const resumeFrom =
      scheduleChanged || !existing.nextExecutionDate || compareISO(existing.nextExecutionDate, from) < 0 ? from : existing.nextExecutionDate;
    const nextExecutionDate = computeNext({ ...input, endDate: input.endDate ?? null }, resumeFrom);

    await recurringRepository.update(db(), userId, id, {
      ...input,
      nextExecutionDate,
      isActive: input.isActive && nextExecutionDate !== null,
    });
    await this.processRule(id);
    return (await recurringRepository.findById(db(), userId, id))!;
  },

  async remove(userId: string, id: string): Promise<void> {
    // Generated transactions remain (recurring_id → NULL); history is preserved.
    if (!(await recurringRepository.delete(db(), userId, id))) throw notFound('Recurring transaction');
  },

  /**
   * Materialises due occurrences for a single rule inside a transaction holding a row lock.
   * Idempotent: the (recurring_id, occurrence_date) unique constraint makes re-runs no-ops.
   */
  async processRule(ruleId: string): Promise<number> {
    const result = await db().transaction(async (tx) => {
      const [locked] = await tx
        .select({ rule: recurringTransactions, timezone: users.timezone, prefs: users.notificationPrefs })
        .from(recurringTransactions)
        .innerJoin(users, eq(users.id, recurringTransactions.userId))
        .where(and(eq(recurringTransactions.id, ruleId), eq(recurringTransactions.isActive, true)))
        .for('update', { of: recurringTransactions, skipLocked: true });
      if (!locked?.rule.nextExecutionDate) return null;

      const { rule } = locked;
      const today = todayISO(locked.timezone);
      const dates = dueOccurrences(rule, rule.nextExecutionDate!, today);
      if (!dates.length) return null;

      const now = new Date();
      const inserted = await tx
        .insert(transactions)
        .values(
          dates.map((d) => ({
            id: randomUUID(),
            userId: rule.userId,
            categoryId: rule.categoryId,
            type: rule.type,
            amount: rule.amount,
            description: rule.description,
            paymentMethod: rule.paymentMethod,
            transactionDate: d,
            recurringId: rule.id,
            occurrenceDate: d,
            createdAt: now,
            updatedAt: now,
          })),
        )
        .onConflictDoNothing({ target: [transactions.recurringId, transactions.occurrenceDate] })
        .returning({ date: transactions.transactionDate });

      const last = dates[dates.length - 1]!;
      const next = computeNext(rule, occurrenceAt(rule.startDate, rule.frequency, occurrenceIndexOnOrAfter(rule.startDate, rule.frequency, last) + 1));
      await tx
        .update(recurringTransactions)
        .set({ nextExecutionDate: next, isActive: next !== null, updatedAt: now })
        .where(eq(recurringTransactions.id, rule.id));

      if (inserted.length && locked.prefs.recurringActivity) {
        await notificationService.create(tx, rule.userId, {
          type: 'recurring',
          title: `${rule.description} recorded`,
          message:
            inserted.length === 1
              ? `A recurring ${rule.type} of ${rule.amount} was added for ${inserted[0]!.date}.`
              : `${inserted.length} recurring ${rule.type}s of ${rule.amount} were added.`,
        });
      }
      return { userId: rule.userId, type: rule.type, dates: inserted.map((i) => i.date) };
    });

    if (result?.type === 'expense' && result.dates.length) {
      await budgetService.evaluateAlerts(result.userId, result.dates).catch((err) => logger.error({ err }, 'alert eval failed'));
    }
    return result?.dates.length ?? 0;
  },

  /** Scheduler entry point: process every due rule (safe to run on multiple instances). */
  async processDue(): Promise<number> {
    const due = await db()
      .select({ id: recurringTransactions.id })
      .from(recurringTransactions)
      .innerJoin(users, eq(users.id, recurringTransactions.userId))
      .where(
        and(
          eq(recurringTransactions.isActive, true),
          sql`${recurringTransactions.nextExecutionDate} <= (now() at time zone ${users.timezone})::date`,
        ),
      )
      .limit(500);
    let total = 0;
    for (const { id } of due) {
      try {
        total += await this.processRule(id);
      } catch (err) {
        logger.error({ err, ruleId: id }, 'Failed to process recurring rule');
      }
    }
    return total;
  },
};
