import type { FastifyInstance, FastifyReply } from 'fastify'
import type { DatabaseSync } from 'node:sqlite'
import { buildMonthExport, monthExportInfo } from '../../core/export/zip-exporter'
import { buildFullArchive } from './build'

export function registerArchiveRoutes(
  app: FastifyInstance,
  deps: { db: DatabaseSync; dataDir: string }
): void {
  const { db, dataDir } = deps

  app.get('/api/export/full', async (_request, reply: FastifyReply) => {
    try {
      const { stream, filename } = await buildFullArchive({ db, dataDir })
      return reply
        .type('application/zip')
        .header('content-disposition', `attachment; filename="${filename}"`)
        .header('cache-control', 'private, no-store')
        .send(stream)
    } catch (error) {
      if ((error as { code?: string }).code === 'CONFLICT') {
        return reply
          .code(409)
          .send({ ok: false, error: { code: 'CONFLICT', message: 'Archive already running' } })
      }
      throw error
    }
  })

  // Monatsexport in drei Teilen: Rechnungen-ZIP, Belege-ZIP und Kontoauszug.
  // Kein Sammel-ZIP — der Nutzer lädt genau das, was er braucht.
  app.get('/api/export/month/:yearMonth/info', async (request, reply) => {
    const { yearMonth } = request.params as { yearMonth: string }
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION', message: 'Invalid month' } })
    }
    return reply.send(monthExportInfo(db, yearMonth))
  })

  app.get('/api/export/month/:yearMonth/:part', async (request, reply) => {
    const { yearMonth, part } = request.params as { yearMonth: string; part: string }
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION', message: 'Invalid month' } })
    }
    if (part !== 'invoices' && part !== 'expenses' && part !== 'statement') {
      return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'Unknown export part' } })
    }

    const built = await buildMonthExport(db, yearMonth, dataDir)
    const file = part === 'invoices' ? built.invoices : part === 'expenses' ? built.expenses : built.statement
    if (!file) {
      return reply
        .code(404)
        .send({ ok: false, error: { code: 'NOT_FOUND', message: 'Kein Kontoauszug für diesen Monat' } })
    }

    return reply
      .type(part === 'statement' ? 'application/pdf' : 'application/zip')
      .header('content-disposition', `attachment; filename="${file.name}"`)
      .header('cache-control', 'private, no-store')
      .send(file.data)
  })
}
