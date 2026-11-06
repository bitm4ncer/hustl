import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface PanelProps {
  children: ReactNode
  /** Use the raised surface tone instead of the base surface. */
  raised?: boolean
  /** Adds hover lift + pointer affordance when an onClick is provided. */
  onClick?: () => void
  className?: string
  /** Ohne Innenabstand — für Panels, die ihre Bereiche selbst einrücken. */
  flush?: boolean
  /** Stagger index for list mount animations. */
  index?: number
}

/**
 * Borderless container: separation comes from the surface tone + a subtle
 * shadow + rounded corners. Never a border.
 */
export function Panel({ children, raised, onClick, className, flush, index = 0 }: PanelProps): React.ReactElement {
  const interactive = Boolean(onClick)
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut', delay: Math.min(index * 0.04, 0.3) }}
      whileHover={interactive ? { y: -2 } : undefined}
      whileTap={interactive ? { scale: 0.995 } : undefined}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
      className={`rounded-[14px] ${flush ? '' : 'p-4 md:p-5'} ${interactive ? 'cursor-pointer' : ''} ${className ?? ''}`}
      style={{
        background: raised ? 'var(--surface-raised)' : 'var(--surface)',
        boxShadow: 'var(--shadow)',
      }}
    >
      {children}
    </motion.div>
  )
}
