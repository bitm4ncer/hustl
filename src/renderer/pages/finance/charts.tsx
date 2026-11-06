import type { ReactElement } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ComposedChart, Area, Customized,
} from 'recharts'
import type { MonthlyPoint, ForecastPoint } from '@shared/types'
import { formatDate, formatMoney, formatMonthTick, formatMonthTickUtc } from '../../i18n/format'
import { t } from '../../i18n'

const kEUR = (v: number): string => `${Math.round(v / 1000)}k`

// expenses = dark orange; negative = red (used for negative profit).
const C = { revenue: '#4f9dde', expenses: '#cf7330', fixedCosts: '#e6b24a', profit: '#57b37c', negative: '#d9534f' }

function TooltipBox({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number | null; color?: string; stroke?: string }>; label?: string }): ReactElement | null {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-[10px] p-2.5 text-xs" style={{ background: 'var(--surface-raised)', boxShadow: '0 6px 24px rgba(0,0,0,.18)' }}>
      <div className="mb-1 font-medium" style={{ color: 'var(--text)' }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-3" style={{ color: 'var(--text-muted)' }}>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color ?? p.stroke }} />
            {p.name}
          </span>
          <span style={{ color: 'var(--text)' }}>{p.value == null ? '–' : `${formatMoney(p.value)} €`}</span>
        </div>
      ))}
    </div>
  )
}

const axisTick = { fill: 'var(--text-muted)' as string, fontSize: 11 }
const axisShared = { axisLine: false as const, tickLine: false as const }

// Full-height dark band behind the current month's column. Rendered via
// recharts <Customized> so we can read the band scale and draw the exact rect.
interface BandProps {
  xAxisMap?: Record<string, { scale?: ((v: string) => number | undefined) & { bandwidth?: () => number } }>
  offset?: { top?: number; height?: number }
}
function highlightBand(name: string): (props: BandProps) => ReactElement {
  return (props) => {
    const map = props.xAxisMap
    const axis = map ? map['0'] ?? Object.values(map)[0] : undefined
    const scale = axis?.scale
    const top = props.offset?.top
    const height = props.offset?.height
    if (!scale || top == null || height == null) return <g />
    const x = scale(name)
    const bw = scale.bandwidth ? scale.bandwidth() : 0
    if (x == null || !bw) return <g />
    return <rect x={x} y={top} width={bw} height={height} rx={6} fill="var(--chart-highlight)" />
  }
}

// Tooltip for the day-accurate forecast curve: formats the x value (a unix ms
// timestamp) as a date and lists whichever series have a value at that point.
function ForecastTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number | null; color?: string; stroke?: string; payload?: ForecastPoint }>; label?: number }): ReactElement | null {
  if (!active || !payload) return null
  const rows = payload.filter((p) => p.value != null)
  if (rows.length === 0) return null
  const date = label != null ? formatDate(new Date(label).toISOString().slice(0, 10)) : ''
  const projects = payload[0]?.payload?.projects ?? []
  return (
    <div className="rounded-[10px] p-2.5 text-xs" style={{ background: 'var(--surface-raised)', boxShadow: '0 6px 24px rgba(0,0,0,.18)' }}>
      <div className="mb-1 font-medium" style={{ color: 'var(--text)' }}>{date}</div>
      {rows.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-3" style={{ color: 'var(--text-muted)' }}>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color ?? p.stroke }} />
            {p.name}
          </span>
          <span style={{ color: 'var(--text)' }}>{`${formatMoney(p.value as number)} €`}</span>
        </div>
      ))}
      {projects.length > 0 && (
        <div className="mt-2">
          <div className="mb-1.5 h-px w-full" style={{ background: 'var(--bg)' }} />
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            {t.finance.forecastFrom}
          </div>
          {projects.map((pr, i) => (
            <div key={`${pr.title}-${i}`} className="flex items-center justify-between gap-3" style={{ color: 'var(--text-muted)' }}>
              <span className="truncate" style={{ maxWidth: 180 }}>{pr.title}</span>
              <span className="shrink-0" style={{ color: 'var(--text)' }}>{`+${formatMoney(pr.amount)} €`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function RevenueExpenseChart({ monthly, highlightMonth }: { monthly: MonthlyPoint[]; highlightMonth?: string }): ReactElement {
  const data = monthly.map((p) => ({
    name: formatMonthTick(p.month),
    month: p.month,
    [t.finance.legend.revenue]: p.revenue,
    [t.finance.legend.expenses]: p.expenses,
    [t.finance.legend.fixedCosts]: p.fixedCosts,
    [t.finance.legend.profit]: p.profit,
  }))
  const hlName = highlightMonth ? data.find((d) => d.month === highlightMonth)?.name : undefined
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} barGap={1} barCategoryGap="24%">
        {hlName && <Customized component={highlightBand(hlName)} />}
        <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.06)" />
        <XAxis dataKey="name" tick={axisTick} {...axisShared} />
        <YAxis tick={axisTick} {...axisShared} tickFormatter={kEUR} width={36} />
        <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={<TooltipBox />} />
        <Bar dataKey={t.finance.legend.revenue} fill={C.revenue} radius={[4, 4, 0, 0]} />
        <Bar dataKey={t.finance.legend.expenses} stackId="costs" fill={C.expenses} radius={[0, 0, 0, 0]} />
        <Bar dataKey={t.finance.legend.fixedCosts} stackId="costs" fill={C.fixedCosts} radius={[4, 4, 0, 0]} />
        <Bar dataKey={t.finance.legend.profit} radius={[4, 4, 0, 0]}>
          {data.map((row, i) => (
            <Cell key={i} fill={(row[t.finance.legend.profit] as number) < 0 ? C.negative : C.profit} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function ForecastChart({ points }: { points: ForecastPoint[] }): ReactElement {
  if (points.length === 0) return <div style={{ height: 200 }} />
  const startMs = points[0].t
  const endMs = points[points.length - 1].t
  // One tick per month (the 1st), labelled with the short month name.
  const year = new Date(startMs).getUTCFullYear()
  const ticks = Array.from({ length: 12 }, (_, m) => Date.UTC(year, m, 1))
  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={points}>
        <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.06)" />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={[startMs, endMs]}
          ticks={ticks}
          tickFormatter={(v: number) => formatMonthTickUtc(v)}
          tick={axisTick}
          {...axisShared}
        />
        <YAxis tick={axisTick} {...axisShared} tickFormatter={kEUR} width={36} />
        <Tooltip content={<ForecastTooltip />} />
        <Area type="monotone" dataKey="actual" name={t.finance.legend.actual} stroke={C.revenue} strokeWidth={2.5}
          fill={C.revenue} fillOpacity={0.12} connectNulls dot={false} />
        <Area type="monotone" dataKey="forecast" name={t.finance.legend.forecast} stroke={C.revenue} strokeWidth={2.5}
          strokeDasharray="6 5" fill={C.revenue} fillOpacity={0.06} connectNulls dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export function ChartLegend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }): ReactElement {
  return (
    <div className="mb-2.5 flex flex-wrap gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          {it.dashed ? (
            <span style={{ width: 14, borderTop: `3px dashed ${it.color}` }} />
          ) : (
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: it.color }} />
          )}
          {it.label}
        </span>
      ))}
    </div>
  )
}

export const chartColors = C
