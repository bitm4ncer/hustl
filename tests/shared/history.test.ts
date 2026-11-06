import { describe, it, expect } from 'vitest'
import { groupByMonth, monthLabel, monthsWithData } from '../../src/shared/history'
import type { BankTransaction } from '../../src/shared/types'

function tx(id: string, bookingDate: string): BankTransaction {
  return {
    id,
    accountId: 'acc',
    bookingDate,
    amount: -10,
    currency: 'EUR',
    counterparty: 'Test',
    remittance: '',
    kind: 'debit',
    status: 'matched',
    matchedInvoiceId: null,
    matchedExpenseId: null,
    matchedFixedCostId: null,
  }
}

describe('groupByMonth', () => {
  it('gruppiert nach Buchungsmonat, neuester Monat zuerst', () => {
    const months = groupByMonth([
      tx('a', '2026-09-03'),
      tx('b', '2026-10-01'),
      tx('c', '2026-10-20'),
      tx('d', '2026-08-31'),
    ])
    expect(months.map((m) => m.month)).toEqual(['2026-10', '2026-09', '2026-08'])
  })

  it('sortiert innerhalb des Monats die jüngste Buchung nach oben', () => {
    const months = groupByMonth([
      tx('a', '2026-10-01'),
      tx('b', '2026-10-20'),
      tx('c', '2026-10-10'),
    ])
    expect(months[0].transactions.map((t) => t.id)).toEqual(['b', 'c', 'a'])
  })

  it('liefert eine leere Liste ohne Buchungen', () => {
    expect(groupByMonth([])).toEqual([])
  })

  it('Monatslabel auf Deutsch', () => {
    expect(monthLabel('2026-10')).toBe('Oktober 2026')
    expect(monthLabel('2026-01')).toBe('Januar 2026')
  })
})

describe('monthsWithData', () => {
  it('nimmt alle Monate mit Daten plus den laufenden, neuester zuerst', () => {
    expect(monthsWithData(['2026-10-22', '2026-09-03', '2026-10-01'], '2026-11')).toEqual([
      '2026-11',
      '2026-10',
      '2026-09',
    ])
  })

  it('ignoriert leere Werte und Duplikate', () => {
    expect(monthsWithData(['', '2026-08-01', '2026-08-15'], '2026-08')).toEqual(['2026-08'])
  })
})
