import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { applyMigrations } from '../../../src/core/db/migrations'
import { createClient } from '../../../src/core/db/clients'
import {
  createOffer, getOffer, listOffers, updateOffer, setOfferStatus,
  assignOfferNumber, deleteOffer, type OfferInput,
} from '../../../src/core/db/offers'

function baseInput(over: Partial<OfferInput> = {}): OfferInput {
  return {
    kind: 'angebot',
    clientId: null,
    prospect: { name: 'Interessent GmbH', contactPerson: '', addressExtra: '', email: '', street: 'Weg 1', zip: '10115', city: 'Berlin', country: 'Deutschland', vatId: '' },
    title: 'Website',
    date: '2026-06-15',
    validUntil: '2026-06-29',
    servicePeriodStart: '2026-07-01',
    servicePeriodEnd: '2026-08-31',
    taxMode: 'regular',
    freibleibend: false,
    discountKind: 'none',
    discountValue: 0,
    hourlyRate: 90,
    showHours: false,
    introText: '',
    closingText: '',
    paymentSchedule: { depositPercent: 0, milestones: [] },
    items: [
      { section: '', title: 'Konzept', description: '', quantity: null, unit: 'Psch', unitPrice: null, fixPrice: 1000, optional: false, recurring: false, catalogItemId: null, internalHours: null },
    ],
    ...over,
  }
}

describe('offers db', () => {
  it('create + get stores items and computed totals', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const id = createOffer(db, baseInput())
    const o = getOffer(db, id)!
    expect(o.number).toBeNull()
    expect(o.status).toBe('draft')
    expect(o.kind).toBe('angebot')
    expect(o.prospect.name).toBe('Interessent GmbH')
    expect(o.items).toHaveLength(1)
    expect(o.subtotal).toBe(1000)
    expect(o.taxAmount).toBe(190)
    expect(o.total).toBe(1190)
  })

  it('derives clientName from a linked client', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const clientId = createClient(db, { notionId: null, name: 'Acme', contactPerson: '', addressExtra: '', address: '', street: '', zip: '', city: '', country: '', email: '', hourlyRate: 0, noTax: false, vatId: null, notes: '' })
    const id = createOffer(db, baseInput({ clientId }))
    expect(getOffer(db, id)!.clientName).toBe('Acme')
  })

  it('assignOfferNumber gives a gapless per-year number on first send', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const a = createOffer(db, baseInput())
    const b = createOffer(db, baseInput())
    expect(assignOfferNumber(db, a, 'ANG')).toBe('ANG-2026-001')
    expect(assignOfferNumber(db, b, 'ANG')).toBe('ANG-2026-002')
    // re-assigning keeps the existing number (idempotent)
    expect(assignOfferNumber(db, a, 'ANG')).toBe('ANG-2026-001')
  })

  it('setOfferStatus updates status', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const id = createOffer(db, baseInput())
    setOfferStatus(db, id, 'declined')
    expect(getOffer(db, id)!.status).toBe('declined')
  })

  it('updateOffer replaces items and recomputes totals', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const id = createOffer(db, baseInput())
    updateOffer(db, id, baseInput({
      items: [
        { section: '', title: 'A', description: '', quantity: 10, unit: 'Std', unitPrice: 90, fixPrice: null, optional: false, recurring: false, catalogItemId: null, internalHours: null },
      ],
    }))
    const o = getOffer(db, id)!
    expect(o.items).toHaveLength(1)
    expect(o.subtotal).toBe(900)
    expect(o.total).toBe(1071)
  })

  it('deleteOffer removes the row and its items', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const id = createOffer(db, baseInput())
    deleteOffer(db, id)
    expect(getOffer(db, id)).toBeNull()
    expect(listOffers(db)).toHaveLength(0)
  })
})
