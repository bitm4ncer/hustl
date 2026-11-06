import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { applyMigrations } from '../../../src/core/db/migrations'
import { getSettings, saveSettings } from '../../../src/core/db/settings'

describe('saveSettings merge', () => {
  it('keeps previously stored keys not present in a partial save', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const full = { ...getSettings(db), name: 'A', emailBodyTemplate: 'KEEP' }
    saveSettings(db, full)
    // a later save that omits emailBodyTemplate must not wipe it
    const { emailBodyTemplate: _omit, ...without } = full
    saveSettings(db, without)
    expect(getSettings(db).emailBodyTemplate).toBe('KEEP')
    expect(getSettings(db).name).toBe('A')
  })
})
