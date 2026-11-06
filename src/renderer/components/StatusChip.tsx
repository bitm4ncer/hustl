import { motion } from 'framer-motion'
import type { ReactElement, ReactNode } from 'react'
import type { InvoiceStatus } from '@shared/types'
import { t } from '../i18n'

/**
 * Status pills. Pastel tints (defined in index.css as `.chip-*`) carry the
 * meaning — never a border. Both light & dark text colours are handled there.
 */
const chipClass: Record<InvoiceStatus, string> = {
  draft: 'chip-draft',
  finalized: 'chip-finalized',
  sent: 'chip-sent',
  paid: 'chip-paid',
  cancelled: 'chip-cancelled'
}

export function StatusChip({ status }: { status: InvoiceStatus }): ReactElement {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`chip ${chipClass[status]}`}
    >
      {t.invoice.status[status]}
    </motion.span>
  )
}

/**
 * Generic borderless chip. Defaults to the violet reverse-charge tint used for
 * the noTax client flag and the "0% · Reverse-Charge" marker.
 */
export function Chip({
  children,
  variant = 'reverse'
}: {
  children: ReactNode
  variant?: 'reverse' | 'draft'
}): ReactElement {
  return <span className={`chip chip-${variant}`}>{children}</span>
}
