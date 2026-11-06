import type { DatabaseSync } from 'node:sqlite'
import type {
  DocumentLanguage,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  InvoiceSubItem,
  TaxMode,
} from '@shared/types'
import { itemAmount, computeTotals } from '@shared/money'
import { normalizeTaxMode } from '@shared/tax'
import { nextNumber } from '@shared/invoice-number'
import { canTransitionInvoice } from '@shared/invoice-status'
import { appendAudit } from './audit'
import { tx } from './tx'
import { todayInBerlin } from '../clock'
import { getSettings } from './settings'

interface DraftInput {
  clientId: number
  date: string
  servicePeriodStart?: string | null
  servicePeriodEnd?: string | null
  poNumber?: string | null
  notes?: string | null
  /** Nummer der stornierten Rechnung — nur beim Storno-Dokument. */
  correctsNumber?: string | null
  taxMode?: TaxMode
  /** Fraction, e.g. 0.19. */
  taxRate?: number
  currency?: string
  exchangeRate?: number
  language?: DocumentLanguage
  items: Array<
    Pick<InvoiceItem, 'title' | 'description' | 'quantity' | 'unitPrice' | 'fixPrice'> & {
      projectId?: number | null
      subItems?: InvoiceSubItem[]
    }
  >
}

interface DocumentDefaults {
  taxMode: TaxMode
  taxRate: number
  currency: string
  exchangeRate: number
  language: DocumentLanguage
}

function documentDefaults(db: DatabaseSync, input: DraftInput): DocumentDefaults {
  const client = db
    .prepare('SELECT no_tax, tax_mode, currency, language FROM clients WHERE id = ?')
    .get(input.clientId) as
    | { no_tax: number; tax_mode: string | null; currency: string | null; language: string | null }
    | undefined
  const settings = getSettings(db)
  const taxMode = normalizeTaxMode(
    input.taxMode ?? client?.tax_mode,
    !!client?.no_tax,
  )
  const settingsRate =
    typeof settings.defaultTaxRate === 'number' ? settings.defaultTaxRate : 0.19
  const requestedRate = input.taxRate ?? settingsRate
  const taxRate =
    taxMode === 'standard' || taxMode === 'reduced'
      ? requestedRate > 0
        ? requestedRate
        : settingsRate
      : 0
  const currency = (input.currency || client?.currency || 'EUR').toUpperCase()
  const language = (input.language ||
    (client?.language as DocumentLanguage | null) ||
    settings.documentLanguage ||
    'de') as DocumentLanguage
  return {
    taxMode,
    taxRate,
    currency,
    exchangeRate: input.exchangeRate && input.exchangeRate > 0 ? input.exchangeRate : 1,
    language,
  }
}

export function createDraft(db: DatabaseSync, input: DraftInput): number {
  const defaults = documentDefaults(db, input)
  const amounts = input.items.map(itemAmount)
  const totals = computeTotals(amounts, {
    taxMode: defaults.taxMode,
    taxRate: defaults.taxRate,
    currency: defaults.currency,
  })
  return tx(db, () => {
    const info = db
      .prepare(
        `
      INSERT INTO invoices (client_id, date, service_period_start, service_period_end, status,
        subtotal, tax_rate, tax_amount, total, no_tax, reverse_charge, tax_mode,
        currency, exchange_rate, language, po_number, notes, corrects_number)
      VALUES (@clientId, @date, @sps, @spe, 'draft', @subtotal, @taxRate, @taxAmount, @total, @noTax, @rc, @taxMode,
        @currency, @exchangeRate, @language, @po, @notes, @corrects)
    `
      )
      .run({
        clientId: input.clientId,
        date: input.date,
        sps: input.servicePeriodStart ?? null,
        spe: input.servicePeriodEnd ?? null,
        subtotal: totals.subtotal,
        taxRate: totals.taxRate,
        taxAmount: totals.taxAmount,
        total: totals.total,
        noTax: totals.noTax ? 1 : 0,
        rc: totals.reverseCharge ? 1 : 0,
        taxMode: totals.taxMode,
        currency: defaults.currency,
        exchangeRate: defaults.exchangeRate,
        language: defaults.language,
        po: input.poNumber ?? null,
        notes: input.notes ?? null,
        corrects: input.correctsNumber ?? null
      })
    const invoiceId = Number(info.lastInsertRowid)
    input.items.forEach((it, idx) => {
      db.prepare(
        `INSERT INTO invoice_items (invoice_id, position, title, description, quantity, unit_price, fix_price, amount, project_id, sub_items)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        invoiceId,
        idx,
        it.title,
        it.description,
        it.quantity,
        it.unitPrice,
        it.fixPrice,
        itemAmount(it),
        it.projectId ?? null,
        it.subItems && it.subItems.length > 0 ? JSON.stringify(it.subItems) : null
      )
    })
    appendAudit(db, { invoiceId, action: 'created' })
    return invoiceId
  })
}

/**
 * Replace a DRAFT invoice's editable fields + items and recompute its totals.
 * Refuses to touch anything but a draft — finalized invoices are immutable
 * (GoBD). Returns false if the invoice is missing or already finalized.
 */
export function updateDraft(db: DatabaseSync, invoiceId: number, input: DraftInput): boolean {
  const row = db.prepare('SELECT status FROM invoices WHERE id = ?').get(invoiceId) as
    | { status: string }
    | undefined
  if (!row || row.status !== 'draft') return false
  const defaults = documentDefaults(db, input)
  const amounts = input.items.map(itemAmount)
  const totals = computeTotals(amounts, {
    taxMode: defaults.taxMode,
    taxRate: defaults.taxRate,
    currency: defaults.currency,
  })
  return tx(db, () => {
    db.prepare(
      `
      UPDATE invoices SET
        client_id=@clientId, date=@date, service_period_start=@sps, service_period_end=@spe,
        subtotal=@subtotal, tax_rate=@taxRate, tax_amount=@taxAmount, total=@total,
        no_tax=@noTax, reverse_charge=@rc, tax_mode=@taxMode,
        currency=@currency, exchange_rate=@exchangeRate, language=@language,
        po_number=@po, notes=@notes,
        updated_at=datetime('now')
      WHERE id=@id AND status='draft'
    `
    ).run({
      id: invoiceId,
      clientId: input.clientId,
      date: input.date,
      sps: input.servicePeriodStart ?? null,
      spe: input.servicePeriodEnd ?? null,
      subtotal: totals.subtotal,
      taxRate: totals.taxRate,
      taxAmount: totals.taxAmount,
      total: totals.total,
      noTax: totals.noTax ? 1 : 0,
      rc: totals.reverseCharge ? 1 : 0,
      taxMode: totals.taxMode,
      currency: defaults.currency,
      exchangeRate: defaults.exchangeRate,
      language: defaults.language,
      po: input.poNumber ?? null,
      notes: input.notes ?? null
    })
    db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(invoiceId)
    input.items.forEach((it, idx) => {
      db.prepare(
        `INSERT INTO invoice_items (invoice_id, position, title, description, quantity, unit_price, fix_price, amount, project_id, sub_items)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        invoiceId,
        idx,
        it.title,
        it.description,
        it.quantity,
        it.unitPrice,
        it.fixPrice,
        itemAmount(it),
        it.projectId ?? null,
        it.subItems && it.subItems.length > 0 ? JSON.stringify(it.subItems) : null
      )
    })
    appendAudit(db, { invoiceId, action: 'updated' })
    return true
  })
}

/**
 * Storno + Korrektur: cancels a finalized invoice (including 'sent'/'paid') and
 * creates a fresh DRAFT copy of it in one transaction. The original keeps its
 * gapless number, PDF and audit trail — it is never rewritten (GoBD). The copy
 * gets its own number only once it is finalised itself.
 *
 * Refuses drafts (edit those directly) and already-cancelled invoices.
 */
export function cancelAndCopyInvoice(db: DatabaseSync, invoiceId: number): number {
  return tx(db, () => {
    const inv = getInvoice(db, invoiceId)
    if (!inv) throw new Error(`Invoice ${invoiceId} not found`)
    if (inv.status === 'draft') {
      throw new Error('Ein Entwurf wird direkt bearbeitet, nicht storniert.')
    }
    if (inv.status === 'cancelled') {
      throw new Error('Diese Rechnung ist bereits storniert.')
    }
    const copyId = createDraft(db, {
      clientId: inv.clientId,
      // Das Storno-Dokument trägt das heutige Datum, nicht das der Originalrechnung.
      date: todayInBerlin(),
      correctsNumber: inv.number,
      servicePeriodStart: inv.servicePeriodStart,
      servicePeriodEnd: inv.servicePeriodEnd,
      poNumber: inv.poNumber,
      notes: inv.notes,
      taxMode: inv.taxMode,
      taxRate: inv.taxRate,
      currency: inv.currency,
      exchangeRate: inv.exchangeRate,
      language: inv.language,
      items: inv.items.map((it) => ({
        title: it.title,
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        fixPrice: it.fixPrice,
        projectId: it.projectId,
        subItems: it.subItems
      }))
    })
    // Drop the payment stamp along with the status: a cancelled invoice must not
    // keep counting towards cash-basis revenue.
    db.prepare(
      "UPDATE invoices SET status = 'cancelled', paid_at = NULL, updated_at = datetime('now') WHERE id = ?"
    ).run(invoiceId)
    appendAudit(db, { invoiceId, action: 'cancelled', payload: { replacedBy: copyId } })
    appendAudit(db, { invoiceId: copyId, action: 'correctedFrom', payload: { invoiceId } })
    return copyId
  })
}

export function finalizeInvoice(db: DatabaseSync, invoiceId: number, isoDate: string): void {
  const year = Number(isoDate.slice(0, 4))
  tx(db, () => {
    const seq = db.prepare('SELECT year, last_number FROM number_sequence WHERE year = ?').get(year) as
      | { year: number; last_number: number }
      | undefined
    const next = nextNumber({ year, lastNumber: seq?.last_number ?? 0 }, year)
    db.prepare(
      'INSERT INTO number_sequence (year, last_number) VALUES (?, ?) ON CONFLICT(year) DO UPDATE SET last_number = ?'
    ).run(year, next.counter, next.counter)
    db.prepare(
      "UPDATE invoices SET number = ?, status = 'finalized', finalized_at = datetime('now') WHERE id = ? AND status = 'draft'"
    ).run(next.value, invoiceId)
    const changed = db.prepare('SELECT changes() AS c').get() as { c: number }
    if (changed.c === 0) {
      throw new Error('Rechnung ist nicht im Entwurfsstatus — keine Nummer vergeben.')
    }
    appendAudit(db, { invoiceId, action: 'finalized', payload: { number: next.value } })
  })
}

/**
 * Nimmt eine Finalisierung zurück, wenn das PDF nicht erzeugt werden konnte.
 * Die Nummer wird nur freigegeben, wenn sie die zuletzt vergebene ist — sonst
 * bliebe eine Lücke, die niemand mehr erklären kann.
 */
export function revertFinalize(db: DatabaseSync, invoiceId: number): void {
  tx(db, () => {
    const row = db.prepare('SELECT number FROM invoices WHERE id = ?').get(invoiceId) as
      | { number: string | null }
      | undefined
    if (!row?.number) return
    const year = Number(row.number.slice(0, 4))
    const counter = Number(row.number.slice(4))
    db.prepare(
      "UPDATE invoices SET status = 'draft', number = NULL, finalized_at = NULL, updated_at = datetime('now') WHERE id = ?"
    ).run(invoiceId)
    const seq = db.prepare('SELECT last_number FROM number_sequence WHERE year = ?').get(year) as
      | { last_number: number }
      | undefined
    if (seq && seq.last_number === counter) {
      db.prepare('UPDATE number_sequence SET last_number = ? WHERE year = ?').run(counter - 1, year)
    }
    appendAudit(db, { invoiceId, action: 'finalizeReverted', payload: { number: row.number } })
  })
}

function parseSubItems(json: string | null | undefined): InvoiceSubItem[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function rowToItem(r: any): InvoiceItem {
  return {
    id: r.id,
    invoiceId: r.invoice_id,
    notionTaskId: r.notion_task_id,
    projectId: r.project_id ?? null,
    position: r.position,
    title: r.title,
    description: r.description,
    quantity: r.quantity,
    unitPrice: r.unit_price,
    fixPrice: r.fix_price,
    amount: r.amount,
    subItems: parseSubItems(r.sub_items)
  }
}

export function getInvoice(db: DatabaseSync, id: number): Invoice | null {
  const r = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as any
  if (!r) return null
  const items = (
    db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position').all(id) as any[]
  ).map(rowToItem)
  return {
    id: r.id,
    number: r.number,
    clientId: r.client_id,
    date: r.date,
    servicePeriodStart: r.service_period_start,
    servicePeriodEnd: r.service_period_end,
    status: r.status,
    subtotal: r.subtotal,
    taxRate: r.tax_rate,
    taxAmount: r.tax_amount,
    total: r.total,
    noTax: !!r.no_tax,
    reverseCharge: !!r.reverse_charge,
    taxMode: normalizeTaxMode(r.tax_mode, !!r.no_tax),
    currency: r.currency ?? 'EUR',
    exchangeRate: r.exchange_rate ?? 1,
    language: (r.language ?? 'de') as Invoice['language'],
    poNumber: r.po_number,
    notes: r.notes,
    pdfPath: r.pdf_path,
    hash: r.hash,
    prevHash: r.prev_hash,
    finalizedAt: r.finalized_at,
    paidAt: r.paid_at ?? null,
    emailSentAt: r.email_sent_at ?? null,
    emailRecipient: r.email_recipient ?? null,
    correctsNumber: r.corrects_number ?? null,
    items
  }
}

export function setPdfPath(db: DatabaseSync, id: number, pdfPath: string): void {
  db.prepare('UPDATE invoices SET pdf_path = ? WHERE id = ?').run(pdfPath, id)
}

/**
 * GoBD: Der SHA-256 des ausgelieferten PDF wird mit der Rechnung gespeichert,
 * verkettet mit dem Hash der vorherigen Rechnung. Damit ist nachweisbar, dass
 * das Dokument nachträglich nicht verändert wurde.
 */
export function setInvoiceHash(db: DatabaseSync, id: number, hash: string, prevHash: string | null): void {
  db.prepare('UPDATE invoices SET hash = ?, prev_hash = ? WHERE id = ?').run(hash, prevHash, id)
}

export function lastInvoiceHash(db: DatabaseSync): string | null {
  const row = db
    .prepare(
      "SELECT hash FROM invoices WHERE hash IS NOT NULL ORDER BY CAST(substr(number,1,4) AS INTEGER) DESC, CAST(substr(number,5) AS INTEGER) DESC LIMIT 1",
    )
    .get() as { hash: string } | undefined
  return row?.hash ?? null
}

/**
 * Record a successful email send: stamp recipient + timestamp and lift a
 * 'finalized' invoice to 'sent'. A 'paid' (or already 'sent') invoice keeps its
 * status — we never downgrade.
 */
export function setEmailSent(db: DatabaseSync, id: number, recipient: string): void {
  db.prepare(
    "UPDATE invoices SET email_sent_at = datetime('now'), email_recipient = @to, " +
      "status = CASE WHEN status = 'finalized' THEN 'sent' ELSE status END, " +
      "updated_at = datetime('now') WHERE id = @id",
  ).run({ id, to: recipient })
  appendAudit(db, { invoiceId: id, action: 'emailed', payload: { recipient } })
}

export function setInvoiceStatus(db: DatabaseSync, id: number, status: InvoiceStatus): void {
  const current = db.prepare('SELECT status FROM invoices WHERE id = ?').get(id) as
    | { status: InvoiceStatus }
    | undefined
  if (!current) throw new Error(`Invoice ${id} not found`)
  // Ein Entwurf wird finalisiert, nicht per Statuswechsel "finalized"; eine
  // stornierte Rechnung lebt nie wieder auf. Sonst entstehen Rechnungen ohne
  // Nummer oder doppelte Erlöse.
  if (!canTransitionInvoice(current.status, status)) {
    throw new Error(
      `Statuswechsel ${current.status} → ${status} ist nicht erlaubt.` +
        (status === 'finalized' ? ' Rechnungen werden über „Finalisieren" nummeriert.' : ''),
    )
  }
  // Keep paid_at consistent with the status so the StatusMenu dropdown and the
  // "Bezahlt" PillToggle agree — otherwise a 'paid' invoice without paid_at would
  // silently drop out of the cash-basis dashboard. paid ⇒ stamp paid_at (once);
  // any other status ⇒ clear it.
  if (status === 'paid') {
    db.prepare(
      "UPDATE invoices SET status = 'paid', paid_at = COALESCE(paid_at, date('now')), updated_at = datetime('now') WHERE id = @id"
    ).run({ id })
  } else {
    db.prepare(
      "UPDATE invoices SET status = @status, paid_at = NULL, updated_at = datetime('now') WHERE id = @id"
    ).run({ id, status })
  }
  appendAudit(db, { invoiceId: id, action: 'status', payload: { status } })
}

export function setInvoicePaid(db: DatabaseSync, id: number, paid: boolean): void {
  const current = db.prepare('SELECT status FROM invoices WHERE id = ?').get(id) as
    | { status: InvoiceStatus }
    | undefined
  if (!current) throw new Error(`Invoice ${id} not found`)
  const target: InvoiceStatus = paid ? 'paid' : 'sent'
  if (!canTransitionInvoice(current.status, target)) {
    throw new Error(`Statuswechsel ${current.status} → ${target} ist nicht erlaubt.`)
  }
  if (paid) {
    db.prepare(
      "UPDATE invoices SET status='paid', paid_at=COALESCE(paid_at, date('now')), updated_at=datetime('now') WHERE id=?",
    ).run(id)
  } else {
    db.prepare(
      "UPDATE invoices SET status='sent', paid_at=NULL, updated_at=datetime('now') WHERE id=?",
    ).run(id)
  }
  appendAudit(db, { invoiceId: id, action: 'status', payload: { status: target } })
}

export function listInvoices(db: DatabaseSync): Invoice[] {
  // Sort by invoice number, newest first; drafts (no number yet) on top.
  const ids = (
    db
      .prepare(
      'SELECT id FROM invoices ORDER BY (number IS NULL) DESC, CAST(substr(number,1,4) AS INTEGER) DESC, CAST(substr(number,5) AS INTEGER) DESC, id DESC',
    )
      .all() as any[]
  ).map((r) => r.id)
  return ids.map((id) => getInvoice(db, id)!).filter(Boolean)
}
