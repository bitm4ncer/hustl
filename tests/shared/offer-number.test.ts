import { describe, it, expect } from 'vitest'
import { formatOfferNumber, nextOfferNumber } from '../../src/shared/offer-number'

describe('offer numbers', () => {
  it('formats with prefix, year and zero-padded counter', () => {
    expect(formatOfferNumber('ANG', 2026, 7)).toBe('ANG-2026-007')
  })
  it('continues the counter within the same year', () => {
    expect(nextOfferNumber({ year: 2026, lastNumber: 4 }, 2026, 'ANG'))
      .toEqual({ year: 2026, counter: 5, value: 'ANG-2026-005' })
  })
  it('restarts the counter in a new year', () => {
    expect(nextOfferNumber({ year: 2025, lastNumber: 42 }, 2026, 'ANG'))
      .toEqual({ year: 2026, counter: 1, value: 'ANG-2026-001' })
  })
})
