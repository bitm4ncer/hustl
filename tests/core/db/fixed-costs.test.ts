import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { applyMigrations } from '../../../src/core/db/migrations'
import {
  createFixedCost, listFixedCosts, updateFixedCost, deleteFixedCost,
  type FixedCostInput,
} from '../../../src/core/db/fixed-costs'

const input = (over: Partial<FixedCostInput> = {}): FixedCostInput => ({
  name: 'Miete', category: 'Büro', gross: 800, vatRate: 0,
  interval: 'monthly', startDate: '2026-01-01', endDate: null, active: true, note: '', ...over,
})

describe('fixed costs db', () => {
  it('creates and lists a fixed cost with boolean active mapping', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    createFixedCost(db, input())
    const list = listFixedCosts(db)
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Miete')
    expect(list[0].active).toBe(true)
    expect(list[0].interval).toBe('monthly')
  })

  it('updates and deletes', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const id = createFixedCost(db, input())
    updateFixedCost(db, id, input({ name: 'KSK', gross: 210, active: false }))
    const updated = listFixedCosts(db)[0]
    expect(updated.name).toBe('KSK')
    expect(updated.active).toBe(false)
    deleteFixedCost(db, id)
    expect(listFixedCosts(db)).toHaveLength(0)
  })
})
