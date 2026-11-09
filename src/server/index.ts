import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { initDatabase, closeDatabase } from '../core/db/connection'
import { dispatchRpc, RpcError } from './rpc/dispatch'
import { registerAuthRoutes } from './auth/routes'
import { registerGuard } from './auth/guard'
import { registerFileRoutes } from './files/routes'
import { registerArchiveRoutes } from './archive/routes'
import { registerRestoreRoutes } from './restore/routes'
import { applyPendingRestore } from './restore/restore'
import { simpleWebAuthn } from './auth/authenticator'
import { createBootstrapToken, hasCredentials } from './auth/store'
import { closePdfBrowser, serverPdfRenderer } from './pdf'
import { writeFileSync, mkdirSync } from 'node:fs'
import type { ServerConfig } from './config'
import type { Platform } from '../platform/types'
import { rpcContext } from './rpc/registry'

declare module 'fastify' {
  interface FastifyInstance {
    db: DatabaseSync
    config: ServerConfig
  }
}

const APP_VERSION = process.env.HUSTL_VERSION ?? '1.1.2'

export interface BuildServerOptions {
  platform?: Platform
  webRoot?: string
  /** Wird nach einem erfolgreich vorbereiteten Restore aufgerufen. */
  onRestart?: () => void
}

/**
 * Baut die Fastify-Instanz, startet sie aber nicht. Tests injizieren Requests,
 * `main.ts` ruft `listen`.
 */
export async function buildServer(
  config: ServerConfig,
  options: BuildServerOptions = {}
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: 'warn' },
    bodyLimit: 1024 * 1024,
    // Genau ein Proxy (Caddy) davor. Ohne das ist request.ip die
    // Container-Adresse und das Auth-Rate-Limit wird ein globaler Eimer.
    // Im lokalen Betrieb aus, damit request.ip nicht fÃ¤lschbar ist.
    trustProxy: config.trustProxy ?? config.local !== true
  })

  applyPendingRestore(config.dataDir)
  app.decorate('db', initDatabase(config.dataDir))
  app.decorate('config', config)

  const platform: Platform =
    options.platform ?? { kind: 'web', dataDir: config.dataDir, renderPdf: serverPdfRenderer }

  await app.register(cookie)
  await app.register(rateLimit, { global: false })
  await app.register(multipart, {
    limits: { fileSize: 20 * 1024 * 1024, files: 1 }
  })

  registerAuthRoutes(app, { db: app.db, authenticator: simpleWebAuthn, config })
  registerGuard(app, { db: app.db, config })
  registerFileRoutes(app, { db: app.db, dataDir: config.dataDir, platform })
  registerArchiveRoutes(app, { db: app.db, dataDir: config.dataDir })
  registerRestoreRoutes(app, { dataDir: config.dataDir, onRestart: options.onRestart })

  // Erststart: Einmal-Token fÃ¼r die erste Passkey-Registrierung. Ohne ihn kann
  // sich niemand vor dem Besitzer eintragen.
  if (config.local !== true && !hasCredentials(app.db)) {
    const token = createBootstrapToken(app.db)
    mkdirSync(config.dataDir, { recursive: true })
    writeFileSync(join(config.dataDir, 'bootstrap-token.txt'), token + '\n', { mode: 0o600 })
    // eslint-disable-next-line no-console
    console.log(`hustl setup: ${config.origin}/setup?token=${token}`)
  }

  app.get('/api/health', async () => {
    let db = 'ok'
    try {
      app.db.prepare('SELECT 1').get()
    } catch {
      db = 'error'
    }
    return { ok: db === 'ok', version: APP_VERSION, db }
  })

  app.post('/api/rpc/:method', async (request, reply) => {
    const { method } = request.params as { method: string }
    const body = (request.body ?? {}) as { args?: unknown }
    const args = Array.isArray(body.args) ? body.args : []

    try {
      const data = await dispatchRpc(method, args, rpcContext(app.db, config.dataDir, platform))
      return reply.send({ ok: true, data })
    } catch (error) {
      if (error instanceof RpcError) {
        const status =
          error.code === 'NOT_FOUND' ? 404 : error.code === 'VALIDATION' ? 400 : 500
        return reply
          .code(status)
          .send({ ok: false, error: { code: error.code, message: error.message } })
      }
      request.log.error(error)
      return reply
        .code(500)
        .send({ ok: false, error: { code: 'INTERNAL', message: 'Internal error' } })
    }
  })

  // Statische Auslieferung nur, wenn ein Web-Build existiert. Im Dev-Betrieb
  // liefert Vite die OberflÃ¤che, im Container dieses Verzeichnis.
  const webRoot = options.webRoot ?? config.webRoot ?? join(process.cwd(), 'dist/web')
  if (existsSync(webRoot)) {
    await app.register(fastifyStatic, {
      root: webRoot,
      setHeaders(reply, filePath) {
        const name = filePath.split(/[\\/]/).pop() ?? ''
        if (name === 'index.html' || name === 'sw.js' || name.endsWith('.webmanifest')) {
          reply.header('Cache-Control', 'no-cache')
          return
        }
        if (/[\\/]assets[\\/]/.test(filePath) || /-[A-Za-z0-9_-]{8,}\./.test(name)) {
          reply.header('Cache-Control', 'public, max-age=31536000, immutable')
          return
        }
        reply.header('Cache-Control', 'public, max-age=3600')
      }
    })
    app.setNotFoundHandler((request, reply) => {
      const url = (request.raw.url ?? '/').split('?')[0]
      if (url.startsWith('/api/')) {
        return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } })
      }
      // Fehlende Dateien dÃ¼rfen niemals HTML zurÃ¼ckgeben: ein Browser, der ein
      // Icon oder Asset anfragt, wÃ¼rde sonst stillschweigend aufgeben.
      if (/\.[a-z0-9]{2,5}$/i.test(url)) {
        return reply.code(404).send('Not found')
      }
      return reply.sendFile('index.html')
    })
  }

  app.addHook('onClose', async () => {
    await closePdfBrowser()
    closeDatabase()
  })

  return app
}

