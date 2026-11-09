import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildServer } from '../../src/server'
import { isLoopbackAddress } from '../../src/server/config'
import type { ServerConfig } from '../../src/server/config'

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hustl-local-'))
  dirs.push(dir)
  return dir
}

function localConfig(dataDir: string): ServerConfig {
  return {
    dataDir,
    origin: 'http://127.0.0.1:3999',
    rpId: 'localhost',
    port: 3999,
    secureCookies: false,
    local: true,
    trustProxy: false,
  }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

describe('local mode', () => {
  it('recognises loopback addresses', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true)
    expect(isLoopbackAddress('::1')).toBe(true)
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true)
    expect(isLoopbackAddress('10.0.0.5')).toBe(false)
  })

  it('reports an authenticated session without a cookie', async () => {
    const app = await buildServer(localConfig(tempDir()))
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      remoteAddress: '127.0.0.1',
      headers: { host: '127.0.0.1:3999' }
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ authenticated: true, local: true })
    await app.close()
  })

  it('rejects a foreign host header even from loopback', async () => {
    const app = await buildServer(localConfig(tempDir()))
    const response = await app.inject({
      method: 'GET',
      url: '/api/export/full',
      remoteAddress: '127.0.0.1',
      headers: { host: 'attacker.example:3999' }
    })
    expect(response.statusCode).toBe(403)
    await app.close()
  })

  it('ignores forged forwarded headers for the loopback check', async () => {
    const app = await buildServer({ ...localConfig(tempDir()), trustProxy: true })
    const response = await app.inject({
      method: 'GET',
      url: '/api/export/full',
      remoteAddress: '10.0.0.5',
      headers: { host: '127.0.0.1:3999', 'x-forwarded-for': '127.0.0.1' }
    })
    expect(response.statusCode).toBe(401)
    await app.close()
  })

  it('rejects local API calls from non-loopback', async () => {
    const app = await buildServer(localConfig(tempDir()))
    const response = await app.inject({
      method: 'POST',
      url: '/api/rpc/listClients',
      remoteAddress: '10.0.0.5',
      headers: {
        origin: 'http://127.0.0.1:3999',
        host: '127.0.0.1:3999',
        'x-hustl-client': 'web'
      },
      payload: { args: [] }
    })
    expect(response.statusCode).toBe(401)
    await app.close()
  })
})
