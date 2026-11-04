import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, CloudOff, Loader2, RefreshCw, TriangleAlert, WifiOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';
import { syncNow } from '@/services/sync-engine';
import { useSyncStore } from '@/stores/sync';

export function usePendingCount() {
  return useLiveQuery(() => db.outbox.count(), [], 0);
}

/** Compact status pill: synced / syncing / N pending / offline / error. Click to sync now. */
export function SyncBadge({ className }: { className?: string }) {
  const { phase, lastSyncedAt, online } = useSyncStore();
  const pending = usePendingCount();
  const failed = useLiveQuery(() => db.outbox.where('status').equals('failed').count(), [], 0);

  let icon = <Check className="h-3.5 w-3.5" />;
  let label = 'Synced';
  let tone = 'text-success bg-success-soft';
  if (!online || phase === 'offline') {
    icon = <WifiOff className="h-3.5 w-3.5" />;
    label = pending ? `Offline · ${pending} pending` : 'Offline';
    tone = 'text-warning bg-warning-soft';
  } else if (phase === 'syncing') {
    icon = <Loader2 className="h-3.5 w-3.5 animate-spin" />;
    label = 'Syncing';
    tone = 'text-primary bg-primary/10';
  } else if (failed) {
    icon = <TriangleAlert className="h-3.5 w-3.5" />;
    label = `${failed} failed`;
    tone = 'text-danger bg-danger-soft';
  } else if (pending) {
    icon = <RefreshCw className="h-3.5 w-3.5" />;
    label = `${pending} pending`;
    tone = 'text-primary bg-primary/10';
  } else if (phase === 'error') {
    icon = <CloudOff className="h-3.5 w-3.5" />;
    label = 'Sync paused';
    tone = 'text-warning bg-warning-soft';
  }

  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      title={lastSyncedAt ? `Last synced ${formatDistanceToNow(lastSyncedAt, { addSuffix: true })}` : 'Sync now'}
      className={cn('press inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold', tone, className)}
      aria-live="polite"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function OfflineBanner() {
  const online = useSyncStore((s) => s.online);
  return (
    <AnimatePresence initial={false}>
      {!online && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden"
          role="status"
        >
          <div className="mb-4 flex items-center gap-2.5 rounded-lg bg-warning-soft px-3.5 py-2.5 text-[13px] font-medium text-warning">
            <WifiOff className="h-4 w-4 shrink-0" />
            You're offline. New transactions are saved on this device and will sync automatically.
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
