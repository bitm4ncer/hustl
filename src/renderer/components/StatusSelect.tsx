import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Icon } from './Icon'
import type { StatusOption } from './StatusMenu'

interface StatusSelectProps {
  label: string
  value: string
  options: StatusOption[]
  onChange: (value: string) => void
}

/**
 * Field-shaped status picker: a full-width trigger showing the current status
 * (coloured dot + German label) that opens a borderless popover listing every
 * option with its own dot. A native `<select>` can't render the dots, hence the
 * custom control — it mirrors {@link StatusMenu}, just with a labelled trigger.
 */
export function StatusSelect({ label, value, options, onChange }: StatusSelectProps): ReactElement {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const active = options.find((o) => o.value === value)

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
    <div className="block">
      <span className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <div ref={wrapRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-sm focus:outline-none focus-visible:[box-shadow:var(--focus)]"
          style={{ background: 'var(--field)', color: 'var(--text)' }}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span
              className="h-[9px] w-[9px] shrink-0 rounded-full"
              style={{ background: active?.color ?? 'var(--text-muted)' }}
            />
            <span className="truncate">{active?.label ?? value}</span>
          </span>
          <motion.span
            animate={{ rotate: open ? -90 : 90 }}
            transition={{ duration: 0.15 }}
            style={{ color: 'var(--text-muted)' }}
          >
            <Icon name="chevron-right" size={16} />
          </motion.span>
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              role="listbox"
              initial={{ opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -4 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
              className="absolute inset-x-0 top-[calc(100%+4px)] z-30 origin-top rounded-[12px] p-1.5"
              style={{ background: 'var(--surface-raised)', boxShadow: '0 6px 24px rgba(0,0,0,.18)' }}
            >
              {options.map((o) => {
                const isCurrent = o.value === value
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
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
      </div>
    </div>
  )
}
