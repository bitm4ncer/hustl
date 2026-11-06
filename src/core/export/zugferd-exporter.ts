import { writeFileAtomic } from '../fs-atomic'
import type { ProfileEN16931 } from 'node-zugferd/profile/en16931'
import type { InvoiceExporter, ExportResult } from './exporter'
import type { Client, CompanySettings, Invoice, InvoiceTemplate } from '@shared/types'
import { mapInvoiceToZugferd } from '@shared/zugferd-map'
import { renderInvoicePdfBuffer, invoiceOutputPath } from './pdf-exporter'
import type { PdfRenderer } from '../../platform/types'

export interface ZugferdRenderArgs {
  invoice: Invoice
  client: Client
  settings: CompanySettings
  template?: InvoiceTemplate
}

/**
 * Rendert die hybride ZUGFeRD/Factur-X-Rechnung als Bytes, ohne zu schreiben.
 * So kann der Aufrufer erst rendern und die Nummer danach verbindlich vergeben.
 */
export async function renderInvoicePdfA(
  renderPdf: PdfRenderer,
  args: ZugferdRenderArgs
): Promise<Uint8Array> {
  // node-zugferd is ESM-only-ish and main-process-only; import lazily (matches
  // the jszip/unpdf pattern) so it never reaches the renderer bundle.
  const { zugferd } = await import('node-zugferd')
  const { EN16931 } = await import('node-zugferd/profile/en16931')

  const pdf = await renderInvoicePdfBuffer(renderPdf, args)

  const invoicer = zugferd({ profile: EN16931, strict: false })
  // The integration test (tests/core/export/zugferd-xml.test.ts) guarantees our
  // mapping satisfies the EN16931 Zod schema; create() re-validates here.
  const data = mapInvoiceToZugferd(args.invoice, args.client, args.settings) as unknown as ProfileEN16931
  const document = invoicer.create(data)

  const title = args.invoice.language === 'en' ? 'Invoice' : 'Rechnung'
  return document.embedInPdf(pdf, {
    metadata: {
      title: `${title} ${args.invoice.number}`,
      subject: `${title} ${args.invoice.number}`,
      author: args.settings.name,
      creator: 'Hustl',
      language: args.invoice.language === 'en' ? 'en-GB' : 'de-DE',
    },
  })
}

/**
 * Produces a hybrid ZUGFeRD/Factur-X invoice: the same human-readable PDF as the
 * plain exporter, upgraded to PDF/A-3b with an embedded EN16931 (Comfort) CII
 * XML — a compliant German e-invoice (EN 16931).
 *
 * `strict: false` skips node-zugferd's optional XSD validation step, which
 * otherwise requires a Java runtime (`xsd-schema-validator`). The Zod schema
 * validation in `create()` still runs, so the data shape is checked in pure JS.
 * Final XSD + Schematron conformance should be confirmed once against the
 * official KoSIT validator before productive use (the library is still beta).
 */
export class ZugferdExporter implements InvoiceExporter {
  constructor(private readonly renderPdf: PdfRenderer) {}

  async export({
    invoice,
    client,
    settings,
    template,
    outDir,
  }: Parameters<InvoiceExporter['export']>[0]): Promise<ExportResult> {
    const pdfA = await renderInvoicePdfA(this.renderPdf, { invoice, client, settings, template })
    const { file } = invoiceOutputPath(outDir, invoice, client)
    await writeFileAtomic(file, pdfA)
    return { pdfPath: file }
  }
}
