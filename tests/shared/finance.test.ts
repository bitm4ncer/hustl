import { describe, it, expect } from 'vitest'
import { netOfGross, vatOfGross, fixedCostMonths, expandFixedCosts } from '@shared/finance'
import type { FixedCost } from '@shared/types'

const fc = (over: Partial<FixedCost>): FixedCost => ({
  id: 1, name: 'X', category: '', gross: 119, vatRate: 19,
  interval: 'monthly', startDate: '2026-01-15', endDate: null, active: true, note: '',
  ...over,
})

describe('net/vat from gross', () => {
  it('splits a 19% gross into net + vat', () => {
    expect(netOfGross(119, 19)).toBe(100)
    expect(vatOfGross(119, 19)).toBe(19)
  })
  it('handles 0% (net == gross)', () => {
    expect(netOfGross(800, 0)).toBe(800)
    expect(vatOfGross(800, 0)).toBe(0)
  })
})

describe('fixedCostMonths', () => {
  it('monthly: every month inside the window', () => {
    expect(fixedCostMonths(fc({ interval: 'monthly' }), '2026-01', '2026-03'))
      .toEqual(['2026-01', '2026-02', '2026-03'])
  })
  it('quarterly: aligned to the start month', () => {
    expect(fixedCostMonths(fc({ interval: 'quarterly', startDate: '2026-01-01' }), '2026-01', '2026-12'))
      .toEqual(['2026-01', '2026-04', '2026-07', '2026-10'])
  })
  it('yearly: same month each year', () => {
    expect(fixedCostMonths(fc({ interval: 'yearly', startDate: '2026-03-01' }), '2026-01', '2027-12'))
      .toEqual(['2026-03', '2027-03'])
  })
  it('respects endDate and active flag', () => {
    expect(fixedCostMonths(fc({ endDate: '2026-02-28' }), '2026-01', '2026-06'))
      .toEqual(['2026-01', '2026-02'])
    expect(fixedCostMonths(fc({ active: false }), '2026-01', '2026-06')).toEqual([])
  })
  it('applies retroactively before startDate (monthly fills the whole window)', () => {
    expect(fixedCostMonths(fc({ interval: 'monthly', startDate: '2026-06-01' }), '2026-01', '2026-06'))
      .toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'])
  })
})

describe('expandFixedCosts', () => {
  it('sums net & vat per month across costs', () => {
    const map = expandFixedCosts(
      [fc({ id: 1, gross: 119, vatRate: 19 }), fc({ id: 2, gross: 100, vatRate: 0 })],
      '2026-01', '2026-01',
    )
    expect(map.get('2026-01')).toEqual({ net: 200, vat: 19 })
  })
})

import { summarize } from '@shared/finance'
import type { Invoice, Expense } from '@shared/types'

const inv = (over: Partial<Invoice>): Invoice => ({
  id: 1, number: '2026001', clientId: 1, date: '2026-06-10',
  servicePeriodStart: null, servicePeriodEnd: null, status: 'paid',
  subtotal: 1000, taxRate: 0.19, taxAmount: 190, total: 1190,
  noTax: false, reverseCharge: false, poNumber: null, notes: null,
  pdfPath: null, hash: null, prevHash: null, finalizedAt: null,
  paidAt: '2026-06-12', items: [],
  ...over,
})

const exp = (over: Partial<Expense>): Expense => ({
  id: 1, vendor: 'V', category: '', date: '2026-06-05', paidAt: '2026-06-05',
  gross: 119, vatRate: 19, note: '', pdfPath: null, sourceName: null,
  ...over,
})

describe('summarize', () => {
  it('converts foreign-currency invoices to EUR via the stored exchange rate', () => {
    const s = summarize(
      {
        invoices: [
          inv({
            status: 'paid',
            paidAt: '2026-06-12',
            subtotal: 1000,
            taxAmount: 190,
            total: 1190,
            currency: 'USD',
            exchangeRate: 1.2,
          } as Partial<Invoice>),
        ],
        expenses: [],
        fixedCosts: [],
      },
      { from: '2026-06', to: '2026-06' },
      'cash',
      '2026-06',
    )
    expect(s.revenue).toBe(1200)
    expect(s.vatCollected).toBe(228)
    expect(s.openRevenue).toBe(0)
  })

  it('cash basis counts paid invoices by paidAt month', () => {
    const s = summarize(
      { invoices: [inv({ paidAt: '2026-06-12', status: 'paid' }), inv({ id: 2, status: 'sent', paidAt: null })],
        expenses: [exp({})], fixedCosts: [] },
      { from: '2026-06', to: '2026-06' }, 'cash', '2026-06',
    )
    expect(s.revenue).toBe(1000) // only the paid one
    expect(s.expenses).toBe(100) // 119 gross @19% -> 100 net
    expect(s.profit).toBe(900)
    expect(s.vatCollected).toBe(190)
    expect(s.vatPaid).toBe(19)
    expect(s.vatBalance).toBe(171)
    expect(s.openRevenue).toBe(1190) // the 'sent' one is open, BRUTTO (total)
    expect(s.openCount).toBe(1)
  })

  it('accrual basis counts non-draft invoices by invoice date', () => {
    const s = summarize(
      { invoices: [inv({ status: 'finalized', date: '2026-06-10', paidAt: null })],
        expenses: [], fixedCosts: [] },
      { from: '2026-06', to: '2026-06' }, 'accrual', '2026-06',
    )
    expect(s.revenue).toBe(1000)
  })

  it('tracks fixed costs separately from variable expenses', () => {
    const s = summarize(
      { invoices: [], expenses: [exp({ gross: 119, vatRate: 19 })],
        fixedCosts: [{ id: 1, name: 'Miete', category: '', gross: 800, vatRate: 0,
          interval: 'monthly', startDate: '2026-01-01', endDate: null, active: true, note: '' }] },
      { from: '2026-06', to: '2026-06' }, 'cash', '2026-06',
    )
    expect(s.expenses).toBe(100) // variable only (119 gross @19% -> 100 net)
    expect(s.fixedCosts).toBe(800) // fixed costs split out
    expect(s.profit).toBe(-900) // 0 revenue - 100 - 800
    expect(s.monthly).toHaveLength(1)
    expect(s.monthly[0]).toEqual({ month: '2026-06', revenue: 0, expenses: 100, fixedCosts: 800, profit: -900 })
  })
})
