import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, type TooltipProps } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/stores/auth';

/**
 * Chart tokens resolve through CSS variables so light/dark are each themed, not auto-flipped.
 * Series: expense = primary blue (slot 1), income = teal-green, previous period = muted ink.
 */
export const CHART = {
  expense: 'rgb(var(--primary))',
  income: '#0F9F6E',
  previous: 'rgb(var(--muted-foreground) / 0.55)',
  grid: 'rgb(var(--chart-grid))',
  axis: 'rgb(var(--muted-foreground))',
  surface: 'rgb(var(--surface))',
};

export const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fill: CHART.axis, fontSize: 11 },
} as const;

export interface TooltipRow {
  label: string;
  value: number | string;
  color: string;
}

/** Card-style tooltip: values in text ink, series identity carried by the swatch. */
export function ChartTooltipCard({ title, rows }: { title?: string; rows: TooltipRow[] }) {
  const currency = useCurrency();
  return (
    <div className="min-w-[150px] rounded-lg border border-border bg-elevated px-3 py-2.5 shadow-lift">
      {title && <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{title}</p>}
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4 text-[13px]">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
              {r.label}
            </span>
            <span className="num font-semibold text-foreground">{formatMoney(String(typeof r.value === 'number' ? r.value.toFixed(2) : r.value), currency)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Generic Recharts tooltip adapter. */
export function SeriesTooltip({ active, payload, label, labelFormatter }: TooltipProps<ValueType, NameType> & { labelFormatter?: (l: unknown) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <ChartTooltipCard
      title={labelFormatter ? labelFormatter(label) : String(label)}
      rows={payload
        .filter((p) => p.value !== null && p.value !== undefined)
        .map((p) => ({ label: String(p.name), value: Number(p.value), color: String(p.color ?? p.stroke ?? p.fill) }))}
    />
  );
}

export function Legend({ items, className }: { items: { label: string; color: string; dashed?: boolean }[]; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground', className)}>
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          {i.dashed ? (
            <span className="h-0 w-3.5 border-t-2 border-dashed" style={{ borderColor: i.color }} />
          ) : (
            <span className="h-2 w-3.5 rounded-full" style={{ background: i.color }} />
          )}
          {i.label}
        </span>
      ))}
    </div>
  );
}

export interface DonutSlice {
  id: string;
  name: string;
  value: number;
  total: string;
  color: string;
}

/**
 * Donut with a 2px surface gap between segments and the total in the centre.
 * Always rendered next to a legend listing names + values (identity is never colour-alone).
 */
export function Donut({ data, centerLabel, centerValue, size = 180 }: { data: DonutSlice[]; centerLabel: string; centerValue: string; size?: number }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="72%"
            outerRadius="100%"
            paddingAngle={data.length > 1 ? 1.5 : 0}
            cornerRadius={4}
            stroke={CHART.surface}
            strokeWidth={2}
            startAngle={90}
            endAngle={-270}
            isAnimationActive
            animationDuration={700}
          >
            {data.map((d) => (
              <Cell key={d.id} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.[0] ? (
                <ChartTooltipCard rows={[{ label: String(payload[0].name), value: (payload[0].payload as DonutSlice).total, color: (payload[0].payload as DonutSlice).color }]} />
              ) : null
            }
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[11px] font-medium text-muted-foreground">{centerLabel}</span>
        <span className="num mt-0.5 max-w-[70%] truncate text-lg font-bold">{centerValue}</span>
      </div>
    </div>
  );
}
