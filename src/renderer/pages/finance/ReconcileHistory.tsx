import type { ReactElement } from 'react'
import type { BankTransaction, Expense, FixedCost, Invoice } from '@shared/types'
import { groupByMonth } from '@shared/history'
import { t } from '../../i18n'
import { formatMonth } from '../../i18n/format'
import { chartColors } from './charts'
import { formatMoney, formatDate } from '../../i18n/format'

/**
 * Rückblick auf alle abgeglichenen Buchungen, nach Monat gruppiert — zum
 * nachträglichen Prüfen der Zuordnungen.
 */
export function ReconcileHistory({
  transactions,
  invoices,
  expenses,
  fixedCosts,
}: {
  transactions: BankTransaction[]
  invoices: Invoice[]
  expenses: Expense[]
  fixedCosts: FixedCost[]
}): ReactElement {
  const months = groupByMonth(transactions)

  if (months.length === 0) {
    return <p style={{ color: 'var(--text-muted)' }}>{t.finance.bank.historyEmpty}</p>
  }

  const invoiceById = new Map(invoices.map((i) => [i.id, i]))
  const expenseById = new Map(expenses.map((e) => [e.id, e]))
  const fixedCostById = new Map(fixedCosts.map((f) => [f.id, f]))

  const target = (tx: BankTransaction): string => {
    if (tx.status === 'ignored') return t.finance.bank.historyIgnored
    if (tx.matchedInvoiceId != null) {
      const invoice = invoiceById.get(tx.matchedInvoiceId)
      return invoice
        ? t.finance.bank.historyInvoice(invoice.number ?? `#${invoice.id}`)
        : t.finance.bank.historyMissing
    }
    if (tx.matchedExpenseId != null) {
      const expense = expenseById.get(tx.matchedExpenseId)
      return expense
        ? t.finance.bank.historyExpense(expense.vendor || t.common.none, formatDate(expense.date))
        : t.finance.bank.historyMissing
    }
    if (tx.matchedFixedCostId != null) {
      const fixed = fixedCostById.get(tx.matchedFixedCostId)
      return fixed ? t.finance.bank.historyFixed(fixed.name) : t.finance.bank.historyMissing
    }
    return t.finance.bank.historyMissing
  }

  return (
    <div className="grid gap-6">
      {months.map(({ month, transactions: items }) => {
        const matched = items.filter((tx) => tx.status === 'matched')
        const net = matched.reduce((sum, tx) => sum + tx.amount, 0)
        return (
          <section key={month}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                {formatMonth(month)}
              </h3>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {t.finance.bank.historySummary(matched.length, items.length - matched.length)} ·{' '}
                {formatMoney(net)} €
              </span>
            </div>
          <div className="grid gap-2">
            {items.map((tx) => {
              const color = tx.kind === 'credit' ? chartColors.profit : chartColors.negative
              const ignored = tx.status === 'ignored'
              return (
                <div
                  key={tx.id}
                  className="rounded-[12px] p-3"
                  style={{ background: 'var(--surface)', opacity: ignored ? 0.7 : 1 }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="rounded-[6px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: 'var(--surface-raised)', color }}
                        >
                          {tx.kind === 'credit' ? t.finance.bank.credit : t.finance.bank.debit}
                        </span>
                        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                          {tx.counterparty || '—'}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {formatDate(tx.bookingDate)}
                        </span>
                      </div>
                      <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {target(tx)}
                      </div>
                    </div>
                    <div className="whitespace-nowrap text-sm font-medium" style={{ color }}>
                      {formatMoney(tx.amount)} €
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          </section>
        )
      })}
    </div>
  )
}
