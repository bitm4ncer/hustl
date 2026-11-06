import type { TaxMode } from './types'

export function itemAmount(i: {
  fixPrice: number | null
  quantity: number | null
  unitPrice: number | null
}): number {
  if (i.fixPrice !== null && i.fixPrice !== undefined) return i.fixPrice
  return (i.quantity ?? 0) * (i.unitPrice ?? 0)
}

export interface Totals {
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  reverseCharge: boolean
  noTax: boolean
  taxMode: TaxMode
}

export const round2 = (n: number): number => Math.round(n * 100) / 100

/** Currencies with a non-2-decimal minor unit. */
const CURRENCY_DECIMALS: Record<string, number> = {
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  UYI: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
}

export function currencyDecimals(currency: string): number {
  return CURRENCY_DECIMALS[(currency || 'EUR').toUpperCase()] ?? 2
}

/** Round to the currency's minor unit (JPY 0, EUR 2, KWD 3, …). */
export function roundMoney(amount: number, currency: string): number {
  const factor = 10 ** currencyDecimals(currency)
  return Math.round(amount * factor) / factor
}

export function computeTotals(
  amounts: number[],
  opts: { taxMode: TaxMode; taxRate: number; currency?: string },
): Totals {
  const currency = opts.currency || 'EUR'
  // Jede Zeile wird gerundet und die Summe aus den gerundeten Zeilen gebildet.
  // Sonst addiert sich das PDF sichtbar falsch (13,13 + 13,13 ≠ 26,25) und die
  // E-Rechnung verletzt EN16931 BR-CO-10.
  const subtotal = roundMoney(
    amounts.reduce((s, a) => s + roundMoney(a, currency), 0),
    currency,
  )
  const rate =
    opts.taxMode === 'standard' || opts.taxMode === 'reduced' ? opts.taxRate || 0 : 0
  const taxAmount = roundMoney(subtotal * rate, currency)
  return {
    subtotal,
    taxRate: rate,
    taxAmount,
    total: roundMoney(subtotal + taxAmount, currency),
    // §19 (kein Steuerausweis) ist NICHT Reverse Charge — die beiden dürfen
    // nicht gekoppelt werden, sonst exportiert die E-Rechnung den falschen
    // Steuerkategorie-Code (AE statt E).
    reverseCharge: opts.taxMode === 'reverse_charge',
    noTax: opts.taxMode === 'small_business' || opts.taxMode === 'exempt',
    taxMode: opts.taxMode,
  }
}

export function formatCurrency(
  amount: number,
  currency: string,
  locale = 'de-DE',
): string {
  const code = (currency || 'EUR').toUpperCase()
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    currencyDisplay: code === 'EUR' ? 'symbol' : 'code',
    minimumFractionDigits: currencyDecimals(code),
    maximumFractionDigits: currencyDecimals(code),
  }).format(amount)
}

export function formatEUR(amount: number): string {
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDateLocale(isoDate: string, locale = 'de-DE'): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return isoDate
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(y, m - 1, d))
}

export function formatDateDE(isoDate: string): string {
  return formatDateLocale(isoDate, 'de-DE')
}
