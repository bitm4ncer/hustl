import { useMemo } from 'react'
import type { ReactElement } from 'react'
import type { FinanceBasis, FinancePeriodKind } from '@shared/types'
import { summarize } from '@shared/finance'
import { forecast } from '@shared/forecast'
import { rangeFor, monthOf } from '@shared/period'
import { api } from '../../lib/api'
import { t } from '../../i18n'
import { Panel } from '../../components/Panel'
import { SegmentedControl } from '../../components/SegmentedControl'
import { PillToggle } from '../../components/PillToggle'
import type { FinanceData } from '../Finance'
import { RevenueExpenseChart, ForecastChart, ChartLegend, chartColors } from './charts'
import { formatCurrency, formatMoney, formatDate } from '../../i18n/format'

interface DashboardProps {
  data: FinanceData
  period: FinancePeriodKind
  basis: FinanceBasis
  onPeriod: (p: FinancePeriodKind) => void
  onBasis: (b: FinanceBasis) => void
  reload: () => void
}

function Kpi({ label, value, sub, subColor, valueColor }: { label: string; value: string; sub?: string; subColor?: string; valueColor?: string }): ReactElement {
  return (
    <Panel>
      <div className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="mt-1.5 whitespace-nowrap text-[15px] font-medium tracking-tight" style={{ color: valueColor ?? 'var(--text)' }}>{value} €</div>
      {sub && <div className="mt-1 text-[11.5px]" style={{ color: subColor ?? 'var(--text-muted)' }}>{sub}</div>}
    </Panel>
  )
}

export function Dashboard({ data, period, basis, onPeriod, onBasis, reload }: DashboardProps): ReactElement {
  const anchor = monthOf(new Date().toISOString().slice(0, 10))

  const openInvoices = useMemo(
    () =>
      data.invoices
        .filter((i) => i.status === 'finalized' || i.status === 'sent')
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [data],
  )
  const clientName = (id: number): string => data.clients.find((c) => c.id === id)?.name ?? t.common.none
  const markPaid = async (id: number): Promise<void> => {
    await api.setInvoicePaid(id, true)
    reload()
  }

  const summary = useMemo(
    () => summarize(
      { invoices: data.invoices, expenses: data.expenses, fixedCosts: data.fixedCosts },
      rangeFor(period, anchor), basis, anchor,
    ),
    [data, period, basis, anchor],
  )

  const today = new Date().toISOString().slice(0, 10)
  const fc = useMemo(
    () => forecast({ projects: data.projects, invoices: data.invoices }, today),
    [data, today],
  )

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          value={period}
          onChange={onPeriod}
          layoutId="finance-period"
          segments={[
            { value: 'month', label: t.finance.period.month },
            { value: 'quarter', label: t.finance.period.quarter },
            { value: 'year', label: t.finance.period.year },
            { value: 'all', label: t.finance.period.all },
          ]}
        />
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t.finance.basis.label}</span>
          <SegmentedControl
            value={basis}
            onChange={onBasis}
            layoutId="finance-basis"
            segments={[
              { value: 'cash', label: t.finance.basis.cash },
              { value: 'accrual', label: t.finance.basis.accrual },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label={basis === 'cash' ? t.finance.kpi.income : t.finance.kpi.revenue} value={formatMoney(summary.revenue)} />
        <Kpi label={t.finance.kpi.expenses} value={formatMoney(summary.expenses)} valueColor={chartColors.expenses} />
        <Kpi label={t.finance.legend.fixedCosts} value={formatMoney(summary.fixedCosts)} />
        <Kpi label={t.finance.kpi.profit} value={formatMoney(summary.profit)}
          valueColor={summary.profit < 0 ? chartColors.negative : undefined}
          sub={`${t.finance.kpi.vatBalance}: ${formatMoney(summary.vatBalance)} €`} />
        <Kpi label={t.finance.kpi.open} value={formatMoney(summary.openRevenue)}
          sub={t.finance.openCount(summary.openCount)} />
      </div>

      <Panel>
        <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{t.finance.chartTitle}</div>
        <div className="mb-3 mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>{t.finance.chartSubtitle}</div>
        <ChartLegend items={[
          { label: t.finance.legend.revenue, color: chartColors.revenue },
          { label: t.finance.legend.expenses, color: chartColors.expenses },
          { label: t.finance.legend.fixedCosts, color: chartColors.fixedCosts },
          { label: t.finance.legend.profit, color: chartColors.profit },
        ]} />
        <RevenueExpenseChart monthly={summary.monthly} highlightMonth={anchor} />
      </Panel>

      <Panel>
        <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{t.finance.forecastTitle}</div>
        <div className="mb-3 mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>{t.finance.forecastSubtitle}</div>
        <ChartLegend items={[
          { label: t.finance.legend.actual, color: chartColors.revenue },
          { label: t.finance.legend.forecast, color: chartColors.revenue, dashed: true },
        ]} />
        <ForecastChart points={fc.points} />
        {fc.undatedPipeline > 0 && (
          <div className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            {t.finance.undatedPipeline(formatMoney(fc.undatedPipeline))}
          </div>
        )}
      </Panel>

      <Panel>
        <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{t.finance.openTitle}</div>
        <div className="mb-3 mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          {t.finance.openCount(openInvoices.length)}
        </div>
        {openInvoices.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t.finance.openEmpty}</p>
        ) : (
          <div className="grid gap-2">
            {openInvoices.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-4 rounded-[10px] px-3 py-2"
                style={{ background: 'var(--surface-raised)' }}
              >
                <div className="min-w-0">
                  <span className="font-medium" style={{ color: 'var(--text)' }}>{inv.number ?? t.invoice.draft}</span>
                  <span className="ml-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                    {clientName(inv.clientId)} · {formatDate(inv.date)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{formatCurrency(inv.total, inv.currency)}</span>
                  <PillToggle label={t.finance.invoicePaid} checked={false} onChange={() => void markPaid(inv.id)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
