import { writeFileAtomic } from '../fs-atomic'
import path from 'node:path'
import type { Offer, CompanySettings, InvoiceTemplate } from '@shared/types'
import type { Platform, PdfRenderer } from '../../platform/types'
import { renderOfferHtml } from './offer-template'
import { sanitizeClientName } from './pdf-exporter'
import { offerLabels } from './document-labels'

/** `<outDir>/<number>/Angebot - <number>_<Empfänger>.pdf`. */
export function offerOutputPath(outDir: string, offer: Offer): { dir: string; file: string } {
  const folder = offer.number ?? `draft-${offer.id}`
  const recipient = sanitizeClientName(offer.clientName || offer.prospect.name || 'Kunde')
  const dir = path.join(outDir, folder)
  const label = offer.language === 'en' ? 'Offer' : 'Angebot'
  const file = path.join(dir, `${label} - ${folder}_${recipient}.pdf`)
  return { dir, file }
}

/** Count page objects in a Chromium-generated PDF buffer. */
function countPdfPages(pdf: Uint8Array): number {
  const text = Buffer.from(pdf).toString('latin1')
  const matches = text.match(/\/Type\s*\/Page(?![s])/g)
  return matches ? matches.length : 1
}

export async function renderOfferPdfBuffer(
  renderPdf: PdfRenderer,
  args: {
    offer: Offer
    settings: CompanySettings
    template?: InvoiceTemplate
  },
): Promise<Uint8Array> {
  const html = renderOfferHtml(args)
  const base = {
    margins: { top: 0.79, bottom: 0.79, left: 0.59, right: 0.59 },
  }
  const first = await renderPdf(html, base)
  // Single page → no page numbers. Multi-page → re-render with a footer that
  // shows "Seite X / Y" (the content area is unchanged, so page count holds).
  if (countPdfPages(first) <= 1) return first
  const L = offerLabels(args.offer.language || 'de')
  const footerTemplate =
    `<div style="width:100%;margin:0 15mm;font-size:9px;color:#888;` +
    `font-family:'Segoe UI',Arial,sans-serif;text-align:center;">` +
    `${L.page} <span class="pageNumber"></span> ${L.of} <span class="totalPages"></span></div>`
  return renderPdf(html, {
    ...base,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate,
  })
}

export async function exportOfferPdf(
  platform: Platform,
  args: {
    offer: Offer
    settings: CompanySettings
    template?: InvoiceTemplate
    outDir: string
  },
): Promise<{ pdfPath: string }> {
  const pdf = await renderOfferPdfBuffer(platform.renderPdf, args)
  const { file } = offerOutputPath(args.outDir, args.offer)
  await writeFileAtomic(file, pdf)
  return { pdfPath: file }
}
