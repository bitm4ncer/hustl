import type { BankTransaction } from './types'

export interface TransactionMonth {
  /** 'YYYY-MM' */
  month: string
  transactions: BankTransaction[]
}

/**
 * Abgeglichene Buchungen nach Monat, neuester Monat zuerst, innerhalb des
 * Monats die jüngste Buchung oben. Grundlage ist das Buchungsdatum, nicht das
 * Importdatum — ein nachgereichter Kontoauszug soll im richtigen Monat landen.
 */
export function groupByMonth(transactions: BankTransaction[]): TransactionMonth[] {
  const byMonth = new Map<string, BankTransaction[]>()
  for (const tx of transactions) {
    const month = tx.bookingDate.slice(0, 7)
    const list = byMonth.get(month)
    if (list) list.push(tx)
    else byMonth.set(month, [tx])
  }

  return [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, items]) => ({
      month,
      transactions: [...items].sort(
        (a, b) => b.bookingDate.localeCompare(a.bookingDate) || b.id.localeCompare(a.id),
      ),
    }))
}

/** Monatsüberschrift, z. B. "Oktober 2026". */
export function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number)
  return new Date(year, m - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
}

/**
 * Alle Monate, in denen Daten liegen, plus der laufende Monat — neuester
 * zuerst. Für Auswahlfelder, die einen Monat erwarten (Export, Auswertung).
 */
export function monthsWithData(dates: string[], currentMonth: string): string[] {
  const set = new Set<string>()
  for (const date of dates) {
    if (date && date.length >= 7) set.add(date.slice(0, 7))
  }
  set.add(currentMonth)
  return [...set].sort((a, b) => b.localeCompare(a))
}
