import { describe, it, expect } from 'vitest'
import {
  monthOf, monthIndex, monthFromIndex, addMonths, monthsBetween, rangeFor, inRange
} from '@shared/period'

describe('period helpers', () => {
  it('monthOf takes the YYYY-MM prefix', () => {
    expect(monthOf('2026-06-14')).toBe('2026-06')
    expect(monthOf('2026-06-14T10:00:00Z')).toBe('2026-06')
  })

  it('addMonths crosses year boundaries both ways', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02')
    expect(addMonths('2026-02', -3)).toBe('2025-11')
  })

  it('monthFromIndex is the inverse of monthIndex', () => {
    expect(monthFromIndex(monthIndex('2026-06'))).toBe('2026-06')
  })

  it('monthsBetween is inclusive', () => {
    expect(monthsBetween('2026-05', '2026-08')).toEqual(['2026-05', '2026-06', '2026-07', '2026-08'])
  })

  it('rangeFor builds month/quarter/year/all bounds', () => {
    expect(rangeFor('month', '2026-06')).toEqual({ from: '2026-06', to: '2026-06' })
    expect(rangeFor('quarter', '2026-05')).toEqual({ from: '2026-04', to: '2026-06' })
    expect(rangeFor('year', '2026-08')).toEqual({ from: '2026-01', to: '2026-12' })
    expect(rangeFor('all', '2026-06')).toEqual({ from: '0000-01', to: '9999-12' })
  })

  it('inRange uses inclusive string comparison', () => {
    expect(inRange('2026-06', { from: '2026-04', to: '2026-06' })).toBe(true)
    expect(inRange('2026-07', { from: '2026-04', to: '2026-06' })).toBe(false)
  })
})
