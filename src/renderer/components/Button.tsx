import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  variant?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  className?: string
}

/**
 * Borderless button. Primary = accent fill, ghost = raised surface tone.
 * Focus is shown via a soft accent ring (box-shadow), never an outline.
 */
export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled,
  className,
}: ButtonProps): React.ReactElement {
  const isPrimary = variant === 'primary'
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={`rounded-[10px] px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:[box-shadow:var(--focus)] disabled:cursor-not-allowed disabled:opacity-40 ${className ?? ''}`}
      style={
        isPrimary
          ? { background: 'var(--accent)', color: 'var(--accent-contrast)' }
          : variant === 'danger'
            ? { background: 'var(--danger, #e5484d)', color: '#fff' }
            : { background: 'var(--surface-raised)', color: 'var(--text)' }
      }
    >
      {children}
    </motion.button>
  )
}
