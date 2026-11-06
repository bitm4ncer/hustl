import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { applyMigrations } from './migrations'

let db: DatabaseSync | null = null

/**
 * Öffnet (oder liefert) die Datenbank unter `<dataDir>/hustl.db`.
 *
 * Der Pfad kommt vom Aufrufer — Electron reicht `app.getPath('userData')` herein,
 * der Server `HUSTL_DATA_DIR`. `src/core` kennt damit kein electron.
 */
export function initDatabase(dataDir: string): DatabaseSync {
  if (db) return db
  mkdirSync(dataDir, { recursive: true })
  const file = path.join(dataDir, 'hustl.db')
  db = new DatabaseSync(file)
  applyMigrations(db)
  return db
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error('Database not initialised — call initDatabase(dataDir) first')
  return db
}

export function closeDatabase(): void {
  db?.close()
  db = null
}
