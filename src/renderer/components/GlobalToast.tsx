import { useEffect, useRef, useState } from 'react'
import { subscribe } from '../lib/notify'
import { Toast } from './Toast'

/** Zeigt Meldungen aus `notify()` an — auch unbehandelte Request-Fehler. */
export function GlobalToast(): React.ReactElement {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const unsubscribe = subscribe((msg) => {
      setMessage(msg)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setMessage(null), 4000)
    })
    return () => {
      unsubscribe()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  return <Toast message={message} />
}
