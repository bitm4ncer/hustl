import type { DatabaseSync } from 'node:sqlite'
import type { Todo, TodoCategoryRow, TodoGroup, TodoResetRule, TodoStats } from '@shared/types'

const pad = (n: number): string => String(n).padStart(2, '0')
const isoDate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/**
 * Beginn der laufenden Periode: der letzte Zurücksetz-Tag (Wochentag oder
 * Monatstag) um 00:00. Alles, was davor erledigt wurde, gilt als veraltet.
 */
export function resetBoundary(rule: TodoResetRule, day: number, now: Date): string | null {
  if (rule === 'none') return null
  if (rule === 'daily') return isoDate(now)
  if (rule === 'weekly') {
    const diff = (now.getDay() - day + 7) % 7
    const b = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    b.setDate(b.getDate() - diff)
    return isoDate(b)
  }
  const dom = Math.min(Math.max(day, 1), 28)
  const b = new Date(now.getFullYear(), now.getMonth(), dom)
  if (now.getDate() < dom) b.setMonth(b.getMonth() - 1)
  return isoDate(b)
}

/**
 * Setzt erledigte To-Dos zurück, deren Kategorie eine Periode hat und deren
 * Erledigt-Datum vor dem Beginn der aktuellen Periode liegt. Vorher wird
 * festgehalten, ob die abgelaufene Periode vollständig war (für Streaks).
 */
function resetCategories(db: DatabaseSync): void {
  const categories = db
    .prepare(
      "SELECT id, reset_rule, reset_day FROM todo_categories WHERE reset_rule != 'none' AND group_name != 'planner'",
    )
    .all() as Array<{ id: number; reset_rule: TodoResetRule; reset_day: number | null }>
  const now = new Date()
  const countStmt = db.prepare(
    'SELECT COUNT(*) AS total, COALESCE(SUM(done), 0) AS done FROM todos WHERE category_id = ?',
  )
  const record = db.prepare(
    `INSERT OR IGNORE INTO todo_periods (category_id, period_start, total, done, completed)
     VALUES (?, ?, ?, ?, ?)`,
  )
  const update = db.prepare(
    'UPDATE todos SET done = 0, done_at = NULL WHERE done = 1 AND category_id = ? AND (done_at IS NULL OR done_at < ?)',
  )

  for (const c of categories) {
    const boundary = resetBoundary(c.reset_rule, c.reset_day ?? 1, now)
    if (!boundary) continue
    const stale = db
      .prepare(
        'SELECT COUNT(*) AS n FROM todos WHERE done = 1 AND category_id = ? AND (done_at IS NULL OR done_at < ?)',
      )
      .get(c.id, boundary) as { n: number }
    if (stale.n > 0) {
      const { total, done } = countStmt.get(c.id) as { total: number; done: number }
      if (total > 0) {
        record.run(c.id, boundary, total, done, done >= total ? 1 : 0)
      }
      update.run(c.id, boundary)
    }
  }
}

/** Naechster Werktag: Freitag springt auf Montag, Wochenende wird uebersprungen. */
export function nextPlannerDay(isoDay: string): string {
  const d = new Date(`${isoDay}T12:00:00`)
  do {
    d.setDate(d.getDate() + 1)
  } while (d.getDay() === 0 || d.getDay() === 6)
  return isoDate(d)
}

/**
 * Offene Planer-Eintraege wandern Tag fuer Tag weiter, bis sie in der
 * Gegenwart ankommen. Freitag -> Montag, Wochenende wird uebersprungen.
 */
export function rolloverPlanner(db: DatabaseSync, now: Date = new Date()): number {
  const today = isoDate(now)
  const rows = db
    .prepare(
      `SELECT id, date FROM todos
       WHERE done = 0 AND date IS NOT NULL AND date < ?
         AND category_id IN (SELECT id FROM todo_categories WHERE group_name = 'planner')`,
    )
    .all(today) as Array<{ id: number; date: string }>
  const update = db.prepare('UPDATE todos SET date = ? WHERE id = ?')
  for (const r of rows) {
    let target = r.date
    while (target < today) target = nextPlannerDay(target)
    update.run(target, r.id)
  }
  return rows.length
}
export function listTodoCategories(db: DatabaseSync): TodoCategoryRow[] {
  const rows = db
    .prepare(
      'SELECT id, name, group_name, reset_rule, reset_day, position FROM todo_categories ORDER BY position, id',
    )
    .all() as Array<{
    id: number
    name: string
    group_name: TodoGroup
    reset_rule: TodoResetRule
    reset_day: number | null
    position: number
  }>
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    group: r.group_name,
    resetRule: r.reset_rule,
    resetDay: r.reset_day,
    position: r.position,
  }))
}

export function createTodoCategory(
  db: DatabaseSync,
  input: { name: string; resetRule: TodoResetRule; resetDay?: number | null; group?: TodoGroup },
): number {
  const name = input.name.trim()
  if (!name) throw new Error('Eine Kategorie braucht einen Namen.')
  const next = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM todo_categories').get() as {
    p: number
  }
  const day =
    input.resetRule === 'none' || input.resetRule === 'daily' ? null : (input.resetDay ?? 1)
  const info = db
    .prepare(
      'INSERT INTO todo_categories (name, weekly, reset_rule, reset_day, group_name, position) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(
      name,
      input.resetRule === 'weekly' ? 1 : 0,
      input.resetRule,
      day,
      input.group ?? 'list',
      next.p,
    )
  return Number(info.lastInsertRowid)
}

/** Ändert die Zurücksetz-Regel einer bestehenden Kategorie. */
export function setCategoryReset(
  db: DatabaseSync,
  id: number,
  rule: TodoResetRule,
  day: number | null,
): void {
  db.prepare('UPDATE todo_categories SET reset_rule = ?, reset_day = ?, weekly = ? WHERE id = ?').run(
    rule,
    rule === 'none' || rule === 'daily' ? null : (day ?? 1),
    rule === 'weekly' ? 1 : 0,
    id,
  )
}

/** Löscht die Kategorie samt ihrer To-Dos (die UI fragt vorher nach). */
export function deleteTodoCategory(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM todos WHERE category_id = ?').run(id)
  db.prepare('DELETE FROM todo_periods WHERE category_id = ?').run(id)
  db.prepare('DELETE FROM todo_categories WHERE id = ?').run(id)
}

/** Verschiebt eine Kategorie um eine Position nach oben (-1) oder unten (+1). */
export function moveTodoCategory(db: DatabaseSync, id: number, delta: number): void {
  const rows = db
    .prepare('SELECT id, position FROM todo_categories ORDER BY position, id')
    .all() as Array<{ id: number; position: number }>
  const index = rows.findIndex((r) => r.id === id)
  const target = index + delta
  if (index === -1 || target < 0 || target >= rows.length) return
  const a = rows[index]
  const b = rows[target]
  const update = db.prepare('UPDATE todo_categories SET position = ? WHERE id = ?')
  update.run(b.position, a.id)
  update.run(a.position, b.id)
}

export function listTodos(db: DatabaseSync): Todo[] {
  resetCategories(db)
  rolloverPlanner(db)
  const rows = db
    .prepare(
      `SELECT id, title, notes, category_id, done, done_at, done_ts, created_at, date, position
       FROM todos ORDER BY position, id`,
    )
    .all() as Array<{
    id: number
    title: string
    notes: string | null
    category_id: number
    done: number
    done_at: string | null
    done_ts: string | null
    created_at: string | null
    date: string | null
    position: number
  }>
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    notes: r.notes,
    categoryId: r.category_id,
    done: r.done === 1,
    doneAt: r.done_at,
    doneTs: r.done_ts,
    createdAt: r.created_at,
    date: r.date,
    position: r.position,
  }))
}

export function createTodo(
  db: DatabaseSync,
  input: { title: string; categoryId: number; date?: string | null },
): number {
  const title = input.title.trim()
  if (!title) throw new Error('Ein Planer-Eintrag braucht einen Text.')
  const next = db
    .prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM todos WHERE category_id = ?')
    .get(input.categoryId) as { p: number }
  const info = db
    .prepare('INSERT INTO todos (title, category_id, date, position) VALUES (?, ?, ?, ?)')
    .run(title, input.categoryId, input.date ?? null, next.p)
  return Number(info.lastInsertRowid)
}

export function moveTodoToDate(db: DatabaseSync, id: number, date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Ungültiges Datum.')
  db.prepare('UPDATE todos SET date = ? WHERE id = ?').run(date, id)
}

/** Notiz eines Eintrags setzen (leer = keine Notiz). */
export function setTodoNotes(db: DatabaseSync, id: number, notes: string | null): void {
  const clean = notes?.trim() ?? ''
  db.prepare('UPDATE todos SET notes = ? WHERE id = ?').run(clean || null, id)
}

export function setTodoDone(db: DatabaseSync, id: number, done: boolean): void {
  db.prepare(
    `UPDATE todos SET done = ?,
       done_at = CASE WHEN ? = 1 THEN date('now','localtime') ELSE NULL END,
       done_ts = CASE WHEN ? = 1 THEN datetime('now','localtime') ELSE NULL END
     WHERE id = ?`,
  ).run(done ? 1 : 0, done ? 1 : 0, done ? 1 : 0, id)
}

export function renameTodo(db: DatabaseSync, id: number, title: string): void {
  const clean = title.trim()
  if (!clean) throw new Error('Ein Planer-Eintrag braucht einen Text.')
  db.prepare('UPDATE todos SET title = ? WHERE id = ?').run(clean, id)
}

/** Leert eine Liste: alle Einträge der Kategorie löschen, Kategorie bleibt. */
export function clearTodoCategory(db: DatabaseSync, categoryId: number): void {
  db.prepare('DELETE FROM todos WHERE category_id = ?').run(categoryId)
}

/** Verschiebt einen Eintrag innerhalb seiner Kategorie nach oben/unten. */
export function moveTodo(db: DatabaseSync, id: number, delta: number): void {
  const todo = db.prepare('SELECT id, category_id FROM todos WHERE id = ?').get(id) as
    | { id: number; category_id: number }
    | undefined
  if (!todo) return
  const rows = db
    .prepare('SELECT id, position FROM todos WHERE category_id = ? ORDER BY position, id')
    .all(todo.category_id) as Array<{ id: number; position: number }>
  const i = rows.findIndex((r) => r.id === id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= rows.length) return
  const update = db.prepare('UPDATE todos SET position = ? WHERE id = ?')
  update.run(rows[j].position, rows[i].id)
  update.run(rows[i].position, rows[j].id)
}

export function deleteTodo(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM todos WHERE id = ?').run(id)
}

/** Streak und Verlauf der regelmäßigen Kategorien. */
export function listTodoStats(db: DatabaseSync): TodoStats[] {
  const categories = listTodoCategories(db).filter((c) => c.group === 'regular')
  const stmt = db.prepare(
    'SELECT period_start, total, done, completed FROM todo_periods WHERE category_id = ? ORDER BY period_start DESC LIMIT 8',
  )
  return categories.map((c) => {
    const rows = stmt.all(c.id) as Array<{
      period_start: string
      total: number
      done: number
      completed: number
    }>
    let streak = 0
    for (const r of rows) {
      if (r.completed === 1) streak += 1
      else break
    }
    let best = 0
    let run = 0
    for (const r of [...rows].reverse()) {
      if (r.completed === 1) {
        run += 1
        best = Math.max(best, run)
      } else {
        run = 0
      }
    }
    return {
      categoryId: c.id,
      name: c.name,
      streak,
      best: Math.max(best, streak),
      periods: [...rows]
        .reverse()
        .map((r) => ({
          start: r.period_start,
          total: r.total,
          done: r.done,
          completed: r.completed === 1,
        })),
    }
  })
}
