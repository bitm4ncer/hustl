import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { applyMigrations } from '../../../src/core/db/migrations'
import { splitDescriptionToItems } from '../../../src/core/db/project-item-split'
import {
  createProject,
  getProjectById,
  listProjects,
  updateProject,
  deleteProject,
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

describe('splitDescriptionToItems', () => {
  it('splits bullet lines into one item each', () => {
    const items = splitDescriptionToItems('- Erste Leistung\n- Zweite Leistung\n- Dritte')
    expect(items).toEqual(['Erste Leistung', 'Zweite Leistung', 'Dritte'])
  })

  it('appends continuation lines to the previous bullet', () => {
    const items = splitDescriptionToItems('- Konzeption und Planung\nder Grundstruktur\n- Umsetzung')
    expect(items).toEqual(['Konzeption und Planung der Grundstruktur', 'Umsetzung'])
  })

  it('supports en-dash and dot bullets and skips blank lines', () => {
    const items = splitDescriptionToItems('– Eins\n\n• Zwei\n* Drei')
    expect(items).toEqual(['Eins', 'Zwei', 'Drei'])
  })

  it('returns the whole text as one item when there are no bullets', () => {
    expect(splitDescriptionToItems('Nur ein Fließtext\nüber zwei Zeilen')).toEqual([
      'Nur ein Fließtext über zwei Zeilen'
    ])
  })

  it('returns [] for empty/whitespace text', () => {
    expect(splitDescriptionToItems('')).toEqual([])
    expect(splitDescriptionToItems('  \n \n')).toEqual([])
  })
})

describe('project_items migration backfill', () => {
  it('converts existing descriptions into positions once', () => {
    const db = new DatabaseSync(':memory:')
    // Simulate a pre-migration DB: run migrations, drop the new table, seed a
    // legacy project, then re-run migrations to trigger the backfill.
    applyMigrations(db)
    db.exec('DROP TABLE project_items')
    db.prepare("INSERT INTO projects (title, description) VALUES ('Legacy', '- Eins\n- Zwei')").run()
    applyMigrations(db)
    const p = listProjects(db).find((x) => x.title === 'Legacy')!
    expect(p.items.map((it) => it.description)).toEqual(['Eins', 'Zwei'])
    expect(p.items.every((it) => it.title === '' && it.hours === null)).toBe(true)
    // Re-running migrations must not duplicate the backfill.
    applyMigrations(db)
    expect(getProjectById(db, p.id)!.items).toHaveLength(2)
  })
})

describe('project items round-trip', () => {
  it('create + get returns ordered items', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const id = createProject(
      db,
      baseInput({
        items: [
          { title: 'Setup', description: 'Staging + CMS', hours: 2 },
          { title: 'Webdesign', description: '', hours: null }
        ]
      })
    )
    const p = getProjectById(db, id)!
    expect(p.items).toHaveLength(2)
    expect(p.items[0]).toMatchObject({ title: 'Setup', description: 'Staging + CMS', hours: 2, position: 0 })
    expect(p.items[1]).toMatchObject({ title: 'Webdesign', hours: null, position: 1 })
  })

  it('update replaces the item list', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const id = createProject(db, baseInput({ items: [{ title: 'Alt', description: '', hours: null }] }))
    updateProject(db, id, baseInput({ items: [
      { title: 'Neu A', description: '', hours: 1 },
      { title: 'Neu B', description: '', hours: null }
    ] }))
    const p = getProjectById(db, id)!
    expect(p.items.map((it) => it.title)).toEqual(['Neu A', 'Neu B'])
  })

  it('deleting a project cascades to its items', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const id = createProject(db, baseInput({ items: [{ title: 'X', description: '', hours: null }] }))
    deleteProject(db, id)
    const left = db.prepare('SELECT COUNT(*) AS n FROM project_items').get() as { n: number }
    expect(left.n).toBe(0)
  })
})
