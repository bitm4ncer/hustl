export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

export interface Autosaver<T> {
  schedule(value: T): void
  /** Speichert sofort, was noch aussteht, und wartet auf laufende Saves. */
  flush(): Promise<void>
  cancel(): void
}

/**
 * Debounce-Autosave mit serialisierten Schreibvorgängen. Ein neuer Wert während
 * eines laufenden Saves wird nicht verworfen, sondern danach geschrieben.
 */
export function createAutosaver<T>(options: {
  delay: number
  save: (value: T) => Promise<void>
  onStatus?: (status: AutosaveStatus) => void
}): Autosaver<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: { value: T } | null = null
  let running: Promise<void> | null = null
  let lastError: unknown = null

  const emit = (status: AutosaveStatus): void => options.onStatus?.(status)

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function drain(): Promise<void> {
    if (running) return running
    running = (async () => {
      while (pending) {
        const { value } = pending
        pending = null
        emit('saving')
        try {
          await options.save(value)
          lastError = null
          emit('saved')
        } catch (error) {
          // Wert zurücklegen, damit ein späterer Versuch ihn nicht verliert.
          pending = pending ?? { value }
          lastError = error
          emit('error')
          return
        }
      }
    })().finally(() => {
      running = null
    })
    return running
  }

  return {
    schedule(value: T): void {
      pending = { value }
      lastError = null
      emit('pending')
      clearTimer()
      timer = setTimeout(() => {
        timer = null
        void drain()
      }, options.delay)
    },

    async flush(): Promise<void> {
      clearTimer()
      if (running) await running
      if (pending) await drain()
      if (pending && lastError) throw lastError
    },

    cancel(): void {
      clearTimer()
      pending = null
      lastError = null
      emit('idle')
    },
  }
}
