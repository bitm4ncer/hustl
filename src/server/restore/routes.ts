import type { FastifyInstance } from 'fastify'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { stageRestore, validateArchive } from './restore'

const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024

export function registerRestoreRoutes(
  app: FastifyInstance,
  deps: { dataDir: string; onRestart?: () => void }
): void {
  const { dataDir } = deps
  const restart = deps.onRestart ?? (() => process.exit(0))

  app.addContentTypeParser(
    'application/zip',
    { parseAs: 'buffer', bodyLimit: MAX_ARCHIVE_BYTES },
    (_request, body, done) => done(null, body)
  )

  app.post('/api/restore', { bodyLimit: MAX_ARCHIVE_BYTES }, async (request, reply) => {
    if (!Buffer.isBuffer(request.body)) {
      return reply.code(400).send({ ok: false, error: 'ZIP-Body erwartet' })
    }

    try {
      const zip = await JSZip.loadAsync(request.body)
      const { entries } = await validateArchive(zip)

      const nonEmpty = existsSync(join(dataDir, 'hustl.db'))
      const confirm = (request.query as { confirm?: string } | undefined)?.confirm
      if (nonEmpty && confirm !== '1') {
        return reply.code(409).send({ ok: false, error: 'CONFIRM_REQUIRED' })
      }

      await stageRestore(dataDir, entries)
      setTimeout(restart, 100)
      return reply.code(202).send({ ok: true, restart: true })
    } catch (error) {
      return reply.code(400).send({
        ok: false,
        error: error instanceof Error ? error.message : 'Restore fehlgeschlagen'
      })
    }
  })
}
