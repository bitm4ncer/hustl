import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { applyMigrations } from '../../../src/core/db/migrations'
import { getNumberSequence, setNumberSequence } from '../../../src/core/db/number-sequence'

describe('number-sequence', () => {
  it('reads back a seeded sequence', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    setNumberSequence(db, 2026, 42)
    expect(getNumberSequence(db, 2026)).toEqual({ year: 2026, lastNumber: 42 })
  })

  it('updates rather than duplicates on the same year', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    setNumberSequence(db, 2026, 42)
    setNumberSequence(db, 2026, 100)
    expect(getNumberSequence(db, 2026)).toEqual({ year: 2026, lastNumber: 100 })
    const count = db
      .prepare('SELECT COUNT(*) AS n FROM number_sequence WHERE year = ?')
      .get(2026) as { n: number }
    expect(count.n).toBe(1)
  })

  it('returns null for an unseeded year', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    expect(getNumberSequence(db, 2025)).toBeNull()
  })

  it('weigert sich, unter eine bereits vergebene Nummer zu gehen', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    db.exec('PRAGMA foreign_keys = OFF')
    db.prepare(
      "INSERT INTO invoices (number, client_id, date, status) VALUES ('2026007', 1, '2026-01-01', 'finalized')",
    ).run()
    expect(() => setNumberSequence(db, 2026, 3)).toThrow(/kleiner geht nicht/)
  })

  it('protokolliert Aenderungen im Audit-Log', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    setNumberSequence(db, 2026, 10)
    setNumberSequence(db, 2026, 20)
    const rows = db
      .prepare("SELECT payload FROM audit_log WHERE action = 'numberSequence' ORDER BY id")
      .all() as Array<{ payload: string }>
    expect(rows.length).toBe(2)
    expect(JSON.parse(rows[1].payload)).toEqual({ year: 2026, from: 10, to: 20 })
  })
})
