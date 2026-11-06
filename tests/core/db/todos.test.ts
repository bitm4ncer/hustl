import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { applyMigrations } from '../../../src/core/db/migrations'
import {
  listTodos,
  createTodo,
  setTodoDone,
  deleteTodo,
  listTodoCategories,
  createTodoCategory,
  moveTodoCategory,
  deleteTodoCategory,
  resetBoundary,
  listTodoStats,
  clearTodoCategory,
  nextPlannerDay,
} from '../../../src/core/db/todos'

function db(): DatabaseSync {
  const d = new DatabaseSync(':memory:')
  applyMigrations(d)
  return d
}

const cat = (d: DatabaseSync, name: string): number =>
  listTodoCategories(d).find((c) => c.name === name)!.id

describe('todos', () => {
  it('legt die fuenf Standardkategorien an', () => {
    expect(listTodoCategories(db()).map((c) => c.name)).toEqual([
      'Shopping',
      'Groceries',
      'Tasks',
      'Daily',
      'Weeklys',
    ])
  })

  it('ordnet die Standardkategorien den Bereichen zu', () => {
    const groups = Object.fromEntries(listTodoCategories(db()).map((c) => [c.name, c.group]))
    expect(groups).toEqual({
      Shopping: 'list',
      Groceries: 'list',
      Tasks: 'planner',
      Daily: 'regular',
      Weeklys: 'regular',
    })
  })

  it('legt ein To-Do an und listet es', () => {
    const d = db()
    createTodo(d, { title: '  Pfanne  ', categoryId: cat(d, 'Shopping') })
    const all = listTodos(d)
    expect(all).toHaveLength(1)
    expect(all[0].title).toBe('Pfanne')
    expect(all[0].done).toBe(false)
  })

  it('leere Titel werden abgelehnt', () => {
    const d = db()
    expect(() => createTodo(d, { title: '   ', categoryId: cat(d, 'Tasks') })).toThrow()
  })

  it('setzt erledigt und wieder zurueck', () => {
    const d = db()
    const id = createTodo(d, { title: 'Butter', categoryId: cat(d, 'Groceries') })
    setTodoDone(d, id, true)
    expect(listTodos(d)[0].done).toBe(true)
    expect(listTodos(d)[0].doneAt).not.toBeNull()
    setTodoDone(d, id, false)
    expect(listTodos(d)[0].done).toBe(false)
    expect(listTodos(d)[0].doneAt).toBeNull()
  })

  it('setzt Weeklys in einer neuen Woche zurueck', () => {
    const d = db()
    const id = createTodo(d, { title: 'Joggen', categoryId: cat(d, 'Weeklys') })
    setTodoDone(d, id, true)
    d.prepare("UPDATE todos SET done_at = '2020-01-06' WHERE id = ?").run(id)
    expect(listTodos(d)[0].done).toBe(false)
    expect(listTodos(d)[0].doneAt).toBeNull()
  })

  it('laesst normale To-Dos erledigt', () => {
    const d = db()
    const id = createTodo(d, { title: 'Finanzamt anrufen', categoryId: cat(d, 'Tasks') })
    setTodoDone(d, id, true)
    d.prepare("UPDATE todos SET done_at = '2020-01-06' WHERE id = ?").run(id)
    expect(listTodos(d)[0].done).toBe(true)
  })

  it('loescht ein To-Do', () => {
    const d = db()
    const id = createTodo(d, { title: 'Löffel', categoryId: cat(d, 'Shopping') })
    deleteTodo(d, id)
    expect(listTodos(d)).toHaveLength(0)
  })

  it('legt eine Kategorie an und verschiebt sie nach oben', () => {
    const d = db()
    const id = createTodoCategory(d, { name: 'Reisen', resetRule: 'none' })
    expect(listTodoCategories(d).map((c) => c.name).at(-1)).toBe('Reisen')
    moveTodoCategory(d, id, -1)
    const names = listTodoCategories(d).map((c) => c.name)
    expect(names[names.length - 2]).toBe('Reisen')
    expect(names.at(-1)).toBe('Weeklys')
  })

  it('verschiebt nicht ueber die Raender hinaus', () => {
    const d = db()
    const first = listTodoCategories(d)[0]
    moveTodoCategory(d, first.id, -1)
    expect(listTodoCategories(d)[0].name).toBe('Shopping')
  })

  it('loescht eine Kategorie samt ihrer To-Dos', () => {
    const d = db()
    const id = createTodoCategory(d, { name: 'Temp', resetRule: 'none' })
    createTodo(d, { title: 'Weg damit', categoryId: id })
    deleteTodoCategory(d, id)
    expect(listTodoCategories(d).some((c) => c.id === id)).toBe(false)
    expect(listTodos(d)).toHaveLength(0)
  })
})

describe('resetBoundary', () => {
  it('wochentlich: letzter gewaehlter Wochentag', () => {
    // Mittwoch, 4. November 2026 -> Montag ist der 2.
    expect(resetBoundary('weekly', 1, new Date(2026, 10, 4))).toBe('2026-11-02')
    // Wochentag selbst: heute ist der Zuruecksetz-Tag.
    expect(resetBoundary('weekly', 3, new Date(2026, 10, 4))).toBe('2026-11-04')
    // Sonntag (0) liegt vor dem Mittwoch.
    expect(resetBoundary('weekly', 0, new Date(2026, 10, 4))).toBe('2026-11-01')
  })

  it('monatlich: letzter Monatstag', () => {
    expect(resetBoundary('monthly', 1, new Date(2026, 10, 4))).toBe('2026-11-01')
    expect(resetBoundary('monthly', 15, new Date(2026, 10, 4))).toBe('2026-10-15')
    expect(resetBoundary('monthly', 15, new Date(2026, 10, 20))).toBe('2026-11-15')
  })

  it('nie: kein Reset', () => {
    expect(resetBoundary('none', 1, new Date(2026, 10, 4))).toBeNull()
  })

  it('taeglich: heute', () => {
    expect(resetBoundary('daily', 1, new Date(2026, 10, 4, 15, 30))).toBe('2026-11-04')
  })
})

describe('Streaks', () => {
  it('haelt eine vollstaendige Periode fest und zaehlt den Streak', () => {
    const d = db()
    const daily = listTodoCategories(d).find((c) => c.name === 'Daily')!
    const a = createTodo(d, { title: 'Sport', categoryId: daily.id })
    const b = createTodo(d, { title: 'Lesen', categoryId: daily.id })
    setTodoDone(d, a, true)
    setTodoDone(d, b, true)
    // Beide gestern erledigt -> beim naechsten Lesen zurueckgesetzt und gezaehlt.
    d.prepare("UPDATE todos SET done_at = date('now','localtime','-1 day')").run()
    expect(listTodos(d).every((x) => !x.done)).toBe(true)
    const stat = listTodoStats(d).find((s) => s.categoryId === daily.id)!
    expect(stat.streak).toBe(1)
    expect(stat.periods.at(-1)?.completed).toBe(true)
    expect(stat.periods.at(-1)?.total).toBe(2)
  })

  it('bricht den Streak bei unvollstaendiger Periode', () => {
    const d = db()
    const daily = listTodoCategories(d).find((c) => c.name === 'Daily')!
    const a = createTodo(d, { title: 'Sport', categoryId: daily.id })
    createTodo(d, { title: 'Lesen', categoryId: daily.id })
    setTodoDone(d, a, true)
    d.prepare("UPDATE todos SET done_at = date('now','localtime','-1 day')").run()
    listTodos(d)
    const stat = listTodoStats(d).find((s) => s.categoryId === daily.id)!
    expect(stat.streak).toBe(0)
    expect(stat.periods.at(-1)?.completed).toBe(false)
  })
})

describe('Liste leeren', () => {
  it('loescht alle Eintraege, behaelt die Kategorie', () => {
    const d = db()
    const shopping = listTodoCategories(d).find((c) => c.name === 'Shopping')!
    createTodo(d, { title: 'Pfanne', categoryId: shopping.id })
    createTodo(d, { title: 'Loeffel', categoryId: shopping.id })
    clearTodoCategory(d, shopping.id)
    expect(listTodos(d)).toHaveLength(0)
    expect(listTodoCategories(d).some((c) => c.id === shopping.id)).toBe(true)
  })
})

describe('Planer-Rollover', () => {
  it('schiebt offene Eintraege tagweise nach vorn', () => {
    const d = db()
    const tasks = listTodoCategories(d).find((c) => c.name === 'Tasks')!
    const open = createTodo(d, { title: 'Alt', categoryId: tasks.id, date: '2026-10-28' })
    const done = createTodo(d, { title: 'Fertig', categoryId: tasks.id, date: '2026-10-28' })
    setTodoDone(d, done, true)
    const all = listTodos(d)
    const moved = all.find((x) => x.id === open)!.date!
    expect(moved >= '2026-11-01').toBe(true)
    expect(all.find((x) => x.id === done)!.date).toBe('2026-10-28')
  })

  it('springt von Freitag auf Montag', () => {
    expect(nextPlannerDay('2026-10-30')).toBe('2026-11-02')
    expect(nextPlannerDay('2026-10-29')).toBe('2026-10-30')
    expect(nextPlannerDay('2026-10-31')).toBe('2026-11-02')
  })

  it('laesst heutige Eintraege stehen', () => {
    const d = db()
    const tasks = listTodoCategories(d).find((c) => c.name === 'Tasks')!
    const today = new Date()
    const key =
      today.getFullYear() +
      '-' +
      String(today.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(today.getDate()).padStart(2, '0')
    const t1 = createTodo(d, { title: 'Heute', categoryId: tasks.id, date: key })
    expect(listTodos(d).find((x) => x.id === t1)!.date).toBe(key)
  })
})