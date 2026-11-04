import { and, asc, desc, eq } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { recurringTransactions, type RecurringRow } from '../db/schema';

export const recurringRepository = {
  list(ex: Executor, userId: string): Promise<RecurringRow[]> {
    return ex
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.userId, userId))
      .orderBy(desc(recurringTransactions.isActive), asc(recurringTransactions.nextExecutionDate));
  },

  async findById(ex: Executor, userId: string, id: string): Promise<RecurringRow | undefined> {
    const [row] = await ex
      .select()
      .from(recurringTransactions)
      .where(and(eq(recurringTransactions.userId, userId), eq(recurringTransactions.id, id)))
      .limit(1);
    return row;
  },

  async create(ex: Executor, data: typeof recurringTransactions.$inferInsert): Promise<RecurringRow> {
    const [row] = await ex.insert(recurringTransactions).values(data).returning();
    return row!;
  },

  async update(ex: Executor, userId: string, id: string, data: Partial<typeof recurringTransactions.$inferInsert>): Promise<RecurringRow | undefined> {
    const [row] = await ex
      .update(recurringTransactions)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(recurringTransactions.userId, userId), eq(recurringTransactions.id, id)))
      .returning();
    return row;
  },

  async delete(ex: Executor, userId: string, id: string): Promise<boolean> {
    const rows = await ex
      .delete(recurringTransactions)
      .where(and(eq(recurringTransactions.userId, userId), eq(recurringTransactions.id, id)))
      .returning({ id: recurringTransactions.id });
    return rows.length > 0;
  },

  async reassignCategory(ex: Executor, userId: string, fromId: string, toId: string): Promise<void> {
    await ex
      .update(recurringTransactions)
      .set({ categoryId: toId, updatedAt: new Date() })
      .where(and(eq(recurringTransactions.userId, userId), eq(recurringTransactions.categoryId, fromId)));
  },
};
