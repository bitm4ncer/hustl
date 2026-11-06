import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { tx } from '../../../src/core/db/tx'

function db(): DatabaseSync {
  const d = new DatabaseSync(':memory:')
  d.exec('CREATE TABLE t (v TEXT)')
  return d
}

const rows = (d: DatabaseSync): string[] =>
  (d.prepare('SELECT v FROM t ORDER BY rowid').all() as { v: string }[]).map((r) => r.v)

const insert = (d: DatabaseSync, v: string): void => {
  d.prepare('INSERT INTO t (v) VALUES (?)').run(v)
}

describe('tx', () => {
  it('commits on success and returns the callback value', () => {
    const d = db()
    expect(tx(d, () => { insert(d, 'a'); return 42 })).toBe(42)
    expect(rows(d)).toEqual(['a'])
  })

  it('rolls back on throw and rethrows', () => {
    const d = db()
    expect(() => tx(d, () => { insert(d, 'a'); throw new Error('boom') })).toThrow('boom')
    expect(rows(d)).toEqual([])
  })

  it('nests: an inner tx commits with the outer one', () => {
    const d = db()
    tx(d, () => {
      insert(d, 'outer')
      tx(d, () => insert(d, 'inner'))
    })
    expect(rows(d)).toEqual(['outer', 'inner'])
  })

  it('nests: a failing inner tx rolls back only its own writes', () => {
    const d = db()
    tx(d, () => {
      insert(d, 'outer')
      try {
        tx(d, () => { insert(d, 'inner'); throw new Error('boom') })
      } catch {
        // swallowed on purpose: the outer transaction carries on
      }
      insert(d, 'after')
    })
    expect(rows(d)).toEqual(['outer', 'after'])
  })

  it('nests: a throwing inner tx takes the outer one down when uncaught', () => {
    const d = db()
    expect(() =>
      tx(d, () => {
        insert(d, 'outer')
        tx(d, () => { insert(d, 'inner'); throw new Error('boom') })
      }),
    ).toThrow('boom')
    expect(rows(d)).toEqual([])
  })

  it('leaves no open transaction behind, so the next tx can begin', () => {
    const d = db()
    expect(() => tx(d, () => { throw new Error('boom') })).toThrow()
    tx(d, () => insert(d, 'a'))
    expect(rows(d)).toEqual(['a'])
  })
})
