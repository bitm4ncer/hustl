import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildServer } from '../../src/server/index'
import { createSession } from '../../src/server/auth/store'

const origin = 'https://hustl.example.com'

async function app() {
  const instance = await buildServer({
    dataDir: mkdtempSync(join(tmpdir(), 'hustl-export-')),
    origin,
    rpId: 'hustl.example.com',
    port: 0,
    secureCookies: true,
  })
  const session = createSession(instance.db, { userAgent: null, ip: null })
  const headers = {
    origin,
    'x-hustl-client': 'web',
    cookie: `hustl_session=${session.token}`,
  }
  return { app: instance, headers }
}

describe('monatsexport', () => {
  it('meldet die verfuegbaren teile eines monats', async () => {
    const { app: a, headers } = await app()
    const res = await a.inject({ method: 'GET', url: '/api/export/month/2026-10/info', headers })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ invoices: 0, expenses: 0, statement: false })
    await a.close()
  })

  it('liefert rechnungen und belege als eigene zip-dateien', async () => {
    const { app: a, headers } = await app()
    for (const part of ['invoices', 'expenses']) {
      const res = await a.inject({ method: 'GET', url: `/api/export/month/2026-10/${part}`, headers })
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('application/zip')
      expect(String(res.headers['content-disposition'])).toContain('.zip')
    }
    await a.close()
  })

  it('gibt 404 ohne kontoauszug und bei unbekanntem teil', async () => {
    const { app: a, headers } = await app()
    const stmt = await a.inject({ method: 'GET', url: '/api/export/month/2026-10/statement', headers })
    expect(stmt.statusCode).toBe(404)
    const unknown = await a.inject({ method: 'GET', url: '/api/export/month/2026-10/alles', headers })
    expect(unknown.statusCode).toBe(404)
    await a.close()
  })

  it('lehnt ungueltige monate ab', async () => {
    const { app: a, headers } = await app()
    const res = await a.inject({ method: 'GET', url: '/api/export/month/2026-1/invoices', headers })
    expect(res.statusCode).toBe(400)
    await a.close()
  })

  it('rechnet eine rechnung in den monat der zahlung, nicht des rechnungsdatums', async () => {
    const { app: a, headers } = await app()
    a.db.exec('PRAGMA foreign_keys = OFF')
    a.db
      .prepare(
        `INSERT INTO invoices (client_id, date, status, paid_at, pdf_path)
         VALUES (1, '2026-09-22', 'paid', '2026-10-12', 'invoices/2026037.pdf')`,
      )
      .run()

    const october = await a.inject({ method: 'GET', url: '/api/export/month/2026-10/info', headers })
    expect(october.json().invoices).toBe(1)

    const september = await a.inject({ method: 'GET', url: '/api/export/month/2026-09/info', headers })
    expect(september.json().invoices).toBe(0)

    await a.close()
  })

  it('laesst eine unbezahlte rechnung in ihrem rechnungsmonat', async () => {
    const { app: a, headers } = await app()
    a.db.exec('PRAGMA foreign_keys = OFF')
    a.db
      .prepare(
        `INSERT INTO invoices (client_id, date, status, pdf_path)
         VALUES (1, '2026-10-19', 'finalized', 'invoices/2026041.pdf')`,
      )
      .run()

    const october = await a.inject({ method: 'GET', url: '/api/export/month/2026-10/info', headers })
    expect(october.json().invoices).toBe(1)
    await a.close()
  })
})
