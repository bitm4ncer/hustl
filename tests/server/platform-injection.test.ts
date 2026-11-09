import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildServer } from '../../src/server'
import type { Platform } from '../../src/platform/types'
import type { ServerConfig } from '../../src/server/config'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

function config(dataDir: string): ServerConfig {
  return {
    dataDir,
    origin: 'http://127.0.0.1:3999',
    rpId: 'localhost',
    port: 3999,
    secureCookies: false,
    local: true,
    trustProxy: false
  }
}

describe('buildServer injection', () => {
  it('serves the injected webRoot', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'hustl-data-'))
    const webRoot = mkdtempSync(join(tmpdir(), 'hustl-web-'))
    dirs.push(dataDir, webRoot)
    writeFileSync(join(webRoot, 'index.html'), '<h1>local-ui</h1>')

    const app = await buildServer(config(dataDir), { webRoot })
    const response = await app.inject({
      method: 'GET',
      url: '/',
      headers: { host: '127.0.0.1:3999' }
    })
    expect(response.body).toContain('local-ui')
    await app.close()
  })

  it('keeps the injected platform on the rpc context', async () => {
    const platform: Platform = {
      kind: 'electron',
      dataDir: '/tmp/x',
      renderPdf: async () => new Uint8Array([1, 2, 3])
    }
    const { rpcContext } = await import('../../src/server/rpc/registry')
    expect(rpcContext({} as never, '/tmp/x', platform).platform).toBe(platform)
  })
})
