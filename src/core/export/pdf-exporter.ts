import { writeFileAtomic } from '../fs-atomic'
import path from 'node:path'
import type { Invoice, Client, CompanySettings, InvoiceTemplate } from '@shared/types'
import type { InvoiceExporter, ExportResult } from './exporter'
import type { PdfRenderer } from '../../platform/types'
import { renderInvoiceHtml } from './template'

/** Strip filesystem-unsafe characters and collapse whitespace to underscores. */
export function sanitizeClientName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\.\./g, '')
    .replace(/\s+/g, '_')
    .slice(0, 120)
}

/** Per-invoice output target: `<outDir>/<number>/Rechnung - <number>_<Client>.pdf`.
 *  Shared by the plain-PDF and ZUGFeRD exporters so both write identically and
 *  the rest of the app (list, zip export) keeps working unchanged. */
export function invoiceOutputPath(
  outDir: string,
  invoice: Invoice,
  client: Client,
): { dir: string; file: string } {
  const folder = invoice.number ?? `draft-${invoice.id}`
  const dir = path.join(outDir, folder)
  const label = invoice.language === 'en' ? 'Invoice' : 'Rechnung'
  const file = path.join(dir, `${label} - ${invoice.number}_${sanitizeClientName(client.name)}.pdf`)
  return { dir, file }
}

/** Render the invoice HTML to a PDF byte buffer via the injected renderer.
 *  Returns the bytes without touching disk so callers can either write them
 *  directly or post-process them (e.g. embed ZUGFeRD XML). */
export async function renderInvoicePdfBuffer(
  renderPdf: PdfRenderer,
  args: {
    invoice: Invoice
    client: Client
    settings: CompanySettings
    template?: InvoiceTemplate
  },
): Promise<Uint8Array> {
  const html = renderInvoiceHtml(args)
  return renderPdf(html)
}

export class PdfExporter implements InvoiceExporter {
  constructor(private readonly renderPdf: PdfRenderer) {}

  async export({
    invoice,
    client,
    settings,
    template,
    outDir,
  }: Parameters<InvoiceExporter['export']>[0]): Promise<ExportResult> {
    const pdf = await renderInvoicePdfBuffer(this.renderPdf, {
      invoice,
      client,
      settings,
      template,
    })
    const { file } = invoiceOutputPath(outDir, invoice, client)
    await writeFileAtomic(file, pdf)
    return { pdfPath: file }
  }
}
