import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import type {
  BudgetDTO,
  BudgetInput,
  CategoryBreakdownDTO,
  CategoryDTO,
  CategoryInput,
  InsightDTO,
  MonthlyPoint,
  NotificationDTO,
  OverviewDTO,
  RecurringDTO,
  RecurringInput,
  TransactionType,
  TrendsDTO,
  UserDTO,
} from '@expenseflow/shared';
import { api } from '@/lib/api';
import { db, type LocalTransaction } from '@/lib/db';
import { qk } from '@/lib/query-client';
import { requestSync } from '@/services/sync-engine';
import { useAuth } from '@/stores/auth';
import { updateCachedUser } from '../auth/session';

// ───────────────── transactions (local-first) ─────────────────

/** All live transactions from IndexedDB, newest first. Re-renders on any local change. */
export function useLocalTransactions(): LocalTransaction[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db.transactions.orderBy('transactionDate').reverse().toArray();
    return rows.filter((r) => !r.deletedAt);
  }, []);
}

export function useLocalTransaction(id: string | undefined) {
  return useLiveQuery(() => (id ? db.transactions.get(id) : undefined), [id]);
}

// ───────────────── categories ─────────────────

/** Categories from IndexedDB (kept fresh by sync); falls back to the API on first load. */
export function useCategories(): { categories: CategoryDTO[]; loading: boolean } {
  const local = useLiveQuery(() => db.categories.toArray(), []);
  const remote = useQuery({
    queryKey: qk.categories,
    queryFn: async () => {
      const list = await api.get<CategoryDTO[]>('/categories');
      await db.categories.bulkPut(list);
      return list;
    },
    enabled: local !== undefined && local.length === 0,
  });
  const categories = (local && local.length ? local : remote.data) ?? [];
  return {
    categories: [...categories].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name)),
    loading: local === undefined || (local.length === 0 && remote.isLoading),
  };
}

export function useCategoryMap(): Map<string, CategoryDTO> {
  const { categories } = useCategories();
  return new Map(categories.map((c) => [c.id, c]));
}

export function useCategoryMutations() {
  const create = useMutation({
    mutationFn: (input: CategoryInput) => api.post<CategoryDTO>('/categories', input),
    onSuccess: (c) => db.categories.put(c),
  });
  const update = useMutation({
    mutationFn: ({ id, ...input }: Partial<CategoryInput> & { id: string }) => api.put<CategoryDTO>(`/categories/${id}`, input),
    onSuccess: (c) => db.categories.put(c),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/categories/${id}`),
    onSuccess: async (_r, id) => {
      await db.categories.delete(id);
      requestSync({ fullPull: true }); // transactions were reassigned server-side
    },
  });
  return { create, update, remove };
}

// ───────────────── budgets ─────────────────

export function useBudgets() {
  return useQuery({ queryKey: qk.budgets, queryFn: () => api.get<BudgetDTO[]>('/budgets') });
}

export function useBudgetMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.budgets });
  return {
    create: useMutation({ mutationFn: (b: BudgetInput) => api.post<BudgetDTO>('/budgets', b), onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, ...b }: BudgetInput & { id: string }) => api.put<BudgetDTO>(`/budgets/${id}`, b), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: (id: string) => api.delete(`/budgets/${id}`), onSuccess: invalidate }),
  };
}

// ───────────────── recurring ─────────────────

export function useRecurring() {
  return useQuery({ queryKey: qk.recurring, queryFn: () => api.get<RecurringDTO[]>('/recurring') });
}

export function useRecurringMutations() {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: qk.recurring });
    requestSync(); // the server may have generated transactions
  };
  return {
    create: useMutation({ mutationFn: (r: RecurringInput) => api.post<RecurringDTO>('/recurring', r), onSuccess: done }),
    update: useMutation({ mutationFn: ({ id, ...r }: RecurringInput & { id: string }) => api.put<RecurringDTO>(`/recurring/${id}`, r), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: string) => api.delete(`/recurring/${id}`), onSuccess: done }),
  };
}

// ───────────────── analytics (server) ─────────────────

export interface Range {
  from: string;
  to: string;
}

export function useOverview(r: Range) {
  return useQuery({ queryKey: qk.analytics('overview', r), queryFn: () => api.get<OverviewDTO>('/analytics/overview', { query: { ...r } }) });
}
export function useMonthly(months: number) {
  return useQuery({ queryKey: qk.analytics('monthly', months), queryFn: () => api.get<MonthlyPoint[]>('/analytics/monthly', { query: { months } }) });
}
export function useCategoryAnalytics(r: Range, type: TransactionType) {
  return useQuery({
    queryKey: qk.analytics('categories', r, type),
    queryFn: () => api.get<CategoryBreakdownDTO>('/analytics/categories', { query: { ...r, type } }),
  });
}
export function useTrends(r: Range) {
  return useQuery({ queryKey: qk.analytics('trends', r), queryFn: () => api.get<TrendsDTO>('/analytics/trends', { query: { ...r } }) });
}
export function useInsights(r: Range) {
  return useQuery({ queryKey: qk.analytics('insights', r), queryFn: () => api.get<InsightDTO[]>('/analytics/insights', { query: { ...r } }) });
}

// ───────────────── notifications ─────────────────

export function useNotifications() {
  const authed = useAuth((s) => s.status === 'authenticated');
  return useQuery({
    queryKey: qk.notifications,
    queryFn: () => api.get<{ data: NotificationDTO[]; unread: number }>('/notifications'),
    refetchInterval: 120_000,
    enabled: authed,
  });
}

export function useNotificationMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.notifications });
  return {
    markRead: useMutation({ mutationFn: (id: string) => api.patch(`/notifications/${id}/read`), onSuccess: invalidate }),
    markAll: useMutation({ mutationFn: () => api.post('/notifications/read-all'), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: (id: string) => api.delete(`/notifications/${id}`), onSuccess: invalidate }),
  };
}

// ───────────────── profile ─────────────────

export function useUpdateProfile() {
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.patch<{ user: UserDTO }>('/users/me', patch),
    onSuccess: ({ user }) => updateCachedUser(user),
  });
}
