import type { DocumentLanguage } from '@shared/types'

export const CURRENCIES = [
  'EUR',
  'USD',
  'GBP',
  'CHF',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'CZK',
  'CAD',
  'AUD',
  'JPY',
] as const

export const DOCUMENT_LANGUAGES: Array<{ value: DocumentLanguage; label: string }> = [
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
]
