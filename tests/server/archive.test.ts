import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import jszip from 'jszip'
import { buildServer } from '../../src/server/index'
import { createSession } from '../../src/server/auth/store'

async function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), 'hustl-a-'))
  const app = await buildServer({
    dataDir,
    origin: 'https://hustl.example.com',
    rpId: 'hustl.example.com',
    port: 0,
    secureCookies: false
  })
  const session = createSession(app.db, { userAgent: null, ip: null })
  return { app, cookie: `hustl_session=${session.token}` }
}

describe('vollarchiv', () => {
  it('enthaelt manifest, db und csv, aber keine auth-tabellen', async () => {
    const { app, cookie } = await setup()
    const res = await app.inject({
      method: 'GET',
      url: '/api/export/full',
      headers: { cookie }
    })
    expect(res.statusCode).toBe(200)
    const zip = await jszip.loadAsync(res.rawPayload)
    const names = Object.keys(zip.files)
    expect(names).toEqual(
      expect.arrayContaining(['README.txt', 'manifest.json', 'data/hustl.db', 'csv/invoices.csv'])
    )
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'))
    expect(manifest.format).toBe(1)
    expect(manifest.database.sha256).toMatch(/^[a-f0-9]{64}$/)
    const dbBytes = await zip.file('data/hustl.db')!.async('nodebuffer')
    expect(dbBytes.includes(Buffer.from('auth_sessions'))).toBe(false)
    await app.close()
  })

  it('manifest zaehlt denselben Stand wie die live-db', async () => {
    const { app, cookie } = await setup()
    app.db.prepare("INSERT INTO clients (name) VALUES ('A'),('B')").run()
    const res = await app.inject({
      method: 'GET',
      url: '/api/export/full',
      headers: { cookie }
    })
    const zip = await jszip.loadAsync(res.rawPayload)
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'))
    expect(manifest.counts.clients).toBe(2)
    await app.close()
  })
})
