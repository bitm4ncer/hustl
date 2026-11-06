import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import type { Todo, TodoCategoryRow, TodoGroup, TodoResetRule, TodoStats } from '@shared/types'
import { api } from '../lib/api'
import { t } from '../i18n'
import { formatDayLabel, todoCategoryName, weekdayName, weekdayShort } from '../i18n/format'
import { Panel } from '../components/Panel'
import { Icon } from '../components/Icon'
import { Button } from '../components/Button'
import { SegmentedControl } from '../components/SegmentedControl'

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

const pad = (n: number): string => String(n).padStart(2, '0')
const iso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function resetLabel(category: TodoCategoryRow): string {
  if (category.resetRule === 'daily') return t.todos.resetDailyHint
  if (category.resetRule === 'weekly') {
    return t.todos.resetWeeklyOn(weekdayName(category.resetDay ?? 1))
  }
  if (category.resetRule === 'monthly') {
    return t.todos.resetMonthlyOn(category.resetDay ?? 1)
  }
  return ''
}

function Checkbox({ done, onClick }: { done: boolean; onClick: () => void }): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={done}
      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] transition-colors focus:outline-none focus-visible:[box-shadow:var(--focus)]"
      style={{
        border: done
          ? '1.5px solid var(--accent)'
          : '1.5px solid color-mix(in srgb, var(--text-muted) 45%, transparent)',
        background: done ? 'var(--accent)' : 'transparent',
      }}
    >
      {done && (
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="var(--accent-contrast)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </button>
  )
}

const pad2 = (n: number): string => String(n).padStart(2, '0')
const isoOf = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

/** Montag-basierte Woche um `base`, optional um Wochen verschoben. */
function weekDays(base: string, offsetWeeks: number): Date[] {
  const d = new Date(`${base}T12:00:00`)
  const dow = (d.getDay() + 6) % 7
  const monday = new Date(d)
  monday.setDate(d.getDate() - dow + offsetWeeks * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday)
    x.setDate(monday.getDate() + i)
    return x
  })
}

function Row({
  todo,
  editing,
  draft,
  onStartEdit,
  onDraft,
  onCommit,
  onCancel,
  onToggle,
  onDelete,
  onMove,
  onMoveTo,
  onNotes,
  onReorder,
}: {
  todo: Todo
  editing: boolean
  draft: string
  onStartEdit: () => void
  onDraft: (v: string) => void
  onCommit: () => void
  onCancel: () => void
  onToggle: () => void
  onDelete: () => void
  onMove?: () => void
  onMoveTo?: (date: string) => void
  onNotes?: (notes: string) => void
  onReorder?: (delta: number) => void
}): ReactElement {
  const [menu, setMenu] = useState(false)
  const base = todo.date ?? isoOf(new Date())
  return (
    <li>
      <div className="group flex items-start gap-3 px-4 py-2.5 md:px-5">
      <Checkbox done={todo.done} onClick={onToggle} />
      {editing ? (
        <div className="min-w-0 flex-1">
          <input
            autoFocus
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => {
              // Klick ins Notizfeld darf den Editor nicht schließen.
              if (e.relatedTarget?.getAttribute('data-note') === '1') return
              onCommit()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommit()
              if (e.key === 'Escape') onCancel()
            }}
            className="w-full rounded-[6px] bg-transparent px-1 text-[15px] leading-6 outline-none"
            style={{
              color: 'var(--text)',
              boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent)',
            }}
          />
          <input
            defaultValue={todo.notes ?? ''}
            data-note="1"
            placeholder={t.todos.notesPlaceholder}
            aria-label={t.todos.notesPlaceholder}
            onBlur={(e) => onNotes?.(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
            className="mt-1 w-full bg-transparent px-1 text-xs outline-none placeholder:opacity-50"
            style={{ color: 'var(--text-muted)' }}
          />
        </div>
      ) : (
        <div className="min-w-0 flex-1">
          <span
            onClick={onStartEdit}
            title={t.todos.editHint}
            className="block cursor-text text-[15px] leading-6 break-words"
            style={{
              color: todo.done ? 'var(--text-muted)' : 'var(--text)',
              textDecoration: todo.done ? 'line-through' : 'none',
              textDecorationColor: 'color-mix(in srgb, var(--text-muted) 60%, transparent)',
            }}
          >
            {todo.title}
          </span>
          {todo.notes && (
            <p className="mt-0.5 text-xs break-words" style={{ color: 'var(--text-muted)' }}>
              {todo.notes}
            </p>
          )}
        </div>
      )}
      {onReorder && (
        <div className="mt-0.5 flex shrink-0 flex-col">
          <button
            type="button"
            onClick={() => onReorder(-1)}
            aria-label={t.todos.moveUp}
            className="rounded-[4px] px-0.5 opacity-40 transition-opacity hover:opacity-100 focus:outline-none focus-visible:[box-shadow:var(--focus)]"
            style={{ color: 'var(--text-muted)' }}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 15l-6-6-6 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onReorder(1)}
            aria-label={t.todos.moveDown}
            className="rounded-[4px] px-0.5 opacity-40 transition-opacity hover:opacity-100 focus:outline-none focus-visible:[box-shadow:var(--focus)]"
            style={{ color: 'var(--text-muted)' }}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
      )}
      {onMoveTo && (
        <button
          type="button"
          onClick={() => setMenu((v) => !v)}
          aria-label={t.todos.moveTo}
          title={t.todos.moveTo}
          className="mt-0.5 rounded-[6px] p-1 opacity-40 transition-opacity hover:opacity-100 focus:outline-none focus-visible:[box-shadow:var(--focus)]"
          style={{ color: menu ? 'var(--accent)' : 'var(--text-muted)' }}
        >
          <Icon name="calendar" size={14} />
        </button>
      )}
      {onMove && (
        <button
          type="button"
          onClick={onMove}
          aria-label={t.todos.moveTomorrow}
          title={t.todos.moveTomorrow}
          className="mt-0.5 rounded-[6px] p-1 opacity-40 transition-opacity hover:opacity-100 focus:outline-none focus-visible:[box-shadow:var(--focus)]"
          style={{ color: 'var(--text-muted)' }}
        >
          <Icon name="chevron-right" size={14} />
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        aria-label={t.actions.delete}
        className="mt-0.5 rounded-[6px] p-1 opacity-40 transition-opacity hover:opacity-100 focus:outline-none focus-visible:[box-shadow:var(--focus)] md:opacity-0 md:group-hover:opacity-60"
        style={{ color: 'var(--text-muted)' }}
      >
        <Icon name="x" size={14} />
      </button>
      </div>
      {menu && onMoveTo && (
        <div className="px-4 pb-3 md:px-5">
          {[0, 1].map((w) => (
            <div key={w} className="mb-2 last:mb-0">
              <p className="mb-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {w === 0 ? t.todos.thisWeek : t.todos.nextWeek}
              </p>
              <div className="grid grid-cols-7 gap-1">
                {weekDays(base, w).map((d) => {
                  const key = isoOf(d)
                  const active = key === base
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setMenu(false)
                        onMoveTo(key)
                      }}
                      className="rounded-[8px] py-1.5 text-center text-[11px] transition-colors focus:outline-none focus-visible:[box-shadow:var(--focus)]"
                      style={{
                        background: active ? 'var(--accent)' : 'var(--surface-raised)',
                        color: active ? 'var(--accent-contrast)' : 'var(--text)',
                      }}
                    >
                      {weekdayShort(d)}
                      <span className="block text-[10px] opacity-70">{d.getDate()}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </li>
  )
}

/** Karte einer Kategorie: Kopf, Einträge, Eingabefeld. */
function CategoryCard({
  category,
  todos,
  first,
  last,
  editingId,
  editDraft,
  onStartEdit,
  onEditDraft,
  onCommitEdit,
  onCancelEdit,
  onAdd,
  onToggle,
  onDelete,
  onMove,
  onDeleteCategory,
  streak,
  onClear,
  onReorderTodo,
}: {
  category: TodoCategoryRow
  todos: Todo[]
  first: boolean
  last: boolean
  editingId: number | null
  editDraft: string
  onStartEdit: (todo: Todo) => void
  onEditDraft: (v: string) => void
  onCommitEdit: (todo: Todo) => void
  onCancelEdit: () => void
  onAdd: (title: string) => Promise<void>
  onToggle: (todo: Todo) => void
  onDelete: (todo: Todo) => void
  onMove: (delta: number) => void
  onDeleteCategory: () => void
  streak?: number
  /** Nur für Listen: alle Einträge der Kategorie löschen. */
  onClear?: () => void
  onReorderTodo?: (todo: Todo, delta: number) => void
}): ReactElement {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const open = todos.filter((todo) => !todo.done).length

  const submit = async (): Promise<void> => {
    const title = draft.trim()
    if (!title || busy) return
    setBusy(true)
    try {
      await onAdd(title)
      setDraft('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel flush className="flex max-h-[90vh] flex-col">
      <div className="flex shrink-0 items-start gap-2 px-4 pt-4 pb-2 md:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              {todoCategoryName(category.name)}
            </h2>
            {open > 0 && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {open}
              </span>
            )}
            {typeof streak === 'number' && streak > 0 && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[11px] font-medium"
                style={{ background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)' }}
              >
                {t.todos.streak(streak)}
              </span>
            )}
          </div>
          {category.resetRule !== 'none' && (
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              {resetLabel(category)}
            </p>
          )}
        </div>

        {confirmDelete ? (
          <div className="flex shrink-0 items-center gap-1 text-xs">
            <span style={{ color: 'var(--text-muted)' }}>{t.todos.deleteCategoryQuestion}</span>
            <button
              type="button"
              onClick={onDeleteCategory}
              className="rounded-[6px] px-1.5 py-0.5 font-medium focus:outline-none focus-visible:[box-shadow:var(--focus)]"
              style={{ color: 'var(--danger, #e5484d)' }}
            >
              {t.actions.delete}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-[6px] px-1.5 py-0.5 focus:outline-none focus-visible:[box-shadow:var(--focus)]"
              style={{ color: 'var(--text-muted)' }}
            >
              {t.actions.cancel}
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => onMove(-1)}
              disabled={first}
              aria-label={t.todos.moveUp}
              className="rounded-[6px] p-1 disabled:opacity-20 focus:outline-none focus-visible:[box-shadow:var(--focus)]"
              style={{ color: 'var(--text-muted)' }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 15l-6-6-6 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onMove(1)}
              disabled={last}
              aria-label={t.todos.moveDown}
              className="rounded-[6px] p-1 disabled:opacity-20 focus:outline-none focus-visible:[box-shadow:var(--focus)]"
              style={{ color: 'var(--text-muted)' }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label={t.todos.deleteCategory}
              className="rounded-[6px] p-1 focus:outline-none focus-visible:[box-shadow:var(--focus)]"
              style={{ color: 'var(--text-muted)' }}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        )}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {todos.map((todo) => (
          <Row
            key={todo.id}
            todo={todo}
            editing={editingId === todo.id}
            draft={editDraft}
            onStartEdit={() => onStartEdit(todo)}
            onDraft={onEditDraft}
            onCommit={() => onCommitEdit(todo)}
            onCancel={onCancelEdit}
            onToggle={() => onToggle(todo)}
            onDelete={() => onDelete(todo)}
            onReorder={(delta) => onReorderTodo?.(todo, delta)}
          />
        ))}
      </ul>

      <div className="flex shrink-0 items-center gap-2 px-4 py-2.5 md:px-5">
        <Icon name="plus" size={15} />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
          placeholder={t.todos.addPlaceholder}
          aria-label={`${todoCategoryName(category.name)} — ${t.todos.addPlaceholder}`}
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:opacity-50"
          style={{ color: 'var(--text)' }}
        />
        {onClear && todos.length > 0 && (
          <div className="flex shrink-0 items-center gap-1.5 text-xs">
            {confirmClear ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmClear(false)
                    onClear()
                  }}
                  className="rounded-[6px] px-1 py-0.5 font-medium focus:outline-none focus-visible:[box-shadow:var(--focus)]"
                  style={{ color: 'var(--danger, #e5484d)' }}
                >
                  {t.todos.clearConfirm}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="rounded-[6px] px-1 py-0.5 focus:outline-none focus-visible:[box-shadow:var(--focus)]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {t.actions.cancel}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="rounded-[6px] px-1 py-0.5 focus:outline-none focus-visible:[box-shadow:var(--focus)]"
                style={{ color: 'var(--text-muted)' }}
              >
                {t.todos.clearList}
              </button>
            )}
          </div>
        )}
      </div>
    </Panel>
  )
}

export function Todos(): ReactElement {
  const [categories, setCategories] = useState<TodoCategoryRow[] | null>(null)
  const [todos, setTodos] = useState<Todo[] | null>(null)
  const [stats, setStats] = useState<TodoStats[]>([])
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newGroup, setNewGroup] = useState<TodoGroup>('list')
  const [newRule, setNewRule] = useState<TodoResetRule>('none')
  const [newDay, setNewDay] = useState(1)
  const [hideDone, setHideDone] = useState(() => localStorage.getItem('hustl.todos.hideDone') === '1')
  const [regularView, setRegularView] = useState<'list' | 'stats'>('list')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const today = iso(new Date())
  const [day, setDay] = useState(today)

  const load = async (): Promise<void> => {
    try {
      const [cats, list, st] = await Promise.all([
        api.listTodoCategories(),
        api.listTodos(),
        api.todoStats(),
      ])
      setCategories(cats)
      setTodos(list)
      setStats(st)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const groups = useMemo(() => {
    const map: Record<TodoGroup, TodoCategoryRow[]> = { planner: [], regular: [], list: [] }
    for (const c of categories ?? []) map[c.group].push(c)
    return map
  }, [categories])

  const byCategory = useMemo(() => {
    const map = new Map<number, Todo[]>()
    for (const todo of todos ?? []) {
      const list = map.get(todo.categoryId) ?? []
      list.push(todo)
      map.set(todo.categoryId, list)
    }
    return map
  }, [todos])

  const streakFor = (id: number): number | undefined => stats.find((s) => s.categoryId === id)?.streak

  const addTodo = async (categoryId: number, title: string, date?: string): Promise<void> => {
    await api.createTodo({ title, categoryId, date })
    await load()
  }

  const toggle = (todo: Todo): void => {
    setTodos((prev) => prev?.map((t2) => (t2.id === todo.id ? { ...t2, done: !t2.done } : t2)) ?? null)
    void api.setTodoDone(todo.id, !todo.done).catch(() => void load())
  }

  const remove = (todo: Todo): void => {
    setTodos((prev) => prev?.filter((t2) => t2.id !== todo.id) ?? null)
    void api.deleteTodo(todo.id).catch(() => void load())
  }

  const startEdit = (todo: Todo): void => {
    setEditingId(todo.id)
    setEditDraft(todo.title)
  }

  const commitEdit = async (todo: Todo): Promise<void> => {
    const title = editDraft.trim()
    setEditingId(null)
    if (!title || title === todo.title) return
    await api.renameTodo(todo.id, title)
    await load()
  }

  const moveToNextDay = (todo: Todo): void => {
    const base = todo.date ? new Date(`${todo.date}T12:00:00`) : new Date()
    base.setDate(base.getDate() + 1)
    void api.moveTodoToDate(todo.id, iso(base)).then(load)
  }

  const createCategory = async (): Promise<void> => {
    const name = newName.trim()
    if (!name) return
    await api.createTodoCategory({
      name,
      resetRule: newRule,
      resetDay: newRule === 'none' || newRule === 'daily' ? null : newDay,
      group: newGroup,
    })
    setNewName('')
    setNewRule('none')
    setNewDay(1)
    setAdding(false)
    await load()
  }

  const openCount = (todos ?? []).filter((todo) => !todo.done).length
  const visible = (list: Todo[]): Todo[] => list.filter((todo) => !hideDone || !todo.done)

  const plannerTasks = (todos ?? []).filter((todo) => todo.date === day)

  // 15 Tage: drei zurück, elf voraus.
  const days = useMemo(() => {
    const base = new Date(`${today}T12:00:00`)
    return Array.from({ length: 15 }, (_, i) => {
      const d = new Date(base)
      d.setDate(base.getDate() + i - 3)
      return d
    })
  }, [today])

  const selected = new Date(`${day}T12:00:00`)

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-medium tracking-tight" style={{ color: 'var(--text)' }}>
            {t.nav.todos}
          </h1>
          {todos && todos.length > 0 && (
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {t.todos.openCount(openCount)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={hideDone}
            onClick={() => {
              const next = !hideDone
              setHideDone(next)
              localStorage.setItem('hustl.todos.hideDone', next ? '1' : '0')
            }}
            className="flex items-center gap-2 rounded-[10px] px-1 py-1 focus:outline-none focus-visible:[box-shadow:var(--focus)]"
          >
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t.todos.hideDone}
            </span>
            <span
              className="relative h-[18px] w-8 rounded-full transition-colors"
              style={{
                background: hideDone
                  ? 'var(--accent)'
                  : 'color-mix(in srgb, var(--text-muted) 22%, transparent)',
              }}
            >
              <span
                className="absolute top-[2px] h-[14px] w-[14px] rounded-full transition-all"
                style={{
                  left: hideDone ? 16 : 2,
                  background: hideDone ? 'var(--accent-contrast)' : 'var(--surface)',
                }}
              />
            </span>
          </button>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            aria-label={t.todos.newCategory}
            className="flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors focus:outline-none focus-visible:[box-shadow:var(--focus)]"
            style={{ background: 'var(--surface-raised)', color: 'var(--text)' }}
          >
            <Icon name="plus" size={18} />
          </button>
        </div>
      </header>

      {error && (
        <p className="mb-4 text-xs" style={{ color: 'var(--danger, #e5484d)' }}>
          {error}
        </p>
      )}

      {adding && (
        <Panel className="mb-4">
          <p className="mb-3 text-sm font-medium" style={{ color: 'var(--text)' }}>
            {t.todos.newCategory}
          </p>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void createCategory()
              if (e.key === 'Escape') setAdding(false)
            }}
            placeholder={t.todos.categoryName}
            className="mb-3 w-full rounded-[10px] px-3 py-2 text-sm outline-none focus-visible:[box-shadow:var(--focus)]"
            style={{ background: 'var(--field)', color: 'var(--text)' }}
          />
          <p className="mb-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            {t.todos.groupLabel}
          </p>
          <div className="mb-3">
            <SegmentedControl
              value={newGroup}
              onChange={setNewGroup}
              layoutId="todo-group"
              segments={[
                { value: 'planner', label: t.todos.groupPlanner },
                { value: 'regular', label: t.todos.groupRegular },
                { value: 'list', label: t.todos.groupList },
              ]}
            />
          </div>
          {newGroup === 'regular' && (
            <>
              <p className="mb-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                {t.todos.resetLabel}
              </p>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <SegmentedControl
                  value={newRule}
                  onChange={(rule) => {
                    setNewRule(rule)
                    setNewDay(1)
                  }}
                  layoutId="todo-reset-rule"
                  segments={[
                    { value: 'none', label: t.todos.resetNone },
                    { value: 'daily', label: t.todos.resetDaily },
                    { value: 'weekly', label: t.todos.resetWeekly },
                    { value: 'monthly', label: t.todos.resetMonthly },
                  ]}
                />
                {(newRule === 'weekly' || newRule === 'monthly') && (
                  <select
                    value={newDay}
                    onChange={(e) => setNewDay(Number(e.target.value))}
                    aria-label={t.todos.resetDay}
                    className="rounded-[10px] px-2 py-1.5 text-sm outline-none focus-visible:[box-shadow:var(--focus)]"
                    style={{ background: 'var(--field)', color: 'var(--text)' }}
                  >
                    {newRule === 'weekly'
                      ? WEEKDAY_ORDER.map((d) => (
                          <option key={d} value={d}>
                            {weekdayName(d)}
                          </option>
                        ))
                      : Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                          <option key={d} value={d}>
                            {d}.
                          </option>
                        ))}
                  </select>
                )}
              </div>
            </>
          )}
          <div className="flex gap-2">
            <Button onClick={() => void createCategory()} disabled={!newName.trim()}>
              {t.todos.createCategory}
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              {t.actions.cancel}
            </Button>
          </div>
        </Panel>
      )}

      {categories === null || todos === null ? (
        <p style={{ color: 'var(--text-muted)' }}>{t.common.loading}</p>
      ) : (
        <div className="grid gap-6">
          {/* Planer */}
          <section className="min-w-0">
            <h2 className="mb-2 px-1 text-xs font-medium tracking-wide uppercase" style={{ color: 'var(--text-muted)' }}>
              {t.todos.groupPlanner}
            </h2>
            <Panel flush className="w-full min-w-0 overflow-hidden">
              <div className="flex w-full gap-2 overflow-x-auto px-3 pt-3 pb-2 [scrollbar-width:none]">
                {days.map((d) => {
                  const key = iso(d)
                  const active = key === day
                  const weekend = d.getDay() === 0 || d.getDay() === 6
                  const count = (todos ?? []).filter((todo) => todo.date === key && !todo.done).length
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setDay(key)}
                      className="flex w-14 shrink-0 flex-col items-center rounded-[10px] py-2 transition-colors focus:outline-none focus-visible:[box-shadow:var(--focus)]"
                      style={{
                        background: active ? 'var(--accent)' : 'transparent',
                        color: active ? 'var(--accent-contrast)' : 'var(--text)',
                        boxShadow:
                          !active && key === today ? 'inset 0 0 0 1.5px var(--accent)' : undefined,
                        opacity: !active && weekend ? 0.45 : 1,
                      }}
                    >
                      <span className="text-[11px] opacity-70">{weekdayShort(d)}</span>
                      <span className="text-base font-medium">{d.getDate()}</span>
                      <span className="mt-0.5 flex h-2 w-[28px] flex-wrap content-start justify-center gap-[2px]">
                        {Array.from({ length: Math.min(count, 10) }).map((_, i) => (
                          <span
                            key={i}
                            className="h-1 w-1 shrink-0 rounded-full"
                            style={{
                              background: active ? 'var(--accent-contrast)' : 'var(--accent)',
                            }}
                          />
                        ))}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="px-4 pb-3 md:px-5">
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                  {formatDayLabel(selected)}
                </p>
                {groups.planner.length > 1 && (
                  <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {groups.planner.map((c) => todoCategoryName(c.name)).join(' · ')}
                  </p>
                )}
              </div>
              <ul className="min-h-0 overflow-y-auto overscroll-contain">
                {visible(plannerTasks).map((todo) => (
                  <Row
                    key={todo.id}
                    todo={todo}
                    editing={editingId === todo.id}
                    draft={editDraft}
                    onStartEdit={() => startEdit(todo)}
                    onDraft={setEditDraft}
                    onCommit={() => void commitEdit(todo)}
                    onCancel={() => setEditingId(null)}
                    onToggle={() => toggle(todo)}
                    onDelete={() => remove(todo)}
                    onMove={() => moveToNextDay(todo)}
                    onMoveTo={(date) => void api.moveTodoToDate(todo.id, date).then(load)}
                    onNotes={(notes) => void api.setTodoNotes(todo.id, notes || null).then(load)}
                    onReorder={(delta) => void api.moveTodo(todo.id, delta).then(load)}
                  />
                ))}
              </ul>
              <div className="flex items-center gap-2 px-4 py-2.5 md:px-5">
                <Icon name="plus" size={15} />
                <input
                  placeholder={t.todos.addPlaceholder}
                  aria-label={`${t.todos.groupPlanner} — ${t.todos.addPlaceholder}`}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    const value = e.currentTarget.value.trim()
                    const planner = groups.planner[0]
                    if (!value || !planner) return
                    e.currentTarget.value = ''
                    void addTodo(planner.id, value, day)
                  }}
                  className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:opacity-50"
                  style={{ color: 'var(--text)' }}
                />
              </div>
            </Panel>
          </section>

          {/* Regelmäßig */}
          <section className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <h2 className="text-xs font-medium tracking-wide uppercase" style={{ color: 'var(--text-muted)' }}>
                {t.todos.groupRegular}
              </h2>
              <SegmentedControl
                value={regularView}
                onChange={setRegularView}
                layoutId="todo-regular-view"
                segments={[
                  { value: 'list', label: t.todos.viewList },
                  { value: 'stats', label: t.todos.viewStats },
                ]}
              />
            </div>

            {regularView === 'stats' ? (
              <div className="grid gap-3">
                {stats.length === 0 && (
                  <p className="px-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                    {t.todos.noStats}
                  </p>
                )}
                {stats.map((s) => (
                  <Panel key={s.categoryId} className="p-4">
                    <div className="mb-3 flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                        {todoCategoryName(s.name)}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {t.todos.streak(s.streak)} · {t.todos.best(s.best)}
                      </span>
                    </div>
                    <div className="flex h-16 items-end gap-1.5">
                      {s.periods.length === 0 && (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {t.todos.noStats}
                        </span>
                      )}
                      {s.periods.map((p) => {
                        const ratio = p.total > 0 ? p.done / p.total : 0
                        return (
                          <div
                            key={p.start}
                            title={`${p.start}: ${p.done}/${p.total}`}
                            className="flex-1 rounded-t-[3px]"
                            style={{
                              height: `${Math.max(6, ratio * 100)}%`,
                              background: p.completed
                                ? 'var(--accent)'
                                : 'color-mix(in srgb, var(--accent) 35%, transparent)',
                            }}
                          />
                        )
                      })}
                    </div>
                  </Panel>
                ))}
              </div>
            ) : (
              <div className="grid gap-4">
                {groups.regular.map((category, index) => (
                  <CategoryCard
                    key={category.id}
                    category={category}
                    first={index === 0}
                    last={index === groups.regular.length - 1}
                    todos={visible(byCategory.get(category.id) ?? [])}
                    editingId={editingId}
                    editDraft={editDraft}
                    onStartEdit={startEdit}
                    onEditDraft={setEditDraft}
                    onCommitEdit={(todo) => void commitEdit(todo)}
                    onCancelEdit={() => setEditingId(null)}
                    onAdd={(title) => addTodo(category.id, title)}
                    onToggle={toggle}
                    onDelete={remove}
                    onMove={(delta) => void api.moveTodoCategory(category.id, delta).then(load)}
                    onDeleteCategory={() => void api.deleteTodoCategory(category.id).then(load)}
                    streak={streakFor(category.id)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Liste */}
          <section className="min-w-0">
            <h2 className="mb-2 px-1 text-xs font-medium tracking-wide uppercase" style={{ color: 'var(--text-muted)' }}>
              {t.todos.groupList}
            </h2>
            <div className="grid gap-4">
              {groups.list.map((category, index) => (
                <CategoryCard
                  key={category.id}
                  category={category}
                  first={index === 0}
                  last={index === groups.list.length - 1}
                  todos={visible(byCategory.get(category.id) ?? [])}
                  editingId={editingId}
                  editDraft={editDraft}
                  onStartEdit={startEdit}
                  onEditDraft={setEditDraft}
                  onCommitEdit={(todo) => void commitEdit(todo)}
                  onCancelEdit={() => setEditingId(null)}
                  onAdd={(title) => addTodo(category.id, title)}
                  onToggle={toggle}
                  onDelete={remove}
                  onMove={(delta) => void api.moveTodoCategory(category.id, delta).then(load)}
                  onDeleteCategory={() => void api.deleteTodoCategory(category.id).then(load)}
                  onClear={() => void api.clearTodoCategory(category.id).then(load)}
                  onReorderTodo={(todo, delta) => void api.moveTodo(todo.id, delta).then(load)}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
