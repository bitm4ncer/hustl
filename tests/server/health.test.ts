import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildServer } from '../../src/server/index'

const config = {
  dataDir: mkdtempSync(join(tmpdir(), 'hustl-srv-')),
  origin: 'https://hustl.example.com',
  rpId: 'hustl.example.com',
  port: 0,
  secureCookies: true
}

describe('health', () => {
  it('antwortet ohne Auth mit ok', async () => {
    const app = await buildServer(config)
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true, version: expect.any(String), db: 'ok' })
    await app.close()
  })
})
