import { getLanguage } from './index'
import { currencyDecimals } from '@shared/money'

export function currentLocale(): string {
  return getLanguage() === 'de' ? 'de-DE' : 'en-GB'
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat(currentLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/** Currency-aware amount for invoice/offer UI. EUR keeps the € symbol; other
 *  currencies use their ISO code so $/¥ are not ambiguous. */
export function formatCurrency(amount: number, currency: string): string {
  const code = (currency || 'EUR').toUpperCase()
  const decimals = currencyDecimals(code)
  return new Intl.NumberFormat(currentLocale(), {
    style: 'currency',
    currency: code,
    currencyDisplay: code === 'EUR' ? 'symbol' : 'code',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount)
}

export function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(currentLocale(), { maximumFractionDigits }).format(value)
}

export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat(currentLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

/** Long month + year, e.g. "Oktober 2026" / "October 2026". */
export function formatMonth(month: string): string {
  const [year, index] = month.split('-').map(Number)
  return new Intl.DateTimeFormat(currentLocale(), {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, index - 1, 1))
}

/** Short month + year used by the timeline header. */
export function formatMonthShort(date: Date): string {
  return new Intl.DateTimeFormat(currentLocale(), {
    month: 'short',
    year: 'numeric',
  }).format(date)
}

/** Short month tick used by the finance charts. */
export function formatMonthTick(month: string): string {
  const [year, index] = month.split('-').map(Number)
  return formatMonthTickDate(new Date(year, index - 1, 1))
}

export function formatMonthTickDate(date: Date): string {
  return new Intl.DateTimeFormat(currentLocale(), { month: 'short' })
    .format(date)
    .replace(/\.$/, '')
}

export function formatMonthTickUtc(ms: number): string {
  return new Intl.DateTimeFormat(currentLocale(), { month: 'short', timeZone: 'UTC' })
    .format(new Date(ms))
    .replace(/\.$/, '')
}

export function weekdayName(dayIndex: number): string {
  // 7 January 2024 was a Sunday, so 7 + dayIndex maps 0→Sunday … 6→Saturday.
  return new Intl.DateTimeFormat(currentLocale(), { weekday: 'long' }).format(
    new Date(2024, 0, 7 + dayIndex),
  )
}

export function weekdayShort(date: Date): string {
  return new Intl.DateTimeFormat(currentLocale(), { weekday: 'short' })
    .format(date)
    .replace(/\.$/, '')
}

/** "Montag, 6. November" / "Monday, 6 November". */
export function formatDayLabel(date: Date): string {
  return new Intl.DateTimeFormat(currentLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date)
}

/**
 * The four seeded categories keep stable English names in the database.
 * Their labels follow the UI language; user-renamed categories pass through.
 */
const SEEDED_TODO_NAMES: Record<string, Record<'de' | 'en', string>> = {
  Shopping: { de: 'Einkäufe', en: 'Shopping' },
  Groceries: { de: 'Lebensmittel', en: 'Groceries' },
  Tasks: { de: 'Allgemein', en: 'General' },
  Weeklys: { de: 'Wöchentlich', en: 'Weekly' },
  Daily: { de: 'Täglich', en: 'Daily' },
}

export function todoCategoryName(name: string): string {
  const entry = SEEDED_TODO_NAMES[name]
  return entry ? entry[getLanguage()] : name
}
