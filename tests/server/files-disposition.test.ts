import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildServer } from '../../src/server/index'
import { createSession } from '../../src/server/auth/store'

async function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), 'hustl-disp-'))
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

describe('content disposition', () => {
  it('liefert Belege als Download und Rechnungen inline', async () => {
    const { app, db, dataDir, cookie } = await setup()
    mkdirSync(join(dataDir, 'invoices'), { recursive: true })
    mkdirSync(join(dataDir, 'expenses'), { recursive: true })
    writeFileSync(join(dataDir, 'invoices', 'a.pdf'), '%PDF-1.4')
    writeFileSync(join(dataDir, 'expenses', 'b.pdf'), '%PDF-1.4')

    db.prepare("INSERT INTO clients (name) VALUES ('Kunde')").run()
    db.prepare(
      "INSERT INTO invoices (client_id, date, pdf_path) VALUES (1,'2026-01-01','invoices/a.pdf')"
    ).run()
    db.prepare(
      "INSERT INTO expenses (date, gross, pdf_path) VALUES ('2026-01-01', 10, 'expenses/b.pdf')"
    ).run()

    const invoice = await app.inject({
      method: 'GET',
      url: '/api/files/invoice/1',
      headers: { cookie },
    })
    expect(String(invoice.headers['content-disposition'])).toMatch(/^inline/)

    const download = await app.inject({
      method: 'GET',
      url: '/api/files/invoice/1?download=1',
      headers: { cookie },
    })
    expect(download.statusCode).toBe(200)
    expect(String(download.headers['content-disposition'])).toMatch(/^attachment/)

    const expense = await app.inject({
      method: 'GET',
      url: '/api/files/expense/1',
      headers: { cookie },
    })
    expect(String(expense.headers['content-disposition'])).toMatch(/^attachment/)

    await app.close()
  })
})
