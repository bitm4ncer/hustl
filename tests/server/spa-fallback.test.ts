import { describe, it, expect } from 'vitest'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildServer } from '../../src/server/index'

const hasWebBuild = existsSync(join(process.cwd(), 'dist/web/index.html'))

describe('spa fallback', () => {
  it.skipIf(!hasWebBuild)('liefert fuer fehlende dateien 404 statt html', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'hustl-spa-'))
    const app = await buildServer({
      dataDir,
      origin: 'https://hustl.example.com',
      rpId: 'hustl.example.com',
      port: 0,
      secureCookies: false,
    })

    const missing = await app.inject({ method: 'GET', url: '/gibtsnicht.png' })
    expect(missing.statusCode).toBe(404)
    expect(String(missing.headers['content-type'] ?? '')).not.toContain('text/html')

    // Client-Routen ohne Endung bekommen weiterhin die App.
    const route = await app.inject({ method: 'GET', url: '/projekte' })
    expect(route.statusCode).toBe(200)
    expect(String(route.headers['content-type'])).toContain('text/html')

    await app.close()
  })
})
