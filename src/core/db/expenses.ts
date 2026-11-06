import type { DatabaseSync } from 'node:sqlite'
import type { Expense } from '@shared/types'

export interface ExpenseInput {
  vendor: string
  category: string
  date: string
  paidAt: string | null
  gross: number
  originalAmount: number | null
  originalCurrency: string
  vatRate: number
  note: string
  pdfPath: string | null
  sourceName: string | null
}

function rowToExpense(r: any): Expense {
  return {
    id: r.id,
    vendor: r.vendor ?? '',
    category: r.category ?? '',
    date: r.date,
    paidAt: r.paid_at ?? null,
    gross: r.gross,
    originalAmount: r.original_amount ?? null,
    originalCurrency: r.original_currency ?? 'EUR',
    vatRate: r.vat_rate,
    note: r.note ?? '',
    pdfPath: r.pdf_path ?? null,
    sourceName: r.source_name ?? null,
  }
}

export function listExpenses(db: DatabaseSync): Expense[] {
  return (db.prepare('SELECT * FROM expenses ORDER BY date DESC, id DESC').all() as any[]).map(rowToExpense)
}

export function getExpense(db: DatabaseSync, id: number): Expense | null {
  const r = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id) as any
  return r ? rowToExpense(r) : null
}

export function createExpense(db: DatabaseSync, input: ExpenseInput): number {
  const info = db
    .prepare(
      `INSERT INTO expenses (vendor, category, date, paid_at, gross, original_amount, original_currency, vat_rate, note, pdf_path, source_name)
       VALUES (@vendor, @category, @date, @paidAt, @gross, @originalAmount, @originalCurrency, @vatRate, @note, @pdfPath, @sourceName)`,
    )
    .run({
      vendor: input.vendor,
      category: input.category,
      date: input.date,
      paidAt: input.paidAt,
      gross: input.gross,
      // Defensive an der IPC-Grenze: ältere Renderer-Drafts kennen die Felder nicht.
      originalAmount: input.originalAmount ?? null,
      originalCurrency: input.originalCurrency ?? 'EUR',
      vatRate: input.vatRate,
      note: input.note,
      pdfPath: input.pdfPath,
      sourceName: input.sourceName,
    })
  return Number(info.lastInsertRowid)
}

export function updateExpense(db: DatabaseSync, id: number, input: ExpenseInput): void {
  db.prepare(
    `UPDATE expenses SET vendor=@vendor, category=@category, date=@date, paid_at=@paidAt,
       gross=@gross, original_amount=@originalAmount, original_currency=@originalCurrency,
       vat_rate=@vatRate, note=@note, pdf_path=@pdfPath, source_name=@sourceName,
       updated_at=datetime('now') WHERE id=@id`,
  ).run({
    id,
    vendor: input.vendor,
    category: input.category,
    date: input.date,
    paidAt: input.paidAt,
    gross: input.gross,
    originalAmount: input.originalAmount ?? null,
    originalCurrency: input.originalCurrency ?? 'EUR',
    vatRate: input.vatRate,
    note: input.note,
    pdfPath: input.pdfPath,
    sourceName: input.sourceName,
  })
}

export function setExpensePaid(db: DatabaseSync, id: number, paidAt: string | null): void {
  db.prepare("UPDATE expenses SET paid_at=@paidAt, updated_at=datetime('now') WHERE id=@id").run({ id, paidAt })
}

// FX-Abgleich: der tatsächlich abgebuchte EUR-Betrag ersetzt den EZB-Schätzwert;
// original_amount/original_currency bleiben als Beleg-Referenz stehen.
export function setExpenseSettled(db: DatabaseSync, id: number, gross: number, paidAt: string): void {
  db.prepare(
    "UPDATE expenses SET gross=@gross, paid_at=@paidAt, updated_at=datetime('now') WHERE id=@id",
  ).run({ id, gross, paidAt })
}

export function deleteExpense(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id)
}
