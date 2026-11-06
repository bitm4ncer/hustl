import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { applyMigrations } from '../../../src/core/db/migrations'
import { createClient } from '../../../src/core/db/clients'
import {
  createProject,
  getProjectById,
  listProjects,
  listOpenProjectsForClient,
  updateProject,
  setProjectStatus,
  deleteProject,
  upsertProjectByNotionId,
  type ProjectInput
} from '../../../src/core/db/projects'

function baseInput(over: Partial<ProjectInput> = {}): ProjectInput {
  return {
    notionId: null,
    clientId: null,
    title: 'Project',
    description: '',
    status: 'Active',
    hours: null,
    fixPrice: null,
    timeframeStart: null,
    timeframeEnd: null,
    note: '',
    items: [],
    ...over
  }
}

function seedClient(db: DatabaseSync, hourlyRate = 80): number {
  return createClient(db, {
    notionId: null,
    contactPerson: '',
    addressExtra: '',
    name: 'C',
    address: '',
    street: '',
    zip: '',
    city: '',
    country: '',
    email: '',
    hourlyRate,
    noTax: false,
    vatId: null,
    notes: ''
  })
}

describe('projects', () => {
  it('create + get computes finalPrice from fixPrice', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const id = createProject(db, baseInput({ title: 'Fixed', fixPrice: 500, hours: 10 }))
    const p = getProjectById(db, id)!
    expect(p.title).toBe('Fixed')
    // fixPrice wins over hours×rate
    expect(p.finalPrice).toBe(500)
    expect(p.clientName).toBe('')
    expect(p.hourlyRate).toBe(0)
  })

  it('create + get computes finalPrice from hours × client hourlyRate', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const clientId = seedClient(db, 90)
    const id = createProject(db, baseInput({ clientId, hours: 4, fixPrice: null }))
    const p = getProjectById(db, id)!
    expect(p.clientName).toBe('C')
    expect(p.hourlyRate).toBe(90)
    expect(p.finalPrice).toBe(360)
  })

  it('computes finalPrice from the item hours when the hours field is empty', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const clientId = seedClient(db, 75)
    const id = createProject(db, baseInput({
      clientId,
      hours: null,
      fixPrice: null,
      items: [
        { title: 'Sticker Design', description: '4 Motive', hours: 6 },
        { title: 'Büdchentag Merch', description: 'Animation', hours: 5 },
      ],
    }))
    const p = getProjectById(db, id)!
    expect(p.hours).toBeNull() // das Feld bleibt leer, nur der Preis rechnet mit
    expect(p.finalPrice).toBe(825)
  })

  it('lets the hours field win over the item hours', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const clientId = seedClient(db, 75)
    const id = createProject(db, baseInput({
      clientId,
      hours: 8,
      fixPrice: null,
      items: [{ title: 'Sticker Design', description: '', hours: 6 }],
    }))
    expect(getProjectById(db, id)!.finalPrice).toBe(600)
  })

  it('finalPrice is 0 when no client, no fixPrice, hours set', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const id = createProject(db, baseInput({ hours: 5, fixPrice: null }))
    const p = getProjectById(db, id)!
    expect(p.hourlyRate).toBe(0)
    expect(p.finalPrice).toBe(0)
  })

  it('getProjectById returns null when missing', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    expect(getProjectById(db, 9999)).toBeNull()
  })

  it('listProjects returns all', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    createProject(db, baseInput({ title: 'A', timeframeStart: '2026-01-01' }))
    createProject(db, baseInput({ title: 'B', timeframeStart: '2026-03-01' }))
    const all = listProjects(db)
    expect(all).toHaveLength(2)
    // newest timeframe first
    expect(all[0].title).toBe('B')
  })

  it('listOpenProjectsForClient excludes Done/Archived', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const clientId = seedClient(db)
    createProject(db, baseInput({ clientId, title: 'Open', status: 'Active' }))
    createProject(db, baseInput({ clientId, title: 'Doing', status: 'On Hold' }))
    createProject(db, baseInput({ clientId, title: 'Done', status: 'Done' }))
    createProject(db, baseInput({ clientId, title: 'Gone', status: 'Archived' }))
    // a different client's open project must not appear
    const otherClient = seedClient(db)
    createProject(db, baseInput({ clientId: otherClient, title: 'Other', status: 'Active' }))

    const open = listOpenProjectsForClient(db, clientId)
    const titles = open.map((p) => p.title).sort()
    expect(titles).toEqual(['Doing', 'Open'])
  })

  it('setProjectStatus updates the status', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const id = createProject(db, baseInput({ status: 'Active' }))
    setProjectStatus(db, id, 'Archived')
    expect(getProjectById(db, id)!.status).toBe('Archived')
  })

  it('updateProject persists writable fields', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const clientId = seedClient(db, 100)
    const id = createProject(db, baseInput({ notionId: 'keep-me', title: 'Old' }))
    // ProjectInput carries notionId; updateProject must not pass it into the
    // UPDATE (which never references notion_id) or node:sqlite throws.
    expect(() =>
      updateProject(
        db,
        id,
        baseInput({
          notionId: 'keep-me',
          clientId,
          title: 'New',
          description: 'desc',
          status: 'On Hold',
          hours: 3,
          fixPrice: null,
          timeframeStart: '2026-02-02',
          timeframeEnd: '2026-03-03',
          note: 'a note'
        })
      )
    ).not.toThrow()
    const p = getProjectById(db, id)!
    expect(p.title).toBe('New')
    expect(p.description).toBe('desc')
    expect(p.status).toBe('On Hold')
    expect(p.clientId).toBe(clientId)
    expect(p.hours).toBe(3)
    expect(p.timeframeStart).toBe('2026-02-02')
    expect(p.timeframeEnd).toBe('2026-03-03')
    expect(p.note).toBe('a note')
    expect(p.finalPrice).toBe(300)
    expect(p.notionId).toBe('keep-me')
  })

  it('deleteProject removes the row', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const keep = createProject(db, baseInput({ title: 'Keep' }))
    const gone = createProject(db, baseInput({ title: 'Gone' }))
    deleteProject(db, gone)
    expect(getProjectById(db, gone)).toBeNull()
    expect(getProjectById(db, keep)!.title).toBe('Keep')
    expect(listProjects(db)).toHaveLength(1)
  })

  it('migration collapses legacy Ongoing/Wrap-up statuses into On Hold', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    // Insert raw rows carrying the retired statuses (bypassing the typed input).
    db.exec(
      "INSERT INTO projects (title, status) VALUES ('Legacy A', 'Ongoing'), ('Legacy B', 'Wrap-up'), ('Keep', 'Active')",
    )
    // Re-running migrations is idempotent and performs the status rewrite.
    applyMigrations(db)
    const byTitle = new Map(listProjects(db).map((p) => [p.title, p.status]))
    expect(byTitle.get('Legacy A')).toBe('On Hold')
    expect(byTitle.get('Legacy B')).toBe('On Hold')
    expect(byTitle.get('Keep')).toBe('Active')
  })

  it('upsertProjectByNotionId inserts then updates the same notion_id (no duplicate)', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    upsertProjectByNotionId(db, baseInput({ notionId: 'n1', title: 'First', status: 'Active' }))
    upsertProjectByNotionId(
      db,
      baseInput({ notionId: 'n1', title: 'Second', status: 'On Hold', hours: 2, fixPrice: 999 })
    )
    const all = listProjects(db)
    expect(all).toHaveLength(1)
    expect(all[0].title).toBe('Second')
    expect(all[0].status).toBe('On Hold')
    expect(all[0].finalPrice).toBe(999)
  })
})
