import { useEffect, useRef, useState } from 'react'
import { createAutosaver, type AutosaveStatus } from './autosave'

/**
 * React-Hülle um `createAutosaver`. Der erste Wert nach dem Öffnen wird nicht
 * gespeichert — sonst würde jedes Öffnen eines Dialogs einen Schreibvorgang
 * auslösen.
 */
export function useAutosave<T>(options: {
  value: T
  enabled: boolean
  delay?: number
  save: (value: T) => Promise<void>
}): { status: AutosaveStatus; flush: () => Promise<void>; cancel: () => void } {
  const { value, enabled, delay = 600, save } = options
  const [status, setStatus] = useState<AutosaveStatus>('idle')

  const saveRef = useRef(save)
  saveRef.current = save

  const saverRef = useRef<ReturnType<typeof createAutosaver<T>> | null>(null)
  if (saverRef.current === null) {
    saverRef.current = createAutosaver<T>({
      delay,
      save: (input) => saveRef.current(input),
      onStatus: setStatus,
    })
  }

  const armed = useRef(false)
  const valueRef = useRef(value)
  valueRef.current = value

  useEffect(() => {
    const saver = saverRef.current
    if (!saver) return
    if (!enabled) {
      saver.cancel()
      armed.current = false
      return
    }
    if (!armed.current) {
      armed.current = true
      return
    }
    // Während getippt wird, nicht speichern: ein Speichern mitten in der
    // Eingabe schließt auf iOS die Tastatur bzw. stiehlt den Fokus.
    const el = document.activeElement
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
    saver.schedule(value)
  }, [value, enabled])

  // Beim Verlassen eines Feldes wird der aktuelle Stand gespeichert.
  useEffect(() => {
    const onBlur = (event: FocusEvent): void => {
      const target = event.target
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return
      if (!enabled) return
      saverRef.current?.schedule(valueRef.current)
    }
    document.addEventListener('blur', onBlur, true)
    return () => document.removeEventListener('blur', onBlur, true)
  }, [enabled])

  return {
    status,
    flush: () => saverRef.current?.flush() ?? Promise.resolve(),
    cancel: () => saverRef.current?.cancel(),
  }
}
