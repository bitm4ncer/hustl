import { describe, it, expect, vi, afterEach } from 'vitest'
import { appMode, isElectronShell } from '../../src/renderer/platform'

afterEach(() => vi.unstubAllGlobals())

describe('platform', () => {
  it('erkennt den electron-dev-modus am preload-objekt', () => {
    vi.stubGlobal('window', { hustl: {} })
    expect(isElectronShell()).toBe(true)
    expect(appMode()).toBe('electron')
  })

  it('ist im browser web', () => {
    vi.stubGlobal('window', {})
    expect(appMode()).toBe('web')
  })
})
