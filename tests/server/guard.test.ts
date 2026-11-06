import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildServer } from '../../src/server/index'
import { resetRateLimits } from '../../src/server/auth/guard'
import { createSession } from '../../src/server/auth/store'

const base = {
  dataDir: mkdtempSync(join(tmpdir(), 'hustl-g-')),
  origin: 'https://hustl.example.com',
  rpId: 'hustl.example.com',
  port: 0,
  secureCookies: false,
}

beforeEach(() => resetRateLimits())

describe('guard', () => {
  it('verweigert RPC ohne Session', async () => {
    const app = await buildServer(base)
    const res = await app.inject({
      method: 'POST',
      url: '/api/rpc/listClients',
      payload: { args: [] },
      headers: {
        origin: 'https://hustl.example.com',
        'x-hustl-client': 'web',
      },
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('verweigert fremde Origin', async () => {
    const app = await buildServer(base)
    const session = createSession(app.db, { userAgent: null, ip: null })
    const res = await app.inject({
      method: 'POST',
      url: '/api/rpc/listClients',
      payload: { args: [] },
      headers: {
        origin: 'https://evil.example',
        'x-hustl-client': 'web',
        cookie: `hustl_session=${session.token}`,
      },
    })
    expect(res.statusCode).toBe(403)
    await app.close()
  })

  it('setzt Security-Header', async () => {
    const app = await buildServer(base)
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(String(res.headers['content-security-policy'])).toContain("frame-ancestors 'none'")
    expect(res.headers['referrer-policy']).toBe('no-referrer')
    await app.close()
  })

  it('laesst eine gueltige Session durch', async () => {
    const app = await buildServer(base)
    const session = createSession(app.db, { userAgent: null, ip: null })
    const res = await app.inject({
      method: 'POST',
      url: '/api/rpc/listClients',
      payload: { args: [] },
      headers: {
        origin: 'https://hustl.example.com',
        'x-hustl-client': 'web',
        cookie: `hustl_session=${session.token}`,
      },
    })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})
