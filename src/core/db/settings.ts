import type { DatabaseSync } from 'node:sqlite'
import type { CompanySettings } from '@shared/types'
import { DEFAULT_SETTINGS } from './seed'

export function getSettings(db: DatabaseSync): CompanySettings {
  const row = db.prepare('SELECT data FROM settings WHERE id = 1').get() as
    | { data: string }
    | undefined
  return row ? { ...DEFAULT_SETTINGS, ...JSON.parse(row.data) } : DEFAULT_SETTINGS
}

export function saveSettings(db: DatabaseSync, s: Partial<CompanySettings>): void {
  // Merge onto the stored settings instead of replacing — so a partial save (or a
  // stale renderer state missing newly-added keys) can't wipe other sections.
  const merged = { ...getSettings(db), ...s }
  db.prepare(
    'INSERT INTO settings (id, data) VALUES (1, @data) ON CONFLICT(id) DO UPDATE SET data = @data'
  ).run({ data: JSON.stringify(merged) })
}
