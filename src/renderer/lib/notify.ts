import { translateBackendMessage } from '../i18n/backend'
import { t } from '../i18n'

type Listener = (message: string) => void

const listeners = new Set<Listener>()

export function notify(message: string): void {
  for (const listener of listeners) listener(message)
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Letzte Instanz gegen stille Fehlschläge: Jede nicht behandelte
 * Promise-Ablehnung (typisch: ein Klick, dessen Request scheitert) wird
 * sichtbar, statt einfach zu verpuffen.
 */
export function installGlobalErrorToast(): void {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as unknown
    notify(translateBackendMessage(reason instanceof Error ? reason.message : String(reason ?? t.common.unknownError)))
  })
}
