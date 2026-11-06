import { describe, it, expect } from 'vitest'
import { mkdtempSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveDataPath, toStoredPath } from '../../src/core/paths'

const root = mkdtempSync(join(tmpdir(), 'hustl-'))

// Windows ohne Developer Mode darf keine Datei-Symlinks anlegen (EPERM).
// Der Containment-Check bleibt aktiv; nur dieser Test kann dort nicht laufen.
const canSymlink = (() => {
  try {
    const dir = mkdtempSync(join(tmpdir(), 'hustl-link-'))
    writeFileSync(join(dir, 'a'), 'x')
    symlinkSync(join(dir, 'a'), join(dir, 'b'))
    return true
  } catch {
    return false
  }
})()

describe('resolveDataPath', () => {
  it('löst relative Pfade unterhalb von dataDir auf', () => {
    expect(resolveDataPath(root, 'invoices/2026-001/a.pdf')).toBe(
      join(root, 'invoices', '2026-001', 'a.pdf')
    )
  })
  it('lehnt .. ab', () => {
    expect(() => resolveDataPath(root, '../etc/passwd')).toThrow('invalid path')
  })
  it('lehnt absolute Pfade ab', () => {
    expect(() => resolveDataPath(root, 'C:/Windows/win.ini')).toThrow('invalid path')
    expect(() => resolveDataPath(root, '/etc/passwd')).toThrow('invalid path')
  })
  it.skipIf(!canSymlink)('lehnt Symlink-Ausbrüche ab', () => {
    mkdirSync(join(root, 'invoices'), { recursive: true })
    const outsideDir = mkdtempSync(join(tmpdir(), 'hustl-outside-'))
    writeFileSync(join(outsideDir, 'secret.txt'), 'x')
    symlinkSync(join(outsideDir, 'secret.txt'), join(root, 'invoices', 'link.pdf'))
    expect(() => resolveDataPath(root, 'invoices/link.pdf')).toThrow('invalid path')
  })
})

describe('toStoredPath', () => {
  it('macht aus einem absoluten Pfad einen relativen', () => {
    expect(toStoredPath(root, join(root, 'invoices', 'a.pdf'))).toBe('invoices/a.pdf')
  })
  it('lehnt Pfade außerhalb ab', () => {
    expect(() => toStoredPath(root, join(tmpdir(), 'x.pdf'))).toThrow('invalid path')
  })
})
