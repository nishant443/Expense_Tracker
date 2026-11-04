import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, CalendarRange, ChartColumn, Lightbulb } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { format, parseISO } from 'date-fns';
import {
  localTodayISO,
  moneyToChartNumber,
  presetRange,
  RANGE_PRESET_LABELS,
  RANGE_PRESETS,
  type InsightDTO,
  type RangePreset,
  type TransactionType,
} from '@expenseflow/shared';
import { CHART, Donut, Legend, SeriesTooltip, axisProps } from '@/components/charts';
import { CategoryIcon, iconFor } from '@/components/category-icon';
import { Money } from '@/components/money';
import { EmptyState, ErrorState, PageHeader } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/misc';
import { useCategoryAnalytics, useInsights, useMonthly, useOverview, useTrends, type Range } from '@/features/data/hooks';
import { formatMoney, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/stores/auth';

type Selection = { preset: RangePreset } | { preset: 'custom'; from: string; to: string };

function monthsBetween(r: Range) {
  return (Number(r.to.slice(0, 4)) - Number(r.from.slice(0, 4))) * 12 + Number(r.to.slice(5, 7)) - Number(r.from.slice(5, 7)) + 1;
}

export default function AnalyticsPage() {
  const [sel, setSel] = useState<Selection>({ preset: 'this_month' });
  const [customOpen, setCustomOpen] = useState(false);
  const range: Range = useMemo(() => {
    if (sel.preset === 'custom') return { from: sel.from, to: sel.to };
    const w = presetRange(sel.preset, localTodayISO());
    return { from: w.start, to: w.end };
  }, [sel]);
  const months = Math.min(12, Math.max(6, monthsBetween(range)));

  return (
    <div>
      <PageHeader title="Statistics" subtitle={`${format(parseISO(range.from), 'd MMM yyyy')} – ${format(parseISO(range.to), 'd MMM yyyy')}`} />

      {/* Filters: one row above the charts */}
      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar lg:mx-0 lg:px-0">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setSel({ preset: p })}
            className={cn('press h-9 shrink-0 rounded-full px-4 text-[13px] font-semibold ring-1 ring-border transition', sel.preset === p ? 'bg-foreground text-background ring-foreground' : 'bg-surface text-muted-foreground')}
          >
            {RANGE_PRESET_LABELS[p]}
          </button>
        ))}
        <button
          onClick={() => setCustomOpen(true)}
          className={cn('press flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold ring-1 ring-border', sel.preset === 'custom' ? 'bg-foreground text-background ring-foreground' : 'bg-surface text-muted-foreground')}
        >
          <CalendarRange className="h-4 w-4" /> Custom
        </button>
      </div>

      <div className="space-y-5">
        <OverviewStrip range={range} />
        <Insights range={range} />
        <div className="grid gap-5 lg:grid-cols-2">
          <IncomeExpenseChart months={months} />
          <CategoryDonutCard range={range} />
          <DailySpendingChart range={range} />
          <MonthlySpendingLine months={months} />
          <SavingsTrendChart months={months} />
          <CategoryComparisonChart range={range} />
        </div>
      </div>

      <CustomRangeDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        initial={range}
        onApply={(r) => setSel({ preset: 'custom', ...r })}
      />
    </div>
  );
}

// ───────────────────────── KPIs ─────────────────────────

function OverviewStrip({ range }: { range: Range }) {
  const { data, isLoading, error, refetch } = useOverview(range);
  if (error && !data) return <Card><ErrorState error={error} onRetry={() => void refetch()} /></Card>;
  const items = data
    ? [
        { label: 'Income', value: data.current.income, change: data.change.income },
        { label: 'Expenses', value: data.current.expense, change: data.change.expense, inverse: true },
        { label: 'Net savings', value: data.current.savings, change: data.change.savings },
        { label: 'Savings rate', text: data.current.savingsRate === null ? '—' : `${data.current.savingsRate}%`, change: null },
      ]
    : [];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {isLoading
        ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[92px] rounded-xl" />)
        : items.map((it) => (
            <Card key={it.label} className="p-4">
              <p className="text-xs font-medium text-muted-foreground">{it.label}</p>
              <p className="mt-1 truncate text-xl font-bold">{'text' in it ? <span className="num">{it.text}</span> : <Money value={it.value} />}</p>
              {it.change !== null && it.change !== undefined ? (
                <p className={cn('mt-1 flex items-center gap-0.5 text-xs font-semibold', (it.inverse ? it.change <= 0 : it.change >= 0) ? 'text-success' : 'text-danger')}>
                  {it.change >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                  {formatPercent(Math.abs(it.change), false)} <span className="font-normal text-muted-foreground">vs prev.</span>
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">{'text' in it ? 'of income saved' : 'No prior data'}</p>
              )}
            </Card>
          ))}
    </div>
  );
}

// ───────────────────────── insights ─────────────────────────

const TONE: Record<InsightDTO['tone'], string> = {
  positive: 'bg-success-soft text-success',
  negative: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  neutral: 'bg-primary/10 text-primary',
};

function Insights({ range }: { range: Range }) {
  const { data, isLoading } = useInsights(range);
  if (isLoading) return <div className="flex gap-3 overflow-hidden">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[104px] w-72 shrink-0 rounded-xl" />)}</div>;
  if (!data?.length) return null;
  return (
    <section aria-label="Insights">
      <h2 className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        <Lightbulb className="h-4 w-4" /> Insights
      </h2>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 no-scrollbar lg:mx-0 lg:grid lg:grid-cols-3 lg:px-0">
        {data.map((ins, i) => {
          const Icon = iconFor(ins.icon);
          return (
            <motion.div key={ins.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="w-[78%] shrink-0 snap-start sm:w-72 lg:w-auto">
              <Card className="flex h-full gap-3 p-4">
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', TONE[ins.tone])}>
                  <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{ins.title}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{ins.message}</p>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

// ───────────────────────── chart shell ─────────────────────────

function ChartCard({ title, subtitle, loading, empty, error, onRetry, legend, children, className }: {
  title: string;
  subtitle?: string;
  loading: boolean;
  empty?: boolean;
  error?: unknown;
  onRetry?: () => void;
  legend?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader title={title} subtitle={subtitle} />
      <div className="px-2 pb-4 pt-3">
        {loading ? (
          <Skeleton className="mx-3 h-[220px]" />
        ) : error ? (
          <ErrorState error={error} onRetry={onRetry} className="py-6" />
        ) : empty ? (
          <EmptyState icon={ChartColumn} title="No data for this period" className="py-8" />
        ) : (
          <>
            <div className="h-[220px]">{children}</div>
            {legend && <div className="px-3 pt-2">{legend}</div>}
          </>
        )}
      </div>
    </Card>
  );
}

const monthTick = (m: string) => format(parseISO(`${m}-01`), 'MMM');
const monthFull = (m: unknown) => format(parseISO(`${String(m)}-01`), 'MMMM yyyy');

function useCompact() {
  const currency = useCurrency();
  return (v: number) => formatMoney(String(v), currency, { compact: true });
}

// 1. Income vs expense
function IncomeExpenseChart({ months }: { months: number }) {
  const q = useMonthly(months);
  const compact = useCompact();
  const data = (q.data ?? []).map((p) => ({ month: p.month, Income: moneyToChartNumber(p.income), Expenses: moneyToChartNumber(p.expense) }));
  return (
    <ChartCard
      title="Income vs expenses"
      subtitle={`Last ${months} months`}
      loading={q.isLoading}
      error={!q.data && q.error}
      onRetry={() => void q.refetch()}
      empty={data.every((d) => !d.Income && !d.Expenses)}
      legend={<Legend items={[{ label: 'Income', color: CHART.income }, { label: 'Expenses', color: CHART.expense }]} />}
    >
      <ResponsiveContainer>
        <BarChart data={data} barGap={2} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="month" {...axisProps} tickFormatter={monthTick} />
          <YAxis {...axisProps} width={50} tickFormatter={compact} />
          <Tooltip cursor={{ fill: 'rgb(var(--muted))' }} content={(p) => <SeriesTooltip {...p} labelFormatter={monthFull} />} />
          <Bar dataKey="Income" fill={CHART.income} radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Bar dataKey="Expenses" fill={CHART.expense} radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// 2. Monthly spending line
function MonthlySpendingLine({ months }: { months: number }) {
  const q = useMonthly(months);
  const compact = useCompact();
  const data = (q.data ?? []).map((p) => ({ month: p.month, Spending: moneyToChartNumber(p.expense) }));
  return (
    <ChartCard title="Monthly spending" subtitle="Total expenses per month" loading={q.isLoading} error={!q.data && q.error} empty={data.every((d) => !d.Spending)}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="month" {...axisProps} tickFormatter={monthTick} />
          <YAxis {...axisProps} width={50} tickFormatter={compact} />
          <Tooltip cursor={{ stroke: CHART.axis, strokeDasharray: '3 3' }} content={(p) => <SeriesTooltip {...p} labelFormatter={monthFull} />} />
          <Line type="monotone" dataKey="Spending" stroke={CHART.expense} strokeWidth={2} dot={{ r: 4, fill: CHART.expense, stroke: CHART.surface, strokeWidth: 2 }} activeDot={{ r: 6, stroke: CHART.surface, strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// 3. Category donut
function CategoryDonutCard({ range }: { range: Range }) {
  const [type, setType] = useState<TransactionType>('expense');
  const q = useCategoryAnalytics(range, type);
  const currency = useCurrency();
  const items = q.data?.items ?? [];
  const top = items.slice(0, 6);
  const rest = items.slice(6);
  const slices = [
    ...top.map((i) => ({ id: i.categoryId, name: i.name, value: moneyToChartNumber(i.total), total: i.total, color: i.color, icon: i.icon, percent: i.percent })),
    ...(rest.length ? [{ id: 'rest', name: `${rest.length} more`, value: rest.reduce((a, i) => a + moneyToChartNumber(i.total), 0), total: rest.reduce((a, i) => a + moneyToChartNumber(i.total), 0).toFixed(2), color: '#94A3B8', icon: 'circle-ellipsis', percent: Math.round(rest.reduce((a, i) => a + i.percent, 0) * 10) / 10 }] : []),
  ];
  return (
    <Card>
      <CardHeader
        title="By category"
        subtitle="Share of total"
        action={
          <div className="flex rounded-md bg-muted p-0.5 text-xs font-semibold">
            {(['expense', 'income'] as const).map((t) => (
              <button key={t} onClick={() => setType(t)} aria-pressed={type === t} className={cn('rounded-[8px] px-2.5 py-1 capitalize text-muted-foreground', type === t && 'bg-surface text-foreground shadow-sm dark:bg-elevated')}>
                {t}
              </button>
            ))}
          </div>
        }
      />
      <div className="p-5">
        {q.isLoading ? (
          <Skeleton className="h-[200px]" />
        ) : !slices.length ? (
          <EmptyState icon={ChartColumn} title="No data for this period" className="py-8" />
        ) : (
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <Donut data={slices} centerLabel={type === 'expense' ? 'Spent' : 'Earned'} centerValue={formatMoney(q.data!.total, currency, { compact: true })} size={170} />
            <ul className="w-full flex-1 space-y-2">
              {slices.map((s) => (
                <li key={s.id} className="flex items-center gap-2.5 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="num w-11 text-right text-xs text-muted-foreground">{s.percent}%</span>
                  <Money value={String(s.total)} className="w-24 text-right font-semibold" />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

// 4. Daily spending
function DailySpendingChart({ range }: { range: Range }) {
  const q = useTrends(range);
  const compact = useCompact();
  const long = (q.data?.daily.length ?? 0) > 62;
  const data = (q.data?.daily ?? []).map((d) => ({ date: d.date, Spent: moneyToChartNumber(d.expense) }));
  return (
    <ChartCard title="Daily spending" subtitle={long ? 'Per day across the range' : 'Expenses per day'} loading={q.isLoading} error={!q.data && q.error} empty={data.every((d) => !d.Spent)}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="date" {...axisProps} minTickGap={24} tickFormatter={(d: string) => format(parseISO(d), long ? 'MMM' : 'd MMM')} />
          <YAxis {...axisProps} width={50} tickFormatter={compact} />
          <Tooltip cursor={{ fill: 'rgb(var(--muted))' }} content={(p) => <SeriesTooltip {...p} labelFormatter={(l) => format(parseISO(String(l)), 'EEE, d MMM yyyy')} />} />
          <Bar dataKey="Spent" fill={CHART.expense} radius={[4, 4, 0, 0]} maxBarSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// 5. Savings trend
function SavingsTrendChart({ months }: { months: number }) {
  const q = useMonthly(months);
  const compact = useCompact();
  const data = (q.data ?? []).map((p) => ({ month: p.month, Savings: moneyToChartNumber(p.savings) }));
  return (
    <ChartCard
      title="Savings trend"
      subtitle="Income minus expenses per month"
      loading={q.isLoading}
      error={!q.data && q.error}
      empty={data.every((d) => !d.Savings)}
      legend={<Legend items={[{ label: 'Saved', color: CHART.income }, { label: 'Overspent', color: 'rgb(var(--danger))' }]} />}
    >
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="month" {...axisProps} tickFormatter={monthTick} />
          <YAxis {...axisProps} width={50} tickFormatter={compact} />
          <ReferenceLine y={0} stroke={CHART.axis} strokeOpacity={0.5} />
          <Tooltip cursor={{ fill: 'rgb(var(--muted))' }} content={(p) => <SeriesTooltip {...p} labelFormatter={monthFull} />} />
          <Bar dataKey="Savings" radius={4} maxBarSize={22}>
            {data.map((d) => (
              <Cell key={d.month} fill={d.Savings >= 0 ? CHART.income : 'rgb(var(--danger))'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// 6. Category comparison (current vs previous period)
function CategoryComparisonChart({ range }: { range: Range }) {
  const q = useCategoryAnalytics(range, 'expense');
  const items = (q.data?.items ?? []).slice(0, 6);
  return (
    <Card>
      <CardHeader title="Category comparison" subtitle="This period vs the previous one" />
      <div className="space-y-4 p-5">
        {q.isLoading ? (
          <Skeleton className="h-[200px]" />
        ) : !items.length ? (
          <EmptyState icon={ChartColumn} title="No data for this period" className="py-8" />
        ) : (
          <>
            {(() => {
              const max = Math.max(...items.flatMap((i) => [moneyToChartNumber(i.total), moneyToChartNumber(i.previousTotal)]), 1);
              return items.map((i) => {
                const cur = moneyToChartNumber(i.total);
                const prev = moneyToChartNumber(i.previousTotal);
                const change = prev ? Math.round(((cur - prev) / prev) * 100) : null;
                return (
                  <div key={i.categoryId} className="flex items-center gap-3">
                    <CategoryIcon icon={i.icon} color={i.color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                        <span className="truncate font-medium">{i.name}</span>
                        <span className="flex items-center gap-2">
                          {change !== null && <span className={cn('text-xs font-semibold', change > 0 ? 'text-danger' : 'text-success')}>{formatPercent(change)}</span>}
                          <Money value={i.total} className="font-semibold" />
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${(cur / max) * 100}%`, background: CHART.expense }} /></div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${(prev / max) * 100}%`, background: CHART.previous }} /></div>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
            <Legend items={[{ label: 'This period', color: CHART.expense }, { label: 'Previous period', color: CHART.previous }]} />
          </>
        )}
      </div>
    </Card>
  );
}

function CustomRangeDialog({ open, onOpenChange, initial, onApply }: { open: boolean; onOpenChange: (o: boolean) => void; initial: Range; onApply: (r: Range) => void }) {
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const invalid = !from || !to || to < from;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Custom date range</DialogTitle></DialogHeader>
        <DialogBody className="grid grid-cols-2 gap-3">
          <Field label="From" htmlFor="cr-from"><Input id="cr-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To" htmlFor="cr-to" error={to && from && to < from ? 'Must be after start' : undefined}><Input id="cr-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={invalid} onClick={() => { onApply({ from, to }); onOpenChange(false); }}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
