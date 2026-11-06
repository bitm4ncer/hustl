import type { DatabaseSync } from 'node:sqlite'
import type {
  DocumentLanguage,
  Offer,
  OfferItem,
  OfferStatus,
  OfferKind,
  OfferTaxMode,
  OfferDiscountKind,
  OfferProspect,
  OfferPaymentSchedule,
} from '@shared/types'
import { computeOfferTotals, offerItemAmount } from '@shared/offer-money'
import { nextOfferNumber } from '@shared/offer-number'
import { tx } from './tx'

export interface OfferItemInput {
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

export interface OfferInput {
  kind: OfferKind
  clientId: number | null
  prospect: OfferProspect
  title: string
  date: string
  validUntil: string
  servicePeriodStart: string | null
  servicePeriodEnd: string | null
  taxMode: OfferTaxMode
  /** Fraction, e.g. 0.19; used when taxMode is 'regular'. */
  taxRate?: number
  currency?: string
  exchangeRate?: number
  language?: DocumentLanguage
  freibleibend: boolean
  discountKind: OfferDiscountKind
  discountValue: number
  hourlyRate: number
  showHours: boolean
  introText: string
  closingText: string
  paymentSchedule: OfferPaymentSchedule
  items: OfferItemInput[]
}

function totalsOf(input: OfferInput): ReturnType<typeof computeOfferTotals> {
  return computeOfferTotals(input.items, {
    taxMode: input.taxMode,
    taxRate: input.taxRate && input.taxRate > 0 ? input.taxRate : 0.19,
    currency: (input.currency || 'EUR').toUpperCase(),
    discountKind: input.discountKind,
    discountValue: input.discountValue,
  })
}

function writeItems(db: DatabaseSync, offerId: number, items: OfferItemInput[]): void {
  items.forEach((it, idx) => {
    db.prepare(
      `INSERT INTO offer_items
        (offer_id, position, section, title, description, quantity, unit, unit_price, fix_price, amount, optional, recurring, catalog_item_id, internal_hours)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      offerId, idx, it.section, it.title, it.description, it.quantity, it.unit,
      it.unitPrice, it.fixPrice, offerItemAmount(it), it.optional ? 1 : 0,
      it.recurring ? 1 : 0, it.catalogItemId, it.internalHours,
    )
  })
}

export function createOffer(db: DatabaseSync, input: OfferInput): number {
  const t = totalsOf(input)
  return tx(db, () => {
    const info = db.prepare(
      `INSERT INTO offers
        (kind, client_id, prospect_name, prospect_contact_person, prospect_address_extra, prospect_email, prospect_street, prospect_zip, prospect_city, prospect_country, prospect_vat_id,
         title, date, valid_until, service_period_start, service_period_end, status, tax_mode,
         currency, exchange_rate, language, freibleibend,
         discount_kind, discount_value, hourly_rate, show_hours, intro_text, closing_text, payment_schedule,
         subtotal, discount_amount, tax_rate, tax_amount, total, recurring_total)
       VALUES (@kind,@clientId,@pName,@pContact,@pExtra,@pEmail,@pStreet,@pZip,@pCity,@pCountry,@pVat,
         @title,@date,@validUntil,@sps,@spe,'draft',@taxMode,
         @currency,@exchangeRate,@language,@freibleibend,
         @discountKind,@discountValue,@hourlyRate,@showHours,@intro,@closing,@schedule,
         @subtotal,@discountAmount,@taxRate,@taxAmount,@total,@recurringTotal)`,
    ).run({
      kind: input.kind, clientId: input.clientId,
      pName: input.prospect.name, pContact: input.prospect.contactPerson, pExtra: input.prospect.addressExtra, pEmail: input.prospect.email, pStreet: input.prospect.street,
      pZip: input.prospect.zip, pCity: input.prospect.city, pCountry: input.prospect.country, pVat: input.prospect.vatId,
      title: input.title, date: input.date, validUntil: input.validUntil,
      sps: input.servicePeriodStart, spe: input.servicePeriodEnd,
      taxMode: input.taxMode,
      currency: (input.currency || 'EUR').toUpperCase(),
      exchangeRate: input.exchangeRate && input.exchangeRate > 0 ? input.exchangeRate : 1,
      language: input.language || 'de',
      freibleibend: input.freibleibend ? 1 : 0,
      discountKind: input.discountKind, discountValue: input.discountValue,
      hourlyRate: input.hourlyRate, showHours: input.showHours ? 1 : 0,
      intro: input.introText, closing: input.closingText,
      schedule: JSON.stringify(input.paymentSchedule),
      subtotal: t.subtotal, discountAmount: t.discountAmount,
      taxRate: t.taxRate,
      taxAmount: t.taxAmount, total: t.total, recurringTotal: t.recurringTotal,
    })
    const offerId = Number(info.lastInsertRowid)
    writeItems(db, offerId, input.items)
    return offerId
  })
}

export function updateOffer(db: DatabaseSync, id: number, input: OfferInput): void {
  const t = totalsOf(input)
  tx(db, () => {
    db.prepare(
      `UPDATE offers SET
        kind=@kind, client_id=@clientId,
        prospect_name=@pName, prospect_contact_person=@pContact, prospect_address_extra=@pExtra,
        prospect_email=@pEmail, prospect_street=@pStreet, prospect_zip=@pZip,
        prospect_city=@pCity, prospect_country=@pCountry, prospect_vat_id=@pVat,
        title=@title, date=@date, valid_until=@validUntil,
        service_period_start=@sps, service_period_end=@spe,
        tax_mode=@taxMode, tax_rate=@taxRate,
        currency=@currency, exchange_rate=@exchangeRate, language=@language,
        freibleibend=@freibleibend, discount_kind=@discountKind, discount_value=@discountValue,
        hourly_rate=@hourlyRate, show_hours=@showHours,
        intro_text=@intro, closing_text=@closing, payment_schedule=@schedule,
        subtotal=@subtotal, discount_amount=@discountAmount, tax_amount=@taxAmount,
        total=@total, recurring_total=@recurringTotal, updated_at=datetime('now')
       WHERE id=@id`,
    ).run({
      id, kind: input.kind, clientId: input.clientId,
      pName: input.prospect.name, pContact: input.prospect.contactPerson, pExtra: input.prospect.addressExtra, pEmail: input.prospect.email, pStreet: input.prospect.street,
      pZip: input.prospect.zip, pCity: input.prospect.city, pCountry: input.prospect.country, pVat: input.prospect.vatId,
      title: input.title, date: input.date, validUntil: input.validUntil,
      sps: input.servicePeriodStart, spe: input.servicePeriodEnd,
      taxMode: input.taxMode,
      taxRate: t.taxRate,
      currency: (input.currency || 'EUR').toUpperCase(),
      exchangeRate: input.exchangeRate && input.exchangeRate > 0 ? input.exchangeRate : 1,
      language: input.language || 'de',
      freibleibend: input.freibleibend ? 1 : 0,
      discountKind: input.discountKind, discountValue: input.discountValue,
      hourlyRate: input.hourlyRate, showHours: input.showHours ? 1 : 0,
      intro: input.introText, closing: input.closingText,
      schedule: JSON.stringify(input.paymentSchedule),
      subtotal: t.subtotal, discountAmount: t.discountAmount,
      taxAmount: t.taxAmount, total: t.total, recurringTotal: t.recurringTotal,
    })
    db.prepare('DELETE FROM offer_items WHERE offer_id = ?').run(id)
    writeItems(db, id, input.items)
  })
}

export function assignOfferNumber(db: DatabaseSync, id: number, prefix: string): string {
  return tx(db, () => {
    const existing = db.prepare('SELECT number, date FROM offers WHERE id = ?').get(id) as
      | { number: string | null; date: string }
      | undefined
    if (!existing) throw new Error(`Offer ${id} not found`)
    if (existing.number) return existing.number
    const year = Number(existing.date.slice(0, 4))
    const seq = db.prepare('SELECT year, last_number FROM offer_number_sequence WHERE year = ?').get(year) as
      | { year: number; last_number: number }
      | undefined
    const next = nextOfferNumber({ year, lastNumber: seq?.last_number ?? 0 }, year, prefix)
    db.prepare(
      'INSERT INTO offer_number_sequence (year, last_number) VALUES (?, ?) ON CONFLICT(year) DO UPDATE SET last_number = ?',
    ).run(year, next.counter, next.counter)
    db.prepare('UPDATE offers SET number = ?, updated_at = datetime(\'now\') WHERE id = ?').run(next.value, id)
    return next.value
  })
}

export function setOfferStatus(db: DatabaseSync, id: number, status: OfferStatus): void {
  db.prepare("UPDATE offers SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id)
}

export function setOfferPdfPath(db: DatabaseSync, id: number, pdfPath: string): void {
  db.prepare('UPDATE offers SET pdf_path = ? WHERE id = ?').run(pdfPath, id)
}

export function setOfferEmailSent(db: DatabaseSync, id: number, recipient: string): void {
  db.prepare(
    "UPDATE offers SET email_sent_at = datetime('now'), email_recipient = @to, " +
      "status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END, updated_at = datetime('now') WHERE id = @id",
  ).run({ id, to: recipient })
}

export function deleteOffer(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM offers WHERE id = ?').run(id)
}

function rowToItem(r: any): OfferItem {
  return {
    id: r.id, offerId: r.offer_id, position: r.position, section: r.section ?? '',
    title: r.title, description: r.description ?? '',
    quantity: r.quantity, unit: r.unit ?? '', unitPrice: r.unit_price, fixPrice: r.fix_price,
    amount: r.amount, optional: !!r.optional, recurring: !!r.recurring,
    catalogItemId: r.catalog_item_id ?? null, internalHours: r.internal_hours ?? null,
  }
}

const SELECT_OFFER = `
  SELECT o.*, c.name AS client_name
  FROM offers o LEFT JOIN clients c ON c.id = o.client_id
`

function rowToOffer(db: DatabaseSync, r: any): Offer {
  const items = (db.prepare('SELECT * FROM offer_items WHERE offer_id = ? ORDER BY position').all(r.id) as any[]).map(rowToItem)
  return {
    id: r.id, number: r.number, kind: r.kind as OfferKind,
    clientId: r.client_id, clientName: r.client_name ?? '',
    prospect: {
      name: r.prospect_name ?? '', contactPerson: r.prospect_contact_person ?? '',
      addressExtra: r.prospect_address_extra ?? '', email: r.prospect_email ?? '', street: r.prospect_street ?? '',
      zip: r.prospect_zip ?? '', city: r.prospect_city ?? '', country: r.prospect_country ?? '', vatId: r.prospect_vat_id ?? '',
    },
    title: r.title ?? '', date: r.date, validUntil: r.valid_until,
    servicePeriodStart: r.service_period_start, servicePeriodEnd: r.service_period_end,
    status: r.status as OfferStatus, taxMode: r.tax_mode as OfferTaxMode,
    taxRate: r.tax_rate ?? 0,
    currency: r.currency ?? 'EUR',
    exchangeRate: r.exchange_rate ?? 1,
    language: (r.language ?? 'de') as Offer['language'],
    freibleibend: !!r.freibleibend,
    discountKind: r.discount_kind as OfferDiscountKind, discountValue: r.discount_value,
    hourlyRate: r.hourly_rate ?? 0,
    showHours: !!r.show_hours,
    introText: r.intro_text ?? '', closingText: r.closing_text ?? '',
    paymentSchedule: JSON.parse(r.payment_schedule ?? '{"depositPercent":0,"milestones":[]}'),
    subtotal: r.subtotal, discountAmount: r.discount_amount,
    taxAmount: r.tax_amount, total: r.total, recurringTotal: r.recurring_total,
    acceptedAt: r.accepted_at ?? null, acceptedBy: r.accepted_by ?? null, acceptanceNote: r.acceptance_note ?? null,
    version: r.version ?? 1, parentOfferId: r.parent_offer_id ?? null,
    convertedProjectId: r.converted_project_id ?? null, convertedInvoiceId: r.converted_invoice_id ?? null,
    emailSentAt: r.email_sent_at ?? null, emailRecipient: r.email_recipient ?? null,
    pdfPath: r.pdf_path ?? null, items,
  }
}

export function getOffer(db: DatabaseSync, id: number): Offer | null {
  const r = db.prepare(`${SELECT_OFFER} WHERE o.id = ?`).get(id) as any
  return r ? rowToOffer(db, r) : null
}

export function listOffers(db: DatabaseSync): Offer[] {
  const rows = db.prepare(`${SELECT_OFFER} ORDER BY (o.number IS NULL) DESC, o.id DESC`).all() as any[]
  return rows.map((r) => rowToOffer(db, r))
}
