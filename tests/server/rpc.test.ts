import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildServer } from '../../src/server/index'
import { createSession } from '../../src/server/auth/store'

const origin = 'https://hustl.example.com'

async function app() {
  const instance = await buildServer({
    dataDir: mkdtempSync(join(tmpdir(), 'hustl-rpc-')),
    origin,
    rpId: 'hustl.example.com',
    port: 0,
    secureCookies: true
  })
  const session = createSession(instance.db, { userAgent: null, ip: null })
  const headers = {
    origin,
    'x-hustl-client': 'web',
    cookie: `hustl_session=${session.token}`,
  }
  return { app: instance, headers }
}

describe('rpc', () => {
  it('lehnt unbekannte Methoden ab', async () => {
    const { app: a, headers } = await app()
    const res = await a.inject({
      method: 'POST',
      url: '/api/rpc/__evil',
      payload: { args: [] },
      headers,
    })
    expect(res.statusCode).toBe(404)
    await a.close()
  })

  it('gibt bei ungültigen Argumenten VALIDATION zurück', async () => {
    const { app: a, headers } = await app()
    const res = await a.inject({
      method: 'POST',
      url: '/api/rpc/getInvoice',
      payload: { args: ['x'] },
      headers,
    })
    expect(res.json()).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: expect.any(String) },
    })
    await a.close()
  })

  it('liefert keine Stacktraces', async () => {
    const { app: a, headers } = await app()
    const res = await a.inject({
      method: 'POST',
      url: '/api/rpc/getInvoice',
      payload: { args: [1] },
      headers,
    })
    expect(JSON.stringify(res.json())).not.toMatch(/at |Error:|\.ts:/)
    await a.close()
  })

  // Regression: `undefined` wird in JSON zu `null`. Ein neuer Datensatz darf
  // daran nicht scheitern — sonst legt "Speichern" stillschweigend nichts an.
  it('legt einen Beleg mit null als optionaler ID an', async () => {
    const { app: a, headers } = await app()
    const res = await a.inject({
      method: 'POST',
      url: '/api/rpc/saveExpense',
      payload: {
        args: [
          {
            vendor: 'OpenCode',
            category: '',
            date: '2026-11-02',
            paidAt: '2026-11-02',
            gross: 37.19,
            originalAmount: 40,
            originalCurrency: 'USD',
            vatRate: 19,
            note: '',
            pdfPath: null,
            sourceName: null,
          },
          null,
        ],
      },
      headers,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ ok: true })
    expect(res.json().data).toEqual(expect.any(Number))

    const list = await a.inject({
      method: 'POST',
      url: '/api/rpc/listExpenses',
      payload: { args: [] },
      headers,
    })
    expect(list.json().data).toHaveLength(1)
    await a.close()
  })

  it('legt eine Fixkostenposition mit null als optionaler ID an', async () => {
    const { app: a, headers } = await app()
    const res = await a.inject({
      method: 'POST',
      url: '/api/rpc/saveFixedCost',
      payload: {
        args: [
          {
            name: 'Miete',
            category: 'Raum',
            gross: 500,
            vatRate: 0,
            interval: 'monthly',
            startDate: '2026-01-01',
            endDate: null,
            active: true,
            note: '',
          },
          null,
        ],
      },
      headers,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ ok: true })
    await a.close()
  })
})
