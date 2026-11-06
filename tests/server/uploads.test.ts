import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildServer } from '../../src/server/index'
import { createSession } from '../../src/server/auth/store'

async function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), 'hustl-u-'))
  const app = await buildServer({
    dataDir,
    origin: 'https://hustl.example.com',
    rpId: 'hustl.example.com',
    port: 0,
    secureCookies: false
  })
  const session = createSession(app.db, { userAgent: null, ip: null })
  const headers = {
    origin: 'https://hustl.example.com',
    'x-hustl-client': 'web',
    cookie: `hustl_session=${session.token}`,
  }
  return { app, headers }
}

function multipart(filename: string, type: string, bytes: Buffer) {
  const boundary = '----hustl'
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ])
  return { payload: body, contentType: `multipart/form-data; boundary=${boundary}` }
}

describe('uploads', () => {
  it('lehnt SVG als Logo ab', async () => {
    const { app, headers } = await setup()
    const mp = multipart('x.svg', 'image/svg+xml', Buffer.from('<svg/>'))
    const res = await app.inject({
      method: 'POST',
      url: '/api/uploads/logo',
      headers: { ...headers, 'content-type': mp.contentType },
      payload: mp.payload
    })
    expect(res.statusCode).toBe(415)
    await app.close()
  })

  it('lehnt Nicht-PDF als Beleg ab', async () => {
    const { app, headers } = await setup()
    const mp = multipart('x.png', 'image/png', Buffer.from('x'))
    const res = await app.inject({
      method: 'POST',
      url: '/api/uploads/expense',
      headers: { ...headers, 'content-type': mp.contentType },
      payload: mp.payload
    })
    expect(res.statusCode).toBe(415)
    await app.close()
  })
})
