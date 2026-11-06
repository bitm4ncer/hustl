import { useState } from 'react'
import type { ReactElement } from 'react'
import type { FixedCost, FixedCostInterval } from '@shared/types'
import { netOfGross } from '@shared/finance'
import type { FixedCostInput } from '../../../core/db/fixed-costs'
import { api } from '../../lib/api'
import { t } from '../../i18n'
import { Panel } from '../../components/Panel'
import { Button } from '../../components/Button'
import { Field, NumberField, SelectField } from '../../components/Field'
import { Icon } from '../../components/Icon'
import { PillToggle } from '../../components/PillToggle'
import { Toast } from '../../components/Toast'
import type { FinanceData } from '../Finance'
import { formatMoney } from '../../i18n/format'

const emptyDraft = (): FixedCostInput => ({
  name: '', category: '', gross: 0, vatRate: 0, interval: 'monthly',
  startDate: new Date().toISOString().slice(0, 10), endDate: null, active: true, note: '',
})

// Monatsäquivalent für die "pro Monat"-Anzeige (netto).
const perMonthNet = (fc: FixedCost): number => {
  const div = fc.interval === 'monthly' ? 1 : fc.interval === 'quarterly' ? 3 : 12
  return netOfGross(fc.gross, fc.vatRate) / div
}

export function FixedCosts({ data, reload }: { data: FinanceData; reload: () => void }): ReactElement {
  const [draft, setDraft] = useState<FixedCostInput | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const flashToast = (msg: string): void => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const fail = (e: unknown): void => flashToast(e instanceof Error ? e.message : String(e))

  const startNew = (): void => { setDraft(emptyDraft()); setEditId(null) }
  const startEdit = (fc: FixedCost): void => {
    setEditId(fc.id)
    setDraft({ name: fc.name, category: fc.category, gross: fc.gross, vatRate: fc.vatRate,
      interval: fc.interval, startDate: fc.startDate, endDate: fc.endDate, active: fc.active, note: fc.note })
  }

  const save = async (): Promise<void> => {
    if (!draft) return
    try {
      await api.saveFixedCost(draft, editId ?? undefined)
      setDraft(null); setEditId(null); reload()
    } catch (e) {
      fail(e)
    }
  }

  const remove = async (id: number): Promise<void> => {
    try {
      await api.deleteFixedCost(id)
      reload()
    } catch (e) {
      fail(e)
    }
  }

  const intervals: { value: FixedCostInterval; label: string }[] = [
    { value: 'monthly', label: t.finance.fixed.intervals.monthly },
    { value: 'quarterly', label: t.finance.fixed.intervals.quarterly },
    { value: 'yearly', label: t.finance.fixed.intervals.yearly },
  ]

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button onClick={startNew}><span className="inline-flex items-center gap-2"><Icon name="plus" size={16} />{t.finance.fixed.add}</span></Button>
      </div>

      {draft && (
        <Panel raised>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.finance.fixed.name} value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
            <Field label={t.finance.fixed.category} value={draft.category} onChange={(v) => setDraft({ ...draft, category: v })} />
            <NumberField label={t.finance.fixed.gross} value={draft.gross} onChange={(v) => setDraft({ ...draft, gross: v ?? 0 })} step={0.01} />
            <NumberField label={t.finance.fixed.vatRate} value={draft.vatRate} onChange={(v) => setDraft({ ...draft, vatRate: v ?? 0 })} />
            <SelectField
              label={t.finance.fixed.interval}
              value={draft.interval}
              onChange={(v) => setDraft({ ...draft, interval: v as FixedCostInterval })}
            >
              {intervals.map((iv) => <option key={iv.value} value={iv.value}>{iv.label}</option>)}
            </SelectField>
            <Field label={t.finance.fixed.start} type="date" value={draft.startDate} onChange={(v) => setDraft({ ...draft, startDate: v })} />
            <Field label={t.finance.fixed.end} type="date" value={draft.endDate ?? ''} onChange={(v) => setDraft({ ...draft, endDate: v || null })} />
          </div>
          <div className="mt-3">
            <Field label={t.finance.fixed.note} value={draft.note} onChange={(v) => setDraft({ ...draft, note: v })} />
          </div>
          <div className="mt-3">
            <PillToggle label={t.finance.fixed.active} checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} />
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => void save()}>{t.finance.fixed.save}</Button>
            <Button variant="ghost" onClick={() => { setDraft(null); setEditId(null) }}>{t.actions.cancel}</Button>
          </div>
        </Panel>
      )}

      {data.fixedCosts.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>{t.finance.fixed.empty}</p>
      ) : (
        <div className="grid gap-3">
          {data.fixedCosts.map((fc, i) => (
            <Panel key={fc.id} index={i} onClick={() => startEdit(fc)}>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium break-words" style={{ color: 'var(--text)', opacity: fc.active ? 1 : 0.5 }}>{fc.name}</div>
                  <div className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                    {intervals.find((iv) => iv.value === fc.interval)?.label}{fc.category ? ` · ${fc.category}` : ''}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{formatMoney(fc.gross)} €</div>
                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {formatMoney(perMonthNet(fc))} € {t.finance.fixed.perMonth}
                    </div>
                  </div>
                  <button type="button" aria-label={t.finance.fixed.delete}
                    onClick={(e) => { e.stopPropagation(); void remove(fc.id) }}
                    className="rounded-[8px] p-1.5 focus:outline-none focus-visible:[box-shadow:var(--focus)]" style={{ color: 'var(--text-muted)' }}>
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}
      <Toast message={toast} />
    </div>
  )
}
