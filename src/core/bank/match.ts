import type { DatabaseSync } from 'node:sqlite'
import type { BankMatchChoice } from '@shared/types'
import { getTransaction, setTransactionMatch } from '../db/bank'
import { getInvoice, setInvoicePaid } from '../db/invoices'
import { createExpense, getExpense, setExpenseSettled } from '../db/expenses'

/**
 * Bestätigt eine Bank-Zuordnung. Die Auswahl kommt ohne `status` vom Client —
 * sie beschreibt nur das Ziel; welche Felder zu setzen sind, entscheidet diese
 * Funktion. (Ein direktes `setTransactionMatch` mit der Client-Auswahl würde an
 * `status: undefined` scheitern.)
 */
export function applyBankMatch(db: DatabaseSync, txId: string, choice: BankMatchChoice): void {
  if ('invoiceId' in choice) {
    // Rechnung als bezahlt markieren — aber nur, wenn sie es nicht schon ist,
    // damit ein bereits bezahlter Beleg sein ursprüngliches paid_at behält.
    const invoice = getInvoice(db, choice.invoiceId)
    if (invoice && invoice.status !== 'paid') setInvoicePaid(db, choice.invoiceId, true)
    setTransactionMatch(db, txId, { status: 'matched', invoiceId: choice.invoiceId })
    return
  }

  if ('expenseId' in choice) {
    // FX-Beleg: Beim Bestätigen zählt der tatsächlich abgebuchte EUR-Betrag
    // (inkl. Kartenspread) — er ersetzt den EZB-Schätzwert aus dem Upload.
    const tx = getTransaction(db, txId)
    const expense = getExpense(db, choice.expenseId)
    if (tx && expense && tx.kind === 'debit' && expense.originalCurrency !== 'EUR') {
      setExpenseSettled(db, choice.expenseId, Math.abs(tx.amount), tx.bookingDate)
    }
    setTransactionMatch(db, txId, { status: 'matched', expenseId: choice.expenseId })
    return
  }

  if ('fixedCostId' in choice) {
    // Fixkosten (z. B. KSK) stehen bereits in den Büchern — nur verknüpfen.
    setTransactionMatch(db, txId, { status: 'matched', fixedCostId: choice.fixedCostId })
    return
  }

  // Beleg aus dem gewählten PDF anlegen. Betrag und Datum kommen aus der
  // Buchung (immer EUR), nicht aus dem PDF.
  const expenseId = createExpense(db, {
    vendor: choice.createExpense.vendor,
    category: '',
    date: choice.createExpense.date,
    paidAt: choice.createExpense.date,
    gross: choice.createExpense.gross,
    originalAmount: null,
    originalCurrency: 'EUR',
    vatRate: 19,
    note: 'Aus Bank-Abgleich',
    pdfPath: choice.createExpense.pdfPath,
    sourceName: choice.createExpense.sourceName,
  })
  setTransactionMatch(db, txId, { status: 'matched', expenseId })
}
