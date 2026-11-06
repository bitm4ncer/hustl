import { ZipArchive } from 'archiver'
import { createHash } from 'node:crypto'
import { createReadStream, readdirSync, statSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { buildCsvFiles } from './csv'

const AUTH_TABLES = [
  'auth_credentials',
  'auth_challenges',
  'auth_sessions',
  'auth_recovery',
  'auth_bootstrap',
]

const SKIP_DIRS = new Set(['backups', 'exports'])
const SKIP_FILES = new Set(['bootstrap-token.txt'])

let busy = false

function walk(root: string, current = root): string[] {
  const entries = readdirSync(current, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const absolute = path.join(current, entry.name)
    if (entry.isDirectory()) {
      if (current === root && SKIP_DIRS.has(entry.name)) continue
      files.push(...walk(root, absolute))
    } else if (entry.isFile()) {
      if (current === root && SKIP_FILES.has(entry.name)) continue
      if (/\.(db|db-wal|db-shm)$/.test(entry.name)) continue
      files.push(absolute)
    }
  }
  return files
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

/** Hasht eine Datei als Stream — kein Vollpuffer bei großen Archiven. */
async function hashFile(absolute: string): Promise<string> {
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(absolute)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve())
  })
  return hash.digest('hex')
}

function countOf(db: DatabaseSync, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }
  return row.c
}

export interface ArchiveResult {
  stream: NodeJS.ReadableStream
  filename: string
}

/**
 * Baut das Vollarchiv als Streaming-ZIP. Wirft `CONFLICT`, wenn bereits eines
 * erzeugt wird. Die temporäre DB-Kopie wird nach dem Stream gelöscht.
 */
export async function buildFullArchive(args: {
  db: DatabaseSync
  dataDir: string
  now?: Date
}): Promise<ArchiveResult> {
  if (busy) {
    const error = new Error('Archive already running')
    ;(error as Error & { code?: string }).code = 'CONFLICT'
    throw error
  }
  busy = true

  const now = args.now ?? new Date()
  const stamp = now.toISOString().slice(0, 10)
  const snapshot = path.join(os.tmpdir(), `hustl-export-${Date.now()}.db`)

  try {
    args.db.exec(`VACUUM INTO '${snapshot.replace(/'/g, "''")}'`)
    const copy = new DatabaseSync(snapshot)
    for (const table of AUTH_TABLES) copy.exec(`DROP TABLE IF EXISTS ${table}`)
    copy.exec('VACUUM')

    const counts = {
      clients: countOf(copy, 'clients'),
      projects: countOf(copy, 'projects'),
      invoices: countOf(copy, 'invoices'),
      offers: countOf(copy, 'offers'),
      expenses: countOf(copy, 'expenses'),
    }
    const csvFiles = buildCsvFiles(copy)
    copy.close()

    const databaseBytes = await fs.readFile(snapshot)
    const files = walk(args.dataDir).map((absolute) => ({
      absolute,
      relative: path.relative(args.dataDir, absolute).split(path.sep).join('/'),
    }))

    const entries: Array<{ name: string; absolute: string; sha256: string; bytes: number }> = []
    for (const file of files) {
      entries.push({
        name: `data/${file.relative}`,
        absolute: file.absolute,
        sha256: await hashFile(file.absolute),
        bytes: statSync(file.absolute).size,
      })
    }

    const manifest = {
      format: 1,
      createdAt: now.toISOString(),
      appVersion: process.env.HUSTL_VERSION ?? '1.0.0',
      database: {
        file: 'data/hustl.db',
        sha256: sha256(databaseBytes),
        bytes: databaseBytes.length,
      },
      counts,
      files: entries.map((entry) => ({
        path: entry.name,
        sha256: entry.sha256,
        bytes: entry.bytes,
      })),
    }

    const archive = new ZipArchive({ zlib: { level: 6 } })

    // Genau einmal aufräumen — auch wenn der Client den Download abbricht und
    // archiver nie 'end' emittiert. Sonst bleibt `busy` für immer true.
    let released = false
    const release = (): void => {
      if (released) return
      released = true
      busy = false
      void fs.unlink(snapshot).catch(() => undefined)
    }
    archive.on('end', release)
    archive.on('close', release)
    archive.on('error', release)

    archive.append(readme(now), { name: 'README.txt' })
    archive.append(databaseBytes, { name: 'data/hustl.db' })
    // Dateien als Stream anhängen: konstanter Speicherbedarf statt Vollpuffer.
    for (const entry of entries) archive.file(entry.absolute, { name: entry.name })
    for (const [name, content] of Object.entries(csvFiles)) archive.append(content, { name })
    // Manifest zuletzt: es beschreibt genau den Inhalt dieses Streams.
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' })
    void archive.finalize()

    return { stream: archive, filename: `hustl-export-${stamp}.zip` }
  } catch (error) {
    busy = false
    await fs.unlink(snapshot).catch(() => undefined)
    throw error
  }
}

function readme(now: Date): string {
  return [
    'Hustl — Datenexport',
    '',
    `Erstellt: ${now.toISOString()}`,
    '',
    'Inhalt:',
    '  data/hustl.db      konsistenter SQLite-Snapshot (ohne Anmeldedaten)',
    '  data/…             alle PDFs, Belege, Kontoauszüge und Vorlagen-Dateien',
    '  csv/…              lesbare Tabellenexporte (Semikolon, UTF-8)',
    '  manifest.json      SHA-256 und Bytezahl jeder Datei',
    '',
    'Prüfen:',
    '  sha256sum data/hustl.db  mit manifest.database.sha256 vergleichen.',
    '',
    'Wiederherstellen:',
    '  restore.sh prüft Integrität und Manifest, bevor es /data ersetzt.',
    '',
  ].join('\n')
}
