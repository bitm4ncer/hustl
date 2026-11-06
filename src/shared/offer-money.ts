import { roundMoney } from './money'
import type { OfferTaxMode, OfferDiscountKind } from './types'

export function offerItemAmount(i: {
  fixPrice: number | null
  quantity: number | null
  unitPrice: number | null
}): number {
  if (i.fixPrice !== null && i.fixPrice !== undefined) return i.fixPrice
  return (i.quantity ?? 0) * (i.unitPrice ?? 0)
}

export interface OfferTotals {
  subtotal: number // Basissumme (einmalig, nicht-optional) VOR Rabatt
  discountAmount: number
  taxRate: number
  taxAmount: number
  total: number
  recurringTotal: number
  optionalTotal: number
}

interface OfferLine {
  quantity: number | null
  unitPrice: number | null
  fixPrice: number | null
  optional: boolean
  recurring: boolean
}

export function computeOfferTotals(
  items: OfferLine[],
  opts: {
    taxMode: OfferTaxMode
    taxRate?: number
    currency?: string
    discountKind: OfferDiscountKind
    discountValue: number
  },
): OfferTotals {
  const currency = opts.currency || 'EUR'
  let base = 0
  let recurringTotal = 0
  let optionalTotal = 0
  for (const it of items) {
    const amt = offerItemAmount(it)
    if (it.recurring) recurringTotal += amt
    else if (it.optional) optionalTotal += amt
    else base += amt
  }
  base = roundMoney(base, currency)
  recurringTotal = roundMoney(recurringTotal, currency)
  optionalTotal = roundMoney(optionalTotal, currency)

  let discountAmount = 0
  if (opts.discountKind === 'percent') discountAmount = roundMoney(base * (opts.discountValue / 100), currency)
  else if (opts.discountKind === 'fixed') discountAmount = Math.min(roundMoney(opts.discountValue, currency), base)

  const net = roundMoney(base - discountAmount, currency)
  const taxRate = opts.taxMode === 'regular' ? (opts.taxRate ?? 0.19) : 0
  const taxAmount = roundMoney(net * taxRate, currency)
  return {
    subtotal: base,
    discountAmount,
    taxRate,
    taxAmount,
    total: roundMoney(net + taxAmount, currency),
    recurringTotal,
    optionalTotal,
  }
}
