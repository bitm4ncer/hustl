import { describe, it, expect } from 'vitest'
import { offerItemAmount, computeOfferTotals } from '../../src/shared/offer-money'

const item = (over: Partial<Parameters<typeof computeOfferTotals>[0][number]> = {}) => ({
  quantity: null,
  unit: 'Psch',
  unitPrice: null,
  fixPrice: 1000,
  optional: false,
  recurring: false,
  ...over,
})

describe('offerItemAmount', () => {
  it('fixPrice wins over quantity×unitPrice', () => {
    expect(offerItemAmount({ fixPrice: 500, quantity: 10, unitPrice: 90 })).toBe(500)
  })
  it('falls back to quantity×unitPrice', () => {
    expect(offerItemAmount({ fixPrice: null, quantity: 10, unitPrice: 90 })).toBe(900)
  })
})

describe('computeOfferTotals', () => {
  it('regular tax (19%) over base items, ignores optional & recurring in total', () => {
    const t = computeOfferTotals(
      [item({ fixPrice: 1000 }), item({ fixPrice: 500, optional: true }), item({ fixPrice: 30, recurring: true })],
      { taxMode: 'regular', discountKind: 'none', discountValue: 0 },
    )
    expect(t.subtotal).toBe(1000)
    expect(t.optionalTotal).toBe(500)
    expect(t.recurringTotal).toBe(30)
    expect(t.taxRate).toBe(0.19)
    expect(t.taxAmount).toBe(190)
    expect(t.total).toBe(1190)
  })

  it('percent discount reduces base before tax', () => {
    const t = computeOfferTotals([item({ fixPrice: 1000 })], {
      taxMode: 'regular', discountKind: 'percent', discountValue: 10,
    })
    expect(t.discountAmount).toBe(100)
    expect(t.taxAmount).toBe(171) // 900 * 0.19
    expect(t.total).toBe(1071)
  })

  it('fixed discount is capped at base', () => {
    const t = computeOfferTotals([item({ fixPrice: 800 })], {
      taxMode: 'kleinunternehmer', discountKind: 'fixed', discountValue: 1000,
    })
    expect(t.discountAmount).toBe(800)
    expect(t.taxRate).toBe(0)
    expect(t.total).toBe(0)
  })

  it('kleinunternehmer & reverse_charge are tax-free', () => {
    for (const mode of ['kleinunternehmer', 'reverse_charge'] as const) {
      const t = computeOfferTotals([item({ fixPrice: 1000 })], { taxMode: mode, discountKind: 'none', discountValue: 0 })
      expect(t.taxRate).toBe(0)
      expect(t.total).toBe(1000)
    }
  })
})
