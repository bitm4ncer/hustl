import type { DatabaseSync } from 'node:sqlite'

/** Nesting depth per connection. SQLite has no nested BEGIN, so an inner `tx`
 *  has to use a SAVEPOINT instead, otherwise composing two write helpers that
 *  each open their own transaction (e.g. createProject inside a conversion)
 *  fails with "cannot start a transaction within a transaction". */
const depth = new WeakMap<DatabaseSync, number>()

export function tx<T>(db: DatabaseSync, fn: () => T): T {
  const level = depth.get(db) ?? 0
  const point = `tx_${level}`
  db.exec(level === 0 ? 'BEGIN' : `SAVEPOINT ${point}`)
  depth.set(db, level + 1)
  try {
    const result = fn()
    db.exec(level === 0 ? 'COMMIT' : `RELEASE ${point}`)
    return result
  } catch (err) {
    // ROLLBACK TO only rewinds to the savepoint, it does not pop it. The
    // RELEASE afterwards does, so a failed inner tx leaves no dangling frame.
    db.exec(level === 0 ? 'ROLLBACK' : `ROLLBACK TO ${point}; RELEASE ${point}`)
    throw err
  } finally {
    depth.set(db, level)
  }
}
