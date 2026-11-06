import { describe, it, expect } from 'vitest'
import { projectHours } from '../../src/shared/project-hours'

describe('projectHours', () => {
  it('uses the project field when it is set', () => {
    expect(projectHours({ hours: 8, items: [{ hours: 3 }, { hours: 2 }] })).toBe(8)
  })

  it('falls back to the sum of the item hours', () => {
    expect(projectHours({ hours: null, items: [{ hours: 4 }, { hours: 3 }, { hours: 4 }] })).toBe(11)
  })

  it('keeps an explicit zero, it is not the same as an empty field', () => {
    expect(projectHours({ hours: 0, items: [{ hours: 5 }] })).toBe(0)
  })

  it('ignores items without hours', () => {
    expect(projectHours({ hours: null, items: [{ hours: null }, { hours: 2 }] })).toBe(2)
  })

  it('rounds the sum to cents so float noise does not leak into the price', () => {
    expect(projectHours({ hours: null, items: [{ hours: 0.1 }, { hours: 0.2 }] })).toBe(0.3)
  })

  it('returns null when neither the field nor any item carries hours', () => {
    expect(projectHours({ hours: null, items: [{ hours: null }] })).toBeNull()
    expect(projectHours({ hours: null, items: [] })).toBeNull()
  })
})
