import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import jszip from 'jszip'
import { DatabaseSync } from 'node:sqlite'
import { buildServer } from '../../src/server/index'
import { createSession } from '../../src/server/auth/store'
import { buildFullArchive } from '../../src/server/archive/build'

describe('archive consistency', () => {
  it('manifest counts stimmen mit der db im archiv ueberein, auch bei parallelen writes', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'hustl-cons-'))
    const app = await buildServer({
      dataDir,
      origin: 'https://hustl.example.com',
      rpId: 'hustl.example.com',
      port: 0,
      secureCookies: false,
    })
    for (let index = 0; index < 20; index += 1) {
      app.db.prepare("INSERT INTO clients (name) VALUES (?)").run(`C${index}`)
    }

    const { stream } = await buildFullArchive({ db: app.db, dataDir })
    // Während das Archiv läuft, schreibt die App weiter.
    app.db.prepare("INSERT INTO clients (name) VALUES ('during')").run()

    const chunks: Buffer[] = []
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      stream.on('end', () => resolve())
      stream.on('error', reject)
    })

    const zip = await jszip.loadAsync(Buffer.concat(chunks))
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'))

    // Die DB im ZIP ist der Snapshot — ihre Zahl muss zum Manifest passen.
    const snapshotPath = join(dataDir, '..', `manifest-check-${Date.now()}.db`)
    const bytes = await zip.file('data/hustl.db')!.async('nodebuffer')
    const { writeFileSync, rmSync } = await import('node:fs')
    writeFileSync(snapshotPath, bytes)
    const snapshot = new DatabaseSync(snapshotPath, { readOnly: true })
    const count = (snapshot.prepare('SELECT COUNT(*) AS c FROM clients').get() as { c: number }).c
    snapshot.close()
    rmSync(snapshotPath, { force: true })

    expect(manifest.counts.clients).toBe(count)
    expect(manifest.counts.clients).toBe(20)
    await app.close()
  })
})
