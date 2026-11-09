import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import type JSZip from 'jszip'

export interface RestoreManifest {
  format: 1
  database: { file: string; sha256: string; bytes: number }
  files: Array<{ path: string; sha256: string; bytes: number }>
}

const STAGING = '.restore-staging'
const MARKER = 'restore.pending'
const BACKUP_PREFIX = '.before-restore-'

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

function assertSafe(name: string): void {
  const parts = name.split('/')
  if (
    name.startsWith('/') ||
    name.startsWith('\\') ||
    name.includes('\\') ||
    /^[a-zA-Z]:/.test(name) ||
    parts.includes('..')
  ) {
    throw new Error(`Ungültiger Pfad im Archiv: ${name}`)
  }
  if (
    parts.some(
      (part) => part === MARKER || part === STAGING || part.startsWith(BACKUP_PREFIX)
    )
  ) {
    throw new Error(`Reservierter Pfad im Archiv: ${name}`)
  }
}

export async function validateArchive(
  zip: JSZip
): Promise<{ entries: Map<string, Buffer> }> {
  const manifestEntry = zip.file('manifest.json')
  if (!manifestEntry) throw new Error('manifest.json fehlt im Archiv')

  let manifest: RestoreManifest
  try {
    manifest = JSON.parse(await manifestEntry.async('string')) as RestoreManifest
  } catch {
    throw new Error('manifest.json ist kein gültiges JSON')
  }
  if (manifest.format !== 1) throw new Error('Unbekanntes Archivformat')
  if (!manifest.database || manifest.database.file !== 'data/hustl.db') {
    throw new Error('Datenbankeintrag fehlt oder ist ungültig')
  }

  const entries = new Map<string, Buffer>()
  for (const file of Object.values(zip.files)) {
    if (file.dir) continue
    if (file.name === 'manifest.json' || file.name === 'README.txt') continue
    if (file.name.startsWith('csv/')) continue
    assertSafe(file.name)
    if (!file.name.startsWith('data/')) {
      throw new Error(`Ungültiger Pfad im Archiv: ${file.name}`)
    }
    entries.set(file.name, await file.async('nodebuffer'))
  }

  const database = entries.get(manifest.database.file)
  if (!database) throw new Error('Datenbank fehlt im Archiv')
  if (sha256(database) !== manifest.database.sha256 || database.length !== manifest.database.bytes) {
    throw new Error('Prüfsumme der Datenbank stimmt nicht')
  }

  const listed = new Set(manifest.files.map((file) => file.path))
  for (const file of manifest.files) {
    assertSafe(file.path)
    const buffer = entries.get(file.path)
    if (!buffer) throw new Error(`Datei fehlt im Archiv: ${file.path}`)
    if (sha256(buffer) !== file.sha256 || buffer.length !== file.bytes) {
      throw new Error(`Prüfsumme stimmt nicht: ${file.path}`)
    }
  }

  for (const name of entries.keys()) {
    if (name === manifest.database.file) continue
    if (!listed.has(name)) throw new Error(`Datei nicht im Manifest: ${name}`)
  }

  return { entries }
}

export async function stageRestore(
  dataDir: string,
  entries: Map<string, Buffer>
): Promise<void> {
  mkdirSync(dataDir, { recursive: true })
  const staging = join(dataDir, STAGING)
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })

  for (const [name, buffer] of entries) {
    assertSafe(name)
    if (!name.startsWith('data/')) continue
    const relative = name.slice('data/'.length)
    const target = resolve(staging, relative)
    if (target !== staging && !target.startsWith(staging + sep)) {
      throw new Error(`Ungültiger Pfad im Archiv: ${name}`)
    }
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, buffer)
  }

  writeFileSync(join(dataDir, MARKER), '1', { mode: 0o600 })
}

function pruneBackups(dataDir: string): void {
  const backups = readdirSync(dataDir)
    .filter((name) => name.startsWith(BACKUP_PREFIX))
    .sort()
  for (const old of backups.slice(0, Math.max(0, backups.length - 3))) {
    rmSync(join(dataDir, old), { recursive: true, force: true })
  }
}

/**
 * Tauscht den Inhalt von dataDir gegen das vorbereitete Staging. Der Ordner
 * selbst bleibt stehen, weil Chromium im Standalone-Betrieb Dateien im
 * userData hält und ein Rename des Wurzelordners scheitern würde.
 */
export function applyPendingRestore(dataDir: string): void {
  const marker = join(dataDir, MARKER)
  if (!existsSync(marker)) return

  const staging = join(dataDir, STAGING)
  if (!existsSync(staging)) {
    rmSync(marker, { force: true })
    return
  }

  const backup = join(dataDir, `${BACKUP_PREFIX}${Date.now()}`)
  mkdirSync(backup, { recursive: true })
  const moved: string[] = []

  try {
    for (const entry of readdirSync(dataDir)) {
      if (entry === MARKER || entry === STAGING || entry.startsWith(BACKUP_PREFIX)) continue
      renameSync(join(dataDir, entry), join(backup, entry))
      moved.push(entry)
    }
    for (const entry of readdirSync(staging)) {
      renameSync(join(staging, entry), join(dataDir, entry))
    }
    rmSync(marker, { force: true })
    rmSync(staging, { recursive: true, force: true })
    pruneBackups(dataDir)
  } catch (error) {
    // Best effort: die alten Einträge zurückholen, neue zur Seite legen.
    for (const entry of moved) {
      const target = join(dataDir, entry)
      if (existsSync(target)) renameSync(target, join(staging, entry))
      renameSync(join(backup, entry), target)
    }
    throw error
  }
}
