import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { applyMigrations } from '../../../src/core/db/migrations'
import {
  createExpense, listExpenses, getExpense, updateExpense, deleteExpense, setExpensePaid,
  setExpenseSettled, type ExpenseInput,
} from '../../../src/core/db/expenses'

const input = (over: Partial<ExpenseInput> = {}): ExpenseInput => ({
  vendor: 'Adobe', category: 'Software', date: '2026-06-05', paidAt: '2026-06-05',
  gross: 71.39, vatRate: 19, note: '', pdfPath: null, sourceName: null,
  originalAmount: null, originalCurrency: 'EUR', ...over,
})

describe('expenses db', () => {
  it('creates, reads and lists an expense', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const id = createExpense(db, input())
    const e = getExpense(db, id)!
    expect(e.vendor).toBe('Adobe')
    expect(e.gross).toBeCloseTo(71.39, 2)
    expect(e.vatRate).toBe(19)
    expect(listExpenses(db)).toHaveLength(1)
  })

  it('updates an expense', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const id = createExpense(db, input())
    updateExpense(db, id, input({ vendor: 'Figma', gross: 144 }))
    expect(getExpense(db, id)!.vendor).toBe('Figma')
    expect(getExpense(db, id)!.gross).toBe(144)
  })

  it('toggles paid_at', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const id = createExpense(db, input({ paidAt: null }))
    expect(getExpense(db, id)!.paidAt).toBeNull()
    setExpensePaid(db, id, '2026-06-10')
    expect(getExpense(db, id)!.paidAt).toBe('2026-06-10')
    setExpensePaid(db, id, null)
    expect(getExpense(db, id)!.paidAt).toBeNull()
  })

  it('persists original amount and currency for FX receipts', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const id = createExpense(db, input({ gross: 8.62, originalAmount: 10, originalCurrency: 'USD' }))
    const e = getExpense(db, id)!
    expect(e.originalAmount).toBe(10)
    expect(e.originalCurrency).toBe('USD')
    updateExpense(db, id, input({ gross: 8.68, originalAmount: 10, originalCurrency: 'USD' }))
    expect(getExpense(db, id)!.originalAmount).toBe(10)
  })

  it('legacy rows without FX columns read as EUR / null', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    db.prepare("INSERT INTO expenses (vendor, date, gross) VALUES ('Alt', '2026-01-01', 5)").run()
    const e = listExpenses(db)[0]
    expect(e.originalAmount).toBeNull()
    expect(e.originalCurrency).toBe('EUR')
  })

  it('setExpenseSettled corrects gross and paid_at to the bank booking', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const id = createExpense(db, input({ gross: 8.62, paidAt: null, originalAmount: 10, originalCurrency: 'USD' }))
    setExpenseSettled(db, id, 8.68, '2026-06-11')
    const e = getExpense(db, id)!
    expect(e.gross).toBeCloseTo(8.68, 2)
    expect(e.paidAt).toBe('2026-06-11')
    expect(e.originalAmount).toBe(10) // Originalbetrag bleibt erhalten
  })

  it('deletes an expense', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const id = createExpense(db, input())
    deleteExpense(db, id)
    expect(getExpense(db, id)).toBeNull()
  })
})
