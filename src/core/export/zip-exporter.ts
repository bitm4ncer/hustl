import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import { getStatement } from '../db/bank'
import { resolveDataPath } from '../paths'

export interface ExportResult {
  invoices: number
  expenses: number
  statement: boolean
  files: string[]
}

export interface ExportOptions {
  /** Erlaubt absolute Pfade (nur Electron mit Altbestand). Server: false. */
  allowAbsolute?: boolean
}

export interface MonthFile {
  /** Dateiname für den Download bzw. die Ablage. */
  name: string
  data: Buffer
}

export interface MonthExport {
  invoices: MonthFile
  expenses: MonthFile
  /** Kontoauszug des Monats, falls einer importiert wurde. */
  statement: MonthFile | null
  counts: { invoices: number; expenses: number }
}

export interface MonthExportInfo {
  invoices: number
  expenses: number
  statement: boolean
}

function resolve(dataDir: string, stored: string, options: ExportOptions): string {
  // Ohne dataDir (Altbestand/Tests) bleiben absolute Pfade unverändert.
  if (!dataDir) return stored
  if (options.allowAbsolute && path.isAbsolute(stored)) return stored
  return resolveDataPath(dataDir, stored)
}

function assertMonth(yearMonth: string): void {
  // Defensive: yearMonth flows in from IPC and lands in output filenames.
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) throw new Error(`Invalid yearMonth: ${yearMonth}`)
}

function safe(s: string): string {
  return s.replace(/[^\w\-äöüÄÖÜß ]/g, '_').trim() || 'Datei'
}

/** Nur Zählen — ohne PDFs zu lesen, damit die UI das Angebot schnell kennt. */
export function monthExportInfo(db: DatabaseSync, yearMonth: string): MonthExportInfo {
  assertMonth(yearMonth)
  const invoices = db
    .prepare(
      `SELECT COUNT(*) AS n FROM invoices
       WHERE pdf_path IS NOT NULL AND status != 'draft'
         AND (status != 'cancelled' OR paid_at IS NOT NULL OR corrects_number IS NOT NULL)
         AND (status != 'cancelled' OR paid_at IS NOT NULL OR corrects_number IS NOT NULL)
         AND substr(COALESCE(NULLIF(paid_at, ''),
              (SELECT NULLIF(i2.paid_at, '') FROM invoices i2 WHERE i2.number = invoices.corrects_number),
              CASE WHEN status = 'cancelled' THEN updated_at ELSE date END), 1, 7) = ?`,
    )
    .get(yearMonth) as { n: number }
  const expenses = db
    .prepare('SELECT COUNT(*) AS n FROM expenses WHERE pdf_path IS NOT NULL AND substr(date,1,7)=?')
    .get(yearMonth) as { n: number }
  return {
    invoices: invoices.n,
    expenses: expenses.n,
    statement: getStatement(db, yearMonth) !== null,
  }
}

/**
 * Baut die drei Teile eines Monatsexports im Speicher: Rechnungen-ZIP,
 * Belege-ZIP und — falls vorhanden — der Kontoauszug als PDF. Der Aufrufer
 * entscheidet, ob er sie einzeln ausliefert oder in einen Ordner schreibt.
 *
 * Rechnungen gehören in den Monat, in dem sie **bezahlt** wurden (Zufluss),
 * nicht in den Monat des Rechnungsdatums: eine im September gestellte Rechnung,
 * die im Oktober überwiesen wird, ist Oktober-Umsatz. Unbezahlte Rechnungen
 * bleiben bei ihrem Rechnungsdatum, damit sie nicht aus jedem Export fallen.
 */
export async function buildMonthExport(
  db: DatabaseSync,
  yearMonth: string,
  dataDir = '',
  options: ExportOptions = {},
): Promise<MonthExport> {
  assertMonth(yearMonth)
  const JSZip = (await import('jszip')).default

  const invRows = db
    .prepare(
      `SELECT number, pdf_path, status FROM invoices
       WHERE pdf_path IS NOT NULL AND status != 'draft'
         AND (status != 'cancelled' OR paid_at IS NOT NULL OR corrects_number IS NOT NULL)
         AND (status != 'cancelled' OR paid_at IS NOT NULL OR corrects_number IS NOT NULL)
         AND substr(COALESCE(NULLIF(paid_at, ''),
              (SELECT NULLIF(i2.paid_at, '') FROM invoices i2 WHERE i2.number = invoices.corrects_number),
              CASE WHEN status = 'cancelled' THEN updated_at ELSE date END), 1, 7) = ?`,
    )
    .all(yearMonth) as Array<{ number: string | null; pdf_path: string; status: string }>
  const expRows = db
    .prepare(
      'SELECT id, vendor, date, pdf_path FROM expenses WHERE pdf_path IS NOT NULL AND substr(date,1,7)=?',
    )
    .all(yearMonth) as Array<{ id: number; vendor: string; date: string; pdf_path: string }>

  const invZip = new JSZip()
  let invCount = 0
  for (const row of invRows) {
    try {
      invZip.file(
        `${row.status === 'cancelled' ? 'STORNO-' : ''}${safe(row.number ?? 'Rechnung')}.pdf`,
        await fs.readFile(resolve(dataDir, row.pdf_path, options)),
      )
      invCount += 1
    } catch {
      /* fehlende Datei überspringen */
    }
  }

  const expZip = new JSZip()
  let expCount = 0
  for (const row of expRows) {
    try {
      expZip.file(
        `${row.date}_${safe(row.vendor || 'Beleg')}_${row.id}.pdf`,
        await fs.readFile(resolve(dataDir, row.pdf_path, options)),
      )
      expCount += 1
    } catch {
      /* fehlende Datei überspringen */
    }
  }

  const statement = getStatement(db, yearMonth)
  let statementFile: MonthFile | null = null
  if (statement) {
    try {
      statementFile = {
        name: `Kontoauszug-${yearMonth}.pdf`,
        data: await fs.readFile(resolve(dataDir, statement.pdfPath, options)),
      }
    } catch {
      /* fehlende Datei überspringen */
    }
  }

  return {
    invoices: {
      name: `Rechnungen-${yearMonth}.zip`,
      data: await invZip.generateAsync({ type: 'nodebuffer' }),
    },
    expenses: {
      name: `Ausgaben-${yearMonth}.zip`,
      data: await expZip.generateAsync({ type: 'nodebuffer' }),
    },
    statement: statementFile,
    counts: { invoices: invCount, expenses: expCount },
  }
}

/** Schreibt die drei Teile in einen Ordner (Electron: Zielordner des Nutzers). */
export async function exportMonth(
  db: DatabaseSync,
  yearMonth: string, // 'YYYY-MM'
  targetDir: string,
  dataDir = '',
  options: ExportOptions = {},
): Promise<ExportResult> {
  const built = await buildMonthExport(db, yearMonth, dataDir, options)
  const invPath = path.join(targetDir, built.invoices.name)
  const expPath = path.join(targetDir, built.expenses.name)
  await fs.writeFile(invPath, built.invoices.data)
  await fs.writeFile(expPath, built.expenses.data)

  const files = [invPath, expPath]

  // Bank statement PDF for the month (if one was imported), as a standalone file.
  if (built.statement) {
    const stmtOut = path.join(targetDir, built.statement.name)
    await fs.writeFile(stmtOut, built.statement.data)
    files.push(stmtOut)
  }

  return {
    invoices: built.counts.invoices,
    expenses: built.counts.expenses,
    statement: built.statement !== null,
    files,
  }
}
