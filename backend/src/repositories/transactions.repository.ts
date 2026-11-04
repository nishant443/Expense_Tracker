import { and, asc, desc, eq, gte, ilike, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type { TransactionListQuery } from '@expenseflow/shared';
import type { Executor } from '../db/client';
import { transactions, type TransactionRow } from '../db/schema';
import { badRequest } from '../utils/errors';

type ListCursor = { k: string; id: string };

function encodeCursor(c: ListCursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

function decodeCursor(raw: string): ListCursor {
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as ListCursor;
    if (typeof c.k !== 'string' || typeof c.id !== 'string') throw new Error();
    return c;
  } catch {
    throw badRequest('Invalid cursor');
  }
}

function escapeLike(v: string): string {
  return v.replace(/[\\%_]/g, (m) => `\\${m}`);
}

const live = isNull(transactions.deletedAt);

export const transactionsRepository = {
  async findById(ex: Executor, userId: string, id: string, includeDeleted = false): Promise<TransactionRow | undefined> {
    const [row] = await ex
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.id, id), includeDeleted ? undefined : live))
      .limit(1);
    return row;
  },

  /** Unscoped lookup used only to distinguish idempotent replays from id collisions. */
  async findOwnerOf(ex: Executor, id: string): Promise<string | undefined> {
    const [row] = await ex.select({ userId: transactions.userId }).from(transactions).where(eq(transactions.id, id)).limit(1);
    return row?.userId;
  },

  /** Keyset-paginated list. Cursor keys depend on the sort so pagination stays stable. */
  async list(ex: Executor, userId: string, q: TransactionListQuery): Promise<{ rows: TransactionRow[]; nextCursor: string | null }> {
    const filters: (SQL | undefined)[] = [eq(transactions.userId, userId), live];
    if (q.type) filters.push(eq(transactions.type, q.type));
    if (q.categoryId) filters.push(eq(transactions.categoryId, q.categoryId));
    if (q.from) filters.push(gte(transactions.transactionDate, q.from));
    if (q.to) filters.push(lte(transactions.transactionDate, q.to));
    if (q.q) {
      const pattern = `%${escapeLike(q.q)}%`;
      filters.push(or(ilike(transactions.description, pattern), ilike(transactions.notes, pattern)));
    }

    const byAmount = q.sort === 'highest' || q.sort === 'lowest';
    const descending = q.sort === 'newest' || q.sort === 'highest';
    const keyCol = byAmount ? transactions.amount : transactions.transactionDate;

    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      const keyVal = byAmount ? sql`${c.k}::numeric` : sql`${c.k}::date`;
      filters.push(
        descending
          ? sql`(${keyCol}, ${transactions.id}) < (${keyVal}, ${c.id}::uuid)`
          : sql`(${keyCol}, ${transactions.id}) > (${keyVal}, ${c.id}::uuid)`,
      );
    }

    const order = descending ? [desc(keyCol), desc(transactions.id)] : [asc(keyCol), asc(transactions.id)];
    const rows = await ex
      .select()
      .from(transactions)
      .where(and(...filters))
      .orderBy(...order)
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last ? encodeCursor({ k: byAmount ? last.amount : last.transactionDate, id: last.id }) : null;
    return { rows: page, nextCursor };
  },

  /** Inserts unless the id already exists. Returns the inserted row or undefined on conflict. */
  async insertIfAbsent(ex: Executor, data: typeof transactions.$inferInsert): Promise<TransactionRow | undefined> {
    const now = new Date();
    const [row] = await ex
      .insert(transactions)
      .values({ createdAt: now, updatedAt: now, ...data })
      .onConflictDoNothing()
      .returning();
    return row;
  },

  /** Optimistic-concurrency update. Returns undefined when the version did not match. */
  async updateVersioned(
    ex: Executor,
    userId: string,
    id: string,
    expectedVersion: number,
    data: Partial<typeof transactions.$inferInsert>,
  ): Promise<TransactionRow | undefined> {
    const [row] = await ex
      .update(transactions)
      .set({ ...data, version: sql`${transactions.version} + 1`, updatedAt: new Date() })
      .where(
        and(eq(transactions.userId, userId), eq(transactions.id, id), eq(transactions.version, expectedVersion), live),
      )
      .returning();
    return row;
  },

  async update(ex: Executor, userId: string, id: string, data: Partial<typeof transactions.$inferInsert>): Promise<TransactionRow | undefined> {
    const [row] = await ex
      .update(transactions)
      .set({ ...data, version: sql`${transactions.version} + 1`, updatedAt: new Date() })
      .where(and(eq(transactions.userId, userId), eq(transactions.id, id), live))
      .returning();
    return row;
  },

  async softDelete(ex: Executor, userId: string, id: string): Promise<TransactionRow | undefined> {
    const now = new Date();
    const [row] = await ex
      .update(transactions)
      .set({ deletedAt: now, updatedAt: now, version: sql`${transactions.version} + 1` })
      .where(and(eq(transactions.userId, userId), eq(transactions.id, id), live))
      .returning();
    return row;
  },

  /** Moves all of a user's transactions from one category to another (used before deleting a category). */
  async reassignCategory(ex: Executor, userId: string, fromId: string, toId: string): Promise<void> {
    await ex
      .update(transactions)
      .set({ categoryId: toId, updatedAt: new Date(), version: sql`${transactions.version} + 1` })
      .where(and(eq(transactions.userId, userId), eq(transactions.categoryId, fromId)));
  },

  /** Delta feed for sync: rows (including tombstones) after the composite (updated_at, id) cursor. */
  changedSince(ex: Executor, userId: string, after: { t: Date; id: string }, limit: number): Promise<TransactionRow[]> {
    return ex
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          sql`(${transactions.updatedAt}, ${transactions.id}) > (${after.t.toISOString()}::timestamptz, ${after.id}::uuid)`,
        ),
      )
      .orderBy(asc(transactions.updatedAt), asc(transactions.id))
      .limit(limit);
  },
};
