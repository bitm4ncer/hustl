import type { DatabaseSync } from 'node:sqlite'
import { appendAudit } from './audit'

export interface NumberSequence {
  year: number
  lastNumber: number
}

export function getNumberSequence(db: DatabaseSync, year: number): NumberSequence | null {
  const row = db
    .prepare('SELECT year, last_number FROM number_sequence WHERE year = ?')
    .get(year) as { year: number; last_number: number } | undefined
  if (!row) return null
  return { year: row.year, lastNumber: row.last_number }
}

export function setNumberSequence(db: DatabaseSync, year: number, lastNumber: number): void {
  const before = getNumberSequence(db, year)?.lastNumber ?? null
  // Eine Nummer, die schon auf einer Rechnung steht, darf nie wieder frei
  // werden — sonst scheitert die nächste Finalisierung am UNIQUE-Constraint
  // oder vergibt eine Nummer doppelt.
  const highest = db
    .prepare(
      `SELECT MAX(CAST(substr(number, 5) AS INTEGER)) AS n FROM invoices
       WHERE number IS NOT NULL AND substr(number, 1, 4) = ?`,
    )
    .get(String(year)) as { n: number | null }
  if (highest.n != null && lastNumber < highest.n) {
    throw new Error(
      `Der Nummernkreis steht bereits bei ${highest.n} — kleiner geht nicht, sonst wird eine vergebene Nummer erneut vergeben.`,
    )
  }
  db.prepare(
    'INSERT INTO number_sequence (year, last_number) VALUES (?, ?) ON CONFLICT(year) DO UPDATE SET last_number = ?'
  ).run(year, lastNumber, lastNumber)
  // Änderungen am Nummernkreis sind steuerlich relevant — immer protokollieren.
  appendAudit(db, {
    invoiceId: null,
    action: 'numberSequence',
    payload: { year, from: before, to: lastNumber },
  })
}
