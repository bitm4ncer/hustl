import type { Invoice, Client, CompanySettings, InvoiceTemplate } from '@shared/types'
import { formatCurrency, formatDateLocale } from '@shared/money'
import { DEFAULT_TEMPLATE } from '@shared/template-defaults'
import { invoiceTaxMode } from '@shared/tax'
import { esc, escMultiline, fontFaceCss, logoImg, STYLE_REST } from './template-shared'
import {
  countryName,
  invoiceLabels,
  localeFor,
  taxLabel,
  taxNote,
} from './document-labels'

export function renderInvoiceHtml(a: {
  invoice: Invoice
  client: Client
  settings: CompanySettings
  template?: InvoiceTemplate
}): string {
  const { invoice: inv, client, settings: s } = a
  const tpl = a.template ?? DEFAULT_TEMPLATE
  const lang = inv.language || 'de'
  const locale = localeFor(lang)
  const L = invoiceLabels(lang)
  const fontStack = `'${tpl.fontFamily}', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
  const style = `
${fontFaceCss(tpl)}
body {
  font-family: ${fontStack};
  max-width: 210mm;
  width: 210mm;
  margin: 0 auto;
  padding: ${tpl.marginXMm}mm;
  padding-top: ${tpl.marginTopMm}mm;
  color: #000;
  line-height: 1.4;
  font-size: 9pt;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
${STYLE_REST}
.totals-section { border-top: 1px solid ${tpl.accentColor}; }
.totals-label { color: ${tpl.accentColor}; }
/* Line items flow with their (possibly multi-line) content instead of the old
   fixed-height absolute layout, so long descriptions and sub-item lists never
   overlap the totals. Mirrors the offer template. */
.service-item { position: static; min-height: 0; display: flex; justify-content: space-between; align-items: baseline; gap: 8mm; margin-bottom: 2.5mm; }
.service-description { position: static; width: auto; flex: 1 1 auto; }
.service-price { position: static; width: auto; flex: 0 0 auto; white-space: nowrap; }
.service-list { page-break-inside: auto; }
.service-item { page-break-inside: avoid; break-inside: avoid; }
/* Aufschlüsselungs-Unterzeilen eines Postens (aus Projekt-Positionen). */
.sub-items { margin-top: 1.5mm; }
.sub-item { display: flex; justify-content: space-between; align-items: baseline; gap: 6mm; padding-left: 4mm; margin-bottom: 1mm; font-size: 8.5pt; color: #222; }
.sub-item-text { flex: 1 1 auto; }
.sub-item-hours { flex: 0 0 auto; white-space: nowrap; font-size: 7.5pt; color: #888; }
`

  // Seller address: use the structured fields (same source as the e-invoice XML).
  const companyContact = [
    s.recipientName,
    s.sellerStreet,
    [s.sellerZip, s.sellerCity].filter(Boolean).join(' ').trim(),
    s.sellerCountryCode === 'DE' ? countryName('DE', lang) : countryName(s.sellerCountryCode, lang) || s.sellerCountryCode,
  ]
    .filter(Boolean)
    .map((line) => esc(line))
    .join('<br>')

  // Prefer the structured address fields; fall back to the legacy blob.
  const structured = [
    client.street,
    [client.zip, client.city].filter(Boolean).join(' ').trim(),
    client.country
  ].filter(Boolean)
  const addressLines = structured.length ? structured : client.address.split('\n').filter(Boolean)

  // Empfängerblock unter dem Firmennamen: Ansprechpartner, freie Zusatzzeile
  // (z. B. Kostenträger), dann die Anschrift.
  const recipientLines = [client.contactPerson, client.addressExtra, ...addressLines].filter(Boolean)

  const servicePeriod =
    tpl.showServicePeriod && inv.servicePeriodStart && inv.servicePeriodEnd
      ? `<div><strong>${esc(L.servicePeriod)}:</strong> ${esc(formatDateLocale(inv.servicePeriodStart, locale))}–${esc(formatDateLocale(inv.servicePeriodEnd, locale))}</div>`
      : ''
  const metaRowsHtml = tpl.metaRows
    .filter((r) => r.label.trim() || r.value.trim())
    .map((r) => `<div><strong>${esc(r.label)}:</strong> ${esc(r.value)}</div>`)
    .join('')

  const addressBlock = recipientLines.length
    ? `
    <div class="address-invoice-section">
        <div class="client-address-inline">
            <strong>${esc(client.name)}</strong><br>${recipientLines.map((l) => esc(l)).join('<br>')}
        </div>
        <div class="invoice-meta-inline">
            <div><strong>${esc(L.invoiceNumber)}:</strong> ${esc(inv.number ?? '')}</div>
            <div><strong>${esc(L.date)}:</strong> ${esc(formatDateLocale(inv.date, locale))}</div>
            ${inv.correctsNumber ? `<div><strong>${esc(L.creditNoteFor)}</strong> ${esc(inv.correctsNumber)}</div>` : ''}
            ${servicePeriod}${metaRowsHtml}
        </div>
    </div>`
    : ''

  const poBlock = inv.poNumber
    ? `
    <div style="margin-top: 10px; margin-bottom: 10px;">
        <strong>${esc(inv.poNumber)}</strong>
    </div>`
    : ''

  const introHtml = tpl.introText.trim()
    ? `<div style="margin:6mm 0">${escMultiline(tpl.introText)}</div>` : ''

  // Sub-items: indented breakdown lines under a line item (from the project's
  // Positionen). Purely presentational — the amount stays on the parent line.
  const fmtHours = (n: number): string =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n)
  const subItemsHtml = (it: Invoice['items'][number]): string => {
    if (!it.subItems || it.subItems.length === 0) return ''
    const rows = it.subItems
      .map((si) => {
        const text = si.title
          ? `<strong>${esc(si.title)}</strong>${si.description ? ' – ' + escMultiline(si.description) : ''}`
          : escMultiline(si.description)
        const hours = si.hours != null ? `<span class="sub-item-hours">${fmtHours(si.hours)} ${esc(L.hoursShort)}</span>` : ''
        return `<div class="sub-item"><span class="sub-item-text">${text}</span>${hours}</div>`
      })
      .join('')
    return `<div class="sub-items">${rows}</div>`
  }

  const items = inv.items
    .map(
      (it) =>
        `<li class="service-item"><div class="service-description"><strong>${esc(
          it.title
        )}</strong>${
          it.description ? ' – ' + escMultiline(it.description) : ''
        }${subItemsHtml(it)}</div><div class="service-price">${formatCurrency(it.amount, inv.currency, locale)}</div></li>`
    )
    .join('\n        ')

  const vatMode = invoiceTaxMode(inv)
  const vatLabel = taxLabel(lang, vatMode, inv.taxRate)
  const vatNote = taxNote(lang, vatMode)
  const reverseNote = vatNote
    ? `
        <div class="totals-line reverse-charge">
            <div class="totals-content">
                <span class="reverse-charge-note">${esc(vatNote)}</span>
            </div>
        </div>`
    : ''

  const closingHtml = tpl.closingText.trim()
    ? `<div style="margin-top:8mm">${escMultiline(tpl.closingText)}</div>` : ''

  const footerNoteHtml = tpl.footerNote.trim()
    ? `<div style="margin-bottom:6mm;color:#555;font-size:8pt">${escMultiline(tpl.footerNote)}</div>` : ''

  const subtitleHtml = tpl.showSubtitle
    ? `<div class="company-subtitle">${esc(s.subtitle)}</div>` : ''

  const taxNumberLine = tpl.showTaxNumber
    ? `<strong>${esc(L.taxNumber)}:</strong> ${esc(s.taxNumber)}<br>` : ''

  const bankBlock = tpl.showBankDetails
    ? `
        <div class="payment-info">
            <div><strong>${esc(L.payee)}:</strong> ${esc(s.recipientName)}</div>
            <div><strong>IBAN:</strong> ${esc(s.iban)}</div>
            <div><strong>BIC:</strong> ${esc(s.bic)}</div>
            <div><strong>${esc(L.bank)}:</strong> ${esc(s.bank)}</div>
        </div>` : ''

  const body = `
    <div class="header">
        ${logoImg(tpl)}
        <div class="company-info">
            <div class="company-name">${esc(s.name)}</div>
            ${subtitleHtml}

            <div class="contact-info clearfix">
                <div class="contact-left">
                    ${companyContact}<br><br>
                    ${esc(s.phone)}<br>
                    ${esc(s.email)}
                </div>
            </div>
        </div>
    </div>
${addressBlock}${poBlock}
${introHtml}
    <ul class="service-list">
        ${items}
    </ul>

    <div class="totals-section">
        <div class="totals-line">
            <div class="totals-content">
                <span class="totals-label">${esc(L.subtotal)}</span>
                <span class="totals-amount">${formatCurrency(inv.subtotal, inv.currency, locale)}</span>
            </div>
        </div>
        <div class="totals-line">
            <div class="totals-content">
                <span class="totals-label">${esc(vatLabel)}</span>
                <span class="totals-amount">${formatCurrency(inv.taxAmount, inv.currency, locale)}</span>
            </div>
        </div>
        <div class="totals-line total">
            <div class="totals-content">
                <span class="totals-label">${esc(L.total)}</span>
                <span class="totals-amount">${formatCurrency(inv.total, inv.currency, locale)}</span>
            </div>
        </div>${reverseNote}
    </div>
${closingHtml}

    <div class="footer-section">
        ${footerNoteHtml}${bankBlock}

        <div class="payment-terms">
            <div class="payment-terms-left">
                <strong>${esc(L.paymentTerms)}:</strong><br>
                ${esc(L.payableWithin(s.paymentTermsDays))}
            </div>
            <div class="payment-terms-right">
                ${taxNumberLine}
                <strong>${esc(L.vatId)}:</strong> ${esc(s.vatId)}
            </div>
        </div>
    </div>`

  return `<!DOCTYPE html><html lang="${esc(lang)}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(L.title)}</title><style>${style}</style></head><body>${body}</body></html>`
}
