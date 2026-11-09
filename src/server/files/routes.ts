import { createReadStream, existsSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { DatabaseSync } from 'node:sqlite'
import { getInvoice } from '../../core/db/invoices'
import { getOffer } from '../../core/db/offers'
import { getExpense } from '../../core/db/expenses'
import { getStatement } from '../../core/db/bank'
import { getInvoiceTemplate, saveInvoiceTemplate } from '../../core/db/invoice-template'
import { resolveDataPath, toStoredPath } from '../../core/paths'
import { importExpensePdfBytes } from '../../core/operations'
import { importStatement } from '../../core/bank/statement-import'
import type { Platform } from '../../platform/types'

interface FileDeps {
  db: DatabaseSync
  dataDir: string
  platform: Platform
}

function notFound(reply: FastifyReply): FastifyReply {
  return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } })
}

/** Löst den gespeicherten Pfad auf, prüft Containment und streamt die Datei. */
function sendStored(
  reply: FastifyReply,
  dataDir: string,
  stored: string | null | undefined,
  type: string,
  disposition: 'inline' | 'attachment'
): FastifyReply {
  if (!stored) return notFound(reply)
  let absolute: string
  try {
    absolute = resolveDataPath(dataDir, stored)
  } catch {
    return notFound(reply)
  }
  if (!existsSync(absolute)) return notFound(reply)
  return reply
    .type(type)
    .header('content-disposition', `${disposition}; filename="${absolute.split(/[\\/]/).pop()}"`)
    .header('cache-control', 'private, no-store')
    .send(createReadStream(absolute))
}

export function registerFileRoutes(app: FastifyInstance, deps: FileDeps): void {
  const { db, dataDir, platform } = deps

  function unsupported(reply: FastifyReply): FastifyReply {
    return reply
      .code(415)
      .send({ ok: false, error: { code: 'UNSUPPORTED', message: 'Unsupported file type' } })
  }

  async function readUpload(
    request: FastifyRequest,
    fileSize = 20 * 1024 * 1024
  ): Promise<{ buffer: Buffer; filename: string } | null> {
    const file = await request.file({ limits: { fileSize } })
    if (!file) return null
    return { buffer: await file.toBuffer(), filename: file.filename }
  }

  const isPdf = (buffer: Buffer): boolean => buffer.subarray(0, 5).toString('latin1') === '%PDF-'
  const isPng = (buffer: Buffer): boolean =>
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const isJpeg = (buffer: Buffer): boolean =>
    buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
  const isWebp = (buffer: Buffer): boolean =>
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'

  app.post('/api/uploads/expense', async (request, reply) => {
    const upload = await readUpload(request)
    if (!upload) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION', message: 'No file' } })
    }
    if (!isPdf(upload.buffer)) return unsupported(reply)
    try {
      return reply.send(
        await importExpensePdfBytes(
          { db, dataDir, platform },
          upload.buffer,
          upload.filename
        )
      )
    } catch (error) {
      // Doppelter Beleg ist kein Serverfehler — der Nutzer soll die Meldung sehen.
      const message = error instanceof Error ? error.message : 'Upload fehlgeschlagen'
      return reply.code(409).send({ ok: false, error: { code: 'CONFLICT', message } })
    }
  })

  app.post('/api/uploads/statement', async (request, reply) => {
    const upload = await readUpload(request)
    if (!upload) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION', message: 'No file' } })
    }
    if (!isPdf(upload.buffer)) return unsupported(reply)
    return reply.send(await importStatement(db, upload.buffer, upload.filename, dataDir))
  })

  app.post('/api/uploads/logo', async (request, reply) => {
    const upload = await readUpload(request, 5 * 1024 * 1024)
    if (!upload) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION', message: 'No file' } })
    }
    const extension = isPng(upload.buffer)
      ? 'png'
      : isJpeg(upload.buffer)
        ? 'jpg'
        : isWebp(upload.buffer)
          ? 'webp'
          : null
    if (!extension) return unsupported(reply)

    const dir = path.join(dataDir, 'template')
    await fs.mkdir(dir, { recursive: true })
    for (const existing of ['png', 'jpg', 'jpeg', 'webp']) {
      await fs.unlink(path.join(dir, `logo.${existing}`)).catch(() => undefined)
    }
    const absolute = path.join(dir, `logo.${extension}`)
    await fs.writeFile(absolute, upload.buffer)

    const template = getInvoiceTemplate(db)
    const logoPath = toStoredPath(dataDir, absolute)
    saveInvoiceTemplate(db, { ...template, logoPath })
    return reply.send({ logoPath })
  })

  // `?download=1` erzwingt den Download; ohne Parameter zeigt der Browser das
  // PDF in seinem Viewer an (dort ist Herunterladen ebenfalls möglich).
  const dispositionFor = (request: FastifyRequest): 'inline' | 'attachment' =>
    (request.query as { download?: string }).download === '1' ? 'attachment' : 'inline'

  app.get('/api/files/invoice/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const invoice = getInvoice(db, Number(id))
    return sendStored(reply, dataDir, invoice?.pdfPath, 'application/pdf', dispositionFor(request))
  })

  app.get('/api/files/offer/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const offer = getOffer(db, Number(id))
    return sendStored(reply, dataDir, offer?.pdfPath, 'application/pdf', dispositionFor(request))
  })

  app.get('/api/files/expense/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const expense = getExpense(db, Number(id))
    return sendStored(reply, dataDir, expense?.pdfPath, 'application/pdf', 'attachment')
  })

  app.get('/api/files/statement/:yearMonth', async (request, reply) => {
    const { yearMonth } = request.params as { yearMonth: string }
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) return notFound(reply)
    const statement = getStatement(db, yearMonth)
    return sendStored(reply, dataDir, statement?.pdfPath, 'application/pdf', dispositionFor(request))
  })

  app.get('/api/files/logo', async (_request, reply) => {
    const template = getInvoiceTemplate(db)
    if (!template.logoPath) return notFound(reply)
    const extension = template.logoPath.split('.').pop()?.toLowerCase() ?? 'png'
    const type =
      extension === 'jpg' || extension === 'jpeg'
        ? 'image/jpeg'
        : extension === 'webp'
          ? 'image/webp'
          : 'image/png'
    return sendStored(reply, dataDir, template.logoPath, type, 'inline')
  })
}
