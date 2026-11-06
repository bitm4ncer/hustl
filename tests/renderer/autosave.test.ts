import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAutosaver } from '../../src/renderer/lib/autosave'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('autosave', () => {
  it('speichert erst nach der Ruhezeit und nur den letzten Wert', async () => {
    const save = vi.fn(async () => undefined)
    const autosaver = createAutosaver({ delay: 600, save })

    autosaver.schedule('a')
    autosaver.schedule('b')
    await vi.advanceTimersByTimeAsync(599)
    expect(save).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('b')
  })

  it('flush speichert sofort und bricht den Timer ab', async () => {
    const save = vi.fn(async () => undefined)
    const autosaver = createAutosaver({ delay: 600, save })

    autosaver.schedule('x')
    await autosaver.flush()
    expect(save).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(600)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('verliert keinen Wert, der waehrend eines laufenden Saves kommt', async () => {
    let release: () => void = () => undefined
    const first = new Promise<void>((resolve) => {
      release = resolve
    })
    const save = vi.fn().mockImplementationOnce(() => first).mockResolvedValue(undefined)
    const autosaver = createAutosaver({ delay: 10, save })

    autosaver.schedule('one')
    await vi.advanceTimersByTimeAsync(10)

    autosaver.schedule('two')
    release()
    await vi.advanceTimersByTimeAsync(10)

    expect(save.mock.calls.map((c) => c[0])).toEqual(['one', 'two'])
  })

  it('meldet Fehler und versucht es beim naechsten Wert erneut', async () => {
    const statuses: string[] = []
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined)
    const autosaver = createAutosaver({
      delay: 10,
      save,
      onStatus: (status) => statuses.push(status),
    })

    autosaver.schedule('a')
    await vi.advanceTimersByTimeAsync(10)
    expect(statuses).toContain('error')

    autosaver.schedule('b')
    await vi.advanceTimersByTimeAsync(10)
    expect(save).toHaveBeenLastCalledWith('b')
  })
})
