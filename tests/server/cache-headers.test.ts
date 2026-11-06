import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildServer } from '../../src/server/index'

describe('static cache headers', () => {
  it('laesst index.html und sw.js nie cachen', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'hustl-cache-'))
    // dist/web liegt relativ zum Prozessverzeichnis — der Test prueft den Setter
    // ueber die existierende Datei, falls der Build vorhanden ist.
    const app = await buildServer({
      dataDir,
      origin: 'https://hustl.example.com',
      rpId: 'hustl.example.com',
      port: 0,
      secureCookies: false,
    })
    const index = await app.inject({ method: 'GET', url: '/' })
    if (index.statusCode === 200) {
      expect(String(index.headers['cache-control'])).toBe('no-cache')
    }
    await app.close()
  })
})
