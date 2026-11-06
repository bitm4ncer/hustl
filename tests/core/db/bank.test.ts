import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { applyMigrations } from '../../../src/core/db/migrations'
import {
  getConnection,
  saveConnection,
  clearConnection,
  upsertTransaction,
  listTransactions,
  setTransactionMatch,
  getTransaction,
} from '../../../src/core/db/bank'
import type { BankTransaction } from '../../../src/shared/types'

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  applyMigrations(db)
  return db
}

function makeTx(overrides: Partial<BankTransaction> = {}): BankTransaction {
  return {
    id: 'tx-1',
    accountId: 'acc-1',
    bookingDate: '2026-06-04',
    amount: 2000,
    currency: 'EUR',
    counterparty: 'LAgentur GmbH',
    remittance: 'Rechnung 2026023',
    kind: 'credit',
    status: 'unmatched',
    matchedInvoiceId: null,
    matchedExpenseId: null,
    matchedFixedCostId: null,
    ...overrides,
  }
}

describe('bank connection', () => {
  it('getConnection returns null when no connection saved', () => {
    const db = freshDb()
    expect(getConnection(db)).toBeNull()
  })

  it('saveConnection and getConnection round-trip', () => {
    const db = freshDb()
    const conn = {
      institutionId: 'N26_COBADEFF',
      requisitionId: 'req-abc',
      accessToken: 'acc-tok',
      refreshToken: 'ref-tok',
      accessExpires: '2026-06-15T12:00:00Z',
      refreshExpires: '2026-09-15T12:00:00Z',
      accountIds: ['acct-1', 'acct-2'],
      lastSync: null,
    }
    saveConnection(db, conn)
    const stored = getConnection(db)
    expect(stored).not.toBeNull()
    expect(stored!.institutionId).toBe('N26_COBADEFF')
    expect(stored!.requisitionId).toBe('req-abc')
    expect(stored!.accountIds).toEqual(['acct-1', 'acct-2'])
    expect(stored!.lastSync).toBeNull()
  })

  it('saveConnection overwrites existing connection (singleton row)', () => {
    const db = freshDb()
    saveConnection(db, {
      institutionId: 'OLD', requisitionId: 'r1', accessToken: 'a', refreshToken: 'b',
      accessExpires: '2026-01-01', refreshExpires: '2026-01-01',
      accountIds: ['x'], lastSync: null,
    })
    saveConnection(db, {
      institutionId: 'NEW', requisitionId: 'r2', accessToken: 'c', refreshToken: 'd',
      accessExpires: '2027-01-01', refreshExpires: '2027-01-01',
      accountIds: ['y'], lastSync: '2026-06-10',
    })
    const stored = getConnection(db)
    expect(stored!.institutionId).toBe('NEW')
    expect(stored!.lastSync).toBe('2026-06-10')
    // Only one row
    const count = db.prepare('SELECT COUNT(*) as n FROM bank_connection').get() as { n: number }
    expect(count.n).toBe(1)
  })

  it('clearConnection removes the connection', () => {
    const db = freshDb()
    saveConnection(db, {
      institutionId: 'X', requisitionId: 'r', accessToken: 'a', refreshToken: 'b',
      accessExpires: '2026-01-01', refreshExpires: '2026-01-01',
      accountIds: [], lastSync: null,
    })
    clearConnection(db)
    expect(getConnection(db)).toBeNull()
  })
})

describe('bank transactions — upsert', () => {
  it('inserts a transaction', () => {
    const db = freshDb()
    upsertTransaction(db, makeTx())
    const rows = listTransactions(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('tx-1')
    expect(rows[0].amount).toBe(2000)
  })

  it('upsert is idempotent: same id twice → 1 row', () => {
    const db = freshDb()
    upsertTransaction(db, makeTx())
    upsertTransaction(db, makeTx())
    expect(listTransactions(db)).toHaveLength(1)
  })

  it('upsert does NOT overwrite status on conflict', () => {
    const db = freshDb()
    upsertTransaction(db, makeTx())
    // Manually mark as matched
    setTransactionMatch(db, 'tx-1', { status: 'matched', invoiceId: 42 })
    // Re-upsert with different counterparty (simulating resync)
    upsertTransaction(db, makeTx({ counterparty: 'Updated Name' }))
    const rows = listTransactions(db)
    expect(rows[0].status).toBe('matched')
    expect(rows[0].matchedInvoiceId).toBe(42)
  })

  it('upsert DOES update non-user fields (counterparty) on conflict', () => {
    const db = freshDb()
    upsertTransaction(db, makeTx())
    upsertTransaction(db, makeTx({ counterparty: 'New Name' }))
    const rows = listTransactions(db)
    expect(rows[0].counterparty).toBe('New Name')
  })
})

describe('bank transactions — list filter', () => {
  it('listTransactions with no filter returns all', () => {
    const db = freshDb()
    upsertTransaction(db, makeTx({ id: 'tx-1' }))
    upsertTransaction(db, makeTx({ id: 'tx-2', status: 'matched' }))
    expect(listTransactions(db)).toHaveLength(2)
  })

  it('listTransactions filters by status', () => {
    const db = freshDb()
    upsertTransaction(db, makeTx({ id: 'tx-1', status: 'unmatched' }))
    upsertTransaction(db, makeTx({ id: 'tx-2', status: 'matched' }))
    upsertTransaction(db, makeTx({ id: 'tx-3', status: 'ignored' }))
    expect(listTransactions(db, { status: 'unmatched' })).toHaveLength(1)
    expect(listTransactions(db, { status: 'matched' })).toHaveLength(1)
  })
})

describe('getTransaction', () => {
  it('round-trips a transaction by id', () => {
    const db = freshDb()
    upsertTransaction(db, makeTx({ id: 'tx-fx', kind: 'debit', amount: -8.68, bookingDate: '2026-06-11' }))
    const r = getTransaction(db, 'tx-fx')!
    expect(r.amount).toBeCloseTo(-8.68, 2)
    expect(r.bookingDate).toBe('2026-06-11')
    expect(getTransaction(db, 'missing')).toBeNull()
  })
})

describe('setTransactionMatch', () => {
  it('sets status and invoiceId', () => {
    const db = freshDb()
    upsertTransaction(db, makeTx())
    setTransactionMatch(db, 'tx-1', { status: 'matched', invoiceId: 7 })
    const rows = listTransactions(db)
    expect(rows[0].status).toBe('matched')
    expect(rows[0].matchedInvoiceId).toBe(7)
    expect(rows[0].matchedExpenseId).toBeNull()
  })

  it('sets status and expenseId', () => {
    const db = freshDb()
    upsertTransaction(db, makeTx({ kind: 'debit', amount: -9.99 }))
    setTransactionMatch(db, 'tx-1', { status: 'matched', expenseId: 99 })
    const rows = listTransactions(db)
    expect(rows[0].matchedExpenseId).toBe(99)
    expect(rows[0].matchedInvoiceId).toBeNull()
  })

  it('sets status to ignored', () => {
    const db = freshDb()
    upsertTransaction(db, makeTx())
    setTransactionMatch(db, 'tx-1', { status: 'ignored' })
    expect(listTransactions(db, { status: 'ignored' })).toHaveLength(1)
  })
})
