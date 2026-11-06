import type { DatabaseSync } from 'node:sqlite'
import type { Offer } from '@shared/types'
import { round2, formatDateDE } from '@shared/money'
import { taxModeFromOffer } from '@shared/tax'
import { createClient, type ClientInput } from './clients'
import { createProject, getProjectById, type ProjectInput } from './projects'
import { getOffer } from './offers'
import { tx } from './tx'

/**
 * Turning a won offer into master data: the prospect becomes a client, the
 * offer becomes a Forthcoming project. Both steps are idempotent, so the
 * buttons in the offer list can be pressed twice without leaving duplicates.
 */

/** "Angebot" / "Kostenvoranschlag" plus the number, once one was assigned. */
function offerRef(offer: Offer): string {
  const label = offer.kind === 'angebot' ? 'Angebot' : 'Kostenvoranschlag'
  return `${label} ${offer.number ?? ''}`.trim()
}

/** The items a project inherits: everything binding and one-off. Optional
 *  posts aren't sold yet, recurring ones aren't project work. */
function bindingItems(offer: Offer): Offer['items'] {
  return offer.items.filter((it) => !it.optional && !it.recurring)
}

function prospectToClient(offer: Offer): ClientInput {
  const p = offer.prospect
  // The legacy `address` blob is only a fallback for clients without structured
  // fields, and the templates print the name separately, so it holds the same
  // lines as the structured columns, name excluded.
  const address = [p.street, [p.zip, p.city].filter(Boolean).join(' ').trim(), p.country]
    .filter(Boolean)
    .join('\n')
  return {
    notionId: null,
    name: p.name.trim(),
    contactPerson: p.contactPerson,
    addressExtra: p.addressExtra,
    address,
    street: p.street,
    zip: p.zip,
    city: p.city,
    country: p.country,
    countryCode: '',
    currency: offer.currency || '',
    language: offer.language || '',
    taxMode: taxModeFromOffer(offer.taxMode),
    email: p.email,
    hourlyRate: offer.hourlyRate,
    noTax: offer.taxMode !== 'regular',
    vatId: p.vatId.trim() || null,
    notes: `Aus ${offerRef(offer)}`,
  }
}

function offerToProject(offer: Offer, clientId: number): ProjectInput {
  const items = bindingItems(offer)
  const hours = round2(items.reduce((sum, it) => sum + (it.internalHours ?? 0), 0))
  const ref = offerRef(offer)
  return {
    notionId: null,
    clientId,
    title: offer.title.trim() || ref,
    description: '',
    status: 'Forthcoming',
    hours: hours > 0 ? hours : null,
    // Net of discount, without VAT, the same basis the forecast uses.
    fixPrice: round2(offer.subtotal - offer.discountAmount),
    timeframeStart: offer.servicePeriodStart,
    timeframeEnd: offer.servicePeriodEnd,
    note: `Aus ${ref} vom ${formatDateDE(offer.date)}`,
    items: items.map((it) => ({
      title: it.title,
      description: it.description,
      hours: it.internalHours,
    })),
  }
}

function requireOffer(db: DatabaseSync, offerId: number): Offer {
  const offer = getOffer(db, offerId)
  if (!offer) throw new Error(`Angebot ${offerId} nicht gefunden`)
  return offer
}

/**
 * Make sure the offer points at a real client, creating one from the prospect
 * block if it doesn't. Returns the client id either way.
 */
export function ensureOfferClient(db: DatabaseSync, offerId: number): { clientId: number; created: boolean } {
  return tx(db, () => {
    const offer = requireOffer(db, offerId)
    if (offer.clientId != null) return { clientId: offer.clientId, created: false }
    if (offer.prospect.name.trim() === '') {
      throw new Error('Angebot hat keinen Empfängernamen. Bitte zuerst im Angebot ergänzen.')
    }
    const clientId = createClient(db, prospectToClient(offer))
    db.prepare("UPDATE offers SET client_id = ?, updated_at = datetime('now') WHERE id = ?")
      .run(clientId, offerId)
    return { clientId, created: true }
  })
}

/**
 * Create the project the offer describes, creating the client on the way when
 * the offer is still addressed to a prospect. Marks the offer accepted unless
 * it already moved past that.
 */
export function convertOfferToProject(
  db: DatabaseSync,
  offerId: number,
): { projectId: number; created: boolean } {
  return tx(db, () => {
    const offer = requireOffer(db, offerId)
    // Already converted, and the project is still around: hand back that one
    // rather than piling up duplicates.
    if (offer.convertedProjectId != null && getProjectById(db, offer.convertedProjectId)) {
      return { projectId: offer.convertedProjectId, created: false }
    }
    if (bindingItems(offer).length === 0) {
      throw new Error('Angebot enthält keine verbindliche Position.')
    }
    const { clientId } = ensureOfferClient(db, offerId)
    const projectId = createProject(db, offerToProject(offer, clientId))
    db.prepare(
      `UPDATE offers SET
         converted_project_id = @projectId,
         status = CASE WHEN status IN ('accepted', 'invoiced') THEN status ELSE 'accepted' END,
         accepted_at = COALESCE(accepted_at, datetime('now')),
         updated_at = datetime('now')
       WHERE id = @id`,
    ).run({ id: offerId, projectId })
    return { projectId, created: true }
  })
}
