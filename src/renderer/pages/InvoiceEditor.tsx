import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type {
  Client,
  DocumentLanguage,
  Invoice,
  InvoiceItem,
  InvoicePreviewInput,
  Project,
  TaxMode,
} from '@shared/types'
import { api } from '../lib/api'
import { computeTotals, itemAmount } from '@shared/money'
import { projectHours } from '@shared/project-hours'
import { t } from '../i18n'
import { Panel } from '../components/Panel'
import { Button } from '../components/Button'
import { StickyActions } from '../components/StickyActions'
import { Field, NumberField, SelectField, TextAreaField } from '../components/Field'
import { formatCurrency } from '../i18n/format'
import { CURRENCIES, DOCUMENT_LANGUAGES } from '../lib/currencies'

// Aufschlüsselungs-Unterzeile eines Postens im Editor — `key` nur für React,
// wird vor dem Senden entfernt. Beträge hängen NIE an Unterzeilen.
interface SubItemDraft {
  key: string
  title: string
  description: string
  hours: number | null
}

interface ItemDraft {
  key: string
  title: string
  description: string
  quantity: number | null
  unitPrice: number | null
  fixPrice: number | null
  projectId: number | null
  subItems: SubItemDraft[]
}

const newKey = (): string => Math.random().toString(36).slice(2)

const newSubItem = (): SubItemDraft => ({ key: newKey(), title: '', description: '', hours: null })

function newItem(unitPrice: number | null = null): ItemDraft {
  return {
    key: newKey(),
    title: '',
    description: '',
    quantity: null,
    unitPrice,
    fixPrice: null,
    projectId: null,
    subItems: [],
  }
}

/** Map a project to an invoice line item (fix price wins over hourly). The
 *  project's Positionen become editable sub-lines; the legacy description only
 *  fills the item description when the project has no Positionen. */
function itemFromProject(p: Project): ItemDraft {
  const pricing =
    p.fixPrice != null
      ? { quantity: null, unitPrice: null, fixPrice: p.fixPrice }
      : { quantity: projectHours(p), unitPrice: p.hourlyRate, fixPrice: null }
  return {
    key: newKey(),
    title: p.title,
    description: p.items.length > 0 ? '' : p.description,
    projectId: p.id,
    subItems: p.items.map((it) => ({
      key: newKey(),
      title: it.title,
      description: it.description,
      hours: it.hours,
    })),
    ...pricing,
  }
}

/** Strip editor-only keys before sending sub-items over IPC. */
const toSubItems = (subs: SubItemDraft[]): Array<{ title: string; description: string; hours: number | null }> =>
  subs.map(({ title, description, hours }) => ({ title, description, hours }))

/** Load an existing invoice line item (from a saved draft) into an editor row. */
function itemFromInvoiceItem(it: InvoiceItem): ItemDraft {
  return {
    key: newKey(),
    title: it.title,
    description: it.description,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    fixPrice: it.fixPrice,
    projectId: it.projectId,
    subItems: (it.subItems ?? []).map((si) => ({
      key: newKey(),
      title: si.title,
      description: si.description,
      hours: si.hours,
    })),
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function InvoiceEditor({
  onDone,
  initial,
  draft,
}: {
  onDone: () => void
  initial?: { clientId: number; projects: Project[] }
  // A saved draft invoice being reopened for editing. Mutually exclusive with
  // `initial` (which seeds a fresh invoice from projects).
  draft?: Invoice
}): React.ReactElement {
  const [clients, setClients] = useState<Client[]>([])
  const [clientId, setClientId] = useState<string>(
    draft ? String(draft.clientId) : initial ? String(initial.clientId) : '',
  )
  const [date, setDate] = useState(draft ? draft.date : todayISO())
  const [spStart, setSpStart] = useState(draft?.servicePeriodStart ?? '')
  const [spEnd, setSpEnd] = useState(draft?.servicePeriodEnd ?? '')
  const [poNumber, setPoNumber] = useState(draft?.poNumber ?? '')
  const [notes, setNotes] = useState(draft?.notes ?? '')
  const [taxMode, setTaxMode] = useState<TaxMode>(draft?.taxMode ?? 'standard')
  const [taxRatePct, setTaxRatePct] = useState(draft ? draft.taxRate * 100 : 19)
  const [currency, setCurrency] = useState(draft?.currency ?? 'EUR')
  const [language, setLanguage] = useState<DocumentLanguage>(draft?.language ?? 'de')
  const [exchangeRate, setExchangeRate] = useState(draft?.exchangeRate ?? 1)
  const [companyDefaults, setCompanyDefaults] = useState<{
    defaultTaxRate: number
    documentLanguage: DocumentLanguage
  }>({ defaultTaxRate: 0.19, documentLanguage: 'de' })
  const [items, setItems] = useState<ItemDraft[]>(() => {
    if (draft) return draft.items.map(itemFromInvoiceItem)
    if (initial && initial.projects.length > 0) return initial.projects.map(itemFromProject)
    return [newItem()]
  })
  const [busy, setBusy] = useState(false)
  // Open projects for the selected client, available to add as line items.
  const [openProjects, setOpenProjects] = useState<Project[]>([])
  const [pendingProjectId, setPendingProjectId] = useState<string>('')
  // Live PDF preview: the standalone HTML doc returned by the main process for
  // the current editor state ('' when there's no client yet).
  const [previewHtml, setPreviewHtml] = useState('')
  // E-invoice pre-validation problems shown when finalising is blocked.
  const [eInvoiceErrors, setEInvoiceErrors] = useState<string[]>([])

  const selectedClient = clients.find((c) => String(c.id) === clientId) ?? null

  useEffect(() => {
    void api.listClients().then(setClients)
  }, [])

  useEffect(() => {
    void api.getSettings().then((s) => {
      setCompanyDefaults({
        defaultTaxRate: s.defaultTaxRate ?? 0.19,
        documentLanguage: s.documentLanguage ?? 'de',
      })
    })
  }, [])

  const seededClient = useRef<number | null>(null)
  useEffect(() => {
    if (!selectedClient || draft) return
    if (seededClient.current === selectedClient.id) return
    seededClient.current = selectedClient.id
    setTaxMode(selectedClient.taxMode)
    setTaxRatePct(
      selectedClient.taxMode === 'standard' ? (companyDefaults.defaultTaxRate ?? 0.19) * 100 : 0,
    )
    setCurrency(selectedClient.currency || 'EUR')
    setLanguage(selectedClient.language || companyDefaults.documentLanguage || 'de')
  }, [selectedClient, companyDefaults, draft])

  // When a client is chosen, seed empty hourly rows with their rate. Skipped
  // when editing a saved draft — its rows already carry their own prices and we
  // must not silently rewrite them on open.
  useEffect(() => {
    if (!selectedClient || draft) return
    setItems((prev) =>
      prev.map((it) =>
        it.unitPrice === null && it.fixPrice === null && it.projectId === null
          ? { ...it, unitPrice: selectedClient.hourlyRate }
          : it,
      ),
    )
  }, [selectedClient])

  // Load the client's open projects so they can be added as line items.
  useEffect(() => {
    if (!selectedClient) {
      setOpenProjects([])
      return
    }
    let cancelled = false
    void api.listOpenProjectsForClient(selectedClient.id).then((ps) => {
      if (!cancelled) setOpenProjects(ps)
    })
    return () => {
      cancelled = true
    }
  }, [selectedClient])

  // Open projects not yet present as a line item (matched by projectId).
  const addableProjects = useMemo(() => {
    const used = new Set(items.map((it) => it.projectId).filter((id): id is number => id != null))
    return openProjects.filter((p) => !used.has(p.id))
  }, [openProjects, items])

  const addProject = (id: number): void => {
    const p = openProjects.find((pr) => pr.id === id)
    if (!p) return
    setItems((prev) => [...prev, itemFromProject(p)])
    setPendingProjectId('')
  }

  const totals = useMemo(
    () =>
      computeTotals(items.map(itemAmount), {
        taxMode,
        taxRate: taxRatePct / 100,
        currency,
      }),
    [items, taxMode, taxRatePct, currency],
  )

  // Debounced live preview: rebuild the InvoicePreviewInput from the current
  // editor state and re-render whenever any of it changes. ~350ms keeps typing
  // smooth; the timer is cleared on every change and on unmount.
  useEffect(() => {
    if (!selectedClient) {
      setPreviewHtml('')
      return
    }
    let cancelled = false
    const input: InvoicePreviewInput = {
      clientId: selectedClient.id,
      date,
      servicePeriodStart: spStart || null,
      servicePeriodEnd: spEnd || null,
      poNumber: poNumber || null,
      notes: notes || null,
      taxMode,
      taxRate: taxRatePct / 100,
      currency,
      language,
      items: items.map((it) => ({
        title: it.title,
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        fixPrice: it.fixPrice,
        projectId: it.projectId,
        subItems: toSubItems(it.subItems),
      })),
    }
    const timer = setTimeout(() => {
      void api.renderInvoicePreview(input).then((html) => {
        if (!cancelled) setPreviewHtml(html)
      })
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [selectedClient, date, spStart, spEnd, poNumber, notes, items, taxMode, taxRatePct, currency, language])

  const hasPositiveItem = items.some((it) => itemAmount(it) > 0)
  const canFinalize = selectedClient !== null && hasPositiveItem && !busy

  const patchItem = (key: string, p: Partial<ItemDraft>): void =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...p } : it)))

  const removeItem = (key: string): void =>
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev))

  const patchSubItem = (itemKey: string, subKey: string, p: Partial<SubItemDraft>): void =>
    setItems((prev) =>
      prev.map((it) =>
        it.key === itemKey
          ? { ...it, subItems: it.subItems.map((si) => (si.key === subKey ? { ...si, ...p } : si)) }
          : it,
      ),
    )

  const addSubItem = (itemKey: string): void =>
    setItems((prev) =>
      prev.map((it) => (it.key === itemKey ? { ...it, subItems: [...it.subItems, newSubItem()] } : it)),
    )

  const removeSubItem = (itemKey: string, subKey: string): void =>
    setItems((prev) =>
      prev.map((it) =>
        it.key === itemKey ? { ...it, subItems: it.subItems.filter((si) => si.key !== subKey) } : it,
      ),
    )

  // The current editor state as a preview/validation input (used for both the
  // live preview and the e-invoice pre-validation).
  const buildPreviewInput = (): InvoicePreviewInput => ({
    clientId: selectedClient ? selectedClient.id : null,
    date,
    servicePeriodStart: spStart || null,
    servicePeriodEnd: spEnd || null,
    poNumber: poNumber || null,
    notes: notes || null,
    taxMode,
    taxRate: taxRatePct / 100,
    currency,
    language,
    items: items.map((it) => ({
      title: it.title,
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      fixPrice: it.fixPrice,
      projectId: it.projectId,
      subItems: toSubItems(it.subItems),
    })),
  })

  const buildDraft = (): Parameters<typeof api.createDraft>[0] => ({
    clientId: Number(clientId),
    date,
    servicePeriodStart: spStart || undefined,
    servicePeriodEnd: spEnd || undefined,
    poNumber: poNumber || undefined,
    notes: notes || undefined,
    taxMode,
    taxRate: taxRatePct / 100,
    currency,
    exchangeRate,
    language,
    items: items.map((it) => ({
      title: it.title,
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      fixPrice: it.fixPrice,
      projectId: it.projectId,
      subItems: toSubItems(it.subItems),
    })),
  })

  const saveDraft = async (): Promise<void> => {
    if (!selectedClient) return
    setBusy(true)
    try {
      // Editing an existing draft updates it in place; otherwise create a new one.
      if (draft) await api.updateDraft(draft.id, buildDraft())
      else await api.createDraft(buildDraft())
      onDone()
    } finally {
      setBusy(false)
    }
  }

  const finalize = async (): Promise<void> => {
    if (!canFinalize) return
    setBusy(true)
    setEInvoiceErrors([])
    try {
      // Validate the e-invoice before creating a draft, so a missing field never
      // burns a gapless invoice number.
      const check = await api.prevalidateEInvoice(buildPreviewInput())
      if (!check.ok) {
        setEInvoiceErrors(check.errors)
        return
      }
      // Reuse the existing draft when editing; otherwise create a fresh one.
      let id: number
      if (draft) {
        await api.updateDraft(draft.id, buildDraft())
        id = draft.id
      } else {
        id = await api.createDraft(buildDraft())
      }
      await api.finalizeInvoice(id)
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 680, marginLeft: 'auto', marginRight: 'auto' }}>
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-medium tracking-tight" style={{ color: 'var(--text)' }}>
          {draft ? t.actions.editInvoice : t.actions.newInvoice}
        </h1>
        <Button variant="ghost" onClick={onDone}>
          {t.actions.cancel}
        </Button>
      </header>

      <div className="grid gap-4">
        <Panel>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label={t.invoice.client} value={clientId} onChange={setClientId}>
              <option value="">{t.common.none}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <Field label={t.invoice.date} type="date" value={date} onChange={setDate} />
            <Field
              label={`${t.invoice.servicePeriod} (${t.invoice.from})`}
              type="date"
              value={spStart}
              onChange={setSpStart}
            />
            <Field
              label={`${t.invoice.servicePeriod} (${t.invoice.to})`}
              type="date"
              value={spEnd}
              onChange={setSpEnd}
            />
            <SelectField
              label={t.invoice.taxMode}
              value={taxMode}
              onChange={(v) => {
                const mode = v as TaxMode
                setTaxMode(mode)
                if ((mode === 'standard' || mode === 'reduced') && taxRatePct <= 0) {
                  setTaxRatePct((companyDefaults.defaultTaxRate ?? 0.19) * 100)
                }
              }}
            >
              <option value="standard">{t.tax.standard}</option>
              <option value="reduced">{t.tax.reduced}</option>
              <option value="zero">{t.tax.zero}</option>
              <option value="reverse_charge">{t.tax.reverseCharge}</option>
              <option value="small_business">{t.tax.smallBusiness}</option>
              <option value="exempt">{t.tax.exempt}</option>
            </SelectField>
            {(taxMode === 'standard' || taxMode === 'reduced') && (
              <NumberField
                label={t.invoice.taxRate}
                step={0.1}
                value={taxRatePct}
                onChange={(v) => setTaxRatePct(v ?? 0)}
              />
            )}
            <SelectField
              label={t.invoice.currency}
              value={currency}
              onChange={(v) => {
                setCurrency(v)
                if (v === 'EUR') setExchangeRate(1)
              }}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectField>
            {currency !== 'EUR' && (
              <NumberField
                label={t.invoice.exchangeRate}
                step={0.0001}
                value={exchangeRate}
                onChange={(v) => setExchangeRate(v ?? 1)}
              />
            )}
            <SelectField
              label={t.invoice.language}
              value={language}
              onChange={(v) => setLanguage(v as DocumentLanguage)}
            >
              {DOCUMENT_LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </SelectField>
            <Field label={t.invoice.poNumber} value={poNumber} onChange={setPoNumber} />
            <div className="sm:col-span-2">
              <TextAreaField label={t.invoice.notes} rows={2} value={notes} onChange={setNotes} />
            </div>
          </div>
        </Panel>

        <Panel>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              {t.invoice.items}
            </h2>
            <div className="flex items-center gap-2">
              {selectedClient && (
                <select
                  value={pendingProjectId}
                  onChange={(e) => {
                    const v = e.target.value
                    setPendingProjectId(v)
                    if (v !== '') addProject(Number(v))
                  }}
                  disabled={addableProjects.length === 0}
                  className="rounded-[10px] px-3 py-2 text-sm transition-shadow focus:outline-none focus-visible:[box-shadow:var(--focus)] disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: 'var(--field)', color: 'var(--text)' }}
                >
                  <option value="">
                    {addableProjects.length === 0 ? t.invoice.noOpenProjects : t.invoice.addProject}
                  </option>
                  {addableProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              )}
              <Button variant="ghost" onClick={() => setItems((p) => [...p, newItem(selectedClient?.hourlyRate ?? null)])}>
                {t.invoice.addLineItem}
              </Button>
            </div>
          </div>

          <div className="grid gap-3">
            <AnimatePresence initial={false}>
              {items.map((it) => (
                <motion.div
                  key={it.key}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="rounded-[12px] p-3"
                  style={{ background: 'var(--surface-raised)' }}
                >
                  <div className="grid gap-3">
                    <Field label={t.invoice.itemTitle} value={it.title} onChange={(v) => patchItem(it.key, { title: v })} />
                    <TextAreaField
                      label={t.invoice.itemDescription}
                      rows={2}
                      value={it.description}
                      onChange={(v) => patchItem(it.key, { description: v })}
                    />
                    {/* Positionen: Aufschlüsselung aus dem Projekt — hier
                        editierbar (z. B. für Teilrechnungen), ohne Einfluss auf
                        den Betrag des Postens. Eingerückt mit Seitenlinie statt
                        eigener Karte, damit die Felder sichtbar bleiben. */}
                    <div>
                      <div className="mb-1.5 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                        {t.invoice.subItems}
                      </div>
                      <div className="grid gap-3">
                        {it.subItems.map((si) => (
                          <div
                            key={si.key}
                            className="grid gap-2 rounded-[10px] p-3"
                            style={{ border: '1px solid color-mix(in srgb, var(--text-muted) 18%, transparent)' }}
                          >
                            <div className="flex items-end gap-2">
                              <div className="min-w-0 flex-1">
                                <Field
                                  label={t.invoice.itemTitle}
                                  value={si.title}
                                  onChange={(v) => patchSubItem(it.key, si.key, { title: v })}
                                />
                              </div>
                              <div className="w-20 shrink-0">
                                <NumberField
                                  label={t.invoice.subItemHours}
                                  step={0.25}
                                  value={si.hours}
                                  onChange={(v) => patchSubItem(it.key, si.key, { hours: v })}
                                />
                              </div>
                              <button
                                type="button"
                                aria-label={t.actions.removeItem}
                                title={t.actions.removeItem}
                                onClick={() => removeSubItem(it.key, si.key)}
                                className="flex h-[38px] w-8 shrink-0 items-center justify-center rounded-[8px] text-base leading-none transition-colors hover:opacity-80 focus:outline-none focus-visible:[box-shadow:var(--focus)]"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                ×
                              </button>
                            </div>
                            <TextAreaField
                              label={t.invoice.itemDescription}
                              rows={2}
                              value={si.description}
                              onChange={(v) => patchSubItem(it.key, si.key, { description: v })}
                            />
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => addSubItem(it.key)}
                        className="mt-2 rounded-[8px] px-2 py-1 text-xs font-medium focus:outline-none focus-visible:[box-shadow:var(--focus)]"
                        style={{ color: 'var(--accent)' }}
                      >
                        + {t.invoice.addSubItem}
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <NumberField
                        label={t.invoice.hours}
                        step={0.25}
                        value={it.quantity}
                        onChange={(v) => patchItem(it.key, { quantity: v })}
                      />
                      <NumberField
                        label={t.invoice.unitPrice}
                        step={0.01}
                        value={it.unitPrice}
                        onChange={(v) => patchItem(it.key, { unitPrice: v })}
                      />
                      <NumberField
                        label={t.invoice.fixPrice}
                        step={0.01}
                        value={it.fixPrice}
                        onChange={(v) => patchItem(it.key, { fixPrice: v })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                        {formatCurrency(itemAmount(it), currency)}
                      </span>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(it.key)}
                          className="rounded-[8px] px-2 py-1 text-xs focus:outline-none focus-visible:[box-shadow:var(--focus)]"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {t.actions.removeItem}
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </Panel>

        <Panel raised>
          <div className="grid gap-1.5 text-sm">
            <Row label={t.invoice.subtotal} value={formatCurrency(totals.subtotal, currency)} />
            <Row
              label={`${t.invoice.tax} ${(totals.taxRate * 100).toFixed(0)}%`}
              value={formatCurrency(totals.taxAmount, currency)}
            />
            <div className="mt-1 flex items-center justify-between">
              <span className="font-semibold" style={{ color: 'var(--text)' }}>
                {t.invoice.total}
              </span>
              <span className="font-semibold" style={{ color: 'var(--text)' }}>
                {formatCurrency(totals.total, currency)}
              </span>
            </div>
            {totals.reverseCharge && (
              <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                {t.invoice.reverseChargeNote}
              </p>
            )}
          </div>
        </Panel>

        <AnimatePresence>
          {eInvoiceErrors.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-[12px] p-3 text-sm"
              style={{ background: 'var(--surface-raised)', color: 'var(--text)' }}
            >
              <div className="mb-1 text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                {t.invoice.eInvoiceError}
              </div>
              <ul className="list-disc pl-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                {eInvoiceErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>

        <StickyActions
          primaryLabel={t.actions.finalize}
          onPrimary={() => void finalize()}
          primaryDisabled={!canFinalize}
          secondaryLabel={t.actions.saveDraft}
          onSecondary={() => void saveDraft()}
          secondaryDisabled={!selectedClient || busy}
          hint={!selectedClient ? t.invoice.emptyClientHint : undefined}
        />

        <PreviewPane html={previewHtml} />
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  )
}

// A4 invoice body width in px (210mm ≈ 794px) and its 1:√2 height (≈ 1123px).
const A4_W = 794
const A4_H = 1123

/**
 * Read-only PDF preview that flows in the main column below the actions. The
 * main process returns a full standalone A4 HTML document which we render in a
 * sandboxed iframe sized to A4 px, then scale down to the column width via a
 * CSS transform inside a clipping wrapper. The wrapper height tracks the scaled
 * page so it never overflows.
 */
function PreviewPane({ html }: { html: string }): React.ReactElement {
  const paneRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(680)

  // Track the actual rendered column width so scaling stays correct as the
  // window resizes.
  useEffect(() => {
    const el = paneRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Cap the rendered preview to a comfortable document width and centre it,
  // rather than filling the full column.
  const displayW = Math.min(width, 460)
  const scale = displayW / A4_W
  const clipHeight = A4_H * scale

  return (
    <div ref={paneRef} className="mt-2">
      <div className="mb-2 px-0.5 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
        {t.invoice.preview}
      </div>
      {html === '' ? (
        <div
          className="flex items-center justify-center rounded-[10px] px-4 text-center text-sm"
          style={{
            background: 'var(--surface)',
            color: 'var(--text-muted)',
            height: clipHeight,
            width: displayW,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          {t.invoice.previewHint}
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-[10px]"
          style={{
            height: clipHeight,
            width: displayW,
            marginLeft: 'auto',
            marginRight: 'auto',
            background: '#fff',
          }}
        >
          <iframe
            sandbox=""
            title={t.invoice.preview}
            srcDoc={html}
            style={{
              width: A4_W,
              height: A4_H,
              border: 0,
              background: '#fff',
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          />
        </div>
      )}
    </div>
  )
}
