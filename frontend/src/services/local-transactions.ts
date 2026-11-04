import { toMoneyString, type TransactionInput } from '@expenseflow/shared';
import { db, type LocalTransaction, type OutboxEntry } from '@/lib/db';
import { uuid } from '@/lib/utils';
import { inFlight, requestSync } from './sync-engine';

export type TransactionDraft = Omit<TransactionInput, 'id'> & { amount: string; notes?: string | null };

type Normalised = Omit<TransactionInput, 'id' | 'amount' | 'notes'> & { amount: string; notes: string | null };

function normalise(d: TransactionDraft): Normalised {
  return {
    type: d.type,
    amount: toMoneyString(d.amount),
    categoryId: d.categoryId,
    description: d.description.trim(),
    notes: d.notes?.trim() ? d.notes.trim() : null,
    paymentMethod: d.paymentMethod,
    transactionDate: d.transactionDate,
  };
}

async function queuedFor(entityId: string): Promise<OutboxEntry[]> {
  return db.outbox.where('entityId').equals(entityId).sortBy('seq');
}

/**
 * Local-first create: the row appears instantly (and offline), then syncs.
 * The client-generated UUID is the server's idempotency key, so retries can't duplicate.
 */
export async function createTransaction(draft: TransactionDraft, id = uuid()): Promise<LocalTransaction> {
  const data = normalise(draft);
  const now = new Date().toISOString();
  const row: LocalTransaction = {
    id,
    ...data,
    hasReceipt: false,
    recurringId: null,
    version: 0,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  };
  await db.transaction('rw', db.transactions, db.outbox, async () => {
    await db.transactions.put(row);
    await db.outbox.add({ op: 'create', entityId: id, payload: data, attempts: 0, nextAttemptAt: 0, status: 'queued', createdAt: Date.now() });
  });
  requestSync();
  return row;
}

/** Coalesces with pending entries: create+update → create, update+update → latest update. */
export async function updateTransaction(id: string, draft: TransactionDraft): Promise<void> {
  const data = normalise(draft);
  await db.transaction('rw', db.transactions, db.outbox, async () => {
    const existing = await db.transactions.get(id);
    if (!existing) throw new Error('Transaction not found on this device');
    const queued = await queuedFor(id);
    const pendingCreate = queued.find((q) => q.op === 'create');
    const pendingUpdate = queued.find((q) => q.op === 'update');

    if (pendingCreate) {
      await db.outbox.update(pendingCreate.seq!, { payload: data, status: 'queued', attempts: 0, nextAttemptAt: 0, lastError: undefined });
    } else if (pendingUpdate) {
      await db.outbox.update(pendingUpdate.seq!, { payload: data, status: 'queued', attempts: 0, nextAttemptAt: 0, lastError: undefined });
    } else {
      await db.outbox.add({
        op: 'update',
        entityId: id,
        payload: data,
        baseVersion: existing.version,
        attempts: 0,
        nextAttemptAt: 0,
        status: 'queued',
        createdAt: Date.now(),
      });
    }
    await db.transactions.put({ ...existing, ...data, updatedAt: new Date().toISOString(), syncStatus: 'pending', syncError: undefined });
  });
  requestSync();
}

/** create+delete cancel out entirely; otherwise pending updates are dropped and a delete is queued. */
export async function deleteTransaction(id: string): Promise<LocalTransaction | undefined> {
  let removed: LocalTransaction | undefined;
  await db.transaction('rw', db.transactions, db.outbox, async () => {
    removed = await db.transactions.get(id);
    const queued = await queuedFor(id);
    // A create that is mid-flight may already exist on the server, so it still needs a delete.
    const pendingCreate = queued.find((q) => q.op === 'create') && !inFlight.has(id);
    await db.outbox.bulkDelete(queued.map((q) => q.seq!));
    await db.transactions.delete(id);
    if (!pendingCreate) {
      await db.outbox.add({ op: 'delete', entityId: id, attempts: 0, nextAttemptAt: 0, status: 'queued', createdAt: Date.now() });
    }
  });
  requestSync();
  return removed;
}

/** Undo for a just-deleted row: re-creates it (as a new pending create if it never synced). */
export async function restoreTransaction(row: LocalTransaction): Promise<void> {
  await db.transaction('rw', db.transactions, db.outbox, async () => {
    const queued = await queuedFor(row.id);
    const pendingDelete = queued.find((q) => q.op === 'delete');
    if (pendingDelete) {
      // Delete not yet sent — simply cancel it.
      await db.outbox.delete(pendingDelete.seq!);
      await db.transactions.put(row);
      return;
    }
    // Delete already synced (or the row never reached the server): re-create under a new id.
    const { id: _id, syncStatus: _s, ...rest } = row;
    void _id;
    void _s;
    const id = uuid();
    await db.transactions.put({ ...rest, id, version: 0, syncStatus: 'pending' });
    await db.outbox.add({
      op: 'create',
      entityId: id,
      payload: normalise(rest as TransactionDraft),
      attempts: 0,
      nextAttemptAt: 0,
      status: 'queued',
      createdAt: Date.now(),
    });
  });
  requestSync();
}

/** Throws away a failed local change and restores the server copy on next pull. */
export async function discardFailedChange(id: string): Promise<void> {
  await db.transaction('rw', db.transactions, db.outbox, async () => {
    const queued = await queuedFor(id);
    await db.outbox.bulkDelete(queued.map((q) => q.seq!));
    await db.transactions.delete(id);
  });
  requestSync({ fullPull: true });
}
