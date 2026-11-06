import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { applyMigrations } from '../../../src/core/db/migrations'
import { getSettings, saveSettings } from '../../../src/core/db/settings'
import { DEFAULT_SETTINGS } from '../../../src/core/db/seed'

describe('settings', () => {
  it('returns defaults when empty', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    expect(getSettings(db).vatId).toBe(DEFAULT_SETTINGS.vatId)
  })
  it('round-trips saved settings', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    saveSettings(db, { ...DEFAULT_SETTINGS, email: 'x@y.de' })
    expect(getSettings(db).email).toBe('x@y.de')
  })
  it('exposes international defaults and round-trips them', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    expect(getSettings(db).defaultTaxRate).toBe(0.19)
    expect(getSettings(db).documentLanguage).toBe('de')
    saveSettings(db, { defaultTaxRate: 0.2, documentLanguage: 'en', sellerCountryCode: 'US' })
    expect(getSettings(db)).toMatchObject({
      defaultTaxRate: 0.2,
      documentLanguage: 'en',
      sellerCountryCode: 'US',
    })
  })
})
