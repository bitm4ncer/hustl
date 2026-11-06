import { useEffect, useRef } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

/**
 * Darf ein Klick auf den Backdrop den Dialog schließen? Nur wenn die Geste
 * vollständig auf dem Backdrop begann und endete. Ein Text-Auswahl-Drag, der
 * im Dialog beginnt und außerhalb losgelassen wird, erzeugt einen `click` auf
 * dem gemeinsamen Vorfahren — nämlich dem Backdrop — und würde sonst alles
 * verwerfen.
 */
export function backdropCloseAllowed(
  startedOnBackdrop: boolean,
  endedOnBackdrop: boolean,
  busy: boolean
): boolean {
  return startedOnBackdrop && endedOnBackdrop && !busy
}

interface ModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  busy?: boolean
  closeOnBackdrop?: boolean
  labelledBy?: string
  widthClass?: string
}

export function Modal({
  open,
  onClose,
  children,
  busy = false,
  closeOnBackdrop = true,
  labelledBy,
  widthClass = 'max-w-xl',
}: ModalProps): ReactElement {
  const startedOnBackdrop = useRef(false)
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, busy])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onPointerDown={(event) => {
            startedOnBackdrop.current = event.target === event.currentTarget
          }}
          onPointerUp={(event) => {
            const endedOnBackdrop = event.target === event.currentTarget
            const allowed = backdropCloseAllowed(
              startedOnBackdrop.current,
              endedOnBackdrop,
              busy
            )
            startedOnBackdrop.current = false
            if (allowed && closeOnBackdrop) onClose()
          }}
        >
          <motion.div
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={`max-h-[85vh] w-full ${widthClass} overflow-y-auto rounded-[14px] p-5 outline-none`}
            style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
