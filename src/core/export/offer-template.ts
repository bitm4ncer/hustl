import type { Offer, CompanySettings, InvoiceTemplate, TaxMode } from '@shared/types'
import { formatCurrency, formatDateLocale } from '@shared/money'
import { DEFAULT_TEMPLATE } from '@shared/template-defaults'
import { esc, escMultiline, fontFaceCss, logoImg, STYLE_REST } from './template-shared'
import {
  countryName,
  localeFor,
  offerLabels,
  taxLabel,
  taxNote,
} from './document-labels'

function offerTaxMode(o: Offer): TaxMode {
  if (o.taxMode === 'kleinunternehmer') return 'small_business'
  if (o.taxMode === 'reverse_charge') return 'reverse_charge'
  return 'standard'
}

export function renderOfferHtml(a: {
  offer: Offer
  settings: CompanySettings
  template?: InvoiceTemplate
}): string {
  const { offer: o, settings: s } = a
  const tpl = a.template ?? DEFAULT_TEMPLATE
  const lang = o.language || 'de'
  const locale = localeFor(lang)
  const L = offerLabels(lang)
  const vatMode = offerTaxMode(o)
  const fontStack = `'${tpl.fontFamily}', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
  const style = `
${fontFaceCss(tpl)}
body {
  font-family: ${fontStack};
  max-width: 210mm; width: 210mm; margin: 0 auto;
  padding: ${tpl.marginXMm}mm; padding-top: ${tpl.marginTopMm}mm;
  color: #000; line-height: 1.4; font-size: 9pt;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
${STYLE_REST}
.totals-section { border-top: 1px solid ${tpl.accentColor}; }
.totals-label { color: ${tpl.accentColor}; }
.doc-title { font-size: 11.5pt; font-weight: bold; letter-spacing: 0.5px; color: #000; margin-bottom: 5mm; }
.legal-note { margin-top: 6mm; font-size: 8pt; color: #555; line-height: 1.4; }
.acceptance { margin-top: 16mm; font-size: 9pt; }
.acceptance .sig { margin-top: 12mm; border-top: 1px solid #000; width: 70mm; padding-top: 1mm; }
.optional-tag { font-style: italic; color: #666; }
/* Offer line items flow with their (possibly multi-line) content instead of the
   invoice's fixed-height absolute layout, so long descriptions never overlap. */
.service-item { position: static; min-height: 0; display: flex; justify-content: space-between; align-items: baseline; gap: 8mm; margin-bottom: 2.5mm; }
.service-description { position: static; width: auto; flex: 1 1 auto; }
.service-price { position: static; width: auto; flex: 0 0 auto; white-space: nowrap; }
/* Compact header: sender contact sits top-right (parallel to the name) instead
   of stacked below it, and the header is shorter — saves vertical space. */
.header { height: 30mm; margin-bottom: 10mm; }
.company-info { width: 100mm; }
.company-name { font-size: 14pt; letter-spacing: 0.5px; }
.sender-right { position: absolute; right: 0; top: 0; width: 72mm; text-align: right; font-size: 9pt; line-height: 1.35; }
.hours-note { font-size: 7.5pt; color: #888; margin-top: 0.3mm; }
.rate-note { font-size: 8pt; color: #666; margin-top: 3mm; }
/* Offers can have many positions. Let the list flow across pages instead of
   being pushed whole onto page 2 (which left page 1 nearly empty); each single
   position still stays unbroken so a title never splits from its price. */
.service-list { page-break-inside: auto; }
.service-item { page-break-inside: avoid; break-inside: avoid; }
/* The invoice template reserves a lot of vertical air (35mm header + 40mm gap,
   25mm after the address, 20mm below totals). That whitespace is what caused the
   awkward page-1/page-2 split — tighten it for offers. Keep the address block's
   min-height (its address + meta are absolutely positioned, so it must reserve
   vertical space or the intro rides up into it). */
.address-invoice-section { margin-bottom: 12mm; }
.totals-section { margin-top: 8mm; margin-bottom: 10mm; }
/* Per-page vertical margins. The body's padding only creates margins at the very
   start/end of the document, so content at an internal page break sits flush
   against the paper edge (bottom of a page / top of the next) and crowds the
   footer. Move the vertical margin to @page (applies to every page) and drop the
   body's top/bottom padding so page 1 isn't doubled. Horizontal margin stays on
   the body. A bigger bottom margin also pushes a few positions onto page 2. */
@page { margin: 20mm 0; }
/* Only for print/PDF: @page supplies the vertical margins, so drop the body's
   own top/bottom padding to avoid doubling it. The on-screen preview isn't
   paginated (no @page), so it keeps the body padding for its top/bottom margin. */
@media print { body { padding-top: 0; padding-bottom: 0; } }
`

  const companyContact = [
    s.recipientName,
    s.sellerStreet,
    [s.sellerZip, s.sellerCity].filter(Boolean).join(' ').trim(),
    s.sellerCountryCode === 'DE' ? countryName('DE', lang) : countryName(s.sellerCountryCode, lang) || s.sellerCountryCode,
  ].filter(Boolean).map((l) => esc(l)).join('<br>')

  // Recipient: linked client wins; otherwise the prospect fields.
  const recipientName = o.clientName || o.prospect.name
  const addressLines = [
    o.prospect.street,
    [o.prospect.zip, o.prospect.city].filter(Boolean).join(' ').trim(),
    o.prospect.country,
  ].filter(Boolean)

  // Wie auf der Rechnung: Ansprechpartner und freie Zusatzzeile stehen zwischen
  // Firmenname und Anschrift.
  const recipientLines = [o.prospect.contactPerson, o.prospect.addressExtra, ...addressLines].filter(Boolean)

  const servicePeriod =
    o.servicePeriodStart && o.servicePeriodEnd
      ? `<div><strong>${esc(L.servicePeriod)}:</strong> ${esc(formatDateLocale(o.servicePeriodStart, locale))}–${esc(formatDateLocale(o.servicePeriodEnd, locale))}</div>`
      : ''

  const addressBlock = `
    <div class="address-invoice-section">
        <div class="client-address-inline">
            <strong>${esc(recipientName)}</strong><br>${recipientLines.map((l) => esc(l)).join('<br>')}
        </div>
        <div class="invoice-meta-inline">
            <div><strong>${esc(L.offerNumber)}:</strong> ${esc(o.number ?? '—')}</div>
            <div><strong>${esc(L.date)}:</strong> ${esc(formatDateLocale(o.date, locale))}</div>
            <div><strong>${esc(L.validUntil)}:</strong> ${esc(formatDateLocale(o.validUntil, locale))}</div>
            ${servicePeriod}
        </div>
    </div>`

  const introHtml = o.introText.trim()
    ? `<div style="margin:6mm 0">${escMultiline(o.introText)}</div>` : ''

  // One-time, non-optional items in the main list. Optional items appended,
  // marked and excluded from the total.
  const fmtQty = (n: number): string =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n)
  // Optional per-position hours note (only when the offer has "show hours" on
  // and the position is hour-based, not a fixed price).
  const hoursNote = (it: Offer['items'][number]): string =>
    o.showHours && it.fixPrice == null && it.quantity
      ? `<div class="hours-note">${fmtQty(it.quantity)} ${esc(L.hoursShort)}</div>`
      : ''
  // The rate is shown once, globally (below), not on every position.
  const rateNote =
    o.showHours && o.hourlyRate > 0
      ? `<div class="rate-note">${esc(L.hourlyRateNote(formatCurrency(o.hourlyRate, o.currency, locale)))}</div>`
      : ''
  const lineItem = (it: Offer['items'][number], opt = false): string =>
    `<li class="service-item"><div class="service-description"><strong>${esc(it.title)}</strong>${
      it.description ? ' – ' + esc(it.description) : ''
    }${opt ? ' <span class="optional-tag">(optional)</span>' : ''}</div><div class="service-price">${formatCurrency(it.amount, o.currency, locale)}${hoursNote(it)}</div></li>`

  const baseItems = o.items.filter((it) => !it.optional && !it.recurring).map((it) => lineItem(it)).join('\n        ')
  const optionalItems = o.items.filter((it) => it.optional && !it.recurring)
  const recurringItems = o.items.filter((it) => it.recurring)

  const optionalBlock = optionalItems.length
    ? `<div style="margin-top:6mm" class="doc-subtitle"><strong>${esc(L.optionalServices)}</strong></div>
       <ul class="service-list">${optionalItems.map((it) => lineItem(it, true)).join('\n')}</ul>`
    : ''

  const recurringBlock = recurringItems.length
    ? `<div style="margin-top:6mm"><strong>${esc(L.recurringCosts)}</strong></div>
       <ul class="service-list">${recurringItems.map((it) => lineItem(it)).join('\n')}</ul>`
    : ''

  const vatLabel = taxLabel(lang, vatMode, o.taxRate)
  const vatNote = taxNote(lang, vatMode)
  const discountLine = o.discountAmount > 0
    ? `<div class="totals-line"><div class="totals-content"><span class="totals-label">${esc(L.discount)}</span><span class="totals-amount">−${formatCurrency(o.discountAmount, o.currency, locale)}</span></div></div>`
    : ''

  const closingHtml = o.closingText.trim()
    ? `<div style="margin-top:8mm">${escMultiline(o.closingText)}</div>` : ''

  // Legal notes: validity + type-specific + tax + freibleibend.
  const notes: string[] = []
  if (o.kind === 'kostenvoranschlag') {
    notes.push(L.costEstimateNote)
  } else {
    notes.push(L.validUntilNote(formatDateLocale(o.validUntil, locale)))
  }
  if (o.freibleibend) notes.push(L.subjectToChange)
  if (vatNote) notes.push(vatNote)
  else notes.push(L.plusVat)
  const legalHtml = `<div class="legal-note">${notes.map((n) => esc(n)).join('<br>')}</div>`

  const acceptanceHtml =
    o.kind === 'angebot'
      ? `<div class="acceptance">
           <strong>${esc(L.acceptance)}</strong>
           <div class="sig">${esc(L.signature)}</div>
         </div>`
      : ''

  const subtitleHtml = tpl.showSubtitle ? `<div class="company-subtitle">${esc(s.subtitle)}</div>` : ''

  const body = `
    <div class="header">
        ${logoImg(tpl)}
        <div class="company-info">
            <div class="company-name">${esc(s.name)}</div>
            ${subtitleHtml}
        </div>
        <div class="sender-right">
            ${companyContact}<br>
            ${esc(s.phone)}<br>
            ${esc(s.email)}
        </div>
    </div>
    <div class="doc-title">${esc(L.title(o.kind))}${o.title ? ' – ' + esc(o.title) : ''}</div>
${addressBlock}
${introHtml}
    <ul class="service-list">
        ${baseItems}
    </ul>
${optionalBlock}
${rateNote}
    <div class="totals-section">
        <div class="totals-line"><div class="totals-content"><span class="totals-label">${esc(L.subtotal)}</span><span class="totals-amount">${formatCurrency(o.subtotal, o.currency, locale)}</span></div></div>
        ${discountLine}
        <div class="totals-line"><div class="totals-content"><span class="totals-label">${esc(vatLabel)}</span><span class="totals-amount">${formatCurrency(o.taxAmount, o.currency, locale)}</span></div></div>
        <div class="totals-line total"><div class="totals-content"><span class="totals-label">${esc(L.total)}</span><span class="totals-amount">${formatCurrency(o.total, o.currency, locale)}</span></div></div>
    </div>
${recurringBlock}
${closingHtml}
${legalHtml}
${acceptanceHtml}`

  return `<!DOCTYPE html><html lang="${esc(lang)}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(L.title(o.kind))}</title><style>${style}</style></head><body>${body}</body></html>`
}
