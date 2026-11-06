import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { applyMigrations } from '../../../src/core/db/migrations'
import { getInvoiceTemplate, saveInvoiceTemplate } from '../../../src/core/db/invoice-template'
import { DEFAULT_TEMPLATE } from '../../../src/shared/template-defaults'

describe('invoice-template db', () => {
  it('returns defaults when empty', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    expect(getInvoiceTemplate(db).accentColor).toBe(DEFAULT_TEMPLATE.accentColor)
  })
  it('round-trips and merges missing keys onto defaults', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    saveInvoiceTemplate(db, { ...DEFAULT_TEMPLATE, accentColor: '#000000', introText: 'Hallo' })
    expect(getInvoiceTemplate(db).accentColor).toBe('#000000')
    expect(getInvoiceTemplate(db).introText).toBe('Hallo')
    expect(getInvoiceTemplate(db).fontFamily).toBe('Inter') // default preserved
  })
})
