import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

export interface StatusOption {
  value: string
  label: string
  /** Solid hex colour encoding the status; works in both light & dark. */
  color: string
}

interface StatusMenuProps {
  current: string
  options: StatusOption[]
  onChange: (value: string) => void
}

/**
 * A small coloured dot whose colour encodes the current status. Clicking it
 * opens a borderless floating popover listing every status (dot + German
 * label); the current row is apricot-tinted. Selecting a row calls `onChange`
 * and closes.
 *
 * Generic on purpose — both projects and invoices feed their own status maps.
 * The dot is a `<button>` so it can sit LEFT of a title; its onClick stops
 * propagation (bubble phase) so it never triggers a clickable parent card.
 */
export function StatusMenu({ current, options, onChange }: StatusMenuProps): ReactElement {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)

  const active = options.find((o) => o.value === current)
  const dotColor = active?.color ?? 'var(--text-muted)'
  const label = active?.label ?? current

  // Close on outside-click (document mousedown) and Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span ref={wrapRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        // Bubble-phase stop: keeps the dot from also triggering a clickable
        // parent (e.g. the Panel card that opens the editor).
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="h-[9px] w-[9px] rounded-full focus:outline-none focus-visible:[box-shadow:var(--focus)]"
        style={{ background: dotColor }}
      />

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            className="absolute left-0 top-[16px] z-20 min-w-[150px] origin-top-left rounded-[12px] p-1.5"
            style={{
              background: 'var(--surface-raised)',
              // Deliberate popover-only exception to the no-shadow rule: a
              // floating menu needs a soft functional elevation to read as
              // detached. Do NOT add shadows on cards.
              boxShadow: '0 6px 24px rgba(0,0,0,.18)',
            }}
            // Stop clicks inside the menu from bubbling to a clickable parent.
            onClick={(e) => e.stopPropagation()}
          >
            {options.map((o) => {
              const isCurrent = o.value === current
              return (
                <button
                  key={o.value}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onChange(o.value)
                    setOpen(false)
                  }}
                  className="flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 text-left text-sm transition-colors focus:outline-none focus-visible:[box-shadow:var(--focus)]"
                  style={{
                    color: 'var(--text)',
                    background: isCurrent
                      ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
                      : 'transparent',
                  }}
                >
                  <span
                    className="h-[9px] w-[9px] shrink-0 rounded-full"
                    style={{ background: o.color }}
                  />
                  <span className="truncate">{o.label}</span>
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  )
}
