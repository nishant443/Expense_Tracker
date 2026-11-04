import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarClock, EllipsisVertical, Pause, Pencil, Play, Plus, Repeat, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  FREQUENCIES,
  isPositiveMoney,
  localTodayISO,
  parseMoneyInput,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type Frequency,
  type RecurringDTO,
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
import { Badge, Skeleton, Switch } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCategories, useRecurring, useRecurringMutations } from '@/features/data/hooks';
import { errorMessage } from '@/lib/api';
import { currencySymbol, friendlyDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/stores/auth';

const FREQ_LABEL: Record<Frequency, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

export default function RecurringPage() {
  const { data, isLoading, error, refetch } = useRecurring();
  const { categories } = useCategories();
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const { update, remove } = useRecurringMutations();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringDTO | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  const toggle = (r: RecurringDTO) =>
    update.mutate(
      { id: r.id, type: r.type, amount: r.amount, categoryId: r.categoryId, description: r.description, paymentMethod: r.paymentMethod, frequency: r.frequency, startDate: r.startDate, endDate: r.endDate, isActive: !r.isActive },
      { onSuccess: () => toast.success(r.isActive ? 'Paused' : 'Resumed'), onError: (e) => toast.error(errorMessage(e)) },
    );

  const onDelete = async (r: RecurringDTO) => {
    const ok = await confirm({ title: `Delete “${r.description}”?`, description: 'Future occurrences stop. Transactions already recorded are kept.', confirmLabel: 'Delete', destructive: true });
    if (ok) remove.mutate(r.id, { onSuccess: () => toast.success('Recurring transaction deleted'), onError: (e) => toast.error(errorMessage(e)) });
  };

  return (
    <div>
      <PageHeader title="Recurring" subtitle="Rent, salary, bills and subscriptions — on autopilot" action={<Button onClick={() => (setEditing(null), setOpen(true))}><Plus /> <span className="hidden sm:inline">New recurring</span></Button>} />
      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : error && !data ? (
        <Card><ErrorState error={error} onRetry={() => void refetch()} /></Card>
      ) : !data?.length ? (
        <Card>
          <EmptyState icon={Repeat} title="Nothing recurring yet" description="Add rent, salary or subscriptions once and we'll record them automatically on schedule." action={<Button onClick={() => setOpen(true)}><Plus /> Add recurring</Button>} />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((r) => {
            const c = catMap.get(r.categoryId);
            return (
              <Card key={r.id} className={cn('p-4 transition-opacity', !r.isActive && 'opacity-60')}>
                <div className="flex items-start gap-3">
                  <CategoryIcon icon={c?.icon} color={c?.color} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold">{r.description}</p>
                      <Badge variant={r.isActive ? 'default' : 'muted'}>{FREQ_LABEL[r.frequency]}</Badge>
                    </div>
                    <p className="text-[13px] text-muted-foreground">{c?.name} · {PAYMENT_METHOD_LABELS[r.paymentMethod]}</p>
                  </div>
                  <Money value={r.amount} type={r.type} className="font-semibold" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="-mr-1 rounded-full p-1.5 text-muted-foreground hover:bg-muted" aria-label={`Actions for ${r.description}`}><EllipsisVertical className="h-4 w-4" /></button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => (setEditing(r), setOpen(true))}><Pencil /> Edit</DropdownMenuItem>
                      {(r.isActive || r.nextExecutionDate || !r.endDate || r.endDate >= localTodayISO()) && (
                        <DropdownMenuItem onSelect={() => toggle(r)}>{r.isActive ? <><Pause /> Pause</> : <><Play /> Resume</>}</DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem destructive onSelect={() => void onDelete(r)}><Trash2 /> Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-md bg-muted/70 px-3 py-2 text-[13px]">
                  <CalendarClock className="h-4 w-4 text-muted-foreground" />
                  {r.isActive && r.nextExecutionDate ? (
                    <span>Next on <span className="font-semibold">{friendlyDate(r.nextExecutionDate)}</span></span>
                  ) : (
                    <span className="text-muted-foreground">{r.nextExecutionDate ? 'Paused' : 'Completed'}</span>
                  )}
                  {r.endDate && <span className="ml-auto text-xs text-muted-foreground">ends {r.endDate}</span>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <RecurringDialog open={open} onOpenChange={setOpen} item={editing} />
      {confirmDialog}
    </div>
  );
}

const schema = z
  .object({
    type: z.enum(['expense', 'income']),
    amount: z.string().refine((v) => {
      const p = parseMoneyInput(v);
      return p !== null && isPositiveMoney(p);
    }, 'Enter a valid amount'),
    categoryId: z.string().min(1, 'Choose a category'),
    description: z.string().trim().min(1, 'Required').max(120),
    paymentMethod: z.enum(PAYMENT_METHODS),
    frequency: z.enum(FREQUENCIES),
    startDate: z.string().min(1, 'Required'),
    endDate: z.string(),
    isActive: z.boolean(),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { message: 'End must be on/after start', path: ['endDate'] });
type FormValues = z.infer<typeof schema>;

function RecurringDialog({ open, onOpenChange, item }: { open: boolean; onOpenChange: (o: boolean) => void; item: RecurringDTO | null }) {
  const { categories } = useCategories();
  const currency = useCurrency();
  const { create, update } = useRecurringMutations();
  const defaults = (): FormValues => ({
    type: item?.type ?? 'expense',
    amount: item?.amount.replace(/\.00$/, '') ?? '',
    categoryId: item?.categoryId ?? '',
    description: item?.description ?? '',
    paymentMethod: item?.paymentMethod ?? 'bank_transfer',
    frequency: item?.frequency ?? 'monthly',
    startDate: item?.startDate ?? localTodayISO(),
    endDate: item?.endDate ?? '',
    isActive: item?.isActive ?? true,
  });
  const { register, control, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults() });
  useEffect(() => {
    if (open) reset(defaults());
  }, [open, item]); // eslint-disable-line react-hooks/exhaustive-deps
  const type = watch('type');
  const cats = categories.filter((c) => c.type === type);

  const onSubmit = handleSubmit(async (v) => {
    const payload = { ...v, amount: parseMoneyInput(v.amount)!, endDate: v.endDate || null };
    try {
      if (item) await update.mutateAsync({ id: item.id, ...payload });
      else await create.mutateAsync(payload);
      toast.success(item ? 'Recurring transaction updated' : 'Recurring transaction created', {
        description: v.startDate <= localTodayISO() ? 'Any due occurrences were recorded.' : undefined,
      });
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogHeader>
            <DialogTitle>{item ? 'Edit recurring' : 'New recurring transaction'}</DialogTitle>
            <DialogDescription>Occurrences are created automatically on each due date.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {(['expense', 'income'] as const).map((t) => (
                <button key={t} type="button" onClick={() => (setValue('type', t), setValue('categoryId', ''))} className={cn('press h-10 rounded-md text-sm font-semibold capitalize ring-1 ring-border', type === t ? (t === 'income' ? 'bg-success text-white ring-success' : 'bg-primary text-primary-foreground ring-primary') : 'bg-surface')}>{t}</button>
              ))}
            </div>
            <Field label="Description" htmlFor="r-desc" error={errors.description?.message}>
              <Input id="r-desc" placeholder="e.g. Rent, Netflix, Salary" {...register('description')} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount" htmlFor="r-amt" error={errors.amount?.message}>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">{currencySymbol(currency)}</span>
                  <Input id="r-amt" inputMode="decimal" className="num pl-9" {...register('amount')} />
                </div>
              </Field>
              <Field label="Frequency">
                <Controller control={control} name="frequency" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{FREQ_LABEL[f]}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category" error={errors.categoryId?.message}>
                <Controller control={control} name="categoryId" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-invalid={!!errors.categoryId}><SelectValue placeholder="Choose…" /></SelectTrigger>
                    <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </Field>
              <Field label="Payment method">
                <Controller control={control} name="paymentMethod" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date" htmlFor="r-start" error={errors.startDate?.message}><Input id="r-start" type="date" {...register('startDate')} /></Field>
              <Field label="End date (optional)" htmlFor="r-end" error={errors.endDate?.message}><Input id="r-end" type="date" {...register('endDate')} /></Field>
            </div>
            <Controller control={control} name="isActive" render={({ field }) => (
              <label className="flex items-center justify-between rounded-md bg-muted/60 px-3.5 py-3 text-sm font-medium">
                Active
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </label>
            )} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={isSubmitting}>{item ? 'Save' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
