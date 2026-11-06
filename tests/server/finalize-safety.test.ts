import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { todayInBerlin } from '../../src/core/clock'
import { invoiceOutputPath } from '../../src/core/export/pdf-exporter'

describe('finalize safety', () => {
  it('berechnet das Datum in Europe/Berlin, nicht UTC', () => {
    // 2026-12-31T23:30Z ist in Berlin bereits der 01.01.2027
    expect(todayInBerlin(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01')
  })

  it('behaelt Umlaute und entfernt Pfadtrenner', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hustl-u-'))
    const out = invoiceOutputPath(
      dir,
      { number: '2026-001' } as any,
      { name: 'Müller / Söhne' } as any
    )
    const base = out.file.split(/[\\/]/).pop() ?? ''
    expect(base).toContain('Müller')
    expect(base).toContain('Söhne')
    expect(base).not.toContain('/')
  })

  it('laesst keinen Dateinamen aus dataDir ausbrechen', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hustl-n-'))
    const out = invoiceOutputPath(
      dir,
      { number: '2026-001' } as any,
      { name: '../../etc/passwd' } as any
    )
    expect(relative(dir, out.file).startsWith('..')).toBe(false)
    expect(out.file).not.toContain('..')
  })
})
