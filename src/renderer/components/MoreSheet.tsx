import { useEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { backdropCloseAllowed } from './Modal'
import { Icon } from './Icon'
import { ThemeToggle } from './ThemeToggle'
import { LanguageToggle } from './LanguageToggle'
import { getOverflow } from '../navigation'
import { t } from '../i18n'
import type { View } from './Sidebar'
import { isElectronShell } from '../platform'
import { logout } from '../auth/auth-api'

interface MoreSheetProps {
  open: boolean
  active: View
  onClose: () => void
  onNavigate: (view: View) => void
}

export function MoreSheet({ open, active, onClose, onNavigate }: MoreSheetProps): ReactElement {
  const startedOnBackdrop = useRef(false)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="more-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-end md:hidden"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onPointerDown={(event) => {
            startedOnBackdrop.current = event.target === event.currentTarget
          }}
          onClick={(event) => {
            if (backdropCloseAllowed(startedOnBackdrop.current, event.target === event.currentTarget, false)) {
              onClose()
            }
            startedOnBackdrop.current = false
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t.app.more}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="w-full rounded-t-[20px] p-4 pb-6 safe-bottom"
            style={{ background: 'var(--surface)', color: 'var(--text)' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full" style={{ background: 'var(--border)' }} />

            <div className="grid gap-1">
              {getOverflow().map((item) => (
                <button
                  key={item.view}
                  type="button"
                  onClick={() => {
                    onNavigate(item.view as View)
                    onClose()
                  }}
                  className="flex min-h-[52px] items-center gap-3 rounded-[12px] px-3 text-left text-sm font-medium"
                  style={{
                    background: item.view === active ? 'var(--surface-raised)' : 'transparent',
                    color: 'var(--text)',
                  }}
                >
                  <Icon name={item.icon} size={18} />
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
              <div className="min-w-0 flex-1">
                <ThemeToggle />
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <LanguageToggle />
                {!isElectronShell() && (
                  <button
                    type="button"
                    onClick={async () => {
                      await logout().catch(() => undefined)
                      window.location.reload()
                    }}
                    className="min-h-[44px] whitespace-nowrap rounded-[12px] px-3 text-sm font-medium"
                    style={{ color: 'var(--danger, #e5484d)' }}
                  >
                    {t.app.logout}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
