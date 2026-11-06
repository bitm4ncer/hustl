import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { applyMigrations } from '../../src/core/db/migrations'
import { createClient } from '../../src/core/db/clients'
import { createDraft, finalizeInvoice, getInvoice } from '../../src/core/db/invoices'

function setup() {
  const db = new DatabaseSync(':memory:')
  applyMigrations(db)
  const clientId = createClient(db, {
    notionId: null,
    name: 'C',
    contactPerson: '',
    addressExtra: '',
    address: '',
    street: '',
    zip: '',
    city: '',
    country: '',
    email: '',
    hourlyRate: 80,
    noTax: false,
    vatId: null,
    notes: '',
  })
  const id = createDraft(db, {
    clientId,
    date: '2026-12-31',
    servicePeriodStart: null,
    servicePeriodEnd: null,
    poNumber: null,
    notes: null,
    items: [
      { title: 'A', description: '', quantity: 1, unitPrice: 100, fixPrice: null },
    ],
  })
  return { db, id }
}

describe('finalize guard', () => {
  it('vergibt keine zweite Nummer fuer dieselbe Rechnung', () => {
    const { db, id } = setup()
    finalizeInvoice(db, id, '2026-12-31')
    const first = getInvoice(db, id)!
    expect(first.number).toBe('2026001')

    expect(() => finalizeInvoice(db, id, '2026-12-31')).toThrow('Entwurfsstatus')

    const sequence = db.prepare('SELECT last_number FROM number_sequence WHERE year = 2026').get() as {
      last_number: number
    }
    expect(sequence.last_number).toBe(1)
  })

  it('nutzt an der Jahresgrenze den neuen Jahrgang', () => {
    const { db, id } = setup()
    // 2026-12-31T23:30Z ist in Berlin schon 2027.
    finalizeInvoice(db, id, '2027-01-01')
    expect(getInvoice(db, id)!.number).toBe('2027001')
  })
})
