import { describe, it, expect } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { applyMigrations } from '../../src/core/db/migrations'
import { importLegacy, relativeFor } from '../../src/server/migrate/legacy-import'

function fixture() {
  const src = mkdtempSync(join(tmpdir(), 'legacy-src-'))
  const dbFile = join(src, 'hustl.db')
  const db = new DatabaseSync(dbFile)
  applyMigrations(db)
  mkdirSync(join(src, 'invoices', '2026-001'), { recursive: true })
  const rel = 'invoices/2026-001/Rechnung - 2026-001_Kunde.pdf'
  writeFileSync(join(src, rel), '%PDF-1.4 alt')
  db.prepare("INSERT INTO clients (name) VALUES ('Kunde')").run()
  // Echter Altbestand: absoluter Windows-Pfad, wie ihn die Electron-App schrieb.
  const windowsPath = `C:\\Users\\example\\AppData\\Roaming\\Hustl\\${rel.replace(/\//g, '\\')}`
  db.prepare("INSERT INTO invoices (client_id, date, pdf_path) VALUES (1,'2026-01-01',?)").run(
    windowsPath
  )
  db.close()
  return { src, dbFile }
}

describe('legacy import', () => {
  it('behandelt ein Praefix ohne Pfadgrenze nicht als Treffer', () => {
    expect(
      relativeFor(
        'C:\\Users\\example\\AppData\\Roaming\\Hustl2\\invoices\\x.pdf',
        'C:\\Users\\example\\AppData\\Roaming\\Hustl'
      )
    ).toBe('invoices/x.pdf')
  })

  it('schreibt absolute Windows-Pfade auf relativ um', async () => {
    const { src, dbFile } = fixture()
    const target = mkdtempSync(join(tmpdir(), 'legacy-dst-'))
    const report = await importLegacy({ dbFile, sourceDir: src, oldRoot: src, targetDir: target })
    expect(report.invoices).toBe(1)
    expect(report.rewritten).toBe(1)
    const db = new DatabaseSync(join(target, 'hustl.db'))
    const row = db.prepare('SELECT pdf_path FROM invoices').get() as any
    expect(row.pdf_path).toBe('invoices/2026-001/Rechnung - 2026-001_Kunde.pdf')
  })

  it('normalisiert NFD-Dateinamen auf NFC', async () => {
    const { src, dbFile } = fixture()
    const dir = join(src, 'invoices', '2026-002')
    mkdirSync(dir, { recursive: true })
    // macOS/iCloud legt den Namen zerlegt ab: u + kombinierendes Trema.
    writeFileSync(join(dir, 'Rechnung - 2026-002_Du\u0308sseldorf.pdf'), '%PDF-1.4')
    const db = new DatabaseSync(dbFile)
    db.prepare(
      "INSERT INTO invoices (client_id, date, pdf_path) VALUES (1,'2026-01-02',?)"
    ).run('invoices/2026-002/Rechnung - 2026-002_D\u00fcsseldorf.pdf')
    db.close()

    const target = mkdtempSync(join(tmpdir(), 'legacy-dst-'))
    await importLegacy({ dbFile, sourceDir: src, oldRoot: src, targetDir: target })
    expect(
      existsSync(join(target, 'invoices/2026-002/Rechnung - 2026-002_D\u00fcsseldorf.pdf'))
    ).toBe(true)
  })

  it('bricht bei fehlender Datei ab und laesst targetDir unberuehrt', async () => {
    const { src, dbFile } = fixture()
    const parent = mkdtempSync(join(tmpdir(), 'legacy-dst-'))
    const target = join(parent, 'data')
    const db = new DatabaseSync(dbFile)
    db.prepare('UPDATE invoices SET pdf_path = ? WHERE id = 1').run(join(src, 'missing.pdf'))
    db.close()
    await expect(
      importLegacy({ dbFile, sourceDir: src, oldRoot: src, targetDir: target })
    ).rejects.toThrow('fehlende Datei')
    expect(() => new DatabaseSync(join(target, 'hustl.db'))).toThrow()
  })
})
