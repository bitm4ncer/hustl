import { AnimatePresence, motion } from 'framer-motion'

/**
 * Kurze Rückmeldung am unteren Rand. Fehler dürfen nicht verschluckt werden:
 * ein stiller Fehlschlag sieht für den Benutzer aus, als hätte der Klick
 * nichts bewirkt.
 */
export function Toast({ message }: { message: string | null }): React.ReactElement {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[10px] px-4 py-2 text-sm"
          style={{ background: 'var(--surface-raised)', color: 'var(--text)', boxShadow: 'var(--shadow)' }}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
