import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { applyMigrations } from '../../../src/core/db/migrations'
import { createClient, getClientById, listClients } from '../../../src/core/db/clients'
import { createOffer, getOffer, setOfferStatus, type OfferInput } from '../../../src/core/db/offers'
import { getProjectById, listProjects } from '../../../src/core/db/projects'
import { ensureOfferClient, convertOfferToProject } from '../../../src/core/db/offer-convert'

function db(): DatabaseSync {
  const d = new DatabaseSync(':memory:')
  applyMigrations(d)
  return d
}

function baseInput(over: Partial<OfferInput> = {}): OfferInput {
  return {
    kind: 'angebot',
    clientId: null,
    prospect: {
      name: 'Interessent GmbH', contactPerson: 'Anna Wolter', addressExtra: 'Kostenträger 102070',
      email: 'hallo@interessent.de', street: 'Weg 1',
      zip: '10115', city: 'Berlin', country: 'Deutschland', vatId: 'DE123456789',
    },
    title: 'Website-Relaunch',
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
      item({ title: 'Konzept', fixPrice: 1000, internalHours: 8 }),
      item({ title: 'Umsetzung', quantity: 20, unit: 'Std', unitPrice: 100, internalHours: 20 }),
    ],
    ...over,
  }
}

function item(over: Partial<OfferInput['items'][number]> = {}): OfferInput['items'][number] {
  return {
    section: '', title: 'Posten', description: '', quantity: null, unit: 'Psch',
    unitPrice: null, fixPrice: 0, optional: false, recurring: false,
    catalogItemId: null, internalHours: null,
    ...over,
  }
}

describe('ensureOfferClient', () => {
  it('creates a client from the prospect block and links it to the offer', () => {
    const d = db()
    const offerId = createOffer(d, baseInput())

    const { clientId, created } = ensureOfferClient(d, offerId)

    expect(created).toBe(true)
    const client = getClientById(d, clientId)
    expect(client).toMatchObject({
      name: 'Interessent GmbH',
      contactPerson: 'Anna Wolter',
      addressExtra: 'Kostenträger 102070',
      email: 'hallo@interessent.de',
      street: 'Weg 1',
      zip: '10115',
      city: 'Berlin',
      country: 'Deutschland',
      vatId: 'DE123456789',
      hourlyRate: 90,
      noTax: false,
    })
    // The legacy address blob is the structured lines without the name, since
    // the PDF template renders the name separately above the address.
    expect(client?.address).toBe('Weg 1\n10115 Berlin\nDeutschland')
    expect(getOffer(d, offerId)?.clientId).toBe(clientId)
  })

  it('maps reverse-charge offers to a reverse-charge client', () => {
    const d = db()
    const offerId = createOffer(d, baseInput({ taxMode: 'reverse_charge' }))
    const client = getClientById(d, ensureOfferClient(d, offerId).clientId)
    expect(client?.taxMode).toBe('reverse_charge')
    expect(client?.noTax).toBe(false)
  })

  it('returns the existing client without creating a duplicate', () => {
    const d = db()
    const existing = createClient(d, {
      notionId: null, name: 'Bestandskunde', contactPerson: '', addressExtra: '', address: '', street: '', zip: '', city: '',
      country: '', email: '', hourlyRate: 120, noTax: false, vatId: null, notes: '',
    })
    const offerId = createOffer(d, baseInput({ clientId: existing }))

    expect(ensureOfferClient(d, offerId)).toEqual({ clientId: existing, created: false })
    expect(listClients(d)).toHaveLength(1)
  })

  it('is idempotent: a second call reuses the client it just created', () => {
    const d = db()
    const offerId = createOffer(d, baseInput())

    const first = ensureOfferClient(d, offerId)
    const second = ensureOfferClient(d, offerId)

    expect(second).toEqual({ clientId: first.clientId, created: false })
    expect(listClients(d)).toHaveLength(1)
  })

  it('refuses to create a nameless client', () => {
    const d = db()
    const offerId = createOffer(d, baseInput({
      prospect: { name: '  ', contactPerson: '', addressExtra: '', email: '', street: '', zip: '', city: '', country: '', vatId: '' },
    }))

    expect(() => ensureOfferClient(d, offerId)).toThrow(/Empfänger/)
    expect(listClients(d)).toHaveLength(0)
  })

  it('throws for an unknown offer', () => {
    expect(() => ensureOfferClient(db(), 999)).toThrow(/999/)
  })
})

describe('convertOfferToProject', () => {
  it('creates a Forthcoming project carrying the offer title, timeframe and items', () => {
    const d = db()
    const offerId = createOffer(d, baseInput())

    const { projectId, created } = convertOfferToProject(d, offerId)

    expect(created).toBe(true)
    const project = getProjectById(d, projectId)
    expect(project).toMatchObject({
      title: 'Website-Relaunch',
      status: 'Forthcoming',
      timeframeStart: '2026-07-01',
      timeframeEnd: '2026-08-31',
      hours: 28,
    })
    expect(project?.note).toBe('Aus Angebot vom 15.06.2026')
    expect(project?.items.map((i) => i.title)).toEqual(['Konzept', 'Umsetzung'])
    expect(project?.items.map((i) => i.hours)).toEqual([8, 20])
  })

  it('bills only the binding one-off items, net of discount', () => {
    const d = db()
    // 1000 + 2000 binding, 500 optional, 99 recurring, minus 10 % discount.
    const offerId = createOffer(d, baseInput({
      discountKind: 'percent',
      discountValue: 10,
      items: [
        item({ title: 'Konzept', fixPrice: 1000 }),
        item({ title: 'Umsetzung', fixPrice: 2000 }),
        item({ title: 'Schulung', fixPrice: 500, optional: true }),
        item({ title: 'Hosting', fixPrice: 99, recurring: true }),
      ],
    }))

    const { projectId } = convertOfferToProject(d, offerId)

    const project = getProjectById(d, projectId)
    expect(project?.fixPrice).toBe(2700)
    expect(project?.items.map((i) => i.title)).toEqual(['Konzept', 'Umsetzung'])
  })

  it('leaves hours null when no item carries internal hours', () => {
    const d = db()
    const offerId = createOffer(d, baseInput({ items: [item({ title: 'Psch', fixPrice: 500 })] }))
    expect(getProjectById(d, convertOfferToProject(d, offerId).projectId)?.hours).toBeNull()
  })

  it('falls back to the offer number as project title', () => {
    const d = db()
    const offerId = createOffer(d, baseInput({ title: '' }))
    d.prepare("UPDATE offers SET number = 'ANG-2026-0007' WHERE id = ?").run(offerId)

    const project = getProjectById(d, convertOfferToProject(d, offerId).projectId)
    expect(project?.title).toBe('Angebot ANG-2026-0007')
    expect(project?.note).toBe('Aus Angebot ANG-2026-0007 vom 15.06.2026')
  })

  it('creates the client on the way when the offer is still a prospect', () => {
    const d = db()
    const offerId = createOffer(d, baseInput())

    const { projectId } = convertOfferToProject(d, offerId)

    const clients = listClients(d)
    expect(clients).toHaveLength(1)
    expect(getProjectById(d, projectId)?.clientId).toBe(clients[0].id)
    expect(getOffer(d, offerId)?.clientId).toBe(clients[0].id)
  })

  it('links the project and marks the offer accepted', () => {
    const d = db()
    const offerId = createOffer(d, baseInput())

    const { projectId } = convertOfferToProject(d, offerId)

    const offer = getOffer(d, offerId)
    expect(offer?.convertedProjectId).toBe(projectId)
    expect(offer?.status).toBe('accepted')
    expect(offer?.acceptedAt).not.toBeNull()
  })

  it('does not drag an already invoiced offer back to accepted', () => {
    const d = db()
    const offerId = createOffer(d, baseInput())
    setOfferStatus(d, offerId, 'invoiced')

    convertOfferToProject(d, offerId)

    expect(getOffer(d, offerId)?.status).toBe('invoiced')
  })

  it('is idempotent: a second call returns the same project', () => {
    const d = db()
    const offerId = createOffer(d, baseInput())

    const first = convertOfferToProject(d, offerId)
    const second = convertOfferToProject(d, offerId)

    expect(second.projectId).toBe(first.projectId)
    expect(second.created).toBe(false)
    expect(listProjects(d)).toHaveLength(1)
  })

  it('converts again when the linked project was deleted meanwhile', () => {
    const d = db()
    const offerId = createOffer(d, baseInput())
    const first = convertOfferToProject(d, offerId)
    d.prepare('DELETE FROM projects WHERE id = ?').run(first.projectId)

    const second = convertOfferToProject(d, offerId)

    expect(second.created).toBe(true)
    expect(second.projectId).not.toBe(first.projectId)
    expect(getOffer(d, offerId)?.convertedProjectId).toBe(second.projectId)
  })

  it('rolls back the client when the offer has nothing to bill', () => {
    const d = db()
    const offerId = createOffer(d, baseInput({ items: [] }))

    expect(() => convertOfferToProject(d, offerId)).toThrow(/Position/)
    expect(listClients(d)).toHaveLength(0)
    expect(listProjects(d)).toHaveLength(0)
  })
})
