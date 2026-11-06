import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Client, Expense, FixedCost, Invoice, Project } from '@shared/types'
import type { FinanceBasis, FinancePeriodKind } from '@shared/types'
import { monthsWithData } from '@shared/history'
import { api } from '../lib/api'
import { isElectron } from '../lib/env'
import { t } from '../i18n'
import { formatMonth } from '../i18n/format'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { SegmentedControl } from '../components/SegmentedControl'
import { SelectField } from '../components/Field'
import { Dashboard } from './finance/Dashboard'
import { Expenses } from './finance/Expenses'
import { FixedCosts } from './finance/FixedCosts'
import { BankReconcile } from './finance/BankReconcile'

type Tab = 'dashboard' | 'expenses' | 'fixed' | 'bank'

export interface FinanceData {
  invoices: Invoice[]
  expenses: Expense[]
  fixedCosts: FixedCost[]
  projects: Project[]
  clients: Client[]
}

export function Finance(): ReactElement {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [period, setPeriod] = useState<FinancePeriodKind>('year')
  const [basis, setBasis] = useState<FinanceBasis>('cash')
  const [data, setData] = useState<FinanceData | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportMonthValue, setExportMonthValue] = useState<string>(new Date().toISOString().slice(0, 7))
  const [exportInfo, setExportInfo] = useState<{ invoices: number; expenses: number; statement: boolean } | null>(null)
  const exportRef = useRef<HTMLDivElement>(null)

  const load = (): void => {
    void Promise.all([
      api.listInvoices(),
      api.listExpenses(),
      api.listFixedCosts(),
      api.listProjects(),
      api.listClients(),
    ]).then(([invoices, expenses, fixedCosts, projects, clients]) =>
      setData({ invoices, expenses, fixedCosts, projects, clients }),
    )
  }
  useEffect(load, [])

  // Close the export popover on outside-click / Escape (matches StatusMenu).
  useEffect(() => {
    if (!exportOpen) return
    const onDown = (e: MouseEvent): void => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setExportOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [exportOpen])

  const currentMonth = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }, [])

  // Alle Monate, in denen es Rechnungen oder Belege gibt — nur die lassen sich
  // sinnvoll exportieren. Neuester zuerst, der laufende Monat ist immer dabei.
  const exportMonths = useMemo(
    () =>
      monthsWithData(
        [
          ...(data?.invoices ?? []).map((i) => i.paidAt || i.date),
          ...(data?.expenses ?? []).map((e) => e.date),
        ],
        currentMonth,
      ),
    [data, currentMonth],
  )

  // Welche Teile gibt es in diesem Monat? Zählt nur, liest keine PDFs.
  useEffect(() => {
    if (!exportOpen || isElectron()) return
    let cancelled = false
    setExportInfo(null)
    fetch(`/api/export/month/${exportMonthValue}/info`, {
      headers: { 'x-hustl-client': 'web' },
      credentials: 'same-origin',
    })
      .then((r) => (r.ok ? r.json() : { invoices: 0, expenses: 0, statement: false }))
      .then((info) => {
        if (!cancelled) setExportInfo(info)
      })
      .catch(() => {
        if (!cancelled) setExportInfo({ invoices: 0, expenses: 0, statement: false })
      })
    return () => {
      cancelled = true
    }
  }, [exportOpen, exportMonthValue])

  const runExport = async (): Promise<void> => {
    setExporting(true)
    try {
      const res = await api.exportFinanceMonth(exportMonthValue)
      if (res) alert(res.invoices + res.expenses === 0 ? t.finance.export.empty : t.finance.export.done(res.invoices, res.expenses))
    } finally {
      setExporting(false)
      setExportOpen(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-medium tracking-tight" style={{ color: 'var(--text)' }}>
          {t.nav.finance}
        </h1>
        <div className="relative" ref={exportRef}>
          <Button variant="ghost" onClick={() => setExportOpen((v) => !v)} disabled={exporting}>
            <span className="inline-flex items-center gap-2">
              <Icon name="download" size={16} />
              {t.finance.export.button}
            </span>
          </Button>
          {exportOpen && (
            <div
              className="absolute right-0 top-[44px] z-20 w-60 rounded-[12px] p-3"
              style={{ background: 'var(--surface-raised)', boxShadow: '0 6px 24px rgba(0,0,0,.18)' }}
            >
              <div className="mb-2">
                <SelectField
                  label={t.finance.export.month}
                  value={exportMonthValue}
                  onChange={setExportMonthValue}
                >
                  {exportMonths.map((month) => (
                    <option key={month} value={month}>
                      {formatMonth(month)}
                    </option>
                  ))}
                </SelectField>
              </div>
              {isElectron() ? (
                <Button onClick={() => void runExport()} disabled={exporting} className="w-full">
                  {t.finance.export.run}
                </Button>
              ) : (
                <div className="grid gap-1.5">
                  <ExportLink
                    href={`/api/export/month/${exportMonthValue}/invoices`}
                    label={t.finance.export.invoices(exportInfo?.invoices ?? 0)}
                    disabled={!exportInfo || exportInfo.invoices === 0}
                  />
                  <ExportLink
                    href={`/api/export/month/${exportMonthValue}/expenses`}
                    label={t.finance.export.expenses(exportInfo?.expenses ?? 0)}
                    disabled={!exportInfo || exportInfo.expenses === 0}
                  />
                  {exportInfo?.statement && (
                    <ExportLink
                      href={`/api/export/month/${exportMonthValue}/statement`}
                      label={t.finance.export.statement}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="mb-6">
        <SegmentedControl
          value={tab}
          onChange={setTab}
          layoutId="finance-tab"
          segments={[
            { value: 'dashboard', label: t.finance.tabs.dashboard },
            { value: 'expenses', label: t.finance.tabs.expenses },
            { value: 'fixed', label: t.finance.tabs.fixed },
            { value: 'bank', label: t.finance.tabs.bank },
          ]}
        />
      </div>

      {data === null ? (
        <p style={{ color: 'var(--text-muted)' }}>{t.common.loading}</p>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {tab === 'dashboard' && (
              <Dashboard
                data={data}
                period={period}
                basis={basis}
                onPeriod={setPeriod}
                onBasis={setBasis}
                reload={load}
              />
            )}
            {tab === 'expenses' && <Expenses data={data} reload={load} />}
            {tab === 'fixed' && <FixedCosts data={data} reload={load} />}
            {tab === 'bank' && <BankReconcile data={data} reload={load} />}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  )
}

/**
 * Download als Link, nicht als Button: der Browser lädt die Datei direkt,
 * ohne dass die App sie erst in den Speicher holt.
 */
function ExportLink({
  href,
  label,
  disabled,
}: {
  href: string
  label: string
  disabled?: boolean
}): ReactElement {
  const className =
    'block w-full rounded-[10px] px-3 py-2 text-center text-sm font-medium transition-colors'
  const style = { background: 'var(--surface)', color: 'var(--text)' }
  if (disabled) {
    return (
      <span className={`${className} cursor-not-allowed opacity-40`} style={style}>
        {label}
      </span>
    )
  }
  return (
    <a href={href} download className={className} style={style}>
      {label}
    </a>
  )
}
