import { money, type TransactionSort, type TransactionType } from '@expenseflow/shared';
import type { LocalTransaction } from '@/lib/db';

export interface TxFilters {
  q: string;
  type: TransactionType | 'all';
  categoryId: string | 'all';
  from: string;
  to: string;
  sort: TransactionSort;
}

export const DEFAULT_FILTERS: TxFilters = { q: '', type: 'all', categoryId: 'all', from: '', to: '', sort: 'newest' };

export function readFilters(p: URLSearchParams): TxFilters {
  return {
    q: p.get('q') ?? '',
    type: (p.get('type') as TxFilters['type']) ?? 'all',
    categoryId: p.get('category') ?? 'all',
    from: p.get('from') ?? '',
    to: p.get('to') ?? '',
    sort: (p.get('sort') as TransactionSort) ?? 'newest',
  };
}

export function writeFilters(f: TxFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.type !== 'all') p.set('type', f.type);
  if (f.categoryId !== 'all') p.set('category', f.categoryId);
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (f.sort !== 'newest') p.set('sort', f.sort);
  return p;
}

export function activeFilterCount(f: TxFilters): number {
  return Number(f.type !== 'all') + Number(f.categoryId !== 'all') + Number(!!f.from || !!f.to);
}

/** Filtering/sorting runs locally over IndexedDB data: instant and offline-capable. */
export function applyFilters(txs: LocalTransaction[], f: TxFilters, categoryNames: Map<string, string>): LocalTransaction[] {
  const q = f.q.trim().toLowerCase();
  const out = txs.filter((t) => {
    if (f.type !== 'all' && t.type !== f.type) return false;
    if (f.categoryId !== 'all' && t.categoryId !== f.categoryId) return false;
    if (f.from && t.transactionDate < f.from) return false;
    if (f.to && t.transactionDate > f.to) return false;
    if (q) {
      const hay = `${t.description} ${t.notes ?? ''} ${categoryNames.get(t.categoryId) ?? ''} ${t.amount}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const byDate = (a: LocalTransaction, b: LocalTransaction) =>
    a.transactionDate.localeCompare(b.transactionDate) || a.createdAt.localeCompare(b.createdAt);
  switch (f.sort) {
    case 'newest':
      return out.sort((a, b) => byDate(b, a));
    case 'oldest':
      return out.sort(byDate);
    case 'highest':
      return out.sort((a, b) => money(b.amount).comparedTo(money(a.amount)) || byDate(b, a));
    case 'lowest':
      return out.sort((a, b) => money(a.amount).comparedTo(money(b.amount)) || byDate(b, a));
  }
}
