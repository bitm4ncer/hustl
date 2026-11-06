import path from 'node:path'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { applyMigrations } from '../../core/db/migrations'

export interface LegacyImportReport {
  invoices: number
  offers: number
  expenses: number
  statements: number
  filesCopied: number
  rewritten: number
  orphans: string[]
}

const DATA_DIRS = ['invoices', 'offers', 'expenses', 'statements', 'template']

async function copyDir(from: string, to: string): Promise<number> {
  if (!existsSync(from)) return 0
  let count = 0
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name)
    // macOS/iCloud liefert Dateinamen in NFD (u + kombinierendes Trema). Die DB
    // speichert NFC. Beim Import auf NFC normalisieren, sonst findet der
    // Pfad-Resolver die Datei später nicht wieder.
    const destination = path.join(to, entry.name.normalize('NFC'))
    if (entry.isDirectory()) {
      mkdirSync(destination, { recursive: true })
      count += await copyDir(source, destination)
    } else if (entry.isFile()) {
      mkdirSync(path.dirname(destination), { recursive: true })
      await fs.copyFile(source, destination)
      count += 1
    }
  }
  return count
}

/** Absolute Pfade in beiden Schreibweisen — auch unter Linux erkannt. */
export function isAbsoluteStored(stored: string): boolean {
  return /^(?:[a-zA-Z]:[\\/]|[\\/])/.test(stored)
}

/**
 * Übersetzt einen gespeicherten Pfad in einen relativen Pfad unterhalb des
 * Datenverzeichnisses. Präfix-Treffer müssen auf einer Pfadgrenze enden,
 * sonst würde `…\Hustl2` fälschlich als `…\Hustl` gelten.
 */
export function relativeFor(stored: string, oldRoot: string): string {
  const normalizedRoot = path.resolve(oldRoot)
  const normalized = path.resolve(stored)
  const relative = path.relative(normalizedRoot, normalized)
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join('/')
  }

  // Kein Präfix-Treffer (z. B. anderer Laufwerksbuchstabe oder Import unter
  // Linux): über den bekannten Ordneranteil eindeutig machen.
  const parts = stored.split(/[\\/]/)
  const index = parts.findIndex((part) => DATA_DIRS.includes(part))
  if (index === -1) throw new Error(`Pfad nicht zuordenbar: ${stored}`)
  const result = parts.slice(index).join('/')
  if (result.startsWith('..')) throw new Error(`Pfad nicht zuordenbar: ${stored}`)
  return result
}

function walkFiles(root: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name)
    if (entry.isDirectory()) out.push(...walkFiles(absolute))
    else if (entry.isFile()) out.push(absolute)
  }
  return out
}

/**
 * Importiert die lokale Electron-Datenbank samt Anhängen in ein neues
 * Datenverzeichnis und schreibt alle gespeicherten Pfade auf relativ um.
 * Baut zuerst in `<targetDir>.importing` und benennt erst nach erfolgreicher
 * Prüfung um — bei einem Fehler bleibt `targetDir` unberührt.
 */
export async function importLegacy(args: {
  dbFile: string
  sourceDir: string
  oldRoot: string
  targetDir: string
}): Promise<LegacyImportReport> {
  if (!args.dbFile || !args.sourceDir || !args.oldRoot) {
    throw new Error('--db, --from und --old-root sind erforderlich')
  }

  const staging = `${args.targetDir}.importing`
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })

  let db: DatabaseSync | null = null
  let source: DatabaseSync | null = null

  try {
    const dbTarget = path.join(staging, 'hustl.db')
    await fs.copyFile(args.dbFile, dbTarget)

    let filesCopied = 0
    for (const dir of DATA_DIRS) {
      mkdirSync(path.join(staging, dir), { recursive: true })
      filesCopied += await copyDir(path.join(args.sourceDir, dir), path.join(staging, dir))
    }

    db = new DatabaseSync(dbTarget)
    applyMigrations(db)

    const sourceDb = new DatabaseSync(args.dbFile)
    source = sourceDb
    const count = (table: string): number =>
      (sourceDb.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c
    const sum = (table: string, column: string): number =>
      (
        sourceDb.prepare(`SELECT COALESCE(SUM(${column}), 0) AS v FROM ${table}`).get() as {
          v: number
        }
      ).v

    let rewritten = 0
    const referenced = new Set<string>()
    const tables: Array<[string, string, string]> = [
      ['invoices', 'pdf_path', 'id'],
      ['offers', 'pdf_path', 'id'],
      ['expenses', 'pdf_path', 'id'],
      ['bank_statements', 'pdf_path', 'year_month'],
    ]

    for (const [table, column, key] of tables) {
      const rows = db
        .prepare(`SELECT ${key} AS rowKey, ${column} AS stored FROM ${table} WHERE ${column} IS NOT NULL`)
        .all() as Array<{ rowKey: number | string; stored: string }>
      for (const row of rows) {
        if (!row.stored) continue
        const relative = relativeFor(row.stored, args.oldRoot)
        referenced.add(relative)
        if (!existsSync(path.join(staging, relative))) {
          throw new Error(`fehlende Datei: ${relative}`)
        }
        db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${key} = ?`).run(relative, row.rowKey)
        rewritten += 1
      }
    }

    // Vorlagen-Daten (Logo, Fonts) stecken als JSON in einer Zeile.
    const templateRow = db
      .prepare('SELECT id, data FROM invoice_template WHERE id = 1')
      .get() as { id: number; data: string } | undefined
    if (templateRow) {
      const data = JSON.parse(templateRow.data) as Record<string, unknown>
      if (typeof data.logoPath === 'string' && isAbsoluteStored(data.logoPath)) {
        const relative = relativeFor(data.logoPath, args.oldRoot)
        if (!existsSync(path.join(staging, relative))) throw new Error(`fehlende Datei: ${relative}`)
        data.logoPath = relative
        rewritten += 1
      }
      if (Array.isArray(data.fontFiles)) {
        for (const file of data.fontFiles as Array<{ path?: string }>) {
          if (typeof file.path === 'string' && isAbsoluteStored(file.path)) {
            const relative = relativeFor(file.path, args.oldRoot)
            if (!existsSync(path.join(staging, relative))) {
              throw new Error(`fehlende Datei: ${relative}`)
            }
            file.path = relative
            rewritten += 1
          }
        }
      }
      db.prepare('UPDATE invoice_template SET data = ? WHERE id = 1').run(JSON.stringify(data))
    }

    // Verifikation: gleiche Zeilenzahlen und Summen wie die Quelle.
    const expected = {
      invoices: count('invoices'),
      offers: count('offers'),
      expenses: count('expenses'),
      statements: count('bank_statements'),
    }
    const actual = {
      invoices: (db.prepare('SELECT COUNT(*) AS c FROM invoices').get() as { c: number }).c,
      offers: (db.prepare('SELECT COUNT(*) AS c FROM offers').get() as { c: number }).c,
      expenses: (db.prepare('SELECT COUNT(*) AS c FROM expenses').get() as { c: number }).c,
      statements: (db.prepare('SELECT COUNT(*) AS c FROM bank_statements').get() as { c: number }).c,
    }
    for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
      if (expected[key] !== actual[key]) {
        throw new Error(`Zeilenzahl weicht ab (${key}): ${expected[key]} != ${actual[key]}`)
      }
    }

    const totalSource = sum('invoices', 'total')
    const totalTarget = (
      db.prepare('SELECT COALESCE(SUM(total), 0) AS v FROM invoices').get() as { v: number }
    ).v
    if (Math.abs(totalSource - totalTarget) > 0.005) {
      throw new Error(`Rechnungssumme weicht ab: ${totalSource} != ${totalTarget}`)
    }
    const expenseSource = sum('expenses', 'gross')
    const expenseTarget = (
      db.prepare('SELECT COALESCE(SUM(gross), 0) AS v FROM expenses').get() as { v: number }
    ).v
    if (Math.abs(expenseSource - expenseTarget) > 0.005) {
      throw new Error(`Ausgabensumme weicht ab: ${expenseSource} != ${expenseTarget}`)
    }

    const integration = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }
    if (integration.integrity_check !== 'ok') throw new Error('SQLite integrity_check fehlgeschlagen')

    // Verwaiste Dateien nur melden, nicht abbrechen.
    const orphans: string[] = []
    for (const dir of ['invoices', 'offers', 'expenses', 'statements']) {
      const root = path.join(staging, dir)
      if (!existsSync(root)) continue
      for (const absolute of walkFiles(root)) {
        const relative = path.relative(staging, absolute).split(path.sep).join('/')
        if (!referenced.has(relative)) orphans.push(relative)
      }
    }

    db.close()
    db = null
    sourceDb.close()
    source = null

    if (existsSync(args.targetDir)) {
      if (readdirSync(args.targetDir).length > 0) {
        throw new Error('Zielverzeichnis ist nicht leer')
      }
      rmSync(args.targetDir, { recursive: true, force: true })
    }
    await fs.rename(staging, args.targetDir)

    return {
      ...actual,
      filesCopied,
      rewritten,
      orphans,
    }
  } catch (error) {
    try {
      db?.close()
    } catch {
      /* already closed */
    }
    try {
      source?.close()
    } catch {
      /* already closed */
    }
    rmSync(staging, { recursive: true, force: true })
    throw error
  }
}

export function isDirectory(target: string): boolean {
  try {
    return statSync(target).isDirectory()
  } catch {
    return false
  }
}
