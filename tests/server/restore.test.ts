import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { afterEach, describe, expect, it } from 'vitest'
import {
  validateArchive,
  stageRestore,
  applyPendingRestore
} from '../../src/server/restore/restore'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

async function makeZip(entries: Record<string, string>): Promise<JSZip> {
  const zip = new JSZip()
  for (const [name, value] of Object.entries(entries)) zip.file(name, value)
  return zip
}

describe('restore', () => {
  it('rejects path traversal', async () => {
    const zip = await makeZip({
      'manifest.json': JSON.stringify({
        format: 1,
        database: { file: 'data/hustl.db', sha256: '', bytes: 0 },
        files: []
      }),
      '../../evil.txt': 'x'
    })
    await expect(validateArchive(zip)).rejects.toThrow(/Pfad/)
  })

  it('rejects a wrong hash', async () => {
    const zip = await makeZip({
      'manifest.json': JSON.stringify({
        format: 1,
        database: { file: 'data/hustl.db', sha256: 'deadbeef', bytes: 1 },
        files: []
      }),
      'data/hustl.db': 'x'
    })
    await expect(validateArchive(zip)).rejects.toThrow(/Prüfsumme/)
  })

  it('rejects reserved restore paths', async () => {
    const zip = await makeZip({
      'manifest.json': JSON.stringify({
        format: 1,
        database: {
          file: 'data/hustl.db',
          sha256: '2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881',
          bytes: 1
        },
        files: []
      }),
      'data/hustl.db': 'x',
      'data/restore.pending': '/tmp/evil'
    })
    await expect(validateArchive(zip)).rejects.toThrow(/Reservierter Pfad/)
  })

  it('rejects a forged database path', async () => {
    const zip = await makeZip({
      'manifest.json': JSON.stringify({
        format: 1,
        database: {
          file: 'data/other.db',
          sha256: '2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881',
          bytes: 1
        },
        files: []
      }),
      'data/other.db': 'x'
    })
    await expect(validateArchive(zip)).rejects.toThrow(/Datenbankeintrag/)
  })

  it('stages valid data and applies it on the next start', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'hustl-restore-'))
    dirs.push(dataDir)
    writeFileSync(join(dataDir, 'hustl.db'), 'old')

    const zip = await makeZip({
      'manifest.json': JSON.stringify({
        format: 1,
        database: {
          file: 'data/hustl.db',
          sha256: '2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881',
          bytes: 1
        },
        files: []
      }),
      'data/hustl.db': 'x'
    })

    const { entries } = await validateArchive(zip)
    await stageRestore(dataDir, entries)
    expect(existsSync(join(dataDir, 'restore.pending'))).toBe(true)

    applyPendingRestore(dataDir)
    expect(existsSync(join(dataDir, 'restore.pending'))).toBe(false)
    expect(readFileSync(join(dataDir, 'hustl.db'), 'utf8')).toBe('x')

    const backup = readdirSync(dataDir).find((name) => name.startsWith('.before-restore-'))
    expect(backup).toBeTruthy()
    expect(readFileSync(join(dataDir, backup as string, 'hustl.db'), 'utf8')).toBe('old')
  })
})
