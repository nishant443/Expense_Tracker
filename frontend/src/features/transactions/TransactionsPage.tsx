import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDownUp, Copy, EllipsisVertical, Pencil, Receipt, Search, SearchX, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { addMoney, money, TRANSACTION_SORTS, type TransactionSort } from '@expenseflow/shared';
import { useConfirm } from '@/components/confirm-dialog';
import { Money } from '@/components/money';
import { EmptyState, PageHeader } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Badge, Skeleton } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCategories, useLocalTransactions } from '@/features/data/hooks';
import { useDebounce } from '@/hooks/use-debounce';
import type { LocalTransaction } from '@/lib/db';
import { friendlyDate } from '@/lib/format';
import { dayNet, groupByDate } from '@/lib/local-analytics';
import { cn } from '@/lib/utils';
import { deleteTransaction, discardFailedChange, restoreTransaction } from '@/services/local-transactions';
import { activeFilterCount, applyFilters, DEFAULT_FILTERS, readFilters, writeFilters, type TxFilters } from './filters';
import { TransactionRow } from './TransactionRow';

const SORT_LABELS: Record<TransactionSort, string> = { newest: 'Newest first', oldest: 'Oldest first', highest: 'Highest amount', lowest: 'Lowest amount' };
const PAGE = 60;

export default function TransactionsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const [query, setQuery] = useState(filters.q);
  const debouncedQ = useDebounce(query, 250);
  const [filterOpen, setFilterOpen] = useState(false);
  const [visible, setVisible] = useState(PAGE);
  const [confirm, confirmDialog] = useConfirm();

  const txs = useLocalTransactions();
  const { categories } = useCategories();
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const catNames = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const setFilters = (patch: Partial<TxFilters>) => setParams(writeFilters({ ...filters, ...patch }), { replace: true });

  useEffect(() => {
    if (debouncedQ !== filters.q) setFilters({ q: debouncedQ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  const filtered = useMemo(() => (txs ? applyFilters(txs, filters, catNames) : []), [txs, params.toString(), catNames]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setVisible(PAGE), [params.toString()]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => {
    const inc = filtered.filter((t) => t.type === 'income').map((t) => t.amount);
    const exp = filtered.filter((t) => t.type === 'expense').map((t) => t.amount);
    return { income: addMoney('0', ...inc), expense: addMoney('0', ...exp) };
  }, [filtered]);

  const byDateSort = filters.sort === 'newest' || filters.sort === 'oldest';
  const shown = filtered.slice(0, visible);
  const groups = byDateSort ? groupByDate(shown) : [{ date: '', items: shown }];

  // Infinite scroll: render more as the sentinel enters the viewport.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && setVisible((v) => v + PAGE), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length]);

  const onDelete = async (t: LocalTransaction) => {
    const ok = await confirm({ title: 'Delete transaction?', description: `“${t.description}” will be removed from all your devices.`, confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    const removed = await deleteTransaction(t.id);
    toast.success('Transaction deleted', {
      action: removed ? { label: 'Undo', onClick: () => void restoreTransaction(removed) } : undefined,
    });
  };

  const nActive = activeFilterCount(filters);
  const hasAnyFilter = nActive > 0 || !!filters.q;

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle={txs ? `${filtered.length} ${filtered.length === 1 ? 'transaction' : 'transactions'}` : ' '}
        action={
          <Button className="hidden sm:inline-flex" onClick={() => navigate('/transactions/new')}>
            Add transaction
          </Button>
        }
      />

      <div className="sticky top-[calc(3.5rem+var(--tb))] z-20 -mx-4 mb-4 bg-background/90 px-4 py-2 backdrop-blur-xl lg:top-[calc(4rem+var(--tb))] lg:-mx-8 lg:px-8">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search description, notes, category…" className="pl-10 pr-9" aria-label="Search transactions" type="search" />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label="Clear search">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button variant="outline" size="icon" className="relative h-11 w-11 shrink-0" onClick={() => setFilterOpen(true)} aria-label="Filters">
            <SlidersHorizontal />
            {nActive > 0 && <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{nActive}</span>}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label="Sort">
                <ArrowDownUp />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={filters.sort} onValueChange={(v) => setFilters({ sort: v as TransactionSort })}>
                {TRANSACTION_SORTS.map((s) => (
                  <DropdownMenuRadioItem key={s} value={s}>
                    {SORT_LABELS[s]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* type quick filter + summary */}
        <div className="mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {(['all', 'expense', 'income'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilters({ type: t })}
              className={cn(
                'press h-8 shrink-0 rounded-full px-3.5 text-[13px] font-semibold capitalize ring-1 ring-border transition',
                filters.type === t ? 'bg-foreground text-background ring-foreground' : 'bg-surface text-muted-foreground',
              )}
            >
              {t === 'all' ? 'All' : t === 'expense' ? 'Expenses' : 'Income'}
            </button>
          ))}
          {filters.categoryId !== 'all' && (
            <Badge variant="default" className="h-8 shrink-0 rounded-full px-3 text-[12px]">
              {catMap.get(filters.categoryId)?.name}
              <button onClick={() => setFilters({ categoryId: 'all' })} aria-label="Remove category filter"><X className="h-3 w-3" /></button>
            </Badge>
          )}
          {(filters.from || filters.to) && (
            <Badge variant="default" className="h-8 shrink-0 rounded-full px-3 text-[12px]">
              {filters.from || '…'} → {filters.to || '…'}
              <button onClick={() => setFilters({ from: '', to: '' })} aria-label="Remove date filter"><X className="h-3 w-3" /></button>
            </Badge>
          )}
          <div className="ml-auto hidden shrink-0 gap-3 text-[13px] sm:flex">
            <span className="text-muted-foreground">In <Money value={totals.income} className="font-semibold text-success" /></span>
            <span className="text-muted-foreground">Out <Money value={totals.expense} className="font-semibold text-foreground" /></span>
          </div>
        </div>
      </div>

      {!txs ? (
        <Card className="space-y-4 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-1/2" /><Skeleton className="h-3 w-1/4" /></div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          {hasAnyFilter ? (
            <EmptyState icon={SearchX} title="No matches" description="Try a different search or clear your filters." action={<Button variant="outline" size="sm" onClick={() => { setQuery(''); setParams(writeFilters(DEFAULT_FILTERS)); }}>Clear filters</Button>} />
          ) : (
            <EmptyState icon={Receipt} title="No transactions yet" description="Track your first expense or income — it only takes a few seconds." action={<Button size="sm" onClick={() => navigate('/transactions/new')}>Add transaction</Button>} />
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          <AnimatePresence initial={false}>
            {groups.map((g) => (
              <motion.section key={g.date || 'all'} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {g.date && (
                  <div className="mb-1.5 flex items-center justify-between px-1">
                    <h2 className="text-[13px] font-semibold text-muted-foreground">{friendlyDate(g.date)}</h2>
                    <Money value={dayNet(g.items)} sign className={cn('text-[13px] font-semibold', money(dayNet(g.items)).gt(0) ? 'text-success' : 'text-muted-foreground')} />
                  </div>
                )}
                <Card className="p-1.5">
                  {g.items.map((t) => (
                    <TransactionRow
                      key={t.id}
                      tx={t}
                      category={catMap.get(t.categoryId)}
                      showDate={!g.date}
                      onClick={() => navigate(`/transactions/${t.id}/edit`)}
                      trailing={
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <button className="rounded-full p-1.5 text-muted-foreground opacity-70 hover:bg-muted hover:opacity-100" aria-label={`Actions for ${t.description}`}>
                              <EllipsisVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem onSelect={() => navigate(`/transactions/${t.id}/edit`)}><Pencil /> Edit</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => navigate(`/transactions/new?duplicate=${t.id}`)}><Copy /> Duplicate</DropdownMenuItem>
                            {t.syncStatus === 'failed' && (
                              <DropdownMenuItem onSelect={() => void discardFailedChange(t.id)}><X /> Discard unsynced change</DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem destructive onSelect={() => void onDelete(t)}><Trash2 /> Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      }
                    />
                  ))}
                </Card>
              </motion.section>
            ))}
          </AnimatePresence>
          {visible < filtered.length && <div ref={sentinel} className="h-10" aria-hidden />}
        </div>
      )}

      <FilterDialog open={filterOpen} onOpenChange={setFilterOpen} filters={filters} onApply={(f) => setFilters(f)} />
      {confirmDialog}
    </div>
  );
}

function FilterDialog({ open, onOpenChange, filters, onApply }: { open: boolean; onOpenChange: (o: boolean) => void; filters: TxFilters; onApply: (f: Partial<TxFilters>) => void }) {
  const { categories } = useCategories();
  const [draft, setDraft] = useState(filters);
  useEffect(() => {
    if (open) setDraft(filters);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const visibleCats = categories.filter((c) => draft.type === 'all' || c.type === draft.type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Filter transactions</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <Field label="Type">
            <div className="grid grid-cols-3 gap-2">
              {(['all', 'expense', 'income'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setDraft({ ...draft, type: t, categoryId: 'all' })}
                  className={cn('press h-10 rounded-md text-sm font-semibold ring-1 ring-border', draft.type === t ? 'bg-primary text-primary-foreground ring-primary' : 'bg-surface')}
                >
                  {t === 'all' ? 'All' : t === 'expense' ? 'Expense' : 'Income'}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Category">
            <Select value={draft.categoryId} onValueChange={(v) => setDraft({ ...draft, categoryId: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {visibleCats.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} {draft.type === 'all' && <span className="text-muted-foreground">· {c.type}</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" htmlFor="from">
              <Input id="from" type="date" value={draft.from} max={draft.to || undefined} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
            </Field>
            <Field label="To" htmlFor="to">
              <Input id="to" type="date" value={draft.to} min={draft.from || undefined} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { onApply({ type: 'all', categoryId: 'all', from: '', to: '' }); onOpenChange(false); }}>
            Reset
          </Button>
          <Button onClick={() => { onApply({ type: draft.type, categoryId: draft.categoryId, from: draft.from, to: draft.to }); onOpenChange(false); }}>
            Apply filters
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
