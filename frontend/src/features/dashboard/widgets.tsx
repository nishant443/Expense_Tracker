import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  Minus,
  PiggyBank,
  Plus,
  Receipt,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { addMonthsISO, localTodayISO, money, type BudgetDTO, type CategoryDTO } from '@expenseflow/shared';
import { AnimatedMoney, Money } from '@/components/money';
import { CHART, Donut, Legend, SeriesTooltip, axisProps } from '@/components/charts';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Progress, Skeleton } from '@/components/ui/misc';
import { CategoryIcon } from '@/components/category-icon';
import { TransactionRow } from '@/features/transactions/TransactionRow';
import type { LocalTransaction } from '@/lib/db';
import { formatMoney, formatPercent, monthLabel } from '@/lib/format';
import { categoryBreakdown, cumulativeSpending, monthWindow, type MonthComparison } from '@/lib/local-analytics';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/stores/auth';

// ───────────────────────── month switcher ─────────────────────────

export function MonthSwitcher({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const current = localTodayISO().slice(0, 7);
  const shift = (d: number) => onChange(addMonthsISO(`${month}-01`, d).slice(0, 7));
  return (
    <div className="inline-flex items-center rounded-full bg-surface p-1 shadow-card ring-1 ring-border/60">
      <button onClick={() => shift(-1)} className="press rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Previous month">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[118px] px-1 text-center text-[13px] font-semibold">{monthLabel(month)}</span>
      <button
        onClick={() => shift(1)}
        disabled={month >= current}
        className="press rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
        aria-label="Next month"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ───────────────────────── hero ─────────────────────────

function Delta({ value, inverse }: { value: number | null; inverse?: boolean }) {
  if (value === null) return <span className="text-[11px] text-white/60">No prior data</span>;
  const good = inverse ? value <= 0 : value >= 0;
  const Icon = value === 0 ? Minus : value > 0 ? ArrowUpRight : ArrowDownLeft;
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold', good ? 'bg-emerald-400/20 text-emerald-100' : 'bg-rose-400/20 text-rose-100')}>
      <Icon className="h-3 w-3" />
      {formatPercent(Math.abs(value), false)}
    </span>
  );
}

export function BalanceHero({ balance, comparison, loading }: { balance: string; comparison: MonthComparison | null; loading: boolean }) {
  const tiles = comparison
    ? [
        { label: 'Income', value: comparison.current.income, change: comparison.change.income, icon: ArrowDownLeft },
        { label: 'Expenses', value: comparison.current.expense, change: comparison.change.expense, icon: ArrowUpRight, inverse: true },
        { label: 'Savings', value: comparison.current.savings, change: comparison.change.savings, icon: PiggyBank },
      ]
    : [];
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1E40AF] via-[#2563EB] to-[#3B82F6] p-5 text-white shadow-lift sm:p-6 dark:from-[#172554] dark:via-[#1E3A8A] dark:to-[#1D4ED8]">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-24 left-10 h-48 w-48 rounded-full bg-indigo-300/20 blur-3xl" />
      <div className="relative">
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-white/75">
          <Wallet className="h-4 w-4" /> Available balance
        </p>
        {loading ? (
          <Skeleton className="mt-2 h-10 w-52 bg-white/15" />
        ) : (
          <AnimatedMoney value={balance} className="mt-1 block text-[34px] font-bold leading-tight tracking-tight sm:text-display" />
        )}
        {comparison && comparison.current.savingsRate !== null && (
          <p className="mt-1 text-[13px] text-white/75">
            You've saved <span className="font-semibold text-white">{formatPercent(comparison.current.savingsRate, false)}</span> of this month's income
          </p>
        )}
        <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
          {loading
            ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-[76px] rounded-xl bg-white/10" />)
            : tiles.map((t) => (
                <div key={t.label} className="rounded-xl bg-white/10 p-2.5 ring-1 ring-white/10 backdrop-blur-sm sm:p-3.5">
                  <p className="flex items-center gap-1 text-[11px] font-medium text-white/70 sm:text-xs">
                    <t.icon className="h-3.5 w-3.5" /> {t.label}
                  </p>
                  <AnimatedMoney value={t.value} className="mt-1 block truncate text-[15px] font-bold sm:text-lg" />
                  <div className="mt-1">
                    <Delta value={t.change} inverse={t.inverse} />
                  </div>
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── quick actions ─────────────────────────

export function QuickActions() {
  const navigate = useNavigate();
  const actions: { label: string; icon: LucideIcon; to: string; tone: string }[] = [
    { label: 'Add expense', icon: Minus, to: '/transactions/new?type=expense', tone: 'bg-primary/10 text-primary' },
    { label: 'Add income', icon: Plus, to: '/transactions/new?type=income', tone: 'bg-success-soft text-success' },
    { label: 'Reports', icon: ChartColumn, to: '/analytics', tone: 'bg-violet-500/10 text-violet-600 dark:text-violet-300' },
    { label: 'Budgets', icon: PiggyBank, to: '/budgets', tone: 'bg-warning-soft text-warning' },
  ];
  return (
    <div className="grid grid-cols-4 gap-2">
      {actions.map((a, i) => (
        <motion.button
          key={a.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * i }}
          onClick={() => navigate(a.to)}
          className="press flex flex-col items-center gap-2 rounded-xl bg-surface px-1 py-3.5 shadow-card ring-1 ring-border/60"
        >
          <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', a.tone)}>
            <a.icon className="h-5 w-5" />
          </span>
          <span className="text-center text-[11.5px] font-semibold leading-tight">{a.label}</span>
        </motion.button>
      ))}
    </div>
  );
}

// ───────────────────────── spending overview ─────────────────────────

export function SpendingOverviewCard({ txs, month, comparison }: { txs: LocalTransaction[]; month: string; comparison: MonthComparison }) {
  const [view, setView] = useState<'trend' | 'daily'>('trend');
  const currency = useCurrency();
  const today = localTodayISO();
  const data = useMemo(() => cumulativeSpending(txs, month, today), [txs, month, today]);
  const change = comparison.change.expense;
  const { income, expense } = comparison.current;
  const max = money(income).gt(expense) ? income : expense;
  const pct = (v: string) => (money(max).isZero() ? 0 : money(v).div(max).times(100).toNumber());

  return (
    <Card>
      <CardHeader
        title="Spending overview"
        subtitle={
          <>
            <Money value={expense} className="font-semibold text-foreground" /> spent
            {change !== null && (
              <span className={cn('ml-1.5 font-semibold', change > 0 ? 'text-danger' : 'text-success')}>
                {formatPercent(change)} vs last month
              </span>
            )}
          </>
        }
        action={
          <div className="flex rounded-md bg-muted p-0.5 text-xs font-semibold" role="tablist">
            {(['trend', 'daily'] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn('rounded-[8px] px-2.5 py-1 capitalize text-muted-foreground transition', view === v && 'bg-surface text-foreground shadow-sm dark:bg-elevated')}
              >
                {v}
              </button>
            ))}
          </div>
        }
      />
      <div className="px-2 pt-3">
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            {view === 'trend' ? (
              <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART.expense} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={CHART.expense} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={CHART.grid} strokeDasharray="0" />
                <XAxis dataKey="day" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
                <YAxis {...axisProps} width={48} tickFormatter={(v: number) => formatMoney(String(v), currency, { compact: true })} />
                <Tooltip
                  cursor={{ stroke: CHART.axis, strokeDasharray: '3 3' }}
                  content={(p) => <SeriesTooltip {...p} labelFormatter={(l) => `Day ${l}`} />}
                />
                <Area type="monotone" dataKey="previous" name="Last month" stroke={CHART.previous} strokeWidth={2} strokeDasharray="4 4" fill="none" dot={false} activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="current" name="This month" stroke={CHART.expense} strokeWidth={2} fill="url(#spendFill)" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: CHART.surface }} connectNulls={false} />
              </AreaChart>
            ) : (
              <BarChart data={data.filter((d) => d.current !== null)} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="day" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
                <YAxis {...axisProps} width={48} tickFormatter={(v: number) => formatMoney(String(v), currency, { compact: true })} />
                <Tooltip cursor={{ fill: 'rgb(var(--muted))' }} content={(p) => <SeriesTooltip {...p} labelFormatter={(l) => `Day ${l}`} />} />
                <Bar dataKey="daily" name="Spent" fill={CHART.expense} radius={[4, 4, 0, 0]} maxBarSize={14} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
        <Legend
          className="px-3 pb-1 pt-2"
          items={view === 'trend' ? [{ label: 'This month', color: CHART.expense }, { label: 'Last month', color: CHART.previous, dashed: true }] : [{ label: 'Daily spending', color: CHART.expense }]}
        />
      </div>
      {/* Income vs expense comparison */}
      <div className="space-y-3 border-t border-border/60 px-5 py-4">
        {[
          { label: 'Income', value: income, color: CHART.income },
          { label: 'Expenses', value: expense, color: CHART.expense },
        ].map((r) => (
          <div key={r.label} className="flex items-center gap-3 text-[13px]">
            <span className="w-16 text-muted-foreground">{r.label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <motion.div className="h-full rounded-full" style={{ background: r.color }} initial={{ width: 0 }} animate={{ width: `${pct(r.value)}%` }} transition={{ duration: 0.7, ease: 'easeOut' }} />
            </div>
            <Money value={r.value} className="w-24 text-right font-semibold" />
          </div>
        ))}
      </div>
    </Card>
  );
}

// ───────────────────────── category breakdown ─────────────────────────

export function CategoryBreakdownCard({ txs, categories, month }: { txs: LocalTransaction[]; categories: CategoryDTO[]; month: string }) {
  const currency = useCurrency();
  const { start, end } = monthWindow(month);
  const { total, slices } = useMemo(() => categoryBreakdown(txs, categories, start, end), [txs, categories, start, end]);
  // Top 5 + "Other" fold (never generate extra hues).
  const top = slices.slice(0, 5);
  const rest = slices.slice(5);
  const data = [
    ...top.map((s) => ({ id: s.categoryId, name: s.category?.name ?? 'Unknown', value: s.value, total: s.total, color: s.category?.color ?? '#64748B', icon: s.category?.icon, percent: s.percent })),
    ...(rest.length
      ? [
          {
            id: 'other',
            name: `${rest.length} more`,
            value: rest.reduce((a, s) => a + s.value, 0),
            total: rest.reduce((a, s) => a.plus(money(s.total)), money(0)).toFixed(2),
            color: '#94A3B8',
            icon: 'circle-ellipsis',
            percent: Math.round(rest.reduce((a, s) => a + s.percent, 0) * 10) / 10,
          },
        ]
      : []),
  ];

  return (
    <Card>
      <CardHeader title="By category" subtitle={monthLabel(month)} action={<Button asChild variant="ghost" size="sm"><Link to="/analytics">Details</Link></Button>} />
      {data.length === 0 ? (
        <EmptyState icon={ChartColumn} title="No spending yet" description="Expenses you add this month will be broken down here." />
      ) : (
        <div className="flex flex-col items-center gap-6 p-5 sm:flex-row sm:items-center">
          <Donut data={data} centerLabel="Total spent" centerValue={formatMoney(total, currency, { compact: money(total).gte(100000) })} />
          <ul className="w-full flex-1 space-y-2.5">
            {data.map((d) => (
              <li key={d.id} className="flex items-center gap-3">
                <CategoryIcon icon={d.icon} color={d.color} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{d.name}</span>
                    <Money value={d.total} className="text-sm font-semibold" />
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${d.percent}%`, background: d.color }} />
                    </div>
                    <span className="num w-10 text-right text-xs text-muted-foreground">{d.percent}%</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ───────────────────────── budget progress ─────────────────────────

export const statusTone = {
  ok: { bar: 'bg-primary', text: 'text-muted-foreground' },
  warning: { bar: 'bg-warning', text: 'text-warning' },
  danger: { bar: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400' },
  exceeded: { bar: 'bg-danger', text: 'text-danger' },
} as const;

export function BudgetProgressCard({ budgets, loading, categories }: { budgets: BudgetDTO[] | undefined; loading: boolean; categories: Map<string, CategoryDTO> }) {
  const active = (budgets ?? []).filter((b) => b.current);
  const overall = active.find((b) => b.categoryId === null);
  const watch = active.filter((b) => b.categoryId && b.current!.status !== 'ok').slice(0, 3);

  return (
    <Card>
      <CardHeader title="Budget" subtitle={overall ? 'This period' : undefined} action={<Button asChild variant="ghost" size="sm"><Link to="/budgets">Manage</Link></Button>} />
      <div className="p-5 pt-4">
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : !overall && active.length === 0 ? (
          <EmptyState
            className="py-4"
            icon={PiggyBank}
            title="No budget yet"
            description="Set a monthly budget to get warnings before you overspend."
            action={<Button asChild size="sm"><Link to="/budgets?new=1">Create budget</Link></Button>}
          />
        ) : (
          <div className="space-y-5">
            {overall && <BudgetMeter budget={overall} label="Overall budget" />}
            {(overall ? watch : active.slice(0, 3)).map((b) => (
              <BudgetMeter key={b.id} budget={b} label={categories.get(b.categoryId!)?.name ?? 'Category'} compact />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

export function BudgetMeter({ budget, label, compact }: { budget: BudgetDTO; label: string; compact?: boolean }) {
  const c = budget.current!;
  const tone = statusTone[c.status];
  return (
    <div>
      <div className="mb-2 flex items-end justify-between gap-2">
        <div>
          <p className={cn('font-semibold', compact ? 'text-sm' : 'text-[15px]')}>{label}</p>
          <p className="text-xs text-muted-foreground">
            <Money value={c.spent} /> of <Money value={budget.amount} />
          </p>
        </div>
        <div className="text-right">
          <p className={cn('num text-sm font-semibold', money(c.remaining).lt(0) ? 'text-danger' : 'text-foreground')}>
            {money(c.remaining).lt(0) ? <>Over by <Money value={money(c.remaining).abs().toFixed(2)} /></> : <><Money value={c.remaining} /> left</>}
          </p>
          <p className={cn('num text-xs font-medium', tone.text)}>{c.percent}% used</p>
        </div>
      </div>
      <Progress value={c.percent} indicatorClassName={tone.bar} className={compact ? 'h-1.5' : 'h-2.5'} />
      {!compact && c.status !== 'ok' && (
        <p className={cn('mt-2 flex items-center gap-1.5 text-xs font-medium', tone.text)}>
          <TriangleAlert className="h-3.5 w-3.5" />
          {c.status === 'exceeded' ? 'Budget exceeded for this period' : 'You are approaching your limit'}
        </p>
      )}
    </div>
  );
}

// ───────────────────────── recent transactions ─────────────────────────

export function RecentTransactionsCard({ txs, categories, loading }: { txs: LocalTransaction[]; categories: Map<string, CategoryDTO>; loading: boolean }) {
  const navigate = useNavigate();
  const recent = txs.slice(0, 6);
  return (
    <Card>
      <CardHeader
        title="Recent transactions"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link to="/transactions">
              View all <ArrowRight />
            </Link>
          </Button>
        }
      />
      <div className="px-3 pb-3 pt-2">
        {loading ? (
          <div className="space-y-3 p-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : recent.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No transactions yet"
            description="Your latest income and expenses will appear here."
            action={<Button asChild size="sm"><Link to="/transactions/new"><Plus /> Add your first</Link></Button>}
          />
        ) : (
          recent.map((t) => <TransactionRow key={t.id} tx={t} category={categories.get(t.categoryId)} showDate onClick={() => navigate(`/transactions/${t.id}/edit`)} />)
        )}
      </div>
    </Card>
  );
}
