import type { DatabaseSync } from 'node:sqlite'
import type { BankTransaction } from '@shared/types'

// ---------------------------------------------------------------------------
// Connection record shape
// ---------------------------------------------------------------------------

export interface BankConnection {
  institutionId: string
  requisitionId: string
  accessToken: string
  refreshToken: string
  accessExpires: string
  refreshExpires: string
  accountIds: string[]
  lastSync: string | null
}

// ---------------------------------------------------------------------------
// Row → BankConnection
// ---------------------------------------------------------------------------

function rowToConnection(r: any): BankConnection {
  return {
    institutionId: r.institution_id,
    requisitionId: r.requisition_id,
    accessToken: r.access_token,
    refreshToken: r.refresh_token,
    accessExpires: r.access_expires,
    refreshExpires: r.refresh_expires,
    accountIds: JSON.parse(r.account_ids ?? '[]') as string[],
    lastSync: r.last_sync ?? null,
  }
}

// ---------------------------------------------------------------------------
// Row → BankTransaction
// ---------------------------------------------------------------------------

function rowToTx(r: any): BankTransaction {
  return {
    id: r.id,
    accountId: r.account_id,
    bookingDate: r.booking_date,
    amount: r.amount,
    currency: r.currency,
    counterparty: r.counterparty ?? '',
    remittance: r.remittance ?? '',
    kind: r.kind as 'credit' | 'debit',
    status: r.status as 'unmatched' | 'matched' | 'ignored',
    matchedInvoiceId: r.matched_invoice_id ?? null,
    matchedExpenseId: r.matched_expense_id ?? null,
    matchedFixedCostId: r.matched_fixed_cost_id ?? null,
  }
}

// ---------------------------------------------------------------------------
// Connection CRUD
// ---------------------------------------------------------------------------

export function getConnection(db: DatabaseSync): BankConnection | null {
  const r = db.prepare('SELECT * FROM bank_connection WHERE id = 1').get()
  return r ? rowToConnection(r) : null
}

export function saveConnection(db: DatabaseSync, conn: BankConnection): void {
  db.prepare(
    `INSERT INTO bank_connection
       (id, institution_id, requisition_id, access_token, refresh_token,
        access_expires, refresh_expires, account_ids, last_sync, updated_at)
     VALUES
       (1, @institutionId, @requisitionId, @accessToken, @refreshToken,
        @accessExpires, @refreshExpires, @accountIds, @lastSync, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       institution_id  = excluded.institution_id,
       requisition_id  = excluded.requisition_id,
       access_token    = excluded.access_token,
       refresh_token   = excluded.refresh_token,
       access_expires  = excluded.access_expires,
       refresh_expires = excluded.refresh_expires,
       account_ids     = excluded.account_ids,
       last_sync       = excluded.last_sync,
       updated_at      = datetime('now')`,
  ).run({
    institutionId: conn.institutionId,
    requisitionId: conn.requisitionId,
    accessToken: conn.accessToken,
    refreshToken: conn.refreshToken,
    accessExpires: conn.accessExpires,
    refreshExpires: conn.refreshExpires,
    accountIds: JSON.stringify(conn.accountIds),
    lastSync: conn.lastSync,
  })
}

export function clearConnection(db: DatabaseSync): void {
  db.prepare('DELETE FROM bank_connection WHERE id = 1').run()
}

// ---------------------------------------------------------------------------
// Transaction CRUD
// ---------------------------------------------------------------------------

export function upsertTransaction(db: DatabaseSync, tx: BankTransaction): void {
  db.prepare(
    `INSERT INTO bank_transactions
       (id, account_id, booking_date, amount, currency, counterparty, remittance, kind,
        status, matched_invoice_id, matched_expense_id, matched_fixed_cost_id)
     VALUES
       (@id, @accountId, @bookingDate, @amount, @currency, @counterparty, @remittance, @kind,
        @status, @matchedInvoiceId, @matchedExpenseId, @matchedFixedCostId)
     ON CONFLICT(id) DO UPDATE SET
       account_id   = excluded.account_id,
       booking_date = excluded.booking_date,
       amount       = excluded.amount,
       currency     = excluded.currency,
       counterparty = excluded.counterparty,
       remittance   = excluded.remittance,
       kind         = excluded.kind
     -- Intentionally NOT updating: status, matched_invoice_id, matched_expense_id, matched_fixed_cost_id`,
  ).run({
    id: tx.id,
    accountId: tx.accountId,
    bookingDate: tx.bookingDate,
    amount: tx.amount,
    currency: tx.currency,
    counterparty: tx.counterparty,
    remittance: tx.remittance,
    kind: tx.kind,
    status: tx.status,
    matchedInvoiceId: tx.matchedInvoiceId,
    matchedExpenseId: tx.matchedExpenseId,
    matchedFixedCostId: tx.matchedFixedCostId,
  })
}

export function getTransaction(db: DatabaseSync, id: string): BankTransaction | null {
  const r = db.prepare('SELECT * FROM bank_transactions WHERE id = ?').get(id) as any
  return r ? rowToTx(r) : null
}

export interface TransactionFilter {
  status?: 'unmatched' | 'matched' | 'ignored'
}

export function listTransactions(db: DatabaseSync, filter?: TransactionFilter): BankTransaction[] {
  if (filter?.status !== undefined) {
    return (
      db
        .prepare('SELECT * FROM bank_transactions WHERE status = @status ORDER BY booking_date DESC, id')
        .all({ status: filter.status }) as any[]
    ).map(rowToTx)
  }
  return (
    db.prepare('SELECT * FROM bank_transactions ORDER BY booking_date DESC, id').all() as any[]
  ).map(rowToTx)
}

export interface MatchChoice {
  status: 'matched' | 'ignored'
  invoiceId?: number
  expenseId?: number
  fixedCostId?: number
}

export function setTransactionMatch(db: DatabaseSync, id: string, choice: MatchChoice): void {
  db.prepare(
    `UPDATE bank_transactions
     SET status = @status,
         matched_invoice_id = @invoiceId,
         matched_expense_id = @expenseId,
         matched_fixed_cost_id = @fixedCostId
     WHERE id = @id`,
  ).run({
    id,
    status: choice.status,
    invoiceId: choice.invoiceId ?? null,
    expenseId: choice.expenseId ?? null,
    fixedCostId: choice.fixedCostId ?? null,
  })
}

// ---------------------------------------------------------------------------
// Statement PDF tracking (one stored PDF per calendar month)
// ---------------------------------------------------------------------------

export interface StatementRecord {
  yearMonth: string // 'YYYY-MM'
  pdfPath: string
}

export function saveStatement(db: DatabaseSync, rec: StatementRecord): void {
  db.prepare(
    `INSERT INTO bank_statements (year_month, pdf_path, imported_at)
     VALUES (@yearMonth, @pdfPath, datetime('now'))
     ON CONFLICT(year_month) DO UPDATE SET
       pdf_path    = excluded.pdf_path,
       imported_at = datetime('now')`,
  ).run({ yearMonth: rec.yearMonth, pdfPath: rec.pdfPath })
}

export function getStatement(db: DatabaseSync, yearMonth: string): StatementRecord | null {
  const r = db
    .prepare('SELECT year_month, pdf_path FROM bank_statements WHERE year_month = ?')
    .get(yearMonth) as { year_month: string; pdf_path: string } | undefined
  return r ? { yearMonth: r.year_month, pdfPath: r.pdf_path } : null
}
