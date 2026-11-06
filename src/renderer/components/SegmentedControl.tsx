import { motion } from 'framer-motion'
import type { ReactElement } from 'react'

export interface Segment<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  value: T
  onChange: (value: T) => void
  segments: Segment<T>[]
  /** Eindeutig pro Instanz — steuert die gleitende Aktiv-Fläche. */
  layoutId: string
}

/**
 * Segmentierter Pill-Umschalter im Hustl-Stil. Aktive Fläche gleitet via
 * Framer-Motion `layoutId`. Track = surface-raised, aktiver Pill = surface.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  segments,
  layoutId,
}: SegmentedControlProps<T>): ReactElement {
  return (
    <div
      className="inline-flex gap-1 rounded-[12px] p-1"
      style={{ background: 'var(--surface-raised)' }}
    >
      {segments.map((s) => {
        const active = s.value === value
        return (
          <button
            key={s.value}
            type="button"
            onClick={() => onChange(s.value)}
            className="relative isolate rounded-[9px] px-3 py-1.5 text-[13px] font-medium transition-colors focus:outline-none focus-visible:[box-shadow:var(--focus)]"
            style={{ color: active ? 'var(--text)' : 'var(--text-muted)' }}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                className="absolute inset-0 -z-10 rounded-[9px]"
                style={{ background: 'var(--surface)' }}
              />
            )}
            {s.label}
          </button>
        )
      })}
    </div>
  )
}
