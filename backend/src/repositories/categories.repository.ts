import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { DEFAULT_CATEGORIES, FALLBACK_CATEGORY_NAME, type TransactionType } from '@expenseflow/shared';
import type { Executor } from '../db/client';
import { categories, type CategoryRow } from '../db/schema';

export const categoriesRepository = {
  list(ex: Executor, userId: string): Promise<CategoryRow[]> {
    return ex
      .select()
      .from(categories)
      .where(eq(categories.userId, userId))
      .orderBy(asc(categories.type), sql`${categories.isDefault} desc`, asc(categories.name));
  },

  changedSince(ex: Executor, userId: string, since: Date): Promise<CategoryRow[]> {
    return ex
      .select()
      .from(categories)
      .where(and(eq(categories.userId, userId), gt(categories.updatedAt, since)));
  },

  async findById(ex: Executor, userId: string, id: string): Promise<CategoryRow | undefined> {
    const [row] = await ex
      .select()
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.id, id)))
      .limit(1);
    return row;
  },

  async findFallback(ex: Executor, userId: string, type: TransactionType): Promise<CategoryRow | undefined> {
    const [row] = await ex
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.userId, userId),
          eq(categories.type, type),
          eq(categories.isDefault, true),
          eq(categories.name, FALLBACK_CATEGORY_NAME),
        ),
      )
      .limit(1);
    return row;
  },

  async create(ex: Executor, data: typeof categories.$inferInsert): Promise<CategoryRow> {
    const [row] = await ex.insert(categories).values(data).returning();
    return row!;
  },

  async update(
    ex: Executor,
    userId: string,
    id: string,
    data: Partial<Pick<CategoryRow, 'name' | 'icon' | 'color'>>,
  ): Promise<CategoryRow | undefined> {
    const [row] = await ex
      .update(categories)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(categories.userId, userId), eq(categories.id, id)))
      .returning();
    return row;
  },

  async delete(ex: Executor, userId: string, id: string): Promise<void> {
    await ex.delete(categories).where(and(eq(categories.userId, userId), eq(categories.id, id)));
  },

  async seedDefaults(ex: Executor, userId: string): Promise<void> {
    await ex
      .insert(categories)
      .values(DEFAULT_CATEGORIES.map((c) => ({ ...c, userId, isDefault: true })))
      .onConflictDoNothing();
  },
};
