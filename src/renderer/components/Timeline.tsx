import { useLayoutEffect, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import type { Project, ProjectStatus } from '@shared/types'
import { t } from '../i18n'
import { formatMonthShort } from '../i18n/format'
import { useLanguage } from '../i18n/LanguageProvider'

/**
 * Horizontal Gantt of the dated projects. Borderless throughout: separation
 * comes from the surface tone, alternating month bands, a single apricot today
 * line, and per-status pastel bar fills (the same hues as the status chips).
 */

const PX_PER_DAY = 5
const ROW_HEIGHT = 38
const ROW_GAP = 8
const HEADER_HEIGHT = 28
const SIDE_PADDING = 40
const DEFAULT_DURATION_DAYS = 14
const MIN_BAR_WIDTH = 90

const MS_PER_DAY = 1000 * 60 * 60 * 24

/**
 * Pastel bar fill + text colour per status, derived from the status chip hues
 * in `index.css`. A slightly more saturated translucent fill than the chips so
 * the bars read on the surface, while staying calm.
 */
const statusBar: Record<ProjectStatus, { fill: string; text: string }> = {
  Active: { fill: 'rgba(255, 127, 84, 0.28)', text: '#9c4a26' },
  Forthcoming: { fill: 'rgba(140, 165, 210, 0.32)', text: '#52689a' },
  'On Hold': { fill: 'rgba(172, 159, 148, 0.32)', text: '#7a6e63' },
  Done: { fill: 'rgba(125, 178, 131, 0.3)', text: '#4d7d55' },
  Archived: { fill: 'rgba(214, 140, 140, 0.3)', text: '#9a5959' },
}

function parseDate(iso: string): Date {
  // Use a date-only value to avoid timezone drift on day boundaries.
  return new Date(`${iso.slice(0, 10)}T00:00:00`)
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / MS_PER_DAY)
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

interface DatedProject {
  project: Project
  start: Date
  end: Date | null
}

export function Timeline({
  projects,
  onSelect,
}: {
  projects: Project[]
  onSelect: (p: Project) => void
}): React.ReactElement {
  const { lang } = useLanguage()
  const scrollRef = useRef<HTMLDivElement>(null)

  const undatedCount = projects.filter((p) => !p.timeframeStart).length

  const dated: DatedProject[] = useMemo(
    () =>
      projects
        .filter((p): p is Project & { timeframeStart: string } => Boolean(p.timeframeStart))
        .map((p) => ({
          project: p,
          start: parseDate(p.timeframeStart),
          end: p.timeframeEnd ? parseDate(p.timeframeEnd) : null,
        }))
        .sort((a, b) => a.start.getTime() - b.start.getTime()),
    [projects],
  )

  const layout = useMemo(() => {
    if (dated.length === 0) return null

    const today = startOfDay(new Date())

    let rangeStart = dated[0].start
    let rangeEnd = dated[0].start
    for (const d of dated) {
      if (d.start < rangeStart) rangeStart = d.start
      const e = d.end ?? d.start
      if (e > rangeEnd) rangeEnd = e
    }

    // Always show at least [today − 60d, today + 120d].
    const windowStart = addDays(today, -60)
    const windowEnd = addDays(today, 120)
    if (windowStart < rangeStart) rangeStart = windowStart
    if (windowEnd > rangeEnd) rangeEnd = windowEnd

    // Snap the range start to the first of its month so the first month band
    // and label line up cleanly.
    rangeStart = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)

    const x = (date: Date): number => daysBetween(rangeStart, date) * PX_PER_DAY
    const width = x(rangeEnd) + SIDE_PADDING

    // One entry per month from rangeStart to rangeEnd, with alternating bands.
    const months: { left: number; label: string; band: boolean }[] = []
    const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)
    let i = 0
    while (cursor <= rangeEnd) {
      months.push({ left: x(cursor), label: formatMonthShort(cursor), band: i % 2 === 1 })
      cursor.setMonth(cursor.getMonth() + 1)
      i += 1
    }
    // Append a sentinel "left" so each band can be drawn up to the next month.
    const bandEdges = months.map((m) => m.left)
    bandEdges.push(width)

    const rowsHeight = dated.length * ROW_HEIGHT + Math.max(0, dated.length - 1) * ROW_GAP
    const canvasHeight = HEADER_HEIGHT + rowsHeight

    return { rangeStart, rangeEnd, x, width, months, bandEdges, today, canvasHeight, rowsHeight }
  }, [dated, lang])

  // Default-scroll so "today" is roughly in view.
  useLayoutEffect(() => {
    if (!layout || !scrollRef.current) return
    scrollRef.current.scrollLeft = Math.max(0, layout.x(layout.today) - 200)
  }, [layout])

  const undatedNote =
    undatedCount > 0 ? (
      <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        {t.project.undatedCount(undatedCount)}
      </p>
    ) : null

  if (!layout) {
    return (
      <div
        className="rounded-[14px] p-5"
        style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}
      >
        <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          {t.project.timelineEmpty}
        </p>
        {undatedNote}
      </div>
    )
  }

  const { x, width, months, bandEdges, today, canvasHeight } = layout
  const todayX = x(today)

  return (
    <div>
      <div
        ref={scrollRef}
        className="overflow-x-auto rounded-[14px]"
        style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}
      >
        <div className="relative" style={{ width, height: canvasHeight, minWidth: '100%' }}>
          {/* Alternating month bands (no borders — subtle raised fill only). */}
          {months.map((m, mi) =>
            m.band ? (
              <div
                key={`band-${mi}`}
                className="absolute top-0"
                style={{
                  left: m.left,
                  width: bandEdges[mi + 1] - m.left,
                  height: canvasHeight,
                  background: 'var(--surface-raised)',
                  opacity: 0.4,
                }}
              />
            ) : null,
          )}

          {/* Month labels along the header. */}
          {months.map((m, mi) => (
            <span
              key={`lbl-${mi}`}
              className="absolute select-none text-[11px] font-medium"
              style={{ left: m.left + 6, top: 8, color: 'var(--text-muted)' }}
            >
              {m.label}
            </span>
          ))}

          {/* Today marker: thin apricot line spanning all rows + a dot on top. */}
          <div
            className="absolute"
            style={{
              left: todayX,
              top: HEADER_HEIGHT - 6,
              width: 2,
              height: canvasHeight - (HEADER_HEIGHT - 6),
              background: 'var(--accent)',
              opacity: 0.85,
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              left: todayX - 3,
              top: HEADER_HEIGHT - 10,
              width: 8,
              height: 8,
              background: 'var(--accent)',
            }}
          />

          {/* Project bars, one row each. */}
          {dated.map((d, idx) => {
            const top = HEADER_HEIGHT + idx * (ROW_HEIGHT + ROW_GAP)
            const left = x(d.start)
            const rawEnd = d.end ? x(d.end) : x(addDays(d.start, DEFAULT_DURATION_DAYS))
            const barWidth = Math.max(MIN_BAR_WIDTH, rawEnd - left)
            const colors = statusBar[d.project.status]
            return (
              <motion.button
                key={d.project.id}
                type="button"
                onClick={() => onSelect(d.project)}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.985 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="absolute flex flex-col justify-center overflow-hidden rounded-[10px] px-3 text-left focus:outline-none focus-visible:[box-shadow:var(--focus)]"
                style={{
                  left,
                  top,
                  width: barWidth,
                  height: ROW_HEIGHT,
                  background: colors.fill,
                }}
              >
                <span
                  className="truncate text-[12.5px] font-medium leading-tight"
                  style={{ color: colors.text }}
                >
                  {d.project.title}
                </span>
                {d.project.clientName && (
                  <span
                    className="truncate text-[10.5px] leading-tight"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {d.project.clientName}
                  </span>
                )}
              </motion.button>
            )
          })}
        </div>
      </div>
      {undatedNote}
    </div>
  )
}
