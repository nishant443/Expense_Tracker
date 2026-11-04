import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('h-9 w-9', className)} aria-hidden>
      <defs>
        <linearGradient id="ef-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#ef-logo)" />
      <polyline points="14.1,42.2 25.6,32 33.9,38.4 48.6,23" fill="none" stroke="#fff" strokeWidth="4.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="48.6" cy="23" r="4.6" fill="#fff" />
    </svg>
  );
}

export function Logo({ className, collapsed }: { className?: string; collapsed?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      {!collapsed && <span className="text-[17px] font-bold tracking-tight">ExpenseFlow</span>}
    </div>
  );
}
