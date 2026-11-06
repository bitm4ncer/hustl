import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { applyMigrations } from '../../../src/core/db/migrations'
import { createClient } from '../../../src/core/db/clients'
import { todayInBerlin } from '../../../src/core/clock'
import {
  createDraft,
  updateDraft,
  finalizeInvoice,
  getInvoice,
  setPdfPath,
  setInvoiceStatus,
  setInvoicePaid,
  cancelAndCopyInvoice
} from '../../../src/core/db/invoices'

function seedClient(db: any, noTax = false) {
  return createClient(db, {
    notionId: null,
    contactPerson: '',
    addressExtra: '',
    name: 'C',
    address: 'Street\n12345 City',
    street: '',
    zip: '',
    city: '',
    country: '',
    email: '',
    hourlyRate: 80,
    noTax,
    vatId: null,
    notes: ''
  })
}

describe('invoices', () => {
  it('computes totals from items on draft create', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const cid = seedClient(db)
    const id = createDraft(db, {
      clientId: cid,
      date: '2026-06-14',
      items: [
        { title: 'A', description: '', quantity: 10, unitPrice: 80, fixPrice: null },
        { title: 'B', description: '', quantity: null, unitPrice: null, fixPrice: 200 }
      ]
    })
    const inv = getInvoice(db, id)!
    expect(inv.subtotal).toBe(1000)
    expect(inv.taxAmount).toBeCloseTo(190, 2)
    expect(inv.total).toBeCloseTo(1190, 2)
    expect(inv.status).toBe('draft')
    expect(inv.number).toBeNull()
    // Zeilen ohne sub_items lesen sich als leere Liste.
    expect(inv.items[0].subItems).toEqual([])
  })

  it('persists tax mode, currency and document language', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const cid = seedClient(db)
    const id = createDraft(db, {
      clientId: cid,
      date: '2026-06-14',
      taxMode: 'reverse_charge',
      taxRate: 0,
      currency: 'USD',
      exchangeRate: 1.1,
      language: 'en',
      items: [{ title: 'A', description: '', quantity: 1, unitPrice: 1000, fixPrice: null }]
    })
    const inv = getInvoice(db, id)!
    expect(inv.taxMode).toBe('reverse_charge')
    expect(inv.reverseCharge).toBe(true)
    expect(inv.noTax).toBe(false)
    expect(inv.currency).toBe('USD')
    expect(inv.exchangeRate).toBe(1.1)
    expect(inv.language).toBe('en')
    expect(inv.taxAmount).toBe(0)
  })

  it('uses a custom VAT rate for standard invoices', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const cid = seedClient(db)
    const id = createDraft(db, {
      clientId: cid,
      date: '2026-06-14',
      taxMode: 'standard',
      taxRate: 0.2,
      items: [{ title: 'A', description: '', quantity: 1, unitPrice: 1000, fixPrice: null }]
    })
    const inv = getInvoice(db, id)!
    expect(inv.taxRate).toBe(0.2)
    expect(inv.taxAmount).toBe(200)
    expect(inv.total).toBe(1200)
  })

  it('updateDraft replaces items and recomputes totals for a draft', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const cid = seedClient(db)
    const id = createDraft(db, {
      clientId: cid,
      date: '2026-07-08',
      items: [{ title: 'A', description: '', quantity: 1, unitPrice: 100, fixPrice: null }]
    })
    const ok = updateDraft(db, id, {
      clientId: cid,
      date: '2026-07-09',
      poNumber: 'PO-9',
      items: [
        { title: 'B', description: 'neu', quantity: 5, unitPrice: 90, fixPrice: null, subItems: [{ title: 'Sub', description: 'x', hours: 2 }] },
        { title: 'C', description: '', quantity: null, unitPrice: null, fixPrice: 50 }
      ]
    })
    expect(ok).toBe(true)
    const inv = getInvoice(db, id)!
    expect(inv.date).toBe('2026-07-09')
    expect(inv.poNumber).toBe('PO-9')
    expect(inv.items.map((i) => i.title)).toEqual(['B', 'C'])
    expect(inv.items[0].subItems).toEqual([{ title: 'Sub', description: 'x', hours: 2 }])
    expect(inv.subtotal).toBe(5 * 90 + 50)
    expect(inv.total).toBeCloseTo((450 + 50) * 1.19, 2)
    expect(inv.status).toBe('draft')
  })

  it('updateDraft refuses to touch a finalized invoice', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const cid = seedClient(db)
    const id = createDraft(db, {
      clientId: cid,
      date: '2026-07-08',
      items: [{ title: 'A', description: '', quantity: 1, unitPrice: 100, fixPrice: null }]
    })
    finalizeInvoice(db, id, '2026-07-08')
    const ok = updateDraft(db, id, {
      clientId: cid,
      date: '2030-01-01',
      items: [{ title: 'HACK', description: '', quantity: 999, unitPrice: 999, fixPrice: null }]
    })
    expect(ok).toBe(false)
    const inv = getInvoice(db, id)!
    expect(inv.date).toBe('2026-07-08')
    expect(inv.items[0].title).toBe('A')
    expect(inv.status).toBe('finalized')
  })

  it('round-trips sub-items as JSON', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const cid = seedClient(db)
    const subs = [
      { title: 'Setup', description: 'Staging', hours: 2 },
      { title: '', description: 'Ohne Titel', hours: null }
    ]
    const id = createDraft(db, {
      clientId: cid,
      date: '2026-07-08',
      items: [
        { title: 'Projekt', description: '', quantity: 17, unitPrice: 90, fixPrice: null, subItems: subs },
        { title: 'Ohne Subs', description: '', quantity: null, unitPrice: null, fixPrice: 100 }
      ]
    })
    const inv = getInvoice(db, id)!
    expect(inv.items[0].subItems).toEqual(subs)
    expect(inv.items[1].subItems).toEqual([])
    // Beträge kommen weiterhin ausschließlich vom Parent-Item.
    expect(inv.subtotal).toBe(17 * 90 + 100)
  })

  it('assigns the next gapless number on finalize, starting from seeded sequence', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    db.prepare('INSERT INTO number_sequence (year, last_number) VALUES (2026, 24)').run()
    const cid = seedClient(db)
    const id = createDraft(db, {
      clientId: cid,
      date: '2026-06-14',
      items: [{ title: 'A', description: '', quantity: 1, unitPrice: 100, fixPrice: null }]
    })
    finalizeInvoice(db, id, '2026-06-14')
    expect(getInvoice(db, id)!.number).toBe('2026025')
    expect(getInvoice(db, id)!.status).toBe('finalized')
  })

  it('writes an audit_log row on finalize', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const cid = seedClient(db)
    const id = createDraft(db, {
      clientId: cid,
      date: '2026-06-14',
      items: [{ title: 'A', description: '', quantity: 1, unitPrice: 100, fixPrice: null }]
    })
    finalizeInvoice(db, id, '2026-06-14')
    const n = (db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action='finalized'").get() as any).c
    expect(n).toBe(1)
  })

  it('setInvoiceStatus updates the status and appends an audit row', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const cid = seedClient(db)
    const id = createDraft(db, {
      clientId: cid,
      date: '2026-06-14',
      items: [{ title: 'A', description: '', quantity: 1, unitPrice: 100, fixPrice: null }]
    })
    finalizeInvoice(db, id, '2026-06-14')
    setInvoiceStatus(db, id, 'paid')
    expect(getInvoice(db, id)!.status).toBe('paid')
    // Marking paid via the status dropdown must also stamp paid_at, so the
    // cash-basis dashboard counts it (parity with the Bezahlt toggle).
    expect(getInvoice(db, id)!.paidAt).not.toBeNull()
    // Moving away from paid clears paid_at again.
    setInvoiceStatus(db, id, 'sent')
    expect(getInvoice(db, id)!.paidAt).toBeNull()
    const audit = db
      .prepare("SELECT payload FROM audit_log WHERE action = 'status' AND invoice_id = ?")
      .get(id) as { payload: string } | undefined
    expect(audit).toBeDefined()
  })

  it('setPdfPath persists the pdf_path onto the invoice row', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const cid = seedClient(db)
    const id = createDraft(db, {
      clientId: cid,
      date: '2026-06-14',
      items: [{ title: 'A', description: '', quantity: 1, unitPrice: 100, fixPrice: null }]
    })
    setPdfPath(db, id, '/tmp/invoices/Rechnung.pdf')
    expect(getInvoice(db, id)!.pdfPath).toBe('/tmp/invoices/Rechnung.pdf')
  })

  it('cancelAndCopyInvoice cancels a finalized invoice and copies it into a fresh draft', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const cid = seedClient(db)
    const subs = [{ title: 'Setup', description: 'Staging', hours: 2 }]
    const id = createDraft(db, {
      clientId: cid,
      date: '2026-07-08',
      servicePeriodStart: '2026-07-01',
      servicePeriodEnd: '2026-07-31',
      poNumber: 'PO-7',
      notes: 'Notiz',
      items: [
        { title: 'A', description: 'x', quantity: 5, unitPrice: 90, fixPrice: null, subItems: subs },
        { title: 'B', description: '', quantity: null, unitPrice: null, fixPrice: 50 }
      ]
    })
    finalizeInvoice(db, id, '2026-07-08')
    const numberBefore = getInvoice(db, id)!.number
    const totalBefore = getInvoice(db, id)!.total

    const copyId = cancelAndCopyInvoice(db, id)

    const old = getInvoice(db, id)!
    expect(old.status).toBe('cancelled')
    // Number and amounts of the original stay untouched (GoBD).
    expect(old.number).toBe(numberBefore)
    expect(old.total).toBe(totalBefore)

    const copy = getInvoice(db, copyId)!
    expect(copy.status).toBe('draft')
    expect(copy.number).toBeNull()
    expect(copy.pdfPath).toBeNull()
    expect(copy.paidAt).toBeNull()
    expect(copy.clientId).toBe(cid)
    // Das Storno-Dokument trägt das Datum des Stornos, nicht das der Vorrechnung.
    expect(copy.date).toBe(todayInBerlin())
    expect(copy.correctsNumber).toBe(numberBefore)
    expect(copy.servicePeriodStart).toBe('2026-07-01')
    expect(copy.servicePeriodEnd).toBe('2026-07-31')
    expect(copy.poNumber).toBe('PO-7')
    expect(copy.notes).toBe('Notiz')
    expect(copy.items.map((i) => i.title)).toEqual(['A', 'B'])
    expect(copy.items[0].subItems).toEqual(subs)
    expect(copy.total).toBeCloseTo(totalBefore, 2)

    // The audit chain links both directions.
    const cancelled = db
      .prepare("SELECT payload FROM audit_log WHERE action = 'cancelled' AND invoice_id = ?")
      .get(id) as { payload: string } | undefined
    expect(JSON.parse(cancelled!.payload)).toEqual({ replacedBy: copyId })
    const corrected = db
      .prepare("SELECT payload FROM audit_log WHERE action = 'correctedFrom' AND invoice_id = ?")
      .get(copyId) as { payload: string } | undefined
    expect(JSON.parse(corrected!.payload)).toEqual({ invoiceId: id })
  })

  it('cancelAndCopyInvoice refuses drafts and already-cancelled invoices', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const cid = seedClient(db)
    const id = createDraft(db, {
      clientId: cid,
      date: '2026-07-08',
      items: [{ title: 'A', description: '', quantity: 1, unitPrice: 100, fixPrice: null }]
    })
    expect(() => cancelAndCopyInvoice(db, id)).toThrow()
    expect(getInvoice(db, id)!.status).toBe('draft')

    finalizeInvoice(db, id, '2026-07-08')
    cancelAndCopyInvoice(db, id)
    expect(() => cancelAndCopyInvoice(db, id)).toThrow()
    expect(getInvoice(db, id)!.status).toBe('cancelled')
  })

  it('setInvoicePaid sets status=paid + paid_at, and reverts to sent on unpaid', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const cid = seedClient(db)
    const id = createDraft(db, {
      clientId: cid, date: '2026-06-14',
      items: [{ title: 'A', description: '', quantity: 1, unitPrice: 100, fixPrice: null }],
    })
    finalizeInvoice(db, id, '2026-06-14')
    setInvoicePaid(db, id, true)
    let inv = getInvoice(db, id)!
    expect(inv.status).toBe('paid')
    expect(inv.paidAt).not.toBeNull()
    setInvoicePaid(db, id, false)
    inv = getInvoice(db, id)!
    expect(inv.status).toBe('sent')
    expect(inv.paidAt).toBeNull()
  })
})
