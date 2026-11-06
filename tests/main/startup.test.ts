import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  normalizeServerUrl,
  readServerConfig,
  resolveStartupTarget,
  writeServerConfig
} from '../../src/main/startup'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hustl-startup-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('normalizeServerUrl', () => {
  it('ergaenzt https und entfernt den abschliessenden slash', () => {
    expect(normalizeServerUrl('hustl.example.com/')).toBe('https://hustl.example.com')
    expect(normalizeServerUrl(' https://hustl.example.com/ ')).toBe('https://hustl.example.com')
  })

  it('erlaubt http fuer lokale instanzen', () => {
    expect(normalizeServerUrl('http://localhost:3000')).toBe('http://localhost:3000')
  })

  it('behaelt einen pfad', () => {
    expect(normalizeServerUrl('https://example.com/hustl/')).toBe('https://example.com/hustl')
  })

  it('lehnt fremde schemata, zugangsdaten und query/hash ab', () => {
    expect(normalizeServerUrl('ftp://example.com')).toBeNull()
    expect(normalizeServerUrl('https://user:pass@example.com')).toBeNull()
    expect(normalizeServerUrl('https://example.com/?x=1')).toBeNull()
    expect(normalizeServerUrl('https://example.com/#x')).toBeNull()
    expect(normalizeServerUrl('')).toBeNull()
    expect(normalizeServerUrl('nicht mal eine url')).toBeNull()
  })
})

describe('server config', () => {
  it('schreibt und liest die url', () => {
    const dir = tempDir()
    writeServerConfig(dir, 'https://hustl.example.com/')

    expect(readServerConfig(dir)).toBe('https://hustl.example.com')
  })

  it('liefert null bei fehlender oder kaputter datei', () => {
    const dir = tempDir()
    expect(readServerConfig(dir)).toBeNull()

    writeServerConfig(dir, 'https://hustl.example.com')
    expect(readServerConfig(join(dir, 'gibt-es-nicht'))).toBeNull()
  })
})

describe('startup target', () => {
  it('nutzt in dev den lokalen pfad', () => {
    expect(resolveStartupTarget({ isPackaged: false, env: {} })).toEqual({ mode: 'local' })
  })

  it('zeigt verpackt ohne gespeicherte url den einrichtungsdialog', () => {
    expect(resolveStartupTarget({ isPackaged: true, env: {}, storedUrl: null })).toEqual({
      mode: 'setup'
    })
  })

  it('laedt verpackt die gespeicherte url', () => {
    expect(
      resolveStartupTarget({
        isPackaged: true,
        env: {},
        storedUrl: 'https://hustl.example.com'
      })
    ).toEqual({ mode: 'remote', url: 'https://hustl.example.com' })
  })

  it('erlaubt override per env und normalisiert ihn', () => {
    expect(
      resolveStartupTarget({
        isPackaged: false,
        env: { HUSTL_REMOTE_URL: 'https://x.test/' }
      })
    ).toEqual({ mode: 'remote', url: 'https://x.test' })
  })

  it('ignoriert einen ungueltigen override', () => {
    expect(
      resolveStartupTarget({
        isPackaged: true,
        env: { HUSTL_REMOTE_URL: 'ftp://x.test' },
        storedUrl: 'https://hustl.example.com'
      })
    ).toEqual({ mode: 'remote', url: 'https://hustl.example.com' })
  })
})
