import { createServer } from 'node:net'
import { describe, expect, it } from 'vitest'
import { findFreePort } from '../../src/main/free-port'

describe('findFreePort', () => {
  it('returns a bindable loopback port', async () => {
    const port = await findFreePort()
    expect(port).toBeGreaterThan(0)

    const server = createServer()
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', resolve)
    })
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('honours a free preferred port', async () => {
    const first = await findFreePort()
    const preferred = await findFreePort('127.0.0.1', first)
    expect(preferred).toBe(first)
  })
})
