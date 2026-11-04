import { memo } from 'react';
import { CloudUpload, Paperclip, Repeat, TriangleAlert } from 'lucide-react';
import { PAYMENT_METHOD_LABELS, type CategoryDTO } from '@expenseflow/shared';
import { CategoryIcon } from '@/components/category-icon';
import { Money } from '@/components/money';
import type { LocalTransaction } from '@/lib/db';
import { shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Props {
  tx: LocalTransaction;
  category?: CategoryDTO;
  showDate?: boolean;
  onClick?: () => void;
  trailing?: React.ReactNode;
}

/** One transaction line: icon · description/category · amount. Memoised for long lists. */
export const TransactionRow = memo(function TransactionRow({ tx, category, showDate, onClick, trailing }: Props) {
  const meta = [category?.name ?? 'Uncategorised', showDate ? shortDate(tx.transactionDate) : PAYMENT_METHOD_LABELS[tx.paymentMethod]];
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => onClick && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors',
        onClick && 'cursor-pointer hover:bg-muted/70 active:bg-muted focus-visible:ring-offset-0',
      )}
    >
      <CategoryIcon icon={category?.icon} color={category?.color} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[15px] font-medium">{tx.description}</p>
          {tx.recurringId && <Repeat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Recurring" />}
          {tx.hasReceipt && <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Has receipt" />}
        </div>
        <p className="truncate text-[13px] text-muted-foreground">{meta.join(' · ')}</p>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <Money value={tx.amount} type={tx.type} className="text-[15px] font-semibold" />
        {tx.syncStatus === 'pending' && (
          <span className="flex items-center gap-1 text-[11px] font-medium text-primary">
            <CloudUpload className="h-3 w-3" /> Pending
          </span>
        )}
        {tx.syncStatus === 'failed' && (
          <span className="flex items-center gap-1 text-[11px] font-medium text-danger" title={tx.syncError}>
            <TriangleAlert className="h-3 w-3" /> Not synced
          </span>
        )}
      </div>
      {trailing}
    </div>
  );
});
