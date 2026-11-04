import { describe, expect, it } from 'vitest';
import type { LocalTransaction } from './db';
import { balanceOf, categoryBreakdown, compareMonths, cumulativeSpending, dayNet, groupByDate, summarize } from './local-analytics';

let n = 0;
function t(type: 'income' | 'expense', amount: string, date: string, categoryId = 'food'): LocalTransaction {
  n++;
  return {
    id: `id-${n}`,
    type,
    amount,
    categoryId,
    description: 'x',
    notes: null,
    paymentMethod: 'cash',
    transactionDate: date,
    hasReceipt: false,
    recurringId: null,
    version: 1,
    deletedAt: null,
    createdAt: '',
    updatedAt: '',
    syncStatus: 'synced',
  };
}

describe('local analytics', () => {
  const txs = [
    ...Array.from({ length: 10 }, () => t('expense', '0.10', '2025-03-05')),
    t('income', '1000.00', '2025-03-01', 'salary'),
    t('expense', '33.33', '2025-03-20', 'travel'),
    t('expense', '50.00', '2025-02-10'),
  ];

  it('sums exactly without float error', () => {
    const s = summarize(txs, '2025-03-01', '2025-03-31');
    expect(s).toEqual({ income: '1000.00', expense: '34.33', savings: '965.67', savingsRate: 96.6, count: 12 });
    expect(balanceOf(txs)).toBe('915.67');
  });

  it('compares to the previous month', () => {
    const c = compareMonths(txs, '2025-03');
    expect(c.previous.expense).toBe('50.00');
    expect(c.change.expense).toBe(-31.3);
    expect(c.change.income).toBeNull();
  });

  it('builds category breakdowns with percentages', () => {
    const b = categoryBreakdown(txs, [], '2025-03-01', '2025-03-31');
    expect(b.total).toBe('34.33');
    expect(b.slices.map((s) => [s.categoryId, s.total])).toEqual([
      ['travel', '33.33'],
      ['food', '1.00'],
    ]);
  });

  it('builds cumulative spending aligned by day', () => {
    const pts = cumulativeSpending(txs, '2025-03', '2025-03-25');
    expect(pts).toHaveLength(31);
    expect(pts[4]!.current).toBe(1);
    expect(pts[19]!.current).toBe(34.33);
    expect(pts[25]!.current).toBeNull(); // future days are not drawn
    expect(pts[27]!.previous).toBe(50);
    expect(pts[28]!.previous).toBeNull(); // Feb has 28 days
  });

  it('groups by date and nets days', () => {
    const sorted = [...txs].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
    const groups = groupByDate(sorted);
    expect(groups.map((g) => g.date)).toEqual(['2025-03-20', '2025-03-05', '2025-03-01', '2025-02-10']);
    expect(dayNet(groups[1]!.items)).toBe('-1.00');
  });
});
