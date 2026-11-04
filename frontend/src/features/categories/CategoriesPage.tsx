import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { CATEGORY_COLORS, CATEGORY_ICONS, type CategoryDTO, type TransactionType } from '@expenseflow/shared';
import { CategoryIcon } from '@/components/category-icon';
import { useConfirm } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { useCategories, useCategoryMutations } from '@/features/data/hooks';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useSyncStore } from '@/stores/sync';

export default function CategoriesPage() {
  const { categories, loading } = useCategories();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<TransactionType>('expense');
  const [editing, setEditing] = useState<CategoryDTO | null>(null);
  const [open, setOpen] = useState(params.get('new') === '1');
  const { remove } = useCategoryMutations();
  const online = useSyncStore((s) => s.online);
  const [confirm, confirmDialog] = useConfirm();

  const onDelete = async (c: CategoryDTO) => {
    const ok = await confirm({
      title: `Delete “${c.name}”?`,
      description: 'Existing transactions and recurring rules in this category will move to “Others”.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) remove.mutate(c.id, { onSuccess: () => toast.success('Category deleted'), onError: (e) => toast.error(errorMessage(e)) });
  };

  return (
    <div>
      <PageHeader
        title="Categories"
        subtitle="Organise how your money is grouped"
        action={<Button disabled={!online} onClick={() => (setEditing(null), setOpen(true))}><Plus /> <span className="hidden sm:inline">New category</span></Button>}
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as TransactionType)}>
        <TabsList className="mb-4 w-full sm:w-72">
          <TabsTrigger value="expense">Expenses</TabsTrigger>
          <TabsTrigger value="income">Income</TabsTrigger>
        </TabsList>
        {(['expense', 'income'] as const).map((t) => (
          <TabsContent key={t} value={t}>
            <Card className="divide-y divide-border/60">
              {loading
                ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="flex items-center gap-3 p-4"><Skeleton className="h-10 w-10 rounded-xl" /><Skeleton className="h-4 w-32" /></div>)
                : categories
                    .filter((c) => c.type === t)
                    .map((c) => (
                      <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                        <CategoryIcon icon={c.icon} color={c.color} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{c.name}</p>
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            {c.isDefault ? <><Lock className="h-3 w-3" /> Default</> : 'Custom'}
                          </p>
                        </div>
                        <Button variant="ghost" size="icon-sm" disabled={!online} onClick={() => (setEditing(c), setOpen(true))} aria-label={`Edit ${c.name}`}><Pencil /></Button>
                        {!c.isDefault && (
                          <Button variant="ghost" size="icon-sm" disabled={!online} className="text-danger hover:bg-danger-soft" onClick={() => void onDelete(c)} aria-label={`Delete ${c.name}`}><Trash2 /></Button>
                        )}
                      </div>
                    ))}
            </Card>
          </TabsContent>
        ))}
      </Tabs>
      {!online && <p className="mt-3 text-center text-xs text-muted-foreground">Managing categories requires a connection.</p>}
      <CategoryDialog
        open={open}
        category={editing}
        defaultType={tab}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o && params.get('new')) setParams({}, { replace: true });
        }}
      />
      {confirmDialog}
    </div>
  );
}

function CategoryDialog({ open, onOpenChange, category, defaultType }: { open: boolean; onOpenChange: (o: boolean) => void; category: CategoryDTO | null; defaultType: TransactionType }) {
  const { create, update } = useCategoryMutations();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>(CATEGORY_ICONS[0]);
  const [color, setColor] = useState<string>(CATEGORY_COLORS[6]);
  const [type, setType] = useState<TransactionType>(defaultType);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? '');
    setIcon(category?.icon ?? 'shopping-bag');
    setColor(category?.color ?? CATEGORY_COLORS[6]);
    setType(category?.type ?? defaultType);
    setError(null);
  }, [open, category, defaultType]);

  const busy = create.isPending || update.isPending;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Name is required');
    try {
      if (category) await update.mutateAsync({ id: category.id, name: name.trim(), icon, color });
      else await create.mutateAsync({ name: name.trim(), icon, color, type });
      toast.success(category ? 'Category updated' : 'Category created');
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader><DialogTitle>{category ? 'Edit category' : 'New category'}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-5">
            <div className="flex items-center gap-4">
              <CategoryIcon icon={icon} color={color} size="lg" />
              <Field label="Name" htmlFor="cat-name" error={error ?? undefined} className="flex-1">
                <Input id="cat-name" value={name} maxLength={40} onChange={(e) => (setName(e.target.value), setError(null))} placeholder="e.g. Pets" disabled={category?.isDefault && category.name === 'Others'} />
              </Field>
            </div>
            {!category && (
              <Field label="Type">
                <div className="grid grid-cols-2 gap-2">
                  {(['expense', 'income'] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setType(t)} className={cn('press h-10 rounded-md text-sm font-semibold capitalize ring-1 ring-border', type === t ? 'bg-primary text-primary-foreground ring-primary' : 'bg-surface')}>{t}</button>
                  ))}
                </div>
              </Field>
            )}
            <Field label="Colour">
              <div className="flex flex-wrap gap-2.5">
                {CATEGORY_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Colour ${c}`} aria-pressed={color === c} className={cn('h-8 w-8 rounded-full ring-offset-2 ring-offset-elevated transition', color === c && 'ring-2 ring-foreground')} style={{ background: c }} />
                ))}
              </div>
            </Field>
            <Field label="Icon">
              <div className="grid grid-cols-8 gap-1.5">
                {CATEGORY_ICONS.map((i) => (
                  <button key={i} type="button" onClick={() => setIcon(i)} aria-label={i} aria-pressed={icon === i} className={cn('flex aspect-square items-center justify-center rounded-lg transition hover:bg-muted', icon === i && 'bg-primary/10 ring-1 ring-primary')}>
                    <CategoryIcon icon={i} color={icon === i ? color : '#64748B'} size="sm" className="bg-transparent" />
                  </button>
                ))}
              </div>
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>{category ? 'Save' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
