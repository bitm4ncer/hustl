import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import { DatabaseSync } from 'node:sqlite'
import { applyMigrations } from '../../src/core/db/migrations'
import { registerAuthRoutes } from '../../src/server/auth/routes'
import { createBootstrapToken, saveCredential } from '../../src/server/auth/store'

let seenRegistrationChallenge = ''

const fake = {
  registrationOptions: async () => ({ challenge: 'c1', rp: { id: 'hustl.example.com' } }),
  verifyRegistration: async (args: { challenge: string }) => {
    seenRegistrationChallenge = args.challenge
    return {
      credentialId: 'cred-1',
      publicKey: new Uint8Array([1]),
      counter: 0
    }
  },
  authenticationOptions: async () => ({ challenge: 'c2' }),
  verifyAuthentication: async () => ({ newCounter: 1 })
}

async function appWithFake() {
  const db = new DatabaseSync(':memory:')
  applyMigrations(db)
  const app = Fastify()
  await app.register(cookie)
  registerAuthRoutes(app, {
    db,
    authenticator: fake as any,
    config: {
      dataDir: '/tmp',
      origin: 'https://hustl.example.com',
      rpId: 'hustl.example.com',
      port: 0,
      secureCookies: false
    }
  })
  return { app, db }
}

describe('auth routes', () => {
  it('laesst den setup-token mehrfach beginnen, bis ein passkey existiert', async () => {
    const { app, db } = await appWithFake()
    const token = createBootstrapToken(db)
    const first = await app.inject({ method: 'POST', url: '/api/auth/register/begin', payload: { token } })
    const second = await app.inject({ method: 'POST', url: '/api/auth/register/begin', payload: { token } })
    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    await app.close()
  })

  it('speichert die challenge aus den registrierungs-optionen', async () => {
    const { app, db } = await appWithFake()
    const token = createBootstrapToken(db)
    const begin = await app.inject({
      method: 'POST',
      url: '/api/auth/register/begin',
      payload: { token }
    })
    expect(begin.statusCode).toBe(200)
    await app.inject({
      method: 'POST',
      url: '/api/auth/register/finish',
      payload: { challengeId: begin.json().challengeId, response: {}, label: 'Test' }
    })
    expect(seenRegistrationChallenge).toBe('c1')
    await app.close()
  })

  it('verweigert Registrierung ohne Bootstrap-Token', async () => {
    const { app } = await appWithFake()
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register/begin',
      payload: { token: 'wrong' }
    })
    expect(res.statusCode).toBe(403)
    await app.close()
  })

  it('setzt nach Login ein HttpOnly-Cookie', async () => {
    const { app, db } = await appWithFake()
    saveCredential(db, { id: 'cred-1', publicKey: new Uint8Array([1]), counter: 0 })
    const begin = await app.inject({ method: 'POST', url: '/api/auth/login/begin' })
    expect(begin.statusCode).toBe(200)
    const finish = await app.inject({
      method: 'POST',
      url: '/api/auth/login/finish',
      payload: { challengeId: begin.json().challengeId, response: { id: 'cred-1' } }
    })
    expect(finish.statusCode).toBe(200)
    const cookieHeader = String(finish.headers['set-cookie'])
    expect(cookieHeader).toMatch(/hustl_session=/)
    expect(cookieHeader).toMatch(/HttpOnly/)
    await app.close()
  })
})
