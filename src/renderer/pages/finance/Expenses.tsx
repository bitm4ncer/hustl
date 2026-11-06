import { Fragment, useState } from 'react'
import type { ReactElement } from 'react'
import type { Expense } from '@shared/types'
import { netOfGross } from '@shared/finance'
import type { ExpenseInput } from '../../../core/db/expenses'
import { api } from '../../lib/api'
import { pickFile } from '../../lib/pick-file'
import { t } from '../../i18n'
import { Panel } from '../../components/Panel'
import { Button } from '../../components/Button'
import { Field, NumberField } from '../../components/Field'
import { Icon } from '../../components/Icon'
import { PillToggle } from '../../components/PillToggle'
import { FileActions, fileUrl } from '../../components/FileActions'
import { Toast } from '../../components/Toast'
import type { FinanceData } from '../Finance'
import { formatMoney, formatDate, formatMonth } from '../../i18n/format'

interface Draft extends ExpenseInput {}

const emptyDraft = (): Draft => ({
  vendor: '', category: '', date: new Date().toISOString().slice(0, 10), paidAt: new Date().toISOString().slice(0, 10),
  gross: 0, vatRate: 19, note: '', pdfPath: null, sourceName: null,
  originalAmount: null, originalCurrency: 'EUR',
})

// 'YYYY-MM' bucket + a "Juni 2026" label for the month divider headers.
const monthKey = (iso: string): string => iso.slice(0, 7)
const monthLabel = (iso: string): string => formatMonth(monthKey(iso))

export function Expenses({ data, reload }: { data: FinanceData; reload: () => void }): ReactElement {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const flashToast = (msg: string): void => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const fail = (e: unknown): void => flashToast(e instanceof Error ? e.message : String(e))

  const applyImport = (r: { storedPath: string; fields: { vendor: string | null; date: string | null; gross: number | null; currency: string; originalAmount: number | null; vatRate: number | null }; sourceName: string }): void => {
    setEditId(null)
    setDraft({
      ...emptyDraft(),
      vendor: r.fields.vendor ?? '',
      date: r.fields.date ?? new Date().toISOString().slice(0, 10),
      paidAt: r.fields.date ?? new Date().toISOString().slice(0, 10),
      gross: r.fields.gross ?? 0,
      // Den Satz aus dem Beleg übernehmen; 19 % nur als Vorbelegung, wenn im
      // PDF keiner steht (dann weist der Hinweis darauf hin).
      vatRate: r.fields.vatRate ?? 19,
      originalAmount: r.fields.originalAmount ?? null,
      originalCurrency: r.fields.currency ?? 'EUR',
      pdfPath: r.storedPath,
      sourceName: r.sourceName,
    })
    // Ein Scan ohne Textebene liefert leere Felder. Ohne Hinweis sieht das aus,
    // als wäre der Upload fehlgeschlagen.
    if (r.fields.vendor == null && r.fields.gross == null) flashToast(t.finance.expense.noData)
    else if (r.fields.vatRate == null) flashToast(t.finance.expense.vatUnknown)
  }

  const startEdit = (ex: Expense): void => {
    setEditId(ex.id)
    setDraft({
      vendor: ex.vendor, category: ex.category, date: ex.date, paidAt: ex.paidAt,
      gross: ex.gross, originalAmount: ex.originalAmount, originalCurrency: ex.originalCurrency,
      vatRate: ex.vatRate, note: ex.note, pdfPath: ex.pdfPath, sourceName: ex.sourceName,
    })
  }

  const cancel = (): void => { setDraft(null); setEditId(null) }

  const onDrop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) return
    setBusy(true)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      applyImport(await api.importExpensePdf(bytes, file.name))
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  const onPick = async (): Promise<void> => {
    const file = await pickFile('application/pdf')
    if (!file) return
    setBusy(true)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      applyImport(await api.importExpensePdf(bytes, file.name))
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  const save = async (): Promise<void> => {
    if (!draft) return
    setBusy(true)
    try {
      // Die ID darf `null` bleiben: der Server liest null wie "kein Wert".
      await api.saveExpense(draft, editId ?? undefined)
      cancel()
      reload()
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  const togglePaid = async (ex: Expense, paid: boolean): Promise<void> => {
    try {
      await api.setExpensePaid(ex.id, paid ? new Date().toISOString().slice(0, 10) : null)
      reload()
    } catch (e) {
      fail(e)
    }
  }

  const remove = async (id: number): Promise<void> => {
    try {
      await api.deleteExpense(id)
      reload()
    } catch (e) {
      fail(e)
    }
  }

  return (
    <div className="grid gap-4">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => void onDrop(e)}
        className="flex flex-col items-center justify-center gap-2 rounded-[14px] p-8 text-center"
        style={{ background: 'var(--surface)' }}
      >
        <Icon name="upload" size={22} />
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {busy ? t.finance.expense.reading : t.finance.expense.drop}
        </span>
        <Button variant="ghost" onClick={() => void onPick()} disabled={busy}>{t.finance.expense.pick}</Button>
      </div>

      {draft && (
        <Panel raised>
          {editId === null && (
            <div className="mb-3 text-xs" style={{ color: 'var(--accent)' }}>{t.finance.expense.autofilled}</div>
          )}
          {draft.originalCurrency !== 'EUR' && draft.originalAmount != null && (
            <div className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              {t.finance.expense.original} {formatMoney(draft.originalAmount)} {draft.originalCurrency} — {t.finance.expense.fxDetected}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.finance.expense.vendor} value={draft.vendor} onChange={(v) => setDraft({ ...draft, vendor: v })} />
            <Field label={t.finance.expense.category} value={draft.category} onChange={(v) => setDraft({ ...draft, category: v })} />
            <Field label={t.finance.expense.date} type="date" value={draft.date} onChange={(v) => setDraft({ ...draft, date: v })} />
            <NumberField label={t.finance.expense.gross} value={draft.gross} onChange={(v) => setDraft({ ...draft, gross: v ?? 0 })} step={0.01} />
            <NumberField label={t.finance.expense.vatRate} value={draft.vatRate} onChange={(v) => setDraft({ ...draft, vatRate: v ?? 0 })} />
            <div className="flex items-end">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {t.finance.expense.net}: {formatMoney(netOfGross(draft.gross, draft.vatRate))} €
              </span>
            </div>
          </div>
          <div className="mt-3">
            <Field label={t.finance.expense.note} value={draft.note} onChange={(v) => setDraft({ ...draft, note: v })} />
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => void save()}>{t.finance.expense.save}</Button>
            <Button variant="ghost" onClick={cancel}>{t.actions.cancel}</Button>
          </div>
        </Panel>
      )}

      {data.expenses.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>{t.finance.expense.empty}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {data.expenses.map((ex, i) => {
            const showHeader = i === 0 || monthKey(ex.date) !== monthKey(data.expenses[i - 1].date)
            return (
            <Fragment key={ex.id}>
              {showHeader && (
                <div className={`flex items-center gap-3 ${i === 0 ? '' : 'mt-3'}`}>
                  <span className="shrink-0 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                    {monthLabel(ex.date)}
                  </span>
                  <div className="h-px flex-1" style={{ background: 'var(--surface-raised)' }} />
                </div>
              )}
            <Panel index={i} onClick={() => startEdit(ex)}>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium break-words" style={{ color: 'var(--text)' }}>{ex.vendor || t.common.none}</div>
                  <div className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                    {formatDate(ex.date)}{ex.category ? ` · ${ex.category}` : ''}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                  <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{formatMoney(ex.gross)} €</span>
                  {ex.pdfPath && <FileActions url={fileUrl('expense', ex.id)} />}
                  <PillToggle label={t.finance.expense.paid} checked={ex.paidAt != null} onChange={(p) => void togglePaid(ex, p)} />
                  <button type="button" aria-label={t.finance.expense.delete} onClick={() => void remove(ex.id)}
                    className="rounded-[8px] p-1.5 focus:outline-none focus-visible:[box-shadow:var(--focus)]" style={{ color: 'var(--text-muted)' }}>
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </div>
            </Panel>
            </Fragment>
            )
          })}
        </div>
      )}
      <Toast message={toast} />
    </div>
  )
}
