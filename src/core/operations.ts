import path from 'node:path'
import { promises as fs } from 'node:fs'
import { createHash } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type {
  Client,
  CompanySettings,
  Invoice,
  InvoicePreviewInput,
  InvoiceTemplate,
  OfferPreviewInput,
} from '@shared/types'
import type { Platform } from '../platform/types'
import { getInvoice, finalizeInvoice, revertFinalize, setPdfPath, setInvoiceHash, lastInvoiceHash } from './db/invoices'
import { getClientById } from './db/clients'
import { getSettings } from './db/settings'
import { getInvoiceTemplate } from './db/invoice-template'
import { assignOfferNumber, getOffer, setOfferPdfPath, setOfferStatus } from './db/offers'
import { assertExportable } from '@shared/zugferd-map'
import { renderInvoicePdfA } from './export/zugferd-exporter'
import { invoiceOutputPath } from './export/pdf-exporter'
import { writeFileAtomic } from './fs-atomic'
import { exportOfferPdf } from './export/offer-pdf-exporter'
import { renderInvoiceHtml } from './export/template'
import { renderOfferHtml } from './export/offer-template'
import { extractExpenseFromPdf } from './expense/pdf-extract'
import { resolveDataPath, toStoredPath, isAbsoluteStored } from './paths'
import { buildPreviewInvoice, buildPreviewOffer, withRecipientAddress } from './previews'
import { todayInBerlin } from './clock'

export interface OpContext {
  db: DatabaseSync
  dataDir: string
  platform: Platform
}

/**
 * Macht die in der Vorlage gespeicherten Dateipfade absolut. Ohne das liest der
 * Renderer `logoPath`/`fontFiles[].path` relativ zum Prozessverzeichnis — das
 * Logo und die Schrift verschwinden dann stillschweigend aus jedem PDF.
 */
export function resolveTemplate(template: InvoiceTemplate, dataDir: string): InvoiceTemplate {
  const absolute = (stored: string): string =>
    isAbsoluteStored(stored) ? stored : resolveDataPath(dataDir, stored)
  return {
    ...template,
    logoPath: template.logoPath ? absolute(template.logoPath) : null,
    fontFiles: template.fontFiles.map((file) => ({ ...file, path: absolute(file.path) })),
  }
}

/** Finalisiert, vergibt die Nummer und schreibt das ZUGFeRD-PDF dauerhaft. */
export async function finalizeInvoiceWithPdf(
  ctx: OpContext,
  id: number
): Promise<{ pdfPath: string }> {
  const { db } = ctx
  const draft = getInvoice(db, id)
  if (!draft) throw new Error(`Invoice ${id} not found`)
  if (draft.status !== 'draft') {
    throw new Error('Nur Entwürfe können finalisiert werden.')
  }
  const client = getClientById(db, draft.clientId)
  if (!client) throw new Error(`Client ${draft.clientId} not found`)
  const settings = getSettings(db)
  const template = resolveTemplate(getInvoiceTemplate(db), ctx.dataDir)

  // Vor der Nummernvergabe prüfen: ungültige Daten dürfen keine Lücke reißen.
  const problems = assertExportable(draft, client, settings)
  if (problems.length) throw new Error('E-Rechnung nicht möglich:\n' + problems.join('\n'))

  // Nummer zuerst in der Datenbank vergeben: PDF und Buchhaltung müssen
  // dieselbe Nummer tragen, auch wenn zwei Tabs gleichzeitig finalisieren.
  // Das Nummernjahr folgt dem Rechnungsdatum, nicht dem Klick-Tag — sonst
  // bekommt eine im Dezember datierte Rechnung im Januar eine neue Jahresreihe.
  finalizeInvoice(db, id, draft.date)
  const invoice = getInvoice(db, id)
  if (!invoice) throw new Error(`Invoice ${id} not found`)

  try {
    const pdf = await renderInvoicePdfA(ctx.platform.renderPdf, {
      invoice,
      client,
      settings,
      template,
    })
    const { file } = invoiceOutputPath(path.join(ctx.dataDir, 'invoices'), invoice, client)
    await writeFileAtomic(file, pdf)

    const stored = toStoredPath(ctx.dataDir, file)
    setPdfPath(db, id, stored)
    // GoBD: Hash des ausgelieferten Dokuments, verkettet mit der Vorrechnung.
    setInvoiceHash(db, id, createHash('sha256').update(pdf).digest('hex'), lastInvoiceHash(db))
    return { pdfPath: stored }
  } catch (error) {
    // Ohne PDF ist die Rechnung nicht auslieferbar: zurück auf Entwurf und die
    // Nummer freigeben, statt eine Rechnung ohne Dokument zu hinterlassen.
    revertFinalize(db, id)
    throw error
  }
}

/** Rendert ein finalisiertes PDF neu, ohne Nummer, Beträge oder Status zu ändern. */
export async function regenerateInvoicePdfWithPdf(
  ctx: OpContext,
  id: number
): Promise<{ pdfPath: string }> {
  const { db } = ctx
  const invoice = getInvoice(db, id)
  if (!invoice) throw new Error(`Invoice ${id} not found`)
  if (invoice.number == null) {
    throw new Error('Nur finalisierte Rechnungen können neu erzeugt werden.')
  }
  const client = getClientById(db, invoice.clientId)
  if (!client) throw new Error(`Client ${invoice.clientId} not found`)
  const settings = getSettings(db)
  const template = resolveTemplate(getInvoiceTemplate(db), ctx.dataDir)

  const problems = assertExportable(invoice, client, settings)
  if (problems.length) throw new Error('E-Rechnung nicht möglich:\n' + problems.join('\n'))

  const oldPath = invoice.pdfPath
  const pdf = await renderInvoicePdfA(ctx.platform.renderPdf, {
    invoice,
    client,
    settings,
    template,
  })
  const { file } = invoiceOutputPath(path.join(ctx.dataDir, 'invoices'), invoice, client)
  await writeFileAtomic(file, pdf)

  const stored = toStoredPath(ctx.dataDir, file)
  setPdfPath(db, id, stored)

  if (oldPath && oldPath !== stored) {
    try {
      await fs.rm(resolveDataPath(ctx.dataDir, oldPath), { force: true })
    } catch {
      /* alter Pfad war ungültig oder schon weg */
    }
  }
  return { pdfPath: stored }
}

/** Vergibt beim ersten Export eine Angebotsnummer und schreibt das PDF. */
export async function finalizeOfferWithPdf(
  ctx: OpContext,
  id: number
): Promise<{ pdfPath: string }> {
  const { db } = ctx
  const settings = getSettings(db)
  assignOfferNumber(db, id, settings.offerNumberPrefix)
  const rawOffer = getOffer(db, id)
  if (!rawOffer) throw new Error(`Offer ${id} not found`)
  const offer = withRecipientAddress(db, rawOffer)

  const { pdfPath } = await exportOfferPdf(ctx.platform, {
    offer,
    settings,
    template: resolveTemplate(getInvoiceTemplate(db), ctx.dataDir),
    outDir: path.join(ctx.dataDir, 'offers'),
  })
  const stored = toStoredPath(ctx.dataDir, pdfPath)
  setOfferPdfPath(db, id, stored)
  if (rawOffer.status === 'draft') setOfferStatus(db, id, 'sent')
  return { pdfPath: stored }
}

export function invoicePreviewHtml(ctx: OpContext, input: InvoicePreviewInput): string {
  const built = buildPreviewInvoice(ctx.db, input)
  if (!built) return ''
  return renderInvoiceHtml({ ...built, template: resolveTemplate(getInvoiceTemplate(ctx.db), ctx.dataDir) })
}

export function offerPreviewHtml(ctx: OpContext, input: OfferPreviewInput): string {
  const { offer: rawOffer, settings } = buildPreviewOffer(ctx.db, input)
  const offer = withRecipientAddress(ctx.db, rawOffer)
  return renderOfferHtml({ offer, settings, template: resolveTemplate(getInvoiceTemplate(ctx.db), ctx.dataDir) })
}

/** Beispieldaten für die Vorlagen-Vorschau. */
export function buildTemplateSample(): { invoice: Invoice; client: Client } {
  const client: Client = {
    id: 0,
    notionId: null,
    name: 'Beispiel Kunde GmbH',
    contactPerson: 'Erika Mustermann',
    addressExtra: 'Kostenträger 102070',
    address: '',
    street: 'Musterstraße 1',
    zip: '10115',
    city: 'Berlin',
    country: 'Deutschland',
    countryCode: 'DE',
    currency: 'EUR',
    language: 'de',
    taxMode: 'standard',
    email: '',
    hourlyRate: 95,
    noTax: false,
    vatId: 'DE123456789',
    notes: '',
  }
  const invoice: Invoice = {
    id: 0,
    number: '2026024',
    clientId: 0,
    date: todayInBerlin(),
    servicePeriodStart: '2026-05-01',
    servicePeriodEnd: '2026-05-31',
    status: 'finalized',
    subtotal: 1950,
    taxRate: 0.19,
    taxAmount: 370.5,
    total: 2320.5,
    noTax: false,
    reverseCharge: false,
    taxMode: 'standard',
    currency: 'EUR',
    exchangeRate: 1,
    language: 'de',
    poNumber: null,
    notes: null,
    pdfPath: null,
    hash: null,
    prevHash: null,
    finalizedAt: null,
    paidAt: null,
    emailSentAt: null,
    emailRecipient: null,
    correctsNumber: null,
    items: [
      {
        id: 1,
        invoiceId: 0,
        notionTaskId: null,
        projectId: null,
        position: 0,
        title: 'Konzept',
        description: 'Markenkonzept',
        quantity: null,
        unitPrice: null,
        fixPrice: 1000,
        amount: 1000,
        subItems: [],
      },
      {
        id: 2,
        invoiceId: 0,
        notionTaskId: null,
        projectId: null,
        position: 1,
        title: 'Umsetzung',
        description: '',
        quantity: 10,
        unitPrice: 95,
        fixPrice: null,
        amount: 950,
        subItems: [],
      },
    ],
  }
  return { invoice, client }
}

export function templatePreviewHtml(
  ctx: OpContext,
  template: InvoiceTemplate
): string {
  const settings: CompanySettings = getSettings(ctx.db)
  const { invoice, client } = buildTemplateSample()
  return renderInvoiceHtml({
    invoice,
    client,
    settings,
    template: resolveTemplate(template, ctx.dataDir),
  })
}

/** Speichert einen hochgeladenen Beleg und liest die Felder daraus. */
export async function importExpensePdfBytes(
  ctx: OpContext,
  bytes: Uint8Array,
  filename: string
): Promise<{
  storedPath: string
  fields: Awaited<ReturnType<typeof extractExpenseFromPdf>>
  sourceName: string
}> {
  const dir = path.join(ctx.dataDir, 'expenses')
  await fs.mkdir(dir, { recursive: true })

  // Duplikatprüfung: derselbe Beleg darf nicht zweimal in den Büchern landen.
  // Geprüft wird gegen alle PDFs im Ordner (auch noch nicht gespeicherte
  // Uploads) — nur Dateien gleicher Größe werden gehasht, das ist billig.
  const hash = createHash('sha256').update(bytes).digest('hex')
  for (const name of await fs.readdir(dir)) {
    if (!name.toLowerCase().endsWith('.pdf')) continue
    const candidate = path.join(dir, name)
    try {
      if ((await fs.stat(candidate)).size !== bytes.length) continue
      const other = createHash('sha256').update(await fs.readFile(candidate)).digest('hex')
      if (other === hash) {
        throw new Error(`Dieser Beleg ist bereits vorhanden (${name}) — kein zweiter Upload.`)
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Dieser Beleg')) throw error
      /* fehlende Datei überspringen */
    }
  }

  const absolute = path.join(dir, `${Date.now()}-${Math.round(Math.random() * 1e6)}.pdf`)
  await fs.writeFile(absolute, Buffer.from(bytes))
  const fields = await extractExpenseFromPdf(absolute).catch(() => ({
    vendor: null,
    date: null,
    gross: null,
    currency: 'EUR' as const,
    originalAmount: null,
    vatRate: null,
  }))
  return {
    storedPath: toStoredPath(ctx.dataDir, absolute),
    fields,
    sourceName: filename,
  }
}
