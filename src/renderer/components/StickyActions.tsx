import type { ReactElement } from 'react'
import { Button } from './Button'

interface StickyActionsProps {
  primaryLabel: string
  onPrimary: () => void
  primaryDisabled?: boolean
  secondaryLabel?: string
  onSecondary?: () => void
  secondaryDisabled?: boolean
  hint?: string
  total?: string
}

/**
 * Klebende Fußleiste auf dem iPhone, normale Zeile am Desktop. `safe-bottom`
 * hält den Home-Indicator frei, `pb-28` am Seiteninhalt verhindert, dass die
 * Leiste den letzten Block verdeckt.
 */
export function StickyActions({
  primaryLabel,
  onPrimary,
  primaryDisabled,
  secondaryLabel,
  onSecondary,
  secondaryDisabled,
  hint,
  total,
}: StickyActionsProps): ReactElement {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[45] flex items-center justify-between gap-3 border-t px-4 py-3 safe-bottom md:static md:border-0 md:px-0 md:py-0"
      style={{ background: 'var(--surface)', borderColor: 'var(--border, rgba(0,0,0,.08))' }}
    >
      <div className="min-w-0">
        {total && (
          <div className="truncate text-base font-medium tabular-nums" style={{ color: 'var(--text)' }}>
            {total}
          </div>
        )}
        {hint && (
          <div className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
            {hint}
          </div>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        {secondaryLabel && (
          <Button variant="ghost" disabled={secondaryDisabled} onClick={onSecondary}>
            {secondaryLabel}
          </Button>
        )}
        <Button disabled={primaryDisabled} onClick={onPrimary} className="min-h-[48px]">
          {primaryLabel}
        </Button>
      </div>
    </div>
  )
}
