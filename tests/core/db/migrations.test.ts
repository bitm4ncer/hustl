import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { applyMigrations } from '../../../src/core/db/migrations'

describe('finance migrations', () => {
  it('creates expenses and fixed_costs tables and adds invoices.paid_at', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((r) => r.name)
    expect(tables).toContain('expenses')
    expect(tables).toContain('fixed_costs')
    const invCols = (db.prepare('PRAGMA table_info(invoices)').all() as Array<{ name: string }>).map((c) => c.name)
    expect(invCols).toContain('paid_at')
  })

  it('is idempotent (re-running applyMigrations does not throw)', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    expect(() => applyMigrations(db)).not.toThrow()
  })
})

describe('Angebots-Einleitungstext', () => {
  it('strips the leading thank-you sentence from stored settings', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    db.prepare('INSERT INTO settings (id, data) VALUES (1, ?)').run(
      JSON.stringify({
        offerIntroText: 'vielen Dank für Ihre Anfrage. Gerne unterbreite ich Ihnen folgendes Angebot:',
      }),
    )

    applyMigrations(db)

    const row = db.prepare('SELECT data FROM settings WHERE id = 1').get() as { data: string }
    expect(JSON.parse(row.data).offerIntroText).toBe('Gerne unterbreite ich Ihnen folgendes Angebot:')
  })

  it('leaves a hand-written intro untouched', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const own = 'Hi Ben, hier wie besprochen:'
    db.prepare('INSERT INTO settings (id, data) VALUES (1, ?)').run(
      JSON.stringify({ offerIntroText: own }),
    )

    applyMigrations(db)

    const row = db.prepare('SELECT data FROM settings WHERE id = 1').get() as { data: string }
    expect(JSON.parse(row.data).offerIntroText).toBe(own)
  })
})

describe('migrations', () => {
  it('creates all tables', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name)
    for (const t of [
      'clients',
      'invoices',
      'invoice_items',
      'settings',
      'number_sequence',
      'audit_log',
      'projects'
    ]) {
      expect(names).toContain(t)
    }
  })
  it('is idempotent', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    applyMigrations(db) // second run must not throw
    expect(true).toBe(true)
  })
  it('adds structured address + notes columns idempotently', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    applyMigrations(db) // second run must not throw on the ALTER TABLE additions
    const cols = (db.prepare('PRAGMA table_info(clients)').all() as Array<{ name: string }>).map(
      (c) => c.name
    )
    for (const col of ['street', 'zip', 'city', 'country', 'notes']) {
      expect(cols).toContain(col)
    }
  })
  it('adds the invoice_items.project_id column idempotently', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    applyMigrations(db) // second run must not throw on the ALTER TABLE addition
    const cols = (
      db.prepare('PRAGMA table_info(invoice_items)').all() as Array<{ name: string }>
    ).map((c) => c.name)
    expect(cols).toContain('project_id')
  })

  it('creates bank_connection and bank_transactions tables', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name)
    expect(names).toContain('bank_connection')
    expect(names).toContain('bank_transactions')
    expect(names).toContain('bank_statements')
  })

  it('bank tables survive idempotent re-run', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    expect(() => applyMigrations(db)).not.toThrow()
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name)
    expect(names).toContain('bank_connection')
    expect(names).toContain('bank_transactions')
  })
})
