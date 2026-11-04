import { useMemo } from 'react';
import { InstallPromptCard } from '@/components/install-prompt';
import { useBudgets, useCategories, useLocalTransactions } from '@/features/data/hooks';
import { greeting } from '@/lib/format';
import { balanceOf, compareMonths } from '@/lib/local-analytics';
import { useUser } from '@/stores/auth';
import { useUi } from '@/stores/ui';
import { BalanceHero, BudgetProgressCard, CategoryBreakdownCard, MonthSwitcher, QuickActions, RecentTransactionsCard, SpendingOverviewCard } from './widgets';

/**
 * Dashboard figures are computed from the local IndexedDB mirror (exact decimal maths), so
 * they update instantly after adding a transaction and keep working offline.
 */
export default function DashboardPage() {
  const user = useUser();
  const { month, setMonth } = useUi();
  const txs = useLocalTransactions();
  const { categories } = useCategories();
  const budgets = useBudgets();
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const loading = txs === undefined;
  const list = txs ?? [];
  const comparison = useMemo(() => (txs ? compareMonths(txs, month) : null), [txs, month]);
  const balance = useMemo(() => balanceOf(list), [list]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{greeting()},</p>
          <h1 className="text-2xl font-bold tracking-tight">{user?.name.split(' ')[0]} 👋</h1>
        </div>
        <MonthSwitcher month={month} onChange={setMonth} />
      </div>

      <InstallPromptCard />
      <BalanceHero balance={balance} comparison={comparison} loading={loading} />
      <QuickActions />

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          {comparison && <SpendingOverviewCard txs={list} month={month} comparison={comparison} />}
          <RecentTransactionsCard txs={list} categories={catMap} loading={loading} />
        </div>
        <div className="space-y-5 lg:col-span-2">
          <BudgetProgressCard budgets={budgets.data} loading={budgets.isLoading} categories={catMap} />
          <CategoryBreakdownCard txs={list} categories={categories} month={month} />
        </div>
      </div>
    </div>
  );
}
