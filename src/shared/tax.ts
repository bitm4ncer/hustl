import type { OfferTaxMode, TaxMode } from './types'

const TAX_MODES: TaxMode[] = [
  'standard',
  'reduced',
  'zero',
  'reverse_charge',
  'small_business',
  'exempt',
]

export function normalizeTaxMode(value: unknown, noTax = false): TaxMode {
  return TAX_MODES.includes(value as TaxMode) ? (value as TaxMode) : noTax ? 'small_business' : 'standard'
}

/** Offers use the older, German-specific mode names. */
export function taxModeFromOffer(mode: OfferTaxMode): TaxMode {
  if (mode === 'kleinunternehmer') return 'small_business'
  if (mode === 'reverse_charge') return 'reverse_charge'
  return 'standard'
}

export function isZeroRated(mode: TaxMode): boolean {
  return mode !== 'standard' && mode !== 'reduced'
}

/** EN 16931 VAT category code for a document tax mode. */
export function taxCategoryCode(mode: TaxMode): 'S' | 'Z' | 'E' | 'AE' {
  if (mode === 'reverse_charge') return 'AE'
  if (mode === 'zero') return 'Z'
  if (mode === 'small_business' || mode === 'exempt') return 'E'
  return 'S'
}

/** Old invoices only have the two booleans; derive the mode for them. */
export function invoiceTaxMode(invoice: {
  taxMode?: TaxMode | null
  reverseCharge?: boolean
  noTax?: boolean
}): TaxMode {
  if (invoice.taxMode) return invoice.taxMode
  if (invoice.reverseCharge) return 'reverse_charge'
  if (invoice.noTax) return 'small_business'
  return 'standard'
}
