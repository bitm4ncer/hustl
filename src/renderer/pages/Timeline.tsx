import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Project, ProjectStatus } from '@shared/types'
import { api } from '../lib/api'
import { t } from '../i18n'
import { formatMonthShort } from '../i18n/format'
import { useLanguage } from '../i18n/LanguageProvider'
import { Icon } from '../components/Icon'

/**
 * Full-screen, interactive Gantt timeline. Bars can be moved (drag the body)
 * and resized (drag an edge handle); undated projects live in a collapsible
 * drawer and can be dragged onto the grid to be given a date. Everything is
 * day-snapped and only persisted on pointer-release. Borderless throughout —
 * separation comes from surface tones, alternating month bands, a single
 * apricot today line and per-status pastel bar fills.
 */

const PX_PER_DAY = 26 // default zoom (px per day)
const MIN_PX_PER_DAY = 6
const MAX_PX_PER_DAY = 64
const ROW_HEIGHT = 40
const ROW_GAP = 8
const HEADER_HEIGHT = 42
const MS_PER_DAY = 1000 * 60 * 60 * 24
const DEFAULT_DROP_DURATION_DAYS = 6 // 1-week span (start + 6 days inclusive)
const EDGE_HANDLE_WIDTH = 8

/**
 * Pastel bar fill + text colour per status, derived from the status chip hues.
 * A slightly more saturated translucent fill than the chips so the bars read on
 * the surface, while staying calm.
 */
const statusBar: Record<ProjectStatus, { fill: string; text: string }> = {
  Active: { fill: 'rgba(255, 127, 84, 0.28)', text: '#9c4a26' },
  Forthcoming: { fill: 'rgba(140, 165, 210, 0.32)', text: '#52689a' },
  'On Hold': { fill: 'rgba(172, 159, 148, 0.32)', text: '#7a6e63' },
  Done: { fill: 'rgba(125, 178, 131, 0.3)', text: '#4d7d55' },
  Archived: { fill: 'rgba(214, 140, 140, 0.3)', text: '#9a5959' },
}

const statusDot: Record<ProjectStatus, string> = {
  Active: '#ff7f54',
  Forthcoming: '#7088ba',
  'On Hold': '#9a9a9d',
  Done: '#4caf72',
  Archived: '#b06a6a',
}

// --- date helpers (date-only; no timezone drift on day boundaries) ----------

function parseDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00`)
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / MS_PER_DAY)
}

function addDays(date: Date, n: number): Date {
  const r = new Date(date)
  r.setDate(r.getDate() + n)
  return r
}

function toISO(date: Date): string {
  // Local components — `toISOString` would shift across the UTC boundary.
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

// `ProjectInput` shape accepted by `api.saveProject` — built from the existing
// project plus the new dates so the renderer never reaches into `src/main`.
type ProjectInput = Omit<Project, 'id' | 'clientName' | 'hourlyRate' | 'finalPrice' | 'items'> & {
  items: Array<{ title: string; description: string; hours: number | null }>
}

function toInput(p: Project, start: string | null, end: string | null): ProjectInput {
  return {
    notionId: p.notionId,
    clientId: p.clientId,
    title: p.title,
    description: p.description,
    status: p.status,
    hours: p.hours,
    fixPrice: p.fixPrice,
    timeframeStart: start,
    timeframeEnd: end,
    note: p.note,
    // Positionen unverändert mitschreiben — saveProject ersetzt die Liste.
    items: p.items.map((it) => ({ title: it.title, description: it.description, hours: it.hours })),
  }
}

// Live preview state for a bar move/resize. Only the dragged bar reads it.
interface BarDrag {
  id: number
  kind: 'move' | 'resize-start' | 'resize-end'
  startClientX: number
  origStart: string
  origEnd: string | null
  dayDelta: number
}

// Custom drag state for an undated chip being dragged onto the grid.
interface ChipDrag {
  project: Project
  x: number
  y: number
}

export function Timeline(): ReactElement {
  const { lang } = useLanguage()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(true)
  const [drag, setDrag] = useState<BarDrag | null>(null)
  const [chipDrag, setChipDrag] = useState<ChipDrag | null>(null)
  const [pxPerDay, setPxPerDay] = useState(PX_PER_DAY)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [editing, setEditing] = useState<{ project: Project; x: number; y: number } | null>(null)

  const gridRef = useRef<HTMLDivElement>(null)
  // Mirror of `chipDrag` for window listeners (avoids stale closures).
  const chipDragRef = useRef<ChipDrag | null>(null)
  chipDragRef.current = chipDrag

  const load = (): void => {
    void api.listProjects().then(setProjects)
  }
  useEffect(load, [])

  const active = useMemo(
    () => (projects ?? []).filter((p) => p.status !== 'Archived'),
    [projects],
  )
  const dated = useMemo(
    () => active.filter((p) => p.timeframeStart != null),
    [active],
  )
  const undated = useMemo(
    () => active.filter((p) => p.timeframeStart == null),
    [active],
  )

  // Time/space mapping for the whole visible range.
  const layout = useMemo(() => {
    const today = startOfDay(new Date())

    let rangeStart = today
    let rangeEnd = today
    for (const p of dated) {
      const s = parseDate(p.timeframeStart as string)
      const e = p.timeframeEnd ? parseDate(p.timeframeEnd) : s
      if (s < rangeStart) rangeStart = s
      if (e > rangeEnd) rangeEnd = e
    }

    rangeStart = addDays(rangeStart, -14)
    // Snap to the 1st of its month so the first band/label lines up cleanly.
    rangeStart = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)
    rangeEnd = addDays(rangeEnd, 30)

    const x = (iso: string): number => daysBetween(rangeStart, parseDate(iso)) * pxPerDay
    const totalDays = daysBetween(rangeStart, rangeEnd)
    const totalWidth = totalDays * pxPerDay

    // One entry per month, alternating bands.
    const months: { left: number; right: number; label: string; band: boolean }[] = []
    const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)
    let i = 0
    while (cursor <= rangeEnd) {
      const left = daysBetween(rangeStart, cursor) * pxPerDay
      const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
      const right = Math.min(totalWidth, daysBetween(rangeStart, next) * pxPerDay)
      months.push({ left, right, label: formatMonthShort(cursor), band: i % 2 === 1 })
      cursor.setMonth(cursor.getMonth() + 1)
      i += 1
    }

    // Day-number ticks. Spacing widens when zoomed out (~every 64px) so the
    // numbers stay readable; every day once zoomed in enough.
    const step = pxPerDay >= 18 ? 1 : Math.max(1, Math.ceil(64 / pxPerDay))
    const days: { x: number; day: number; first: boolean }[] = []
    for (let d = 0; d <= totalDays; d += step) {
      const date = addDays(rangeStart, d)
      days.push({ x: d * pxPerDay, day: date.getDate(), first: date.getDate() === 1 })
    }

    return { rangeStart, rangeEnd, today, x, totalWidth, months, days }
  }, [dated, pxPerDay, lang])

  const dateFromX = (px: number): string =>
    toISO(addDays(layout.rangeStart, Math.round(px / pxPerDay)))

  const todayISO = toISO(layout.today)
  const rowsHeight =
    dated.length * ROW_HEIGHT + Math.max(0, dated.length - 1) * ROW_GAP
  const canvasHeight = HEADER_HEIGHT + Math.max(rowsHeight, ROW_HEIGHT)

  // Default-scroll so "today" is roughly in view on first paint.
  useLayoutEffect(() => {
    if (projects === null || !gridRef.current) return
    gridRef.current.scrollLeft = Math.max(0, layout.x(todayISO) - 200)
    // Only on first successful load — re-runs are harmless (re-centres today).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects === null])

  // --- bar move / resize ----------------------------------------------------

  const onBarPointerDown = (
    e: ReactPointerEvent<HTMLDivElement>,
    p: Project,
    kind: BarDrag['kind'],
  ): void => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({
      id: p.id,
      kind,
      startClientX: e.clientX,
      origStart: p.timeframeStart as string,
      origEnd: p.timeframeEnd,
      dayDelta: 0,
    })
  }

  const onBarPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!drag) return
    const dayDelta = Math.round((e.clientX - drag.startClientX) / pxPerDay)
    if (dayDelta !== drag.dayDelta) setDrag({ ...drag, dayDelta })
  }

  const onBarPointerUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!drag) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* capture may already be gone */
    }
    const d = drag
    setDrag(null)
    if (d.dayDelta === 0) return

    const project = active.find((p) => p.id === d.id)
    if (!project) return

    const start = parseDate(d.origStart)
    const end = d.origEnd ? parseDate(d.origEnd) : null
    let newStart = d.origStart
    let newEnd = d.origEnd

    if (d.kind === 'move') {
      newStart = toISO(addDays(start, d.dayDelta))
      newEnd = end ? toISO(addDays(end, d.dayDelta)) : null
    } else if (d.kind === 'resize-start') {
      // Clamp so the start never passes the end (min 1 day span).
      const effEnd = end ?? start
      let s = addDays(start, d.dayDelta)
      if (s > effEnd) s = effEnd
      newStart = toISO(s)
      newEnd = d.origEnd
    } else {
      // resize-end: clamp so the end never precedes the start.
      const base = end ?? start
      let nEnd = addDays(base, d.dayDelta)
      if (nEnd < start) nEnd = start
      newEnd = toISO(nEnd)
      newStart = d.origStart
    }

    if (newStart === d.origStart && newEnd === d.origEnd) return

    // Optimistic local update, then persist.
    setProjects((prev) =>
      (prev ?? []).map((p) =>
        p.id === d.id ? { ...p, timeframeStart: newStart, timeframeEnd: newEnd } : p,
      ),
    )
    void api.saveProject(toInput(project, newStart, newEnd), project.id).then(load)
  }

  // Live geometry for a bar, accounting for an in-flight drag preview.
  const barGeometry = (p: Project): { left: number; width: number } => {
    let startISO = p.timeframeStart as string
    let endISO = p.timeframeEnd
    if (drag && drag.id === p.id) {
      const start = parseDate(drag.origStart)
      const end = drag.origEnd ? parseDate(drag.origEnd) : null
      if (drag.kind === 'move') {
        startISO = toISO(addDays(start, drag.dayDelta))
        endISO = end ? toISO(addDays(end, drag.dayDelta)) : null
      } else if (drag.kind === 'resize-start') {
        const effEnd = end ?? start
        let s = addDays(start, drag.dayDelta)
        if (s > effEnd) s = effEnd
        startISO = toISO(s)
      } else {
        const base = end ?? start
        let nEnd = addDays(base, drag.dayDelta)
        if (nEnd < start) nEnd = start
        endISO = toISO(nEnd)
      }
    }
    const left = layout.x(startISO)
    const rawEnd = layout.x(endISO ?? startISO)
    const width = Math.max(pxPerDay, rawEnd - left + pxPerDay)
    return { left, width }
  }

  // --- undated chip drag onto the grid --------------------------------------

  useEffect(() => {
    if (!chipDrag) return

    const onMove = (e: PointerEvent): void => {
      const cur = chipDragRef.current
      if (!cur) return
      setChipDrag({ ...cur, x: e.clientX, y: e.clientY })
    }

    const onUp = (e: PointerEvent): void => {
      const cur = chipDragRef.current
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setChipDrag(null)
      if (!cur || !gridRef.current) return

      const rect = gridRef.current.getBoundingClientRect()
      const overGrid =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      if (!overGrid) return // released outside the grid — cancel

      const px = e.clientX - rect.left + gridRef.current.scrollLeft
      const iso = dateFromX(px)
      const endISO = toISO(addDays(parseDate(iso), DEFAULT_DROP_DURATION_DAYS))
      void api.saveProject(toInput(cur.project, iso, endISO), cur.project.id).then(load)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chipDrag !== null])

  const onChipPointerDown = (e: ReactPointerEvent<HTMLDivElement>, p: Project): void => {
    e.preventDefault()
    setChipDrag({ project: p, x: e.clientX, y: e.clientY })
  }

  // --------------------------------------------------------------------------

  const todayX = layout.x(todayISO)

  return (
    <div className="flex h-full flex-col">
      <header className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-medium tracking-tight" style={{ color: 'var(--text)' }}>
          {t.nav.timeline}
        </h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={t.timeline.zoomOut}
            onClick={() => setPxPerDay((z) => Math.max(MIN_PX_PER_DAY, Math.round(z / 1.3)))}
            className="flex h-8 w-8 items-center justify-center rounded-[10px] text-base leading-none focus:outline-none focus-visible:[box-shadow:var(--focus)]"
            style={{ background: 'var(--surface-raised)', color: 'var(--text)' }}
          >
            −
          </button>
          <button
            type="button"
            aria-label={t.timeline.zoomIn}
            onClick={() => setPxPerDay((z) => Math.min(MAX_PX_PER_DAY, Math.round(z * 1.3)))}
            className="flex h-8 w-8 items-center justify-center rounded-[10px] text-base leading-none focus:outline-none focus-visible:[box-shadow:var(--focus)]"
            style={{ background: 'var(--surface-raised)', color: 'var(--text)' }}
          >
            +
          </button>
        </div>
      </header>

      {projects === null ? (
        <p style={{ color: 'var(--text-muted)' }}>{t.common.loading}</p>
      ) : (
        <>
          {/* The grid: horizontally scrollable, borderless, neutral surface. */}
          <div
            ref={gridRef}
            onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
            className="overflow-x-auto rounded-[14px]"
            style={{ background: 'var(--surface)' }}
          >
            <div
              className="relative"
              style={{
                width: layout.totalWidth,
                minWidth: '100%',
                height: canvasHeight,
                // Subtle day raster: a 1px line at every day boundary (aligned to
                // rangeStart, which is snapped to the 1st of its month).
                backgroundImage: `repeating-linear-gradient(to right, rgba(128,128,128,0.13) 0, rgba(128,128,128,0.13) 1px, transparent 1px, transparent ${pxPerDay}px)`,
              }}
            >
              {/* Alternating month bands. */}
              {layout.months.map((m, mi) =>
                m.band ? (
                  <div
                    key={`band-${mi}`}
                    className="absolute top-0"
                    style={{
                      left: m.left,
                      width: m.right - m.left,
                      height: canvasHeight,
                      background: 'var(--surface-raised)',
                      opacity: 0.4,
                    }}
                  />
                ) : null,
              )}

              {/* Month labels along the header band. */}
              {layout.months.map((m, mi) => (
                <span
                  key={`lbl-${mi}`}
                  className="absolute select-none text-[11px] font-medium"
                  style={{ left: m.left + 8, top: 7, color: 'var(--text-muted)' }}
                >
                  {m.label}
                </span>
              ))}

              {/* Day-number ticks (the day grid). */}
              {layout.days.map((d, di) => (
                <span
                  key={`day-${di}`}
                  className="absolute select-none text-[9.5px] leading-none tabular-nums"
                  style={{ left: d.x + 3, top: 24, color: 'var(--text-muted)', opacity: d.first ? 0.95 : 0.5 }}
                >
                  {d.day}
                </span>
              ))}

              {/* Today marker. */}
              {todayX >= 0 && todayX <= layout.totalWidth && (
                <>
                  <div
                    className="absolute"
                    style={{
                      left: todayX,
                      top: HEADER_HEIGHT - 8,
                      width: 2,
                      height: canvasHeight - (HEADER_HEIGHT - 8),
                      background: 'var(--accent)',
                      opacity: 0.85,
                    }}
                  />
                  <div
                    className="absolute rounded-full"
                    style={{
                      left: todayX - 3,
                      top: HEADER_HEIGHT - 12,
                      width: 8,
                      height: 8,
                      background: 'var(--accent)',
                    }}
                  />
                </>
              )}

              {/* Empty state — no dated projects. */}
              {dated.length === 0 && (
                <span
                  className="absolute select-none text-sm"
                  style={{ left: 16, top: HEADER_HEIGHT + 12, color: 'var(--text-muted)' }}
                >
                  {t.timeline.empty}
                </span>
              )}

              {/* Project bars, one row each. */}
              {dated.map((p, idx) => {
                const top = HEADER_HEIGHT + idx * (ROW_HEIGHT + ROW_GAP)
                const { left, width } = barGeometry(p)
                const colors = statusBar[p.status]
                const isDragging = drag?.id === p.id
                // Sticky title: keep it at the visible left edge of the bar while
                // scrolling, but never push it past the bar's right edge.
                const titleLeft = Math.min(Math.max(8, scrollLeft - left + 8), Math.max(8, width - 48))
                return (
                  <div
                    key={p.id}
                    className="absolute flex items-center overflow-hidden rounded-[8px] px-3 select-none"
                    onPointerDown={(e) => onBarPointerDown(e, p, 'move')}
                    onPointerMove={onBarPointerMove}
                    onPointerUp={onBarPointerUp}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setEditing({ project: p, x: e.clientX, y: e.clientY })
                    }}
                    style={{
                      left,
                      top,
                      width,
                      height: ROW_HEIGHT,
                      background: colors.fill,
                      cursor: isDragging ? 'grabbing' : 'grab',
                      touchAction: 'none',
                      zIndex: isDragging ? 5 : 1,
                    }}
                    title={p.clientName ? `${p.title} · ${p.clientName}` : p.title}
                  >
                    {/* Left resize handle. */}
                    <div
                      onPointerDown={(e) => onBarPointerDown(e, p, 'resize-start')}
                      onPointerMove={onBarPointerMove}
                      onPointerUp={onBarPointerUp}
                      className="absolute inset-y-0 left-0"
                      style={{
                        width: EDGE_HANDLE_WIDTH,
                        cursor: 'ew-resize',
                        touchAction: 'none',
                      }}
                    />
                    <span
                      className="absolute truncate text-[12.5px] font-medium leading-tight"
                      style={{
                        color: colors.text,
                        top: '50%',
                        left: titleLeft,
                        transform: 'translateY(-50%)',
                        maxWidth: Math.max(36, width - titleLeft - 8),
                        pointerEvents: 'none',
                      }}
                    >
                      {p.title}
                    </span>
                    {/* Right resize handle. */}
                    <div
                      onPointerDown={(e) => onBarPointerDown(e, p, 'resize-end')}
                      onPointerMove={onBarPointerMove}
                      onPointerUp={onBarPointerUp}
                      className="absolute inset-y-0 right-0"
                      style={{
                        width: EDGE_HANDLE_WIDTH,
                        cursor: 'ew-resize',
                        touchAction: 'none',
                      }}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {/* Collapsible "ohne Datum" drawer, docked below the grid. */}
          <div className="mt-4 rounded-[14px]" style={{ background: 'var(--surface)' }}>
            <button
              type="button"
              onClick={() => setDrawerOpen((o) => !o)}
              className="flex w-full items-center gap-2 rounded-[14px] px-4 py-3 text-left text-sm font-medium focus:outline-none focus-visible:[box-shadow:var(--focus)]"
              style={{ color: 'var(--text)' }}
            >
              <motion.span
                animate={{ rotate: drawerOpen ? 90 : 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="flex"
                style={{ color: 'var(--text-muted)' }}
              >
                <Icon name="chevron-right" size={16} />
              </motion.span>
              {t.timeline.undatedCount(undated.length)}
            </button>

            <AnimatePresence initial={false}>
              {drawerOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4">
                    {undated.length === 0 ? (
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        {t.common.none}
                      </p>
                    ) : (
                      <>
                        <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                          {t.timeline.placeHint}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {undated.map((p) => (
                            <div
                              key={p.id}
                              onPointerDown={(e) => onChipPointerDown(e, p)}
                              className="flex items-center gap-2 rounded-full px-3 py-2 text-sm select-none"
                              style={{
                                background: 'var(--field)',
                                color: 'var(--text)',
                                cursor: 'grab',
                                touchAction: 'none',
                              }}
                            >
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ background: statusDot[p.status] }}
                              />
                              <span className="font-medium">{p.title}</span>
                              {p.clientName && (
                                <span style={{ color: 'var(--text-muted)' }}>
                                  · {p.clientName}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* Floating ghost following the pointer while a chip is dragged. */}
      {chipDrag && (
        <div
          className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-full px-3 py-2 text-sm"
          style={{
            left: chipDrag.x + 12,
            top: chipDrag.y + 12,
            background: 'var(--surface-raised)',
            color: 'var(--text)',
            opacity: 0.95,
          }}
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: statusDot[chipDrag.project.status] }}
          />
          <span className="font-medium">{chipDrag.project.title}</span>
        </div>
      )}

      {editing && (
        <TimelineEditPopover
          project={editing.project}
          x={editing.x}
          y={editing.y}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}

// Right-click a bar -> compact inline editor for the project's core fields.
function TimelineEditPopover({
  project,
  x,
  y,
  onClose,
  onSaved,
}: {
  project: Project
  x: number
  y: number
  onClose: () => void
  onSaved: () => void
}): ReactElement {
  const [title, setTitle] = useState(project.title)
  const [status, setStatus] = useState<ProjectStatus>(project.status)
  const [start, setStart] = useState(project.timeframeStart ?? '')
  const [end, setEnd] = useState(project.timeframeEnd ?? '')
  const [hours, setHours] = useState(project.hours?.toString() ?? '')
  const [fixPrice, setFixPrice] = useState(project.fixPrice?.toString() ?? '')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const save = async (): Promise<void> => {
    const input: ProjectInput = {
      notionId: project.notionId,
      clientId: project.clientId,
      title,
      description: project.description,
      status,
      hours: hours === '' ? null : Number(hours),
      fixPrice: fixPrice === '' ? null : Number(fixPrice),
      timeframeStart: start || null,
      timeframeEnd: end || null,
      note: project.note,
      // Positionen unverändert mitschreiben — saveProject ersetzt die Liste.
      items: project.items.map((it) => ({ title: it.title, description: it.description, hours: it.hours })),
    }
    await api.saveProject(input, project.id)
    onSaved()
    onClose()
  }

  const left = Math.min(x, window.innerWidth - 276)
  const top = Math.min(y, window.innerHeight - 320)
  const fieldCls =
    'w-full rounded-[8px] px-2.5 py-1.5 text-sm focus:outline-none focus-visible:[box-shadow:var(--focus)]'
  const fieldStyle = { background: 'var(--field)', color: 'var(--text)' } as const

  return (
    <div
      ref={ref}
      className="fixed z-50 w-[260px] rounded-[12px] p-3"
      style={{ left, top, background: 'var(--surface-raised)', boxShadow: '0 8px 30px rgba(0,0,0,.28)' }}
    >
      <div className="grid gap-2">
        <input
          className={fieldCls}
          style={fieldStyle}
          value={title}
          placeholder={t.project.title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select
          className={fieldCls}
          style={fieldStyle}
          value={status}
          onChange={(e) => setStatus(e.target.value as ProjectStatus)}
        >
          {(Object.keys(statusDot) as ProjectStatus[]).map((s) => (
            <option key={s} value={s}>
              {t.project.status[s]}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input className={fieldCls} style={fieldStyle} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <input className={fieldCls} style={fieldStyle} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className={fieldCls} style={fieldStyle} type="number" value={hours} placeholder={t.project.hours} onChange={(e) => setHours(e.target.value)} />
          <input className={fieldCls} style={fieldStyle} type="number" value={fixPrice} placeholder={t.project.fixPrice} onChange={(e) => setFixPrice(e.target.value)} />
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-[8px] px-3 py-1.5 text-sm focus:outline-none focus-visible:[box-shadow:var(--focus)]"
          style={{ background: 'var(--field)', color: 'var(--text)' }}
        >
          {t.actions.cancel}
        </button>
        <button
          type="button"
          onClick={() => void save()}
          className="rounded-[8px] px-3 py-1.5 text-sm font-medium focus:outline-none focus-visible:[box-shadow:var(--focus)]"
          style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
        >
          {t.actions.save}
        </button>
      </div>
    </div>
  )
}
