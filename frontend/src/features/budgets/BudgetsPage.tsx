import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useSearchParams } from 'react-router-dom';
import { BellRing, CalendarRange, EllipsisVertical, Pencil, PiggyBank, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  addMoney,
  BUDGET_PERIODS,
  isPositiveMoney,
  localTodayISO,
  money,
  parseMoneyInput,
  percentOf,
  startOfMonthISO,
  subMoney,
  type BudgetDTO,
  type BudgetPeriod,
} from '@expenseflow/shared';
import { CategoryIcon } from '@/components/category-icon';
import { useConfirm } from '@/components/confirm-dialog';
import { Money } from '@/components/money';
import { EmptyState, ErrorState, PageHeader } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Badge, Progress, Skeleton } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BudgetMeter, statusTone } from '@/features/dashboard/widgets';
import { useBudgetMutations, useBudgets, useCategories } from '@/features/data/hooks';
import { ApiError, errorMessage } from '@/lib/api';
import { currencySymbol, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCurrency, useUser } from '@/stores/auth';

const PERIOD_LABELS: Record<BudgetPeriod, string> = { weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly', custom: 'Custom range' };

export default function BudgetsPage() {
  const { data, isLoading, error, refetch } = useBudgets();
  const { categories } = useCategories();
  const user = useUser();
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<BudgetDTO | null>(null);
  const [open, setOpen] = useState(params.get('new') === '1');
  const { remove } = useBudgetMutations();
  const [confirm, confirmDialog] = useConfirm();

  const active = (data ?? []).filter((b) => b.current);
  const overall = active.find((b) => b.categoryId === null);
  const categoryBudgets = (data ?? []).filter((b) => b.categoryId !== null);

  // Summary: overall budget if present, else sum of active category budgets.
  const summary = useMemo(() => {
    if (overall?.current) return { total: overall.amount, spent: overall.current.spent };
    const cats = active.filter((b) => b.categoryId);
    return { total: addMoney('0', ...cats.map((b) => b.amount)), spent: addMoney('0', ...cats.map((b) => b.current!.spent)) };
  }, [overall, active]);
  const pct = percentOf(summary.spent, summary.total) ?? 0;
  const remaining = subMoney(summary.total, summary.spent);

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };
  const onDelete = async (b: BudgetDTO) => {
    const ok = await confirm({ title: 'Delete budget?', description: 'Alerts for this budget will stop.', confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    remove.mutate(b.id, { onSuccess: () => toast.success('Budget deleted'), onError: (e) => toast.error(errorMessage(e)) });
  };

  return (
    <div>
      <PageHeader
        title="Budgets"
        subtitle="Stay on track with limits and early warnings"
        action={<Button onClick={openNew}><Plus /> <span className="hidden sm:inline">New budget</span></Button>}
      />

      {isLoading ? (
        <div className="space-y-4"><Skeleton className="h-44 rounded-2xl" /><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-28 rounded-xl" /></div>
      ) : error && !data ? (
        <Card><ErrorState error={error} onRetry={() => void refetch()} /></Card>
      ) : !data?.length ? (
        <Card>
          <EmptyState icon={PiggyBank} title="Create your first budget" description="Set an overall monthly limit or budgets per category. We'll alert you at 70%, 90% and 100%." action={<Button onClick={openNew}><Plus /> New budget</Button>} />
        </Card>
      ) : (
        <div className="space-y-5">
          {/* Summary */}
          <Card className="p-5">
            <div className="grid grid-cols-3 gap-3 text-center sm:text-left">
              <Stat label={overall ? 'Monthly budget' : 'Total budgeted'} value={<Money value={summary.total} />} />
              <Stat label="Spent" value={<Money value={summary.spent} />} />
              <Stat label={money(remaining).lt(0) ? 'Over budget' : 'Remaining'} value={<Money value={money(remaining).abs().toFixed(2)} className={money(remaining).lt(0) ? 'text-danger' : 'text-success'} />} />
            </div>
            <Progress value={pct} className="mt-5 h-3" indicatorClassName={pct >= 100 ? 'bg-danger' : pct >= 90 ? 'bg-orange-500' : pct >= 70 ? 'bg-warning' : 'bg-primary'} />
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span className="num">{pct}% consumed</span>
              <Link to="/settings#alerts" className="flex items-center gap-1 font-medium text-primary hover:underline">
                <BellRing className="h-3.5 w-3.5" /> Alerts at {user?.alertThresholds.join('%, ')}%
              </Link>
            </div>
          </Card>

          {overall && (
            <BudgetCard budget={overall} label="Overall budget" onEdit={() => (setEditing(overall), setOpen(true))} onDelete={() => onDelete(overall)} />
          )}

          <section>
            <h2 className="mb-2.5 px-1 text-sm font-semibold text-muted-foreground">Category budgets</h2>
            {categoryBudgets.length === 0 ? (
              <Card className="p-5 text-center text-sm text-muted-foreground">
                No category budgets yet.{' '}
                <button className="font-semibold text-primary" onClick={openNew}>Add one</button>
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {categoryBudgets.map((b) => {
                  const c = catMap.get(b.categoryId!);
                  return (
                    <BudgetCard
                      key={b.id}
                      budget={b}
                      label={c?.name ?? 'Category'}
                      icon={<CategoryIcon icon={c?.icon} color={c?.color} size="sm" />}
                      onEdit={() => (setEditing(b), setOpen(true))}
                      onDelete={() => onDelete(b)}
                    />
                  );
                })}
              </div>
            )}
          </section>
          {(data ?? []).filter((b) => !b.current && b.categoryId === null).map((b) => (
            <BudgetCard key={b.id} budget={b} label="Overall budget" onEdit={() => (setEditing(b), setOpen(true))} onDelete={() => onDelete(b)} />
          ))}
        </div>
      )}

      <BudgetFormDialog
        open={open}
        budget={editing}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o && params.get('new')) setParams({}, { replace: true });
        }}
      />
      {confirmDialog}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-bold sm:text-xl">{value}</p>
    </div>
  );
}

function BudgetCard({ budget, label, icon, onEdit, onDelete }: { budget: BudgetDTO; label: string; icon?: React.ReactNode; onEdit: () => void; onDelete: () => void }) {
  const status = budget.current?.status;
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-3">
        {icon}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge variant="muted">{PERIOD_LABELS[budget.period]}</Badge>
            {status && status !== 'ok' && (
              <Badge variant={status === 'exceeded' ? 'danger' : 'warning'}>{status === 'exceeded' ? 'Exceeded' : status === 'danger' ? 'Almost out' : 'Watch'}</Badge>
            )}
          </div>
          {budget.current && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarRange className="h-3 w-3" /> {shortDate(budget.current.windowStart)} – {shortDate(budget.current.windowEnd)}
            </p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-full p-1.5 text-muted-foreground hover:bg-muted" aria-label={`Actions for ${label}`}><EllipsisVertical className="h-4 w-4" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}><Pencil /> Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={onDelete}><Trash2 /> Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {budget.current ? (
        <BudgetMeter budget={budget} label={label} />
      ) : (
        <p className={cn('text-sm', statusTone.ok.text)}>
          <span className="font-semibold text-foreground">{label}</span> · <Money value={budget.amount} /> — not active today ({budget.startDate}{budget.endDate ? ` → ${budget.endDate}` : ''})
        </p>
      )}
    </Card>
  );
}

const formSchema = z
  .object({
    categoryId: z.string(),
    amount: z.string().refine((v) => {
      const p = parseMoneyInput(v);
      return p !== null && isPositiveMoney(p);
    }, 'Enter a valid amount'),
    period: z.enum(BUDGET_PERIODS),
    startDate: z.string().min(1, 'Required'),
    endDate: z.string(),
  })
  .refine((v) => v.period !== 'custom' || !!v.endDate, { message: 'Custom budgets need an end date', path: ['endDate'] })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { message: 'End must be after start', path: ['endDate'] });
type FormValues = z.infer<typeof formSchema>;

function BudgetFormDialog({ open, onOpenChange, budget }: { open: boolean; onOpenChange: (o: boolean) => void; budget: BudgetDTO | null }) {
  const { categories } = useCategories();
  const currency = useCurrency();
  const { create, update } = useBudgetMutations();
  const expenseCats = categories.filter((c) => c.type === 'expense');
  const defaults = (): FormValues => ({
    categoryId: budget?.categoryId ?? 'overall',
    amount: budget?.amount.replace(/\.00$/, '') ?? '',
    period: budget?.period ?? 'monthly',
    startDate: budget?.startDate ?? startOfMonthISO(localTodayISO()),
    endDate: budget?.endDate ?? '',
  });
  const { register, control, handleSubmit, reset, watch, setError, formState: { errors, isSubmitting } } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: defaults() });
  useEffect(() => {
    if (open) reset(defaults());
  }, [open, budget]); // eslint-disable-line react-hooks/exhaustive-deps
  const period = watch('period');

  const onSubmit = handleSubmit(async (v) => {
    const payload = {
      categoryId: v.categoryId === 'overall' ? null : v.categoryId,
      amount: parseMoneyInput(v.amount)!,
      period: v.period,
      startDate: v.startDate,
      endDate: v.endDate || null,
    };
    try {
      if (budget) await update.mutateAsync({ id: budget.id, ...payload });
      else await create.mutateAsync(payload);
      toast.success(budget ? 'Budget updated' : 'Budget created');
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'DUPLICATE') setError('categoryId', { message: e.message });
      else toast.error(errorMessage(e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogHeader>
            <DialogTitle>{budget ? 'Edit budget' : 'New budget'}</DialogTitle>
            <DialogDescription>Budgets track expenses in each period and alert you as you approach the limit.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Field label="Applies to" error={errors.categoryId?.message}>
              <Controller
                control={control}
                name="categoryId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="overall">All expenses (overall)</SelectItem>
                      {expenseCats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Amount" htmlFor="b-amount" error={errors.amount?.message}>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">{currencySymbol(currency)}</span>
                <Input id="b-amount" inputMode="decimal" className="num pl-9" placeholder="0" aria-invalid={!!errors.amount} {...register('amount')} />
              </div>
            </Field>
            <Field label="Period">
              <Controller
                control={control}
                name="period"
                render={({ field }) => (
                  <div className="grid grid-cols-4 gap-1.5">
                    {BUDGET_PERIODS.map((p) => (
                      <button key={p} type="button" onClick={() => field.onChange(p)} className={cn('press h-10 rounded-md text-[13px] font-semibold ring-1 ring-border', field.value === p ? 'bg-primary text-primary-foreground ring-primary' : 'bg-surface')}>
                        {p === 'custom' ? 'Custom' : PERIOD_LABELS[p]}
                      </button>
                    ))}
                  </div>
                )}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts" htmlFor="b-start" error={errors.startDate?.message} hint={period !== 'custom' ? 'Periods repeat from this date' : undefined}>
                <Input id="b-start" type="date" {...register('startDate')} />
              </Field>
              <Field label={period === 'custom' ? 'Ends' : 'Ends (optional)'} htmlFor="b-end" error={errors.endDate?.message}>
                <Input id="b-end" type="date" {...register('endDate')} />
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={isSubmitting}>{budget ? 'Save' : 'Create budget'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
