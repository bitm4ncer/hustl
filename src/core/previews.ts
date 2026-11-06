import type { DatabaseSync } from 'node:sqlite'
import type {
  Client,
  CompanySettings,
  Invoice,
  InvoicePreviewInput,
  Offer,
  OfferPreviewInput,
} from '@shared/types'
import { itemAmount, computeTotals } from '@shared/money'
import { computeOfferTotals } from '@shared/offer-money'
import { nextNumber } from '@shared/invoice-number'
import { getClientById } from './db/clients'
import { getSettings } from './db/settings'
import { getNumberSequence } from './db/number-sequence'

/**
 * Baut die virtuelle Rechnung für den aktuellen Editor-Zustand — dieselbe, auf
 * der Live-Vorschau und E-Rechnungs-Prüfung arbeiten. Gibt null zurück, wenn
 * kein gültiger Kunde gewählt ist. Nichts wird persistiert.
 */
export function buildPreviewInvoice(
  db: DatabaseSync,
  input: InvoicePreviewInput
): { invoice: Invoice; client: Client; settings: CompanySettings } | null {
  if (input.clientId == null) return null
  const client = getClientById(db, input.clientId)
  if (!client) return null
  const settings = getSettings(db)

  const amounts = input.items.map(itemAmount)
  const taxMode = input.taxMode ?? client.taxMode
  const requestedRate = input.taxRate ?? settings.defaultTaxRate
  const taxRate =
    taxMode === 'standard' || taxMode === 'reduced'
      ? requestedRate > 0
        ? requestedRate
        : settings.defaultTaxRate
      : 0
  const currency = (input.currency || client.currency || 'EUR').toUpperCase()
  const language = input.language || client.language || settings.documentLanguage
  const totals = computeTotals(amounts, { taxMode, taxRate, currency })
  const year = Number(input.date.slice(0, 4))
  const seq = getNumberSequence(db, year)
  const number = nextNumber({ year, lastNumber: seq?.lastNumber ?? 0 }, year).value

  const invoice: Invoice = {
    id: 0,
    number,
    clientId: client.id,
    date: input.date,
    servicePeriodStart: input.servicePeriodStart,
    servicePeriodEnd: input.servicePeriodEnd,
    status: 'draft',
    subtotal: totals.subtotal,
    taxRate: totals.taxRate,
    taxAmount: totals.taxAmount,
    total: totals.total,
    noTax: totals.noTax,
    reverseCharge: totals.reverseCharge,
    taxMode: totals.taxMode,
    currency,
    exchangeRate: 1,
    language,
    poNumber: input.poNumber,
    notes: input.notes,
    pdfPath: null,
    hash: null,
    prevHash: null,
    finalizedAt: null,
    paidAt: null,
    emailSentAt: null,
    emailRecipient: null,
    correctsNumber: null,
    items: input.items.map((it, idx) => ({
      id: 0,
      invoiceId: 0,
      notionTaskId: null,
      projectId: it.projectId ?? null,
      position: idx,
      title: it.title,
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      fixPrice: it.fixPrice,
      amount: itemAmount(it),
      subItems: it.subItems ?? [],
    })),
  }

  return { invoice, client, settings }
}

/**
 * Bei Angeboten mit Kundenbezug sind die Interessenten-Felder leer. Diese
 * Funktion kopiert die Kundenadresse hinein, damit PDF und Vorschau nie eine
 * leere Empfängeradresse zeigen.
 */
export function withRecipientAddress(db: DatabaseSync, offer: Offer): Offer {
  if (offer.clientId == null) return offer
  const c = getClientById(db, offer.clientId)
  if (!c) return offer
  return {
    ...offer,
    prospect: {
      name: c.name,
      contactPerson: c.contactPerson,
      addressExtra: c.addressExtra,
      email: c.email,
      street: c.street,
      zip: c.zip,
      city: c.city,
      country: c.country,
      vatId: c.vatId ?? '',
    },
  }
}

export function buildPreviewOffer(
  db: DatabaseSync,
  input: OfferPreviewInput
): { offer: Offer; settings: CompanySettings } {
  const settings = getSettings(db)
  const t = computeOfferTotals(input.items, {
    taxMode: input.taxMode,
    taxRate: input.taxRate,
    currency: input.currency || 'EUR',
    discountKind: input.discountKind,
    discountValue: input.discountValue,
  })
  const clientName =
    input.clientId != null ? (getClientById(db, input.clientId)?.name ?? '') : ''
  const offer: Offer = {
    id: 0,
    number: null,
    kind: input.kind,
    clientId: input.clientId,
    clientName,
    prospect: input.prospect,
    title: input.title,
    date: input.date,
    validUntil: input.validUntil,
    servicePeriodStart: input.servicePeriodStart,
    servicePeriodEnd: input.servicePeriodEnd,
    status: 'draft',
    taxMode: input.taxMode,
    taxRate: t.taxRate,
    currency: (input.currency || 'EUR').toUpperCase(),
    exchangeRate: input.exchangeRate || 1,
    language: input.language || settings.documentLanguage,
    freibleibend: input.freibleibend,
    discountKind: input.discountKind,
    discountValue: input.discountValue,
    hourlyRate: input.hourlyRate,
    showHours: input.showHours,
    introText: input.introText,
    closingText: input.closingText,
    paymentSchedule: input.paymentSchedule,
    subtotal: t.subtotal,
    discountAmount: t.discountAmount,
    taxAmount: t.taxAmount,
    total: t.total,
    recurringTotal: t.recurringTotal,
    acceptedAt: null,
    acceptedBy: null,
    acceptanceNote: null,
    version: 1,
    parentOfferId: null,
    convertedProjectId: null,
    convertedInvoiceId: null,
    emailSentAt: null,
    emailRecipient: null,
    pdfPath: null,
    items: input.items.map((it, idx) => ({
      id: 0,
      offerId: 0,
      position: idx,
      section: it.section,
      title: it.title,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
      fixPrice: it.fixPrice,
      amount: it.fixPrice ?? (it.quantity ?? 0) * (it.unitPrice ?? 0),
      optional: it.optional,
      recurring: it.recurring,
      catalogItemId: it.catalogItemId,
      internalHours: it.internalHours,
    })),
  }
  return { offer, settings }
}

/** Deutsche Prüfprobleme, die Versand/PDF blockieren. */
export function validateOffer(input: OfferPreviewInput): string[] {
  const errors: string[] = []
  const hasRecipient = input.clientId != null || input.prospect.name.trim() !== ''
  if (!hasRecipient) errors.push('Bitte einen Kunden wählen oder Interessenten-Name angeben.')
  if (input.clientId == null && (!input.prospect.street.trim() || !input.prospect.city.trim())) {
    errors.push('Bitte die Adresse des Interessenten angeben (Straße und Stadt).')
  }
  if (!input.date) errors.push('Bitte ein Datum angeben.')
  if (!input.validUntil) errors.push('Bitte ein „Gültig bis"-Datum angeben.')
  const priced = input.items.some(
    (it) => (it.fixPrice ?? (it.quantity ?? 0) * (it.unitPrice ?? 0)) > 0
  )
  if (!priced) errors.push('Mindestens eine Position mit Preis ist erforderlich.')
  if (input.taxMode === 'reverse_charge' && input.clientId == null && !input.prospect.vatId.trim()) {
    errors.push('Reverse-Charge erfordert die USt-IdNr. des Empfängers.')
  }
  return errors
}
