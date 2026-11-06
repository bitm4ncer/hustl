import { describe, it, expect } from 'vitest'
import { parseEcbCsv, rateOn, convertToEur, looksPlausible } from '../../../src/core/expense/fx'

function mkRates(usdFor: (i: number) => number): { dates: string[]; rates: Record<string, { USD: number }> } {
  const dates: string[] = []
  const rates: Record<string, { USD: number }> = {}
  for (let i = 0; i < 120; i++) {
    const d = `${2015 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`
    dates.push(d)
    rates[d] = { USD: usdFor(i) }
  }
  return { dates, rates }
}

const csv = [
  'Date,USD,JPY,GBP,CHF,',
  '2026-02-24,1.0500,160,0.8400,0.9500,',
  '2026-02-20,1.1000,160,0.8000,0.9000,',
  '2026-01-07,1.0000,160,0.8000,0.9000,',
].join('\n')

describe('fx', () => {
  it('parses the ECB csv into tracked currencies, sorted by date', () => {
    const fx = parseEcbCsv(csv)
    expect(fx.dates).toEqual(['2026-01-07', '2026-02-20', '2026-02-24'])
    expect(fx.rates['2026-02-24'].USD).toBe(1.05)
  })

  it('rateOn uses the nearest date on or before, else earliest', () => {
    const fx = parseEcbCsv(csv)
    expect(rateOn(fx, '2026-02-24', 'USD')).toBe(1.05)
    expect(rateOn(fx, '2026-02-22', 'USD')).toBe(1.1) // no rate on 22nd -> 20th
    expect(rateOn(fx, '2025-01-01', 'USD')).toBe(1.0) // before all -> earliest
  })

  it('convertToEur divides by the per-EUR rate (EUR passes through)', () => {
    const fx = parseEcbCsv(csv)
    expect(convertToEur(10, 'USD', '2026-02-24', fx)).toBe(9.52) // 10 / 1.05
    expect(convertToEur(9.99, 'EUR', '2026-02-24', fx)).toBe(9.99)
  })

  it('convertToEur uses fallback rates when the table is empty', () => {
    const empty = { dates: [], rates: {} }
    expect(convertToEur(10, 'USD', '2026-02-24', empty)).toBe(9.26) // 10 / 1.08
  })

  it('looksPlausible rejects garbled/uniform data, accepts real-looking data', () => {
    expect(looksPlausible(mkRates(() => 2))).toBe(false) // uniform -> garbage
    expect(looksPlausible(mkRates((i) => 1.0 + (i % 50) / 250))).toBe(true) // varied, in band
    expect(looksPlausible({ dates: [], rates: {} })).toBe(false)
  })
})
