import type { FinancePeriodKind } from './types'

export interface MonthRange {
  from: string // 'YYYY-MM' inclusive
  to: string // 'YYYY-MM' inclusive
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7)
}

export function monthIndex(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return y * 12 + (m - 1)
}

export function monthFromIndex(idx: number): string {
  const y = Math.floor(idx / 12)
  const m = (idx % 12) + 1
  return `${String(y).padStart(4, '0')}-${pad2(m)}`
}

export function addMonths(month: string, n: number): string {
  return monthFromIndex(monthIndex(month) + n)
}

export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let i = monthIndex(from); i <= monthIndex(to); i++) out.push(monthFromIndex(i))
  return out
}

export function rangeFor(kind: FinancePeriodKind, anchorMonth: string): MonthRange {
  const [y, m] = anchorMonth.split('-').map(Number)
  switch (kind) {
    case 'month':
      return { from: anchorMonth, to: anchorMonth }
    case 'quarter': {
      const startM = Math.floor((m - 1) / 3) * 3 + 1
      return { from: `${y}-${pad2(startM)}`, to: `${y}-${pad2(startM + 2)}` }
    }
    case 'year':
      return { from: `${y}-01`, to: `${y}-12` }
    case 'all':
    default:
      return { from: '0000-01', to: '9999-12' }
  }
}

export function inRange(month: string, range: MonthRange): boolean {
  return month >= range.from && month <= range.to
}
