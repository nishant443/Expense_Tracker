import type { SyncPullResponse, TransactionDTO } from '@expenseflow/shared';
import { toast } from 'sonner';
import { api, ApiError, isNetworkError } from '@/lib/api';
import { db, getMeta, setMeta, type LocalTransaction, type OutboxEntry } from '@/lib/db';
import { queryClient } from '@/lib/query-client';
import { useSyncStore } from '@/stores/sync';

/**
 * Offline sync engine
 *  1. push: flush the outbox in FIFO order (idempotent creates, versioned updates, soft deletes)
 *  2. pull: fetch server deltas since the last cursor and merge into IndexedDB
 * Triggers: start, `online`, tab focus, interval, enqueue, and Background Sync (when supported).
 */

const INTERVAL_MS = 60_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const CURSOR_KEY = 'syncCursor';

let started = false;
let running: Promise<void> | null = null;
let rerun = false;
let debounce: ReturnType<typeof setTimeout> | null = null;
let forceFullPull = false;

function setPhase(patch: Parameters<ReturnType<typeof useSyncStore.getState>['set']>[0]) {
  useSyncStore.getState().set(patch);
}

function backoff(attempts: number): number {
  const base = Math.min(MAX_BACKOFF_MS, 2_000 * 2 ** attempts);
  return base / 2 + Math.random() * (base / 2);
}

const toLocal = (t: TransactionDTO): LocalTransaction => ({ ...t, syncStatus: 'synced' });

/** Entity ids whose outbox entry is currently being sent (see local-transactions). */
export const inFlight = new Set<string>();

/**
 * After a successful create/update, settle the outbox entry. If the user edited the row while
 * the request was in flight, the entry is converted into an update based on the new server
 * version instead of being dropped, so no edit is lost.
 */
async function settle(entry: OutboxEntry, row: TransactionDTO) {
  await db.transaction('rw', db.transactions, db.outbox, async () => {
    const current = await db.outbox.get(entry.seq!);
    if (!current) {
      // Entry removed meanwhile (row deleted locally → a delete op was queued).
      return;
    }
    if (JSON.stringify(current.payload) !== JSON.stringify(entry.payload)) {
      await db.outbox.update(entry.seq!, { op: 'update', baseVersion: row.version, attempts: 0, nextAttemptAt: 0 });
      await db.transactions.update(entry.entityId, { version: row.version });
      return;
    }
    await db.transactions.put(toLocal(row));
    await db.outbox.delete(entry.seq!);
  });
}

async function pushOne(entry: OutboxEntry): Promise<'done' | 'stop'> {
  inFlight.add(entry.entityId);
  try {
    if (entry.op === 'create') {
      const row = await api.post<TransactionDTO>('/transactions', { id: entry.entityId, ...entry.payload });
      await settle(entry, row);
    } else if (entry.op === 'update') {
      try {
        const row = await api.put<TransactionDTO>(`/transactions/${entry.entityId}`, { ...entry.payload, version: entry.baseVersion });
        await settle(entry, row);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'VERSION_CONFLICT') {
          // Conflict resolution: server wins; the user is told their edit was superseded.
          const current = (e.details as { current?: TransactionDTO } | undefined)?.current;
          await db.transaction('rw', db.transactions, db.outbox, async () => {
            if (current && !current.deletedAt) await db.transactions.put(toLocal(current));
            else await db.transactions.delete(entry.entityId);
            await db.outbox.delete(entry.seq!);
          });
          toast.warning('Edit conflict resolved', {
            description: `“${entry.payload?.description}” was changed on another device. The latest version was kept.`,
          });
          return 'done';
        }
        if (e instanceof ApiError && e.status === 404) {
          await db.transaction('rw', db.transactions, db.outbox, async () => {
            await db.transactions.delete(entry.entityId);
            await db.outbox.delete(entry.seq!);
          });
          toast.info('A transaction you edited was deleted on another device.');
          return 'done';
        }
        throw e;
      }
    } else {
      try {
        await api.delete(`/transactions/${entry.entityId}`);
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 404)) throw e;
      }
      await db.outbox.delete(entry.seq!);
    }
    return 'done';
  } catch (e) {
    if (isNetworkError(e) || (e instanceof ApiError && (e.status >= 500 || e.status === 429 || e.status === 401))) {
      await db.outbox.update(entry.seq!, {
        attempts: entry.attempts + 1,
        nextAttemptAt: Date.now() + backoff(entry.attempts),
        lastError: (e as Error).message,
      });
      return 'stop'; // keep FIFO ordering: retry later
    }
    // Permanent failure (validation etc.) — surface it and move on.
    const msg = e instanceof ApiError ? e.message : 'Sync failed';
    await db.transaction('rw', db.transactions, db.outbox, async () => {
      await db.outbox.update(entry.seq!, { status: 'failed', lastError: msg });
      await db.transactions.update(entry.entityId, { syncStatus: 'failed', syncError: msg });
    });
    return 'done';
  } finally {
    inFlight.delete(entry.entityId);
  }
}

async function push(): Promise<boolean> {
  let changed = false;
  const now = Date.now();
  const queue = await db.outbox.orderBy('seq').filter((e) => e.status === 'queued').toArray();
  for (const entry of queue) {
    if (entry.nextAttemptAt > now) break;
    const r = await pushOne(entry);
    if (r === 'stop') break;
    changed = true;
  }
  return changed;
}

async function pull(): Promise<boolean> {
  let cursor = forceFullPull ? undefined : await getMeta<string>(CURSOR_KEY);
  forceFullPull = false;
  let changed = false;
  for (let page = 0; page < 200; page++) {
    const res = await api.get<SyncPullResponse>('/sync/pull', { query: { cursor } });
    const pendingIds = new Set((await db.outbox.toArray()).map((e) => e.entityId));
    await db.transaction('rw', db.transactions, db.categories, async () => {
      const upserts: LocalTransaction[] = [];
      const deletes: string[] = [];
      for (const t of res.transactions) {
        if (pendingIds.has(t.id)) continue; // local edits win until pushed
        if (t.deletedAt) deletes.push(t.id);
        else upserts.push(toLocal(t));
      }
      if (upserts.length) await db.transactions.bulkPut(upserts);
      if (deletes.length) await db.transactions.bulkDelete(deletes);
      if (upserts.length || deletes.length) changed = true;
      if (res.categories.length) {
        const ids = new Set(res.categories.map((c) => c.id));
        const stale = (await db.categories.toCollection().primaryKeys()).filter((id) => !ids.has(id));
        await db.categories.bulkPut(res.categories);
        if (stale.length) await db.categories.bulkDelete(stale);
      }
    });
    cursor = res.cursor;
    await setMeta(CURSOR_KEY, cursor);
    if (!res.hasMore) break;
  }
  return changed;
}

async function runOnce(): Promise<void> {
  if (!navigator.onLine) {
    setPhase({ phase: 'offline', online: false });
    return;
  }
  setPhase({ phase: 'syncing', online: true, lastError: null });
  try {
    const pushed = await push();
    const pulled = await pull();
    // Pushes may have succeeded after a pull started — push again cheaply if queue changed.
    if (pushed || pulled) {
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
      void queryClient.invalidateQueries({ queryKey: ['budgets'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
    setPhase({ phase: 'idle', lastSyncedAt: Date.now() });
  } catch (e) {
    if (isNetworkError(e)) setPhase({ phase: 'offline', online: navigator.onLine });
    else setPhase({ phase: 'error', lastError: (e as Error).message });
  }
}

/** Runs a sync, coalescing concurrent requests; one tab at a time via Web Locks. */
export function syncNow(): Promise<void> {
  if (running) {
    rerun = true;
    return running;
  }
  const exec = async () => {
    do {
      rerun = false;
      if ('locks' in navigator && navigator.locks) {
        await navigator.locks.request('ef-sync', { ifAvailable: true }, async (lock) => {
          if (lock) await runOnce();
        });
      } else {
        await runOnce();
      }
    } while (rerun);
  };
  running = exec().finally(() => (running = null));
  return running;
}

export function requestSync(opts: { fullPull?: boolean } = {}) {
  if (opts.fullPull) forceFullPull = true;
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => void syncNow(), 250);
  if (!navigator.onLine) void registerBackgroundSync();
}

async function registerBackgroundSync() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    const sync = (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } })?.sync;
    await sync?.register('ef-sync');
  } catch {
    /* Background Sync unsupported — online/focus/interval triggers cover it */
  }
}

export function startSyncEngine(): () => void {
  if (started) return () => {};
  started = true;
  const onOnline = () => {
    setPhase({ online: true });
    void syncNow();
  };
  const onOffline = () => setPhase({ online: false, phase: 'offline' });
  const onVisible = () => document.visibilityState === 'visible' && void syncNow();
  const onSwMessage = (e: MessageEvent) => e.data?.type === 'SYNC_REQUESTED' && void syncNow();

  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVisible);
  navigator.serviceWorker?.addEventListener('message', onSwMessage);
  const timer = setInterval(() => void syncNow(), INTERVAL_MS);
  void syncNow();

  return () => {
    started = false;
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    document.removeEventListener('visibilitychange', onVisible);
    navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    clearInterval(timer);
  };
}

/** Clears the cursor so the next sync re-downloads everything (used after login). */
export async function resetSyncCursor() {
  await setMeta(CURSOR_KEY, undefined);
}
