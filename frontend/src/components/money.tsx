import { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'framer-motion';
import { money } from '@expenseflow/shared';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/stores/auth';

interface MoneyProps {
  value: string | null | undefined;
  /** Colour by type and prefix with +/− */
  type?: 'income' | 'expense';
  sign?: boolean;
  compact?: boolean;
  className?: string;
  currency?: string;
}

export function Money({ value, type, sign, compact, className, currency }: MoneyProps) {
  const cur = useCurrency();
  const c = currency ?? cur;
  let text: string;
  if (type) {
    const abs = formatMoney(money(value ?? '0').abs().toFixed(2), c, { compact });
    text = type === 'income' ? `+${abs}` : `−${abs}`;
  } else {
    text = formatMoney(value, c, { compact, sign });
  }
  return <span className={cn('num whitespace-nowrap', type === 'income' && 'text-success', className)}>{text}</span>;
}

/**
 * Count-up animation for hero figures. Animates a display number but always settles on the
 * exact formatted decimal string.
 */
export function AnimatedMoney({ value, className }: { value: string; className?: string }) {
  const currency = useCurrency();
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(() => formatMoney(value, currency));
  const prev = useRef(value);

  useEffect(() => {
    const exact = formatMoney(value, currency);
    if (reduce || prev.current === value) {
      setDisplay(exact);
      prev.current = value;
      return;
    }
    const from = money(prev.current).toNumber();
    const to = money(value).toNumber();
    prev.current = value;
    const controls = animate(from, to, {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(formatMoney(v.toFixed(2), currency)),
      onComplete: () => setDisplay(exact),
    });
    return () => controls.stop();
  }, [value, currency, reduce]);

  return <span className={cn('num', className)}>{display}</span>;
}
