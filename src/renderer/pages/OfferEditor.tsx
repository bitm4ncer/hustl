import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, Reorder, useDragControls } from 'framer-motion'
import type { Client, DocumentLanguage, OfferKind, OfferPreviewInput, OfferTaxMode } from '@shared/types'
import { api } from '../lib/api'
import { computeOfferTotals, offerItemAmount } from '@shared/offer-money'
import { t } from '../i18n'
import { Panel } from '../components/Panel'
import { Button } from '../components/Button'
import { StickyActions } from '../components/StickyActions'
import { Field, NumberField, SelectField, TextAreaField, ToggleField } from '../components/Field'
import { SegmentedControl } from '../components/SegmentedControl'
import { Icon } from '../components/Icon'
import { formatCurrency } from '../i18n/format'
import { CURRENCIES, DOCUMENT_LANGUAGES } from '../lib/currencies'

interface ItemDraft {
  key: string
  section: string
  title: string
  description: string
  quantity: number | null
  unit: string
  unitPrice: number | null
  fixPrice: number | null
  optional: boolean
  recurring: boolean
  catalogItemId: number | null
  internalHours: number | null
}

const emptyProspect = {
  name: '', contactPerson: '', addressExtra: '', email: '',
  street: '', zip: '', city: '', country: 'Deutschland', vatId: '',
}

function newItem(): ItemDraft {
  return {
    key: Math.random().toString(36).slice(2),
    section: '', title: '', description: '', quantity: null, unit: 'Std',
    unitPrice: null, fixPrice: null, optional: false, recurring: false, catalogItemId: null, internalHours: null,
  }
}

function todayISO(): string { return new Date().toISOString().slice(0, 10) }
function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10)
}

export function OfferEditor({ offerId, onDone }: { offerId?: number; onDone: () => void }): React.ReactElement {
  const [clients, setClients] = useState<Client[]>([])
  const [kind, setKind] = useState<OfferKind>('angebot')
  const [clientId, setClientId] = useState<string>('')
  const [useProspect, setUseProspect] = useState(false)
  const [prospect, setProspect] = useState({ ...emptyProspect })
  // Internal hourly rate: hour-based positions multiply their hours by this to
  // get their price. Never rendered on the offer PDF.
  const [hourlyRate, setHourlyRate] = useState<number>(0)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayISO())
  const [validUntil, setValidUntil] = useState(addDaysISO(todayISO(), 14))
  const [spStart, setSpStart] = useState('')
  const [spEnd, setSpEnd] = useState('')
  const [taxMode, setTaxMode] = useState<OfferTaxMode>('regular')
  const [taxRatePct, setTaxRatePct] = useState(19)
  const [currency, setCurrency] = useState('EUR')
  const [language, setLanguage] = useState<DocumentLanguage>('de')
  const [exchangeRate, setExchangeRate] = useState(1)
  const [freibleibend, setFreibleibend] = useState(false)
  const [showHours, setShowHours] = useState(false)
  const [introText, setIntroText] = useState('')
  const [closingText, setClosingText] = useState('')
  const [items, setItems] = useState<ItemDraft[]>([newItem()])
  const [busy, setBusy] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  // Tracks the persisted offer id so repeated "save draft" updates the same
  // offer instead of creating duplicates (starts from the prop when editing).
  const [savedId, setSavedId] = useState<number | undefined>(offerId)
  const [savedFlash, setSavedFlash] = useState(false)

  // Initial load: clients + settings defaults (+ existing offer when editing).
  useEffect(() => {
    void Promise.all([api.listClients(), api.getSettings()]).then(([cs, s]) => {
      setClients(cs)
      if (offerId == null) {
        setValidUntil(addDaysISO(todayISO(), s.offerValidityDays))
        setIntroText(s.offerIntroText)
        setClosingText(s.offerClosingText)
        setTaxRatePct((s.defaultTaxRate ?? 0.19) * 100)
        setLanguage(s.documentLanguage ?? 'de')
        if (s.kleinunternehmer) setTaxMode('kleinunternehmer')
      }
    })
    if (offerId != null) {
      void api.getOffer(offerId).then((o) => {
        if (!o) return
        setKind(o.kind)
        setClientId(o.clientId != null ? String(o.clientId) : '')
        setUseProspect(o.clientId == null)
        setProspect(o.prospect)
        setHourlyRate(o.hourlyRate)
        setTitle(o.title); setDate(o.date); setValidUntil(o.validUntil)
        setSpStart(o.servicePeriodStart ?? ''); setSpEnd(o.servicePeriodEnd ?? '')
        setTaxMode(o.taxMode); setFreibleibend(o.freibleibend); setShowHours(o.showHours)
        setTaxRatePct(o.taxRate * 100); setCurrency(o.currency); setLanguage(o.language)
        setExchangeRate(o.exchangeRate)
        setIntroText(o.introText); setClosingText(o.closingText)
        setItems(o.items.map((it) => ({ key: Math.random().toString(36).slice(2), ...it })))
      })
    }
  }, [offerId])

  // For an existing client, default the internal rate to the client's rate;
  // prospects type their own above.
  useEffect(() => {
    if (useProspect) return
    const c = clients.find((cl) => String(cl.id) === clientId)
    if (c) {
      setHourlyRate(c.hourlyRate)
      if (offerId == null) {
        if (c.currency) setCurrency(c.currency)
        if (c.language) setLanguage(c.language)
      }
    }
  }, [clientId, useProspect, clients, offerId])

  const patchItem = (key: string, p: Partial<ItemDraft>): void =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...p } : it)))
  const removeItem = (key: string): void =>
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev))

  // Hour-based positions derive their unit price from the shared internal rate;
  // fixed-price positions keep their own price. Used for totals, preview & save.
  const pricedItems = useMemo(
    () => items.map((it) => ({ ...it, unitPrice: it.fixPrice != null ? null : hourlyRate })),
    [items, hourlyRate],
  )

  const totals = useMemo(
    () =>
      computeOfferTotals(pricedItems, {
        taxMode,
        taxRate: taxRatePct / 100,
        currency,
        discountKind: 'none',
        discountValue: 0,
      }),
    [pricedItems, taxMode, taxRatePct, currency],
  )

  const buildPreviewInput = (): OfferPreviewInput => ({
    kind,
    clientId: useProspect ? null : (clientId ? Number(clientId) : null),
    prospect,
    title, date, validUntil,
    servicePeriodStart: spStart || null, servicePeriodEnd: spEnd || null,
    taxMode, freibleibend, discountKind: 'none', discountValue: 0, hourlyRate, showHours,
    taxRate: taxRatePct / 100, currency, exchangeRate, language,
    introText, closingText, paymentSchedule: { depositPercent: 0, milestones: [] },
    items: pricedItems.map((it) => ({
      section: it.section, title: it.title, description: it.description, quantity: it.quantity,
      unit: it.fixPrice != null ? 'Psch' : 'Std', unitPrice: it.unitPrice, fixPrice: it.fixPrice, optional: it.optional,
      recurring: it.recurring, catalogItemId: it.catalogItemId, internalHours: it.internalHours,
    })),
  })

  // Debounced live preview.
  useEffect(() => {
    let cancelled = false
    const input = buildPreviewInput()
    const timer = setTimeout(() => {
      void api.renderOfferPreview(input).then((html) => { if (!cancelled) setPreviewHtml(html) })
    }, 350)
    return () => { cancelled = true; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, clientId, useProspect, prospect, hourlyRate, showHours, title, date, validUntil, spStart, spEnd, taxMode, taxRatePct, currency, exchangeRate, language, freibleibend, introText, closingText, items])

  const save = async (): Promise<number> => {
    const input = buildPreviewInput()
    const payload = {
      kind: input.kind, clientId: input.clientId, prospect: input.prospect, title: input.title,
      date: input.date, validUntil: input.validUntil,
      servicePeriodStart: input.servicePeriodStart, servicePeriodEnd: input.servicePeriodEnd,
      taxMode: input.taxMode, freibleibend: input.freibleibend, discountKind: input.discountKind,
      taxRate: input.taxRate, currency: input.currency, exchangeRate: input.exchangeRate, language: input.language,
      discountValue: input.discountValue, hourlyRate: input.hourlyRate, showHours: input.showHours,
      introText: input.introText, closingText: input.closingText,
      paymentSchedule: input.paymentSchedule, items: input.items,
    }
    const id = await api.saveOffer(payload, savedId)
    setSavedId(id)
    return id
  }

  const saveDraft = async (): Promise<void> => {
    setBusy(true)
    try {
      await save()
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1800)
    } finally { setBusy(false) }
  }

  const exportPdf = async (): Promise<void> => {
    setBusy(true); setErrors([])
    try {
      const check = await api.prevalidateOffer(buildPreviewInput())
      if (!check.ok) { setErrors(check.errors); return }
      const id = await save()
      await api.finalizeOfferPdf(id)
      onDone()
    } finally { setBusy(false) }
  }

  return (
    <div style={{ maxWidth: 680, marginLeft: 'auto', marginRight: 'auto' }}>
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-medium tracking-tight" style={{ color: 'var(--text)' }}>{savedId != null ? t.offer.editOffer : t.offer.newOffer}</h1>
        <Button variant="ghost" onClick={onDone}>{t.actions.cancel}</Button>
      </header>

      <div className="grid gap-4">
        <div className="flex justify-center">
          <SegmentedControl
            value={kind}
            onChange={(v) => setKind(v as OfferKind)}
            layoutId="offer-kind"
            segments={[{ value: 'angebot', label: t.offer.kindAngebot }, { value: 'kostenvoranschlag', label: t.offer.kindKva }]}
          />
        </div>

        <Panel>
          <div className="mb-3">
            <ToggleField label={t.offer.newProspect} value={useProspect} onChange={setUseProspect} />
          </div>
          {useProspect ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t.offer.prospectName} value={prospect.name} onChange={(v) => setProspect({ ...prospect, name: v })} />
              <Field label={t.offer.prospectContactPerson} value={prospect.contactPerson} onChange={(v) => setProspect({ ...prospect, contactPerson: v })} />
              <Field label={t.offer.prospectAddressExtra} value={prospect.addressExtra} onChange={(v) => setProspect({ ...prospect, addressExtra: v })} />
              <Field label={t.offer.prospectEmail} type="email" value={prospect.email} onChange={(v) => setProspect({ ...prospect, email: v })} />
              <Field label={t.offer.prospectStreet} value={prospect.street} onChange={(v) => setProspect({ ...prospect, street: v })} />
              <Field label={t.offer.prospectZip} value={prospect.zip} onChange={(v) => setProspect({ ...prospect, zip: v })} />
              <Field label={t.offer.prospectCity} value={prospect.city} onChange={(v) => setProspect({ ...prospect, city: v })} />
              <Field label={t.offer.prospectCountry} value={prospect.country} onChange={(v) => setProspect({ ...prospect, country: v })} />
              <Field label={t.offer.prospectVatId} value={prospect.vatId} onChange={(v) => setProspect({ ...prospect, vatId: v })} />
            </div>
          ) : (
            <SelectField label={t.offer.existingClient} value={clientId} onChange={setClientId}>
              <option value="">{t.common.none}</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectField>
          )}
          <div className="mt-3">
            <NumberField label={t.offer.hourlyRate} step={1} value={hourlyRate} onChange={(v) => setHourlyRate(v ?? 0)} />
            <p className="mt-1 px-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>{t.offer.hourlyRateHint}</p>
          </div>
        </Panel>

        <Panel>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.offer.workingTitle} value={title} onChange={setTitle} />
            <SelectField label={t.offer.taxMode} value={taxMode} onChange={(v) => setTaxMode(v as OfferTaxMode)}>
              <option value="regular">{t.offer.taxRegular}</option>
              <option value="kleinunternehmer">{t.offer.taxKleinunternehmer}</option>
              <option value="reverse_charge">{t.offer.taxReverseCharge}</option>
            </SelectField>
            {taxMode === 'regular' && (
              <NumberField
                label={t.offer.taxRate}
                step={0.1}
                value={taxRatePct}
                onChange={(v) => setTaxRatePct(v ?? 0)}
              />
            )}
            <SelectField
              label={t.offer.currency}
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
                label={t.offer.exchangeRate}
                step={0.0001}
                value={exchangeRate}
                onChange={(v) => setExchangeRate(v ?? 1)}
              />
            )}
            <SelectField
              label={t.offer.language}
              value={language}
              onChange={(v) => setLanguage(v as DocumentLanguage)}
            >
              {DOCUMENT_LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </SelectField>
            <Field label={t.offer.date} type="date" value={date} onChange={setDate} />
            <Field label={t.offer.validUntil} type="date" value={validUntil} onChange={setValidUntil} />
            <Field label={`${t.offer.servicePeriod} (${t.offer.from})`} type="date" value={spStart} onChange={setSpStart} />
            <Field label={`${t.offer.servicePeriod} (${t.offer.to})`} type="date" value={spEnd} onChange={setSpEnd} />
            <div className="sm:col-span-2"><ToggleField label={t.offer.freibleibend} value={freibleibend} onChange={setFreibleibend} /></div>
            <div className="sm:col-span-2"><ToggleField label={t.offer.showHours} value={showHours} onChange={setShowHours} /></div>
            <div className="sm:col-span-2"><TextAreaField label={t.offer.introText} rows={2} value={introText} onChange={setIntroText} /></div>
            <div className="sm:col-span-2"><TextAreaField label={t.offer.closingText} rows={2} value={closingText} onChange={setClosingText} /></div>
          </div>
        </Panel>

        <Panel>
          <h2 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text)' }}>{t.offer.items}</h2>
          <Reorder.Group as="div" axis="y" values={items} onReorder={setItems} className="grid gap-3">
            {items.map((it) => (
              <PositionRow
                key={it.key}
                it={it}
                hourlyRate={hourlyRate}
                currency={currency}
                canRemove={items.length > 1}
                onPatch={(p) => patchItem(it.key, p)}
                onRemove={() => removeItem(it.key)}
              />
            ))}
          </Reorder.Group>
          <button
            type="button"
            onClick={() => setItems((p) => [...p, newItem()])}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-[12px] py-2.5 text-sm font-medium transition-colors hover:[background:var(--surface-raised)] focus:outline-none focus-visible:[box-shadow:var(--focus)]"
            style={{ background: 'var(--field)', color: 'var(--accent)' }}
          >
            <Icon name="plus" size={16} />
            {t.actions.addItem}
          </button>
        </Panel>

        <Panel raised>
          <div className="grid gap-1.5 text-sm">
            <div className="flex items-center justify-between"><span style={{ color: 'var(--text-muted)' }}>{t.offer.subtotal}</span><span style={{ color: 'var(--text)' }}>{formatCurrency(totals.subtotal, currency)}</span></div>
            <div className="flex items-center justify-between"><span style={{ color: 'var(--text-muted)' }}>{`${t.offer.tax} ${(totals.taxRate * 100).toFixed(0)}%`}</span><span style={{ color: 'var(--text)' }}>{formatCurrency(totals.taxAmount, currency)}</span></div>
            <div className="mt-1 flex items-center justify-between"><span className="font-semibold" style={{ color: 'var(--text)' }}>{t.offer.total}</span><span className="font-semibold" style={{ color: 'var(--text)' }}>{formatCurrency(totals.total, currency)}</span></div>
          </div>
        </Panel>

        <AnimatePresence>
          {errors.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-[12px] p-3 text-sm" style={{ background: 'var(--surface-raised)', color: 'var(--text)' }}>
              <div className="mb-1 text-xs font-semibold" style={{ color: 'var(--accent)' }}>{t.offer.validationTitle}</div>
              <ul className="list-disc pl-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                {errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-end gap-3">
          <AnimatePresence>
            {savedFlash && (
              <motion.span
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-xs" style={{ color: 'var(--accent)' }}
              >
                {t.settings.saved}
              </motion.span>
            )}
          </AnimatePresence>
          <StickyActions
            primaryLabel={t.offer.exportPdf}
            onPrimary={() => void exportPdf()}
            primaryDisabled={busy}
            secondaryLabel={t.offer.saveDraft}
            onSecondary={() => void saveDraft()}
            secondaryDisabled={busy}
          />
        </div>

        <OfferPreviewPane html={previewHtml} />
      </div>
    </div>
  )
}

/** A single position row: drag handle (reorder), title/description, and the
 *  hours/unit/fix-price inputs. The price is derived from the shared rate. */
function PositionRow({
  it,
  hourlyRate,
  currency,
  canRemove,
  onPatch,
  onRemove,
}: {
  it: ItemDraft
  hourlyRate: number
  currency: string
  canRemove: boolean
  onPatch: (p: Partial<ItemDraft>) => void
  onRemove: () => void
}): React.ReactElement {
  const controls = useDragControls()
  const amount = offerItemAmount({ fixPrice: it.fixPrice, quantity: it.quantity, unitPrice: hourlyRate })
  return (
    <Reorder.Item
      as="div"
      value={it}
      dragListener={false}
      dragControls={controls}
      className="rounded-[12px] p-3"
      style={{ background: 'var(--surface-raised)' }}
    >
      <div className="grid gap-3">
        <div className="flex items-end gap-2">
          <span
            onPointerDown={(e) => controls.start(e)}
            title={t.offer.dragHandle}
            aria-label={t.offer.dragHandle}
            className="mb-1 flex h-9 w-6 shrink-0 cursor-grab items-center justify-center rounded-[6px]"
            style={{ color: 'var(--text-muted)', touchAction: 'none' }}
          >
            <Icon name="grip-vertical" size={18} />
          </span>
          <div className="flex-1">
            <Field label={t.offer.itemTitle} value={it.title} onChange={(v) => onPatch({ title: v })} />
          </div>
        </div>
        <TextAreaField label={t.offer.itemDescription} rows={2} value={it.description} onChange={(v) => onPatch({ description: v })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField label={t.offer.hours} step={0.25} value={it.quantity} onChange={(v) => onPatch({ quantity: v })} />
          <NumberField label={t.offer.fixPrice} step={0.01} value={it.fixPrice} onChange={(v) => onPatch({ fixPrice: v })} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{formatCurrency(amount, currency)}</span>
          {canRemove && (
            <button type="button" onClick={onRemove} className="rounded-[8px] px-2 py-1 text-xs focus:outline-none focus-visible:[box-shadow:var(--focus)]" style={{ color: 'var(--text-muted)' }}>
              {t.actions.removeItem}
            </button>
          )}
        </div>
      </div>
    </Reorder.Item>
  )
}

const A4_W = 794
const A4_H = 1123

function OfferPreviewPane({ html }: { html: string }): React.ReactElement {
  const paneRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(680)
  useEffect(() => {
    const el = paneRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => { const w = entries[0]?.contentRect.width; if (w) setWidth(w) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const displayW = Math.min(width, 460)
  const scale = displayW / A4_W
  const clipHeight = A4_H * scale
  return (
    <div ref={paneRef} className="mt-2">
      <div className="mb-2 px-0.5 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t.offer.preview}</div>
      {html === '' ? (
        <div className="flex items-center justify-center rounded-[10px] px-4 text-center text-sm" style={{ background: 'var(--surface)', color: 'var(--text-muted)', height: clipHeight, width: displayW, marginLeft: 'auto', marginRight: 'auto' }}>
          {t.offer.previewHint}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[10px]" style={{ height: clipHeight, width: displayW, marginLeft: 'auto', marginRight: 'auto', background: '#fff' }}>
          <iframe sandbox="" title={t.offer.preview} srcDoc={html} style={{ width: A4_W, height: A4_H, border: 0, background: '#fff', transform: `scale(${scale})`, transformOrigin: 'top left' }} />
        </div>
      )}
    </div>
  )
}
