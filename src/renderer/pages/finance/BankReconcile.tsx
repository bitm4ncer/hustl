import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import type { BankMatchChoice, BankTransaction, MatchSuggestion } from '@shared/types'
import { suggestMatches, uniqueHighSuggestion, type ReconcileContext } from '@shared/reconcile'
import { api } from '../../lib/api'
import { pickFile } from '../../lib/pick-file'
import { t } from '../../i18n'
import { Button } from '../../components/Button'
import { SegmentedControl } from '../../components/SegmentedControl'
import { chartColors } from './charts'
import { ReconcileHistory } from './ReconcileHistory'
import type { FinanceData } from '../Finance'
import { formatMoney, formatDate } from '../../i18n/format'

// A direct-confirm suggestion maps to one match choice. createExpense is handled
// separately because it first requires the user to pick a receipt PDF.
function suggestionToChoice(s: MatchSuggestion): BankMatchChoice | null {
  if (s.invoiceId !== undefined) return { invoiceId: s.invoiceId }
  if (s.expenseId !== undefined) return { expenseId: s.expenseId }
  if (s.fixedCostId !== undefined) return { fixedCostId: s.fixedCostId }
  return null
}

export function BankReconcile({
  data,
  reload,
}: {
  data: FinanceData
  reload: () => void
}): ReactElement {
  const [allTxs, setAllTxs] = useState<BankTransaction[] | null>(null)
  const [view, setView] = useState<'open' | 'history'>('open')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const loadTxs = (): void => {
    // Alle Buchungen laden: bereits zugeordnete Belege dürfen nicht erneut
    // vorgeschlagen werden.
    void api.bankListTransactions().then(setAllTxs)
  }
  useEffect(() => {
    loadTxs()
  }, [])

  const txs = useMemo(
    () => (allTxs === null ? null : allTxs.filter((t) => t.status === 'unmatched')),
    [allTxs],
  )

  const context = useMemo<ReconcileContext>(() => {
    const matchedInvoiceIds = new Set<number>()
    const matchedExpenseIds = new Set<number>()
    const matchedFixedCostIds = new Set<number>()
    for (const t of allTxs ?? []) {
      if (t.matchedInvoiceId != null) matchedInvoiceIds.add(t.matchedInvoiceId)
      if (t.matchedExpenseId != null) matchedExpenseIds.add(t.matchedExpenseId)
      if (t.matchedFixedCostId != null) matchedFixedCostIds.add(t.matchedFixedCostId)
    }
    return { matchedInvoiceIds, matchedExpenseIds, matchedFixedCostIds }
  }, [allTxs])

  const suggestionsFor = (tx: BankTransaction): MatchSuggestion[] =>
    suggestMatches(tx, data.invoices, data.expenses, data.fixedCosts, context)

  const uploadStatement = async (): Promise<void> => {
    const file = await pickFile('application/pdf')
    if (!file) return
    setError(null)
    setNote(null)
    setUploading(true)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const res = await api.importBankStatement(bytes, file.name)
      if (res) {
        setNote(t.finance.bank.statementImported(res.imported, res.ignored))
        loadTxs()
        reload()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
    }
  }

  const apply = async (txId: string, choice: BankMatchChoice): Promise<void> => {
    setError(null)
    try {
      await api.bankApplyMatch(txId, choice)
      loadTxs()
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // "Ausgabe anlegen" requires a receipt PDF. Open the picker first; the bank tx
  // stays the source of truth for amount + date (always booked in EUR).
  const createExpenseWithPdf = async (
    txId: string,
    create: { vendor: string; gross: number; date: string },
  ): Promise<void> => {
    setError(null)
    const file = await pickFile('application/pdf')
    if (!file) return
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const picked = await api.importExpensePdf(bytes, file.name)
      await api.bankApplyMatch(txId, {
        createExpense: { ...create, pdfPath: picked.storedPath, sourceName: picked.sourceName },
      })
      loadTxs()
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const ignore = async (txId: string): Promise<void> => {
    setError(null)
    try {
      await api.bankIgnore(txId)
      loadTxs()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const applyAllHigh = async (): Promise<void> => {
    if (!txs) return
    setBusy(true)
    setError(null)
    try {
      // Guard against two transactions claiming the same invoice/expense in one
      // bulk run (e.g. two equal-amount credits both matching one open invoice).
      const usedInvoices = new Set<number>()
      const usedExpenses = new Set<number>()
      const usedFixedCosts = new Set<number>()
      for (const tx of txs) {
        // "Eindeutig" heißt: genau EIN High-Confidence-Ziel. Bei mehreren (z. B.
        // zwei 10-USD-Belege in derselben Woche) entscheidet der User manuell.
        const top = uniqueHighSuggestion(suggestionsFor(tx))
        const choice = top ? suggestionToChoice(top) : null
        if (!choice) continue
        if ('invoiceId' in choice) {
          if (usedInvoices.has(choice.invoiceId)) continue
          usedInvoices.add(choice.invoiceId)
        } else if ('expenseId' in choice) {
          if (usedExpenses.has(choice.expenseId)) continue
          usedExpenses.add(choice.expenseId)
        } else if ('fixedCostId' in choice) {
          if (usedFixedCosts.has(choice.fixedCostId)) continue
          usedFixedCosts.add(choice.fixedCostId)
        }
        await api.bankApplyMatch(tx.id, choice)
      }
      loadTxs()
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const hasHighMatches =
    txs?.some((tx) => suggestionsFor(tx).some((s) => s.confidence === 'high')) ?? false

  return (
    <div>
      <div className="mb-4 flex justify-center">
        <SegmentedControl
          value={view}
          onChange={setView}
          layoutId="bank-view"
          segments={[
            { value: 'open', label: t.finance.bank.open },
            { value: 'history', label: t.finance.bank.history },
          ]}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => void uploadStatement()} disabled={uploading || busy}>
          {uploading ? t.finance.bank.statementUploading : t.finance.bank.statementUpload}
        </Button>
        {view === 'open' && hasHighMatches && (
          <Button variant="ghost" onClick={() => void applyAllHigh()} disabled={busy}>
            {t.finance.bank.applyAllHigh}
          </Button>
        )}
      </div>

      {note && (
        <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          {note}
        </p>
      )}

      {error && (
        <p className="mb-3 text-xs" style={{ color: 'var(--danger, #e5484d)' }}>
          {error}
        </p>
      )}

      {view === 'history' ? (
        allTxs === null ? (
          <p style={{ color: 'var(--text-muted)' }}>{t.common.loading}</p>
        ) : (
          <ReconcileHistory
            transactions={allTxs.filter((t) => t.status !== 'unmatched')}
            invoices={data.invoices}
            expenses={data.expenses}
            fixedCosts={data.fixedCosts}
          />
        )
      ) : txs === null ? (
        <p style={{ color: 'var(--text-muted)' }}>{t.common.loading}</p>
      ) : txs.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>{t.finance.bank.empty}</p>
      ) : (
        <div className="grid min-w-0 gap-2">
          {txs.map((tx) => (
            <TxRow
              key={tx.id}
              tx={tx}
              suggestions={suggestionsFor(tx)}
              onApply={apply}
              onCreateExpense={createExpenseWithPdf}
              onIgnore={ignore}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TxRow({
  tx,
  suggestions,
  onApply,
  onCreateExpense,
  onIgnore,
}: {
  tx: BankTransaction
  suggestions: MatchSuggestion[]
  onApply: (txId: string, choice: BankMatchChoice) => Promise<void>
  onCreateExpense: (txId: string, create: { vendor: string; gross: number; date: string }) => Promise<void>
  onIgnore: (txId: string) => Promise<void>
}): ReactElement {
  const amountColor = tx.kind === 'credit' ? chartColors.profit : chartColors.negative

  return (
    <div className="min-w-0 rounded-[12px] p-4" style={{ background: 'var(--surface)' }}>
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="rounded-[6px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: 'var(--surface-raised)', color: amountColor }}
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
          {tx.remittance && (
            <div className="mt-0.5 truncate text-xs" style={{ color: 'var(--text-muted)' }}>
              {tx.remittance}
            </div>
          )}
        </div>
        <div className="whitespace-nowrap text-sm font-medium" style={{ color: amountColor }}>
          {formatMoney(tx.amount)} €
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {suggestions.length === 0 && (
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t.finance.bank.noSuggestion}
          </span>
        )}
        {suggestions.map((s, i) => {
          if (s.createExpense) {
            const create = s.createExpense
            return (
              <Button key={i} variant="ghost" onClick={() => void onCreateExpense(tx.id, create)}>
                {s.label}
              </Button>
            )
          }
          const choice = suggestionToChoice(s)
          if (!choice) return null
          return (
            <Button
              key={i}
              variant={s.confidence === 'high' || s.recommended ? 'primary' : 'ghost'}
              onClick={() => void onApply(tx.id, choice)}
            >
              {s.label}
            </Button>
          )
        })}
        <button
          type="button"
          onClick={() => void onIgnore(tx.id)}
          className="rounded-[10px] px-3 py-2 text-xs font-medium transition-colors focus:outline-none focus-visible:[box-shadow:var(--focus)]"
          style={{ color: 'var(--text-muted)' }}
        >
          {t.finance.bank.ignore}
        </button>
      </div>
    </div>
  )
}
