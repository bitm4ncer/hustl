import { describe, expect, it } from 'vitest'
import {
  itemAmount,
  computeTotals,
  formatEUR,
  formatDateDE,
  currencyDecimals,
  roundMoney,
  formatCurrency,
} from '@shared/money'

describe('itemAmount', () => {
  it('returns fixPrice when non-null', () => {
    expect(itemAmount({ fixPrice: 500, quantity: 10, unitPrice: 80 })).toBe(500)
  })

  it('computes quantity * unitPrice when fixPrice is null', () => {
    expect(itemAmount({ fixPrice: null, quantity: 10, unitPrice: 80 })).toBe(800)
  })

  it('treats fixPrice 0 as a real fixed price, not a falsy fallback', () => {
    expect(itemAmount({ fixPrice: 0, quantity: 10, unitPrice: 80 })).toBe(0)
  })

  it('treats null quantity/unitPrice as 0', () => {
    expect(itemAmount({ fixPrice: null, quantity: null, unitPrice: null })).toBe(0)
    expect(itemAmount({ fixPrice: null, quantity: 5, unitPrice: null })).toBe(0)
  })
})

describe('computeTotals', () => {
  it('applies 19% VAT when taxable', () => {
    expect(computeTotals([800, 200], { taxMode: 'standard', taxRate: 0.19 })).toEqual({
      subtotal: 1000,
      taxRate: 0.19,
      taxAmount: 190,
      total: 1190,
      reverseCharge: false,
      noTax: false,
      taxMode: 'standard'
    })
  })

  it('applies no tax for §19 and does NOT mark it as reverse charge', () => {
    expect(computeTotals([800, 200], { taxMode: 'small_business', taxRate: 0 })).toEqual({
      subtotal: 1000,
      taxRate: 0,
      taxAmount: 0,
      total: 1000,
      reverseCharge: false,
      noTax: true,
      taxMode: 'small_business'
    })
  })

  it('marks reverse charge as such', () => {
    const t = computeTotals([1000], { taxMode: 'reverse_charge', taxRate: 0 })
    expect(t.reverseCharge).toBe(true)
    expect(t.noTax).toBe(false)
    expect(t.taxAmount).toBe(0)
  })

  it('rounds each line, so the printed lines add up to the subtotal', () => {
    const t = computeTotals([33.333, 33.333, 33.334], { taxMode: 'standard', taxRate: 0.19 })
    // 3 × 33,33 = 99,99 — genau das, was auf dem PDF steht.
    expect(t.subtotal).toBe(99.99)
    expect(t.taxAmount).toBe(19)
    expect(t.total).toBe(118.99)
  })
})

describe('formatEUR', () => {
  it('formats with German grouping and two decimals', () => {
    expect(formatEUR(1234.5)).toBe('1.234,50')
  })

  it('always shows two decimals', () => {
    expect(formatEUR(80)).toBe('80,00')
  })
})

describe('currency helpers', () => {
  it('uses the right number of decimals per currency', () => {
    expect(currencyDecimals('EUR')).toBe(2)
    expect(currencyDecimals('USD')).toBe(2)
    expect(currencyDecimals('JPY')).toBe(0)
    expect(currencyDecimals('KWD')).toBe(3)
  })

  it('rounds to the currency minor unit', () => {
    expect(roundMoney(1234.567, 'EUR')).toBe(1234.57)
    expect(roundMoney(1234.567, 'JPY')).toBe(1235)
    expect(roundMoney(1.23456, 'KWD')).toBe(1.235)
  })

  it('formats a foreign currency with its ISO code', () => {
    const text = formatCurrency(1234.5, 'USD', 'de-DE')
    expect(text).toContain('1.234,50')
    expect(text).toContain('USD')
  })
})

describe('formatDateDE', () => {
  it('converts ISO date to DD.MM.YYYY', () => {
    expect(formatDateDE('2026-06-14')).toBe('14.06.2026')
  })

  it('handles full ISO datetime strings', () => {
    expect(formatDateDE('2026-06-14T12:34:56.000Z')).toBe('14.06.2026')
  })
})
