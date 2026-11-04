import { QueryClient } from '@tanstack/react-query';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import { ApiError, isNetworkError } from './api';
import { db } from './db';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 7 * 24 * 60 * 60 * 1000, // keep for offline persistence
      networkMode: 'offlineFirst',
      refetchOnWindowFocus: true,
      retry: (count, err) => {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
        if (isNetworkError(err)) return count < 1;
        return count < 2;
      },
    },
    mutations: { networkMode: 'online', retry: false },
  },
});

const KEY = 'tanstack';

/** IndexedDB-backed persister so dashboards and analytics render offline. */
export const idbPersister: Persister = {
  persistClient: async (client: PersistedClient) => {
    await db.queryCache.put({ key: KEY, value: client });
  },
  restoreClient: async () => (await db.queryCache.get(KEY))?.value as PersistedClient | undefined,
  removeClient: async () => {
    await db.queryCache.delete(KEY);
  },
};

export const qk = {
  me: ['me'] as const,
  categories: ['categories'] as const,
  budgets: ['budgets'] as const,
  recurring: ['recurring'] as const,
  notifications: ['notifications'] as const,
  analytics: (kind: string, ...args: unknown[]) => ['analytics', kind, ...args] as const,
};
