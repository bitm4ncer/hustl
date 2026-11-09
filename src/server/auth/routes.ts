import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { DatabaseSync } from 'node:sqlite'
import type { ServerConfig } from '../config'
import {
  createChallenge,
  consumeChallenge,
  createSession,
  getSession,
  deleteSession,
  deleteOtherSessions,
  createRecoveryCodes,
  consumeRecoveryCode,
  verifyBootstrapToken,
  clearBootstrap,
  listCredentials,
  saveCredential,
  updateCredentialCounter,
  hasCredentials,
} from './store'

export const SESSION_COOKIE = 'hustl_session'
const SESSION_MAX_AGE = 30 * 24 * 60 * 60

export interface Authenticator {
  registrationOptions(args: {
    rpId: string
    origin: string
    userName: string
  }): Promise<unknown>
  verifyRegistration(args: {
    response: unknown
    challenge: string
    origin: string
    rpId: string
  }): Promise<{ credentialId: string; publicKey: Uint8Array; counter: number; transports?: string[] }>
  authenticationOptions(args: { rpId: string; credentialIds: string[] }): Promise<unknown>
  verifyAuthentication(args: {
    response: unknown
    challenge: string
    origin: string
    rpId: string
    credential: { publicKey: Uint8Array; counter: number }
  }): Promise<{ newCounter: number }>
}

interface AuthDeps {
  db: DatabaseSync
  authenticator: Authenticator
  config: ServerConfig
}

function setSessionCookie(reply: FastifyReply, token: string, secure: boolean): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'strict',
    maxAge: SESSION_MAX_AGE,
  })
}

function currentSession(db: DatabaseSync, request: FastifyRequest): { id: string } | null {
  const token = request.cookies?.[SESSION_COOKIE]
  if (!token) return null
  return getSession(db, token)
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthDeps): void {
  const { db, authenticator, config } = deps

  // --- Login ----------------------------------------------------------------
  app.post('/api/auth/login/begin', async (_request, reply) => {
    const credentials = listCredentials(db)
    const options = await authenticator.authenticationOptions({
      rpId: config.rpId,
      credentialIds: credentials.map((credential) => credential.id),
    })
    // Der Browser signiert die Challenge aus den Optionen — genau die muss
    // gespeichert werden, nicht eine zweite zufällige.
    const challenge = createChallenge(db, 'login', (options as { challenge: string }).challenge)
    return reply.send({ challengeId: challenge.id, options })
  })

  app.post('/api/auth/login/finish', async (request, reply) => {
    const body = (request.body ?? {}) as { challengeId?: string; response?: { id?: string } }
    if (!body.challengeId || !body.response?.id) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION', message: 'Missing assertion' } })
    }
    const challenge = consumeChallenge(db, body.challengeId, 'login')
    if (!challenge) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION', message: 'Challenge expired' } })
    }
    const credential = listCredentials(db).find((c) => c.id === body.response?.id)
    if (!credential) {
      return reply.code(401).send({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Unknown credential' } })
    }
    try {
      const result = await authenticator.verifyAuthentication({
        response: body.response,
        challenge,
        origin: config.origin,
        rpId: config.rpId,
        credential: { publicKey: credential.publicKey, counter: credential.counter },
      })
      updateCredentialCounter(db, credential.id, result.newCounter)
    } catch {
      return reply.code(401).send({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Verification failed' } })
    }
    const session = createSession(db, {
      userAgent: request.headers['user-agent'] ?? null,
      ip: request.ip,
    })
    setSessionCookie(reply, session.token, config.secureCookies)
    return reply.send({ ok: true })
  })

  // --- Registrierung --------------------------------------------------------
  app.post('/api/auth/register/begin', async (request, reply) => {
    const body = (request.body ?? {}) as { token?: string }
    const session = currentSession(db, request)
    const allowed =
      session != null ||
      (typeof body.token === 'string' &&
        !hasCredentials(db) &&
        verifyBootstrapToken(db, body.token))
    if (!allowed) {
      return reply.code(403).send({ ok: false, error: { code: 'FORBIDDEN', message: 'Setup token required' } })
    }
    const options = await authenticator.registrationOptions({
      rpId: config.rpId,
      origin: config.origin,
      userName: 'hustl',
    })
    const challenge = createChallenge(db, 'register', (options as { challenge: string }).challenge)
    return reply.send({ challengeId: challenge.id, options })
  })

  app.post('/api/auth/register/finish', async (request, reply) => {
    const body = (request.body ?? {}) as { challengeId?: string; response?: unknown; label?: string }
    if (!body.challengeId || !body.response) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION', message: 'Missing attestation' } })
    }
    const challenge = consumeChallenge(db, body.challengeId, 'register')
    if (!challenge) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION', message: 'Challenge expired' } })
    }
    try {
      const result = await authenticator.verifyRegistration({
        response: body.response,
        challenge,
        origin: config.origin,
        rpId: config.rpId,
      })
      const firstCredential = !hasCredentials(db)
      saveCredential(db, {
        id: result.credentialId,
        publicKey: result.publicKey,
        counter: result.counter,
        transports: result.transports?.join(',') ?? null,
        label: body.label ?? '',
      })
      // Erst jetzt ist die Einrichtung wirklich abgeschlossen.
      if (firstCredential) clearBootstrap(db)
    } catch (error) {
      console.error('register finish:', error instanceof Error ? error.message : error)
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION', message: 'Registration failed' } })
    }

    // Die erste Registrierung meldet direkt an; danach bleibt die bestehende
    // Session gültig.
    if (!currentSession(db, request)) {
      const session = createSession(db, {
        userAgent: request.headers['user-agent'] ?? null,
        ip: request.ip,
      })
      setSessionCookie(reply, session.token, config.secureCookies)
    }
    const recoveryCodes = await createRecoveryCodes(db)
    return reply.send({ ok: true, recoveryCodes })
  })

  // --- Recovery -------------------------------------------------------------
  app.post('/api/auth/recover', async (request, reply) => {
    const body = (request.body ?? {}) as { code?: string }
    if (!body.code || !(await consumeRecoveryCode(db, body.code))) {
      return reply.code(403).send({ ok: false, error: { code: 'FORBIDDEN', message: 'Invalid code' } })
    }
    const options = await authenticator.registrationOptions({
      rpId: config.rpId,
      origin: config.origin,
      userName: 'hustl',
    })
    const challenge = createChallenge(db, 'register', (options as { challenge: string }).challenge)
    return reply.send({ challengeId: challenge.id, options })
  })

  // --- Session --------------------------------------------------------------
  app.get('/api/auth/session', async (request, reply) => {
    if (config.local) {
      return reply.send({ authenticated: true, local: true, credentials: [], needsSetup: false })
    }
    const session = currentSession(db, request)
    return reply.send({
      authenticated: session != null,
      credentials: listCredentials(db).map((credential) => ({ label: credential.label })),
      needsSetup: !hasCredentials(db),
    })
  })

  app.post('/api/auth/logout', async (request, reply) => {
    const session = currentSession(db, request)
    if (session) deleteSession(db, session.id)
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return reply.send({ ok: true })
  })

  app.post('/api/auth/sessions/revoke-all', async (request, reply) => {
    const session = currentSession(db, request)
    if (!session) {
      return reply.code(401).send({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'No session' } })
    }
    deleteOtherSessions(db, session.id)
    return reply.send({ ok: true })
  })
}
