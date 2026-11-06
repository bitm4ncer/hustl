import type { InvoiceStatus } from './types'

/**
 * Erlaubte Statuswechsel einer Rechnung. Alles andere würde Nummern oder
 * Erlöse zerstören: ein Entwurf bekommt seine Nummer nur über „Finalisieren",
 * und eine stornierte Rechnung lebt nie wieder auf.
 */
const TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: [],
  finalized: ['sent', 'paid', 'cancelled'],
  sent: ['paid', 'cancelled'],
  paid: ['sent', 'cancelled'],
  cancelled: [],
}

export function canTransitionInvoice(from: InvoiceStatus, to: InvoiceStatus): boolean {
  // Derselbe Status ist kein Wechsel — ein wiederholter Aufruf darf nicht scheitern.
  return from === to || TRANSITIONS[from].includes(to)
}
