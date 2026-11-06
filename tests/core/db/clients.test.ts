import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { applyMigrations } from '../../../src/core/db/migrations'
import {
  upsertClientByNotionId,
  listClients,
  createClient,
  getClientById,
  updateClient
} from '../../../src/core/db/clients'

describe('clients', () => {
  it('inserts then updates the same notion_id (no duplicate)', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    upsertClientByNotionId(db, {
      notionId: 'n1',
      contactPerson: '',
      addressExtra: '',
      name: 'Acme',
      address: 'A',
      street: '',
      zip: '',
      city: '',
      country: '',
      email: '',
      hourlyRate: 80,
      noTax: false,
      vatId: null,
      notes: ''
    })
    upsertClientByNotionId(db, {
      notionId: 'n1',
      contactPerson: '',
      addressExtra: '',
      name: 'Acme GmbH',
      address: 'A2',
      street: '',
      zip: '',
      city: '',
      country: '',
      email: '',
      hourlyRate: 90,
      noTax: true,
      vatId: 'DE1',
      notes: ''
    })
    const all = listClients(db)
    expect(all).toHaveLength(1)
    expect(all[0].name).toBe('Acme GmbH')
    expect(all[0].noTax).toBe(true)
    expect(all[0].hourlyRate).toBe(90)
  })

  it('getClientById returns the row mapped, or null when missing', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const id = createClient(db, {
      notionId: null,
      contactPerson: '',
      addressExtra: '',
      name: 'Acme',
      address: 'Street\n12345 City',
      street: '',
      zip: '',
      city: '',
      country: '',
      email: 'a@b.de',
      hourlyRate: 80,
      noTax: true,
      vatId: 'DE1',
      notes: ''
    })
    const c = getClientById(db, id)
    expect(c).not.toBeNull()
    expect(c!.id).toBe(id)
    expect(c!.name).toBe('Acme')
    expect(c!.noTax).toBe(true)
    expect(c!.vatId).toBe('DE1')
    expect(getClientById(db, 9999)).toBeNull()
  })

  it('updates an existing client without choking on the notionId bind (node:sqlite strict params)', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const id = createClient(db, {
      notionId: 'keep-me',
      contactPerson: '',
      addressExtra: '',
      name: 'Old Name',
      address: 'Old',
      street: '',
      zip: '',
      city: '',
      country: '',
      email: 'old@b.de',
      hourlyRate: 70,
      noTax: false,
      vatId: null,
      notes: ''
    })
    // ClientInput still carries notionId; updateClient must not pass it to the
    // UPDATE (which never references notion_id) or node:sqlite throws.
    expect(() =>
      updateClient(db, id, {
        notionId: 'keep-me',
        contactPerson: '',
        addressExtra: '',
        name: 'New Name',
        address: 'New',
        street: '',
        zip: '',
        city: '',
        country: '',
        email: 'new@b.de',
        hourlyRate: 95,
        noTax: true,
        vatId: 'DE9',
        notes: ''
      })
    ).not.toThrow()
    const c = getClientById(db, id)!
    expect(c.name).toBe('New Name')
    expect(c.hourlyRate).toBe(95)
    expect(c.noTax).toBe(true)
    expect(c.vatId).toBe('DE9')
    expect(c.notionId).toBe('keep-me')
  })

  it('updateClient persists structured address fields and notes', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const id = createClient(db, {
      notionId: null,
      contactPerson: '',
      addressExtra: '',
      name: 'Acme',
      address: '',
      street: '',
      zip: '',
      city: '',
      country: '',
      email: '',
      hourlyRate: 80,
      noTax: false,
      vatId: null,
      notes: ''
    })
    updateClient(db, id, {
      notionId: null,
      contactPerson: '',
      addressExtra: '',
      name: 'Acme',
      address: '',
      street: 'Hauptstraße 1',
      zip: '10115',
      city: 'Berlin',
      country: 'Deutschland',
      email: '',
      hourlyRate: 80,
      noTax: false,
      vatId: null,
      notes: 'VIP client'
    })
    const c = getClientById(db, id)!
    expect(c.street).toBe('Hauptstraße 1')
    expect(c.zip).toBe('10115')
    expect(c.city).toBe('Berlin')
    expect(c.country).toBe('Deutschland')
    expect(c.notes).toBe('VIP client')
  })

  it('upsert with empty structured fields does not clear previously-set ones (COALESCE)', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    // First import establishes structured fields (e.g. user edited them).
    upsertClientByNotionId(db, {
      notionId: 'n9',
      contactPerson: '',
      addressExtra: '',
      name: 'Acme',
      address: 'A',
      street: 'Hauptstraße 1',
      zip: '10115',
      city: 'Berlin',
      country: 'Deutschland',
      email: '',
      hourlyRate: 80,
      noTax: false,
      vatId: null,
      notes: 'keep me'
    })
    // A Notion re-import carries empty structured fields — must NOT wipe them.
    upsertClientByNotionId(db, {
      notionId: 'n9',
      contactPerson: '',
      addressExtra: '',
      name: 'Acme GmbH',
      address: 'A2',
      street: '',
      zip: '',
      city: '',
      country: '',
      email: 'x@acme.de',
      hourlyRate: 90,
      noTax: true,
      vatId: 'DE1',
      notes: ''
    })
    const c = listClients(db).find((x) => x.notionId === 'n9')!
    // Plain fields overwritten as before.
    expect(c.name).toBe('Acme GmbH')
    expect(c.hourlyRate).toBe(90)
    // Structured fields + notes preserved.
    expect(c.street).toBe('Hauptstraße 1')
    expect(c.zip).toBe('10115')
    expect(c.city).toBe('Berlin')
    expect(c.country).toBe('Deutschland')
    expect(c.notes).toBe('keep me')
  })

  it('round-trips Ansprechpartner and Zusatz through create, read and update', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const base = {
      notionId: null,
      name: 'Sparkassenverband e.V.',
      contactPerson: 'Anna Wolter',
      addressExtra: 'Kostenträger 102070',
      address: '',
      street: 'Charlottenstraße 47',
      zip: '10117',
      city: 'Berlin',
      country: 'Deutschland',
      email: '',
      hourlyRate: 85,
      noTax: false,
      vatId: null,
      notes: ''
    }
    const id = createClient(db, base)
    expect(getClientById(db, id)).toMatchObject({
      contactPerson: 'Anna Wolter',
      addressExtra: 'Kostenträger 102070'
    })

    updateClient(db, id, { ...base, contactPerson: 'Marène Gernandt', addressExtra: '' })
    expect(getClientById(db, id)).toMatchObject({
      contactPerson: 'Marène Gernandt',
      addressExtra: ''
    })
  })

  it('round-trips international defaults', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const id = createClient(db, {
      notionId: null,
      name: 'Acme Inc.',
      contactPerson: '',
      addressExtra: '',
      address: '',
      street: '1 Main St',
      zip: '10001',
      city: 'New York',
      country: 'USA',
      countryCode: 'US',
      currency: 'USD',
      language: 'en',
      taxMode: 'reverse_charge',
      email: '',
      hourlyRate: 100,
      noTax: false,
      vatId: null,
      notes: ''
    })
    const client = getClientById(db, id)!
    expect(client.countryCode).toBe('US')
    expect(client.currency).toBe('USD')
    expect(client.language).toBe('en')
    expect(client.taxMode).toBe('reverse_charge')
    expect(client.noTax).toBe(false)
  })
})
