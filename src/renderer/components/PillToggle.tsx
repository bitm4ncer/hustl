import { motion } from 'framer-motion'
import type { ReactElement } from 'react'

interface PillToggleProps {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
  /** Aktiv-Farbe (Default: Grün für „bezahlt"). */
  onColor?: string
}

/**
 * Generischer binärer Pill-Slider (an/aus) im Hustl-Stil: gleitender Knopf,
 * Framer-Motion-Feder, borderless. Stoppt Klick-Bubbling, damit er in
 * klickbaren Karten/Zeilen sitzen kann.
 */
export function PillToggle({
  checked,
  onChange,
  label,
  disabled,
  onColor = '#4caf72',
}: PillToggleProps): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        if (!disabled) onChange(!checked)
      }}
      className="inline-flex items-center gap-2 rounded-full focus:outline-none focus-visible:[box-shadow:var(--focus)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span
        className="text-xs font-medium"
        style={{ color: checked ? onColor : 'var(--text-muted)' }}
      >
        {label}
      </span>
      <span
        className="relative flex h-6 w-11 shrink-0 items-center rounded-full px-0.5"
        style={{ background: checked ? onColor : 'var(--surface-raised)' }}
      >
        <motion.span
          className="h-5 w-5 rounded-full"
          style={{ background: '#fff' }}
          animate={{ x: checked ? 20 : 0 }}
          transition={{ type: 'spring', stiffness: 520, damping: 30 }}
        />
      </span>
    </button>
  )
}
