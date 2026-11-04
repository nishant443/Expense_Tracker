import Dexie, { type EntityTable } from 'dexie';
import type { CategoryDTO, TransactionDTO, TransactionInput } from '@expenseflow/shared';

export type SyncStatus = 'synced' | 'pending' | 'failed';

export interface LocalTransaction extends TransactionDTO {
  syncStatus: SyncStatus;
  syncError?: string;
}

export type OutboxOp = 'create' | 'update' | 'delete';

export interface OutboxEntry {
  seq?: number;
  op: OutboxOp;
  entityId: string;
  /** Full input for create/update (server-shaped), absent for delete. */
  payload?: Omit<TransactionInput, 'id'>;
  /** Server version the edit was based on (optimistic concurrency). */
  baseVersion?: number;
  attempts: number;
  nextAttemptAt: number;
  status: 'queued' | 'failed';
  lastError?: string;
  createdAt: number;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export interface CacheEntry {
  key: string;
  value: unknown;
}

/**
 * Local-first store. `transactions` mirrors the server (plus pending local edits), `outbox`
 * queues mutations for sync, `queryCache` persists TanStack Query for offline viewing.
 */
class ExpenseFlowDB extends Dexie {
  transactions!: EntityTable<LocalTransaction, 'id'>;
  outbox!: EntityTable<OutboxEntry, 'seq'>;
  categories!: EntityTable<CategoryDTO, 'id'>;
  meta!: EntityTable<MetaEntry, 'key'>;
  queryCache!: EntityTable<CacheEntry, 'key'>;

  constructor() {
    super('expenseflow');
    this.version(1).stores({
      transactions: 'id, transactionDate, categoryId, type, syncStatus, [type+transactionDate]',
      outbox: '++seq, entityId, status, nextAttemptAt',
      categories: 'id, type',
      meta: 'key',
      queryCache: 'key',
    });
  }
}

export const db = new ExpenseFlowDB();

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

/** Wipes all local data (logout / account switch). */
export async function clearLocalData(): Promise<void> {
  await db.transaction('rw', [db.transactions, db.outbox, db.categories, db.meta, db.queryCache], async () => {
    await Promise.all([db.transactions.clear(), db.outbox.clear(), db.categories.clear(), db.meta.clear(), db.queryCache.clear()]);
  });
}

/** Ensures local data belongs to `userId`; clears it if another account used this device. */
export async function bindLocalDataToUser(userId: string): Promise<void> {
  const owner = await getMeta<string>('userId');
  if (owner && owner !== userId) await clearLocalData();
  await setMeta('userId', userId);
}
