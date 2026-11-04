import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Copy, ExternalLink, FileText, Paperclip, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  ATTACHMENT_MAX_BYTES,
  isPositiveMoney,
  localTodayISO,
  parseMoneyInput,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  RECEIPT_MIME_TYPES,
  type PaymentMethod,
  type TransactionDTO,
  type TransactionType,
} from '@expenseflow/shared';
import { CategoryIcon } from '@/components/category-icon';
import { useConfirm } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/misc';
import { useCategories, useLocalTransaction } from '@/features/data/hooks';
import { api, errorMessage } from '@/lib/api';
import { db } from '@/lib/db';
import { currencySymbol } from '@/lib/format';
import { cn } from '@/lib/utils';
import { createTransaction, deleteTransaction, restoreTransaction, updateTransaction } from '@/services/local-transactions';
import { syncNow } from '@/services/sync-engine';
import { useCurrency } from '@/stores/auth';
import { useSyncStore } from '@/stores/sync';

const schema = z.object({
  type: z.enum(['expense', 'income']),
  amount: z
    .string()
    .min(1, 'Enter an amount')
    .refine((v) => {
      const p = parseMoneyInput(v);
      return p !== null && isPositiveMoney(p);
    }, 'Enter a valid amount greater than 0'),
  categoryId: z.string().min(1, 'Choose a category'),
  description: z.string().trim().min(1, 'Add a short description').max(120),
  notes: z.string().max(1000).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  transactionDate: z.string().min(1, 'Pick a date'),
});
type FormValues = z.infer<typeof schema>;

export default function TransactionFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const duplicateId = params.get('duplicate') ?? undefined;
  const editing = useLocalTransaction(id);
  const source = useLocalTransaction(duplicateId);
  const isEdit = !!id;

  if ((isEdit && editing === undefined) || (duplicateId && source === undefined)) {
    // useLiveQuery returns undefined while loading and also when missing; give it a moment.
    return <FormLoading missing={isEdit} />;
  }
  return <TransactionForm key={id ?? duplicateId ?? 'new'} existing={isEdit ? editing : undefined} template={source} initialType={(params.get('type') as TransactionType) ?? undefined} />;
}

function FormLoading({ missing }: { missing: boolean }) {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 1500);
    return () => clearTimeout(t);
  }, []);
  if (timedOut && missing) {
    return <EmptyState icon={FileText} title="Transaction not found" description="It may have been deleted on another device." action={<Button asChild variant="outline"><Link to="/transactions">Back to transactions</Link></Button>} />;
  }
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Skeleton className="h-10 w-40" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

function TransactionForm({ existing, template, initialType }: { existing?: TransactionDTO; template?: TransactionDTO; initialType?: TransactionType }) {
  const navigate = useNavigate();
  const currency = useCurrency();
  const online = useSyncStore((s) => s.online);
  const { categories, loading: catsLoading } = useCategories();
  const [confirm, confirmDialog] = useConfirm();
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const base = existing ?? template;

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: base?.type ?? initialType ?? 'expense',
      amount: base ? base.amount.replace(/\.00$/, '') : '',
      categoryId: base?.categoryId ?? '',
      description: base?.description ?? '',
      notes: base?.notes ?? '',
      paymentMethod: base?.paymentMethod ?? 'upi',
      transactionDate: existing?.transactionDate ?? localTodayISO(),
    },
  });

  const type = watch('type');
  const categoryId = watch('categoryId');
  const typeCats = useMemo(() => categories.filter((c) => c.type === type), [categories, type]);

  // Keep category consistent with the type.
  useEffect(() => {
    if (catsLoading) return;
    if (!typeCats.some((c) => c.id === categoryId)) setValue('categoryId', '', { shouldValidate: false });
  }, [type, typeCats, categoryId, catsLoading, setValue]);

  const onSubmit = handleSubmit(async (v) => {
    const draft = {
      type: v.type,
      amount: parseMoneyInput(v.amount)!,
      categoryId: v.categoryId,
      description: v.description,
      notes: v.notes || null,
      paymentMethod: v.paymentMethod,
      transactionDate: v.transactionDate,
    };
    try {
      let txId: string;
      if (existing) {
        await updateTransaction(existing.id, draft);
        txId = existing.id;
      } else {
        txId = (await createTransaction(draft)).id;
      }
      if (receipt) await uploadReceipt(txId, receipt);
      toast.success(existing ? 'Transaction updated' : `${v.type === 'income' ? 'Income' : 'Expense'} added`, {
        description: navigator.onLine ? undefined : 'Saved offline — it will sync when you reconnect.',
      });
      navigate(-1);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  /** Receipts upload once the transaction exists on the server. */
  async function uploadReceipt(txId: string, file: File) {
    if (!navigator.onLine) {
      toast.info('Receipt not attached', { description: 'Attach receipts when you are back online.' });
      return;
    }
    setReceiptBusy(true);
    try {
      await syncNow();
      const local = await db.transactions.get(txId);
      if (!local || local.syncStatus !== 'synced') throw new Error('Transaction has not synced yet; try attaching the receipt again shortly.');
      const form = new FormData();
      form.append('file', file);
      const updated = await api.post<TransactionDTO>(`/transactions/${txId}/receipt`, form);
      await db.transactions.put({ ...updated, syncStatus: 'synced' });
    } catch (e) {
      toast.error('Receipt upload failed', { description: errorMessage(e) });
    } finally {
      setReceiptBusy(false);
    }
  }

  const removeReceipt = async () => {
    if (!existing) return;
    const ok = await confirm({ title: 'Remove receipt?', confirmLabel: 'Remove', destructive: true });
    if (!ok) return;
    try {
      const updated = await api.delete<TransactionDTO>(`/transactions/${existing.id}/receipt`);
      await db.transactions.put({ ...updated, syncStatus: 'synced' });
      toast.success('Receipt removed');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const onDelete = async () => {
    if (!existing) return;
    const ok = await confirm({ title: 'Delete transaction?', description: 'This removes it from all your devices.', confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    const removed = await deleteTransaction(existing.id);
    toast.success('Transaction deleted', { action: removed ? { label: 'Undo', onClick: () => void restoreTransaction(removed) } : undefined });
    navigate('/transactions', { replace: true });
  };

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    if (!(RECEIPT_MIME_TYPES as readonly string[]).includes(f.type)) return toast.error('Use a JPG, PNG, WebP or PDF file');
    if (f.size > ATTACHMENT_MAX_BYTES) return toast.error('File is larger than 5 MB');
    setReceipt(f);
  };

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-xl" noValidate>
      <div className="mb-4 flex items-center gap-2">
        <Button type="button" variant="ghost" size="icon" className="-ml-2 rounded-full" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="!size-5" />
        </Button>
        <h1 className="flex-1 text-xl font-bold tracking-tight">{existing ? 'Edit transaction' : template ? 'Duplicate transaction' : 'New transaction'}</h1>
        {existing && (
          <>
            <Button type="button" variant="ghost" size="icon" onClick={() => navigate(`/transactions/new?duplicate=${existing.id}`)} aria-label="Duplicate">
              <Copy />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="text-danger hover:bg-danger-soft" onClick={onDelete} aria-label="Delete">
              <Trash2 />
            </Button>
          </>
        )}
      </div>

      {/* Amount hero */}
      <Card className="overflow-hidden">
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <div className="relative m-3 grid grid-cols-2 rounded-md bg-muted p-1" role="radiogroup" aria-label="Transaction type">
              <motion.div
                className={cn('absolute inset-y-1 w-[calc(50%-4px)] rounded-[9px] shadow-sm', field.value === 'expense' ? 'bg-surface dark:bg-elevated' : 'bg-success')}
                animate={{ x: field.value === 'expense' ? 0 : '100%' }}
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                style={{ left: 4 }}
              />
              {(['expense', 'income'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={field.value === t}
                  onClick={() => field.onChange(t)}
                  className={cn('relative z-10 h-9 text-sm font-semibold capitalize transition-colors', field.value === t ? (t === 'income' ? 'text-white' : 'text-foreground') : 'text-muted-foreground')}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        />
        <div className="px-5 pb-6 pt-3 text-center">
          <label htmlFor="amount" className="text-[13px] font-medium text-muted-foreground">
            Amount
          </label>
          <div className="mt-1 flex items-center justify-center gap-1.5">
            <span className={cn('text-3xl font-semibold', type === 'income' ? 'text-success' : 'text-muted-foreground')}>{currencySymbol(currency)}</span>
            <input
              id="amount"
              inputMode="decimal"
              autoComplete="off"
              autoFocus={!existing}
              placeholder="0"
              aria-invalid={!!errors.amount}
              {...register('amount')}
              className={cn('num w-full max-w-[260px] bg-transparent text-center text-5xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/40', type === 'income' && 'text-success')}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            />
          </div>
          {errors.amount && <p className="mt-2 text-[13px] font-medium text-danger" role="alert">{errors.amount.message}</p>}
        </div>
      </Card>

      {/* Category grid */}
      <Card className="mt-4 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Category</h2>
          <Link to="/categories" className="text-[13px] font-medium text-primary hover:underline">Manage</Link>
        </div>
        {catsLoading ? (
          <div className="grid grid-cols-4 gap-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[74px] rounded-lg" />)}</div>
        ) : (
          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Category">
                {typeCats.map((c) => {
                  const selected = field.value === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => field.onChange(c.id)}
                      className={cn('press flex flex-col items-center gap-1.5 rounded-lg px-1 py-2.5 ring-1 ring-transparent transition', selected ? 'bg-primary/[0.07] ring-primary' : 'hover:bg-muted')}
                    >
                      <CategoryIcon icon={c.icon} color={c.color} />
                      <span className="line-clamp-2 text-center text-[11px] font-medium leading-tight">{c.name}</span>
                    </button>
                  );
                })}
                <Link to="/categories?new=1" className="press flex flex-col items-center gap-1.5 rounded-lg px-1 py-2.5 hover:bg-muted">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-dashed border-border text-muted-foreground"><Plus className="h-4 w-4" /></span>
                  <span className="text-[11px] font-medium text-muted-foreground">New</span>
                </Link>
              </div>
            )}
          />
        )}
        {errors.categoryId && <p className="mt-2 text-[13px] font-medium text-danger" role="alert">{errors.categoryId.message}</p>}
      </Card>

      {/* Details */}
      <Card className="mt-4 space-y-4 p-4">
        <Field label="Description" htmlFor="description" error={errors.description?.message}>
          <Input id="description" placeholder={type === 'income' ? 'e.g. October salary' : 'e.g. Lunch with team'} aria-invalid={!!errors.description} {...register('description')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" htmlFor="date" error={errors.transactionDate?.message}>
            <Input id="date" type="date" {...register('transactionDate')} />
          </Field>
          <Field label="Payment method">
            <Controller
              control={control}
              name="paymentMethod"
              render={({ field }) => (
                <select value={field.value} onChange={(e) => field.onChange(e.target.value as PaymentMethod)} className="flex h-11 w-full rounded-md border border-border bg-surface px-3 text-[15px] shadow-sm focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15 focus-visible:ring-offset-0">
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
                  ))}
                </select>
              )}
            />
          </Field>
        </div>
        <Field label="Notes" htmlFor="notes" hint="Optional">
          <Textarea id="notes" rows={3} placeholder="Add any details…" {...register('notes')} />
        </Field>

        {/* Receipt */}
        <div>
          <p className="mb-1.5 text-[13px] font-medium">Receipt</p>
          {existing?.hasReceipt && !receipt ? (
            <div className="flex items-center gap-3 rounded-md border border-border p-3">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-sm">Receipt attached</span>
              <Button type="button" variant="ghost" size="sm" asChild>
                <a href={api.url(`/api/transactions/${existing.id}/receipt`)} target="_blank" rel="noreferrer"><ExternalLink /> View</a>
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={!online} onClick={() => fileRef.current?.click()}>Replace</Button>
              <Button type="button" variant="ghost" size="icon-sm" disabled={!online} onClick={removeReceipt} aria-label="Remove receipt"><X /></Button>
            </div>
          ) : receipt ? (
            <div className="flex items-center gap-3 rounded-md border border-primary/40 bg-primary/[0.04] p-3">
              <Paperclip className="h-4 w-4 text-primary" />
              <span className="flex-1 truncate text-sm">{receipt.name}</span>
              <span className="text-xs text-muted-foreground">{(receipt.size / 1024).toFixed(0)} KB</span>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setReceipt(null)} aria-label="Remove file"><X /></Button>
            </div>
          ) : (
            <button
              type="button"
              disabled={!online}
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-border py-4 text-sm font-medium text-muted-foreground transition hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Paperclip className="h-4 w-4" /> {online ? 'Attach receipt (JPG, PNG, PDF · max 5 MB)' : 'Receipts can be attached when online'}
            </button>
          )}
          <input ref={fileRef} type="file" accept={RECEIPT_MIME_TYPES.join(',')} capture="environment" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
        </div>
      </Card>

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] -mx-4 mt-5 bg-gradient-to-t from-background via-background to-transparent px-4 pb-3 pt-6 lg:static lg:mx-0 lg:bg-none lg:px-0 lg:pb-0">
        <Button type="submit" size="lg" className={cn('w-full', type === 'income' && 'bg-success hover:bg-success/90')} loading={isSubmitting || receiptBusy}>
          {existing ? 'Save changes' : type === 'income' ? 'Add income' : 'Add expense'}
        </Button>
      </div>
      {confirmDialog}
    </form>
  );
}
