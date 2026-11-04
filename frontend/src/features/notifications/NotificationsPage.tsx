import { formatDistanceToNow } from 'date-fns';
import { BellOff, CheckCheck, Info, PiggyBank, Repeat, X } from 'lucide-react';
import type { NotificationDTO } from '@expenseflow/shared';
import { EmptyState, ErrorState, PageHeader } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { useNotificationMutations, useNotifications } from '@/features/data/hooks';
import { cn } from '@/lib/utils';

const ICON = { budget: PiggyBank, recurring: Repeat, system: Info } as const;
const TONE = { budget: 'bg-warning-soft text-warning', recurring: 'bg-primary/10 text-primary', system: 'bg-muted text-muted-foreground' } as const;

export default function NotificationsPage() {
  const { data, isLoading, error, refetch } = useNotifications();
  const { markRead, markAll, remove } = useNotificationMutations();
  const items = data?.data ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Notifications"
        subtitle={data ? (data.unread ? `${data.unread} unread` : 'All caught up') : undefined}
        action={data?.unread ? <Button variant="outline" size="sm" onClick={() => markAll.mutate()} loading={markAll.isPending}><CheckCheck /> Mark all read</Button> : null}
      />
      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : error && !data ? (
        <Card><ErrorState error={error} onRetry={() => void refetch()} /></Card>
      ) : !items.length ? (
        <Card><EmptyState icon={BellOff} title="No notifications" description="Budget alerts and recurring activity will show up here." /></Card>
      ) : (
        <Card className="divide-y divide-border/60">
          {items.map((n: NotificationDTO) => {
            const Icon = ICON[n.type];
            return (
              <div
                key={n.id}
                className={cn('group flex cursor-default gap-3 px-4 py-3.5 transition-colors', !n.isRead && 'bg-primary/[0.035]')}
                onClick={() => !n.isRead && markRead.mutate(n.id)}
              >
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', TONE[n.type])}><Icon className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{n.title}</p>
                    {!n.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                  </div>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{n.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground/80">{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</p>
                </div>
                <button onClick={(e) => (e.stopPropagation(), remove.mutate(n.id))} className="self-start rounded-full p-1 text-muted-foreground opacity-60 hover:bg-muted hover:opacity-100" aria-label="Dismiss notification">
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
