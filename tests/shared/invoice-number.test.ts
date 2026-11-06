import { describe, expect, it } from 'vitest'
import { formatNumber, parseNumber, nextNumber } from '@shared/invoice-number'

describe('formatNumber', () => {
  it('zero-pads the counter to 3 digits', () => {
    expect(formatNumber(2026, 25)).toBe('2026025')
    expect(formatNumber(2026, 1)).toBe('2026001')
    expect(formatNumber(2026, 124)).toBe('2026124')
  })
})

describe('parseNumber', () => {
  it('splits a formatted number into year and counter', () => {
    expect(parseNumber('2026024')).toEqual({ year: 2026, counter: 24 })
  })
})

describe('nextNumber', () => {
  it('increments the counter within the same year', () => {
    expect(nextNumber({ year: 2026, lastNumber: 24 }, 2026)).toEqual({
      year: 2026,
      counter: 25,
      value: '2026025'
    })
  })

  it('resets to 001 when the year changes', () => {
    expect(nextNumber({ year: 2026, lastNumber: 24 }, 2027)).toEqual({
      year: 2027,
      counter: 1,
      value: '2027001'
    })
  })
})
