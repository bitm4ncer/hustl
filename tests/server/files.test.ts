import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildServer } from '../../src/server/index'
import { createSession } from '../../src/server/auth/store'

async function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), 'hustl-f-'))
  const app = await buildServer({
    dataDir,
    origin: 'https://hustl.example.com',
    rpId: 'hustl.example.com',
    port: 0,
    secureCookies: false
  })
  const session = createSession(app.db, { userAgent: null, ip: null })
  return { app, db: app.db, dataDir, cookie: `hustl_session=${session.token}` }
}

describe('files', () => {
  it('liefert 401 ohne Session', async () => {
    const { app } = await setup()
    const res = await app.inject({ method: 'GET', url: '/api/files/invoice/1' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('liefert 404 fuer unbekannte Rechnung', async () => {
    const { app, cookie } = await setup()
    const res = await app.inject({
      method: 'GET',
      url: '/api/files/invoice/999',
      headers: { cookie }
    })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('bricht bei Pfadausbruch ab', async () => {
    const { app, db, cookie, dataDir } = await setup()
    mkdirSync(join(dataDir, 'invoices'), { recursive: true })
    writeFileSync(join(dataDir, 'secret.txt'), 'x')
    db.prepare("INSERT INTO clients (name) VALUES ('C')").run()
    db.prepare(
      "INSERT INTO invoices (client_id, date, pdf_path) VALUES (1,'2026-01-01','../secret.txt')"
    ).run()
    const res = await app.inject({
      method: 'GET',
      url: '/api/files/invoice/1',
      headers: { cookie }
    })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('liefert Rechnungen inline', async () => {
    const { app, db, cookie, dataDir } = await setup()
    mkdirSync(join(dataDir, 'invoices'), { recursive: true })
    writeFileSync(join(dataDir, 'invoices', 'a.pdf'), '%PDF-1.4')
    db.prepare("INSERT INTO clients (name) VALUES ('C')").run()
    db.prepare(
      "INSERT INTO invoices (client_id, date, pdf_path) VALUES (1,'2026-01-01','invoices/a.pdf')"
    ).run()
    const res = await app.inject({
      method: 'GET',
      url: '/api/files/invoice/1',
      headers: { cookie }
    })
    expect(res.statusCode).toBe(200)
    expect(String(res.headers['content-disposition'])).toMatch(/^inline/)
    expect(res.headers['content-type']).toContain('application/pdf')
    await app.close()
  })
})
