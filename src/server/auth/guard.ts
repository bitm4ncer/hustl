import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { DatabaseSync } from 'node:sqlite'
import type { ServerConfig } from '../config'
import { isLoopbackAddress } from '../config'
import { SESSION_COOKIE } from './routes'
import { getSession, touchSession } from './store'

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/** Fixed-Window-Limiter. Exportiert, damit Tests ihn zurücksetzen können. */
export function hit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  bucket.count += 1
  return bucket.count <= limit
}

export function resetRateLimits(): void {
  buckets.clear()
}

export function requireSession(db: DatabaseSync, request: FastifyRequest): { id: string } {
  const token = request.cookies?.[SESSION_COOKIE]
  if (!token) throw new Error('UNAUTHENTICATED')
  const session = getSession(db, token)
  if (!session) throw new Error('UNAUTHENTICATED')
  return session
}

function unauthorized(reply: FastifyReply): FastifyReply {
  return reply.code(401).send({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Login required' } })
}

function forbidden(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(403).send({ ok: false, error: { code: 'FORBIDDEN', message } })
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ')

export function registerGuard(app: FastifyInstance, deps: { db: DatabaseSync; config: ServerConfig }): void {
  const { db, config } = deps

  app.addHook('onRequest', async (request, reply) => {
    const url = (request.raw.url ?? '/').split('?')[0]
    if (!url.startsWith('/api/') || url === '/api/health') return

    const isAuth = url.startsWith('/api/auth/')
    const isRpc = url.startsWith('/api/rpc/')
    const isUpload = url.startsWith('/api/uploads/')
    const isExport = url.startsWith('/api/export/')
    const isFile = url.startsWith('/api/files/')

    // CSRF gilt für JEDEN schreibenden Aufruf, auch für die Auth-Routen.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      if (request.headers.origin !== config.origin) {
        return forbidden(reply, 'Invalid origin')
      }
      if (request.headers['sec-fetch-site'] === 'cross-site') {
        return forbidden(reply, 'Cross-site request')
      }
      if (request.headers['x-hustl-client'] !== 'web') {
        return forbidden(reply, 'Missing client header')
      }
    }

    // Lokaler Betrieb: kein Login, aber ausschließlich über Loopback.
    // Die Socket-Adresse ist nicht fälschbar; X-Forwarded-For wird ignoriert.
    if (config.local) {
      if (!isLoopbackAddress(request.raw.socket.remoteAddress ?? '')) return unauthorized(reply)
      const expectedHost = new URL(config.origin).host
      if (request.headers.host !== expectedHost) return forbidden(reply, 'Invalid host')
      return
    }

    if (isAuth) {
      // Der Session-Probe darf das Login-Limit nicht aufbrauchen, sonst sperrt
      // normales Browsen den Besitzer aus.
      const isProbe = url === '/api/auth/session' && request.method === 'GET'
      if (!isProbe && !hit(`auth:${request.ip}`, 10, 60_000)) {
        return reply
          .code(429)
          .header('retry-after', '60')
          .send({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts' } })
      }
      return
    }

    // Alles andere unter /api/ ist standardmäßig geschützt — auch Routen, die
    // es heute noch nicht gibt.
    let session: { id: string }
    try {
      session = requireSession(db, request)
    } catch {
      return unauthorized(reply)
    }

    if (isRpc && !hit(`rpc:${session.id}`, 300, 60_000)) {
      return reply
        .code(429)
        .header('retry-after', '60')
        .send({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } })
    }
    if (isUpload && !hit(`upload:${session.id}`, 20, 3_600_000)) {
      return reply
        .code(429)
        .send({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many uploads' } })
    }
    if (isExport && !hit(`export:${session.id}`, 5, 3_600_000)) {
      return reply
        .code(429)
        .send({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many exports' } })
    }
    if (!isRpc && !isUpload && !isExport && !isFile) {
      // Unbekannte /api/-Routen: Session genügt, Route entscheidet über 404.
      touchSession(db, session.id)
      return
    }

    touchSession(db, session.id)
  })

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('content-security-policy', CSP)
    reply.header('x-content-type-options', 'nosniff')
    reply.header('x-frame-options', 'DENY')
    reply.header('referrer-policy', 'no-referrer')
    reply.header(
      'permissions-policy',
      'camera=(), microphone=(), geolocation=(), payment=()'
    )
    reply.header('cross-origin-opener-policy', 'same-origin')
    reply.header('cross-origin-resource-policy', 'same-origin')
    if (config.secureCookies) {
      reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains')
    }
    return payload
  })
}
