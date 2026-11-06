import { motion } from 'framer-motion'
import { Icon } from './Icon'
import { t } from '../i18n'

/** Authentifizierte Datei-Route des Servers (siehe `src/server/files/routes.ts`). */
export function fileUrl(kind: 'invoice' | 'offer' | 'expense' | 'statement', key: number | string): string {
  return `/api/files/${kind}/${encodeURIComponent(String(key))}`
}

const buttonStyle = {
  background: 'var(--surface-raised)',
  color: 'var(--text)',
} as const

const buttonClass =
  'flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors focus:outline-none focus-visible:[box-shadow:var(--focus)]'

/**
 * PDF öffnen und herunterladen. Die Desktop-Hülle lädt die gehostete
 * Oberfläche, deshalb funktionieren hier dieselben HTTP-Routen wie im Browser —
 * ein Electron-IPC-Aufruf wäre in der Web-App nicht verfügbar.
 */
export function FileActions({ url }: { url: string }): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <motion.button
        type="button"
        title={t.actions.openPdf}
        aria-label={t.actions.openPdf}
        onClick={() => window.open(url, '_blank', 'noopener')}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className={buttonClass}
        style={buttonStyle}
      >
        <Icon name="file-text" size={18} />
      </motion.button>
      <motion.a
        href={`${url}?download=1`}
        download
        title={t.actions.downloadPdf}
        aria-label={t.actions.downloadPdf}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className={buttonClass}
        style={buttonStyle}
      >
        <Icon name="download" size={18} />
      </motion.a>
    </div>
  )
}
